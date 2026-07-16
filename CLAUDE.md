# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

GDoc is a corporate document repository whose core value is **access
governance**: server-validated permissions, per-unit (tenant) isolation,
audit trail, retention-based trash, quotas, and a management dashboard. The
full product is defined in `docs/prd_final.md` (the PRD — master document).

### PRD-driven workflow (important — read before planning/implementing)

- `docs/prd_final.md` is the master document: personas, MVP scope, épicos,
  and the Given/When/Then acceptance criteria for every user story (US x.y).
- Every OpenSpec change implements a slice of the PRD. Specs under
  `openspec/changes/*/specs/` reference the corresponding US instead of
  re-stating criteria already defined in the PRD.
- Before planning or implementing any domain feature, read the relevant US
  in the PRD first — its error scenarios and edge cases are binding, not
  suggestions.
- OpenSpec artifacts (proposal/design/specs/tasks) are written in
  Portuguese, following the style already used in
  `openspec/changes/bootstrap-infrastructure/`. Per-artifact conventions are
  defined in `openspec/config.yaml` (`rules:` section) — e.g. every
  tenant-scoped table needs `unit_id` + an RLS policy; every proposal
  references confirmed architecture decisions instead of re-deciding them.
- Use the `opsx:*` skills (`/opsx:new`, `/opsx:propose`, `/opsx:apply`,
  `/opsx:verify`, `/opsx:archive`, etc.) to drive the OpenSpec workflow.

## Commands

Run from the repo root (npm workspaces):

```bash
npm run lint          # eslint across all workspaces
npm run build         # tsc across all workspaces (packages/shared must build before apps/api)
npm run test          # vitest across all workspaces
npm run format        # prettier --write
npm run format:check
```

Single workspace / single test:

```bash
npm run test --workspace apps/api                    # all api tests
npx vitest run src/__tests__/rls-isolation.test.ts    # one file (run inside apps/api)
npx vitest run -t "usuário da unidade A"              # by test name (run inside apps/api)
npm run build --workspace packages/shared             # rebuild shared types after editing packages/shared/src
```

Dev server and DB:

```bash
make dev-api                          # same as: npm run dev --workspace apps/api (tsx watch)
npm run migrate --workspace apps/api  # apply pending SQL migrations (apps/api/src/db/migrations)
npm run seed --workspace apps/api     # seed dev data, only if `users` table is empty
```

`apps/api/vitest.config.ts` sets `fileParallelism: false` — all test files
share one local Postgres and run migrations/TRUNCATE in `beforeAll`, so they
must run sequentially, never in parallel.

### Dev environment provisioning

The `SessionStart` hook (`.claude/hooks/session-start.sh`, registered in
`.claude/settings.json`) is "the sandbox's Terraform" — idempotently
provisions the dev equivalent of prod resources: local Postgres via
`pg_ctlcluster` (↔ Cloud SQL), `fake-gcs-server` (↔ Cloud Storage, same JSON
protocol), and a dummy signer key. It runs automatically on session start;
run manually with `CLAUDE_CODE_REMOTE=true ./.claude/hooks/session-start.sh`.
It only provisions infra — it never starts the API/web app (that's
`make dev-api`, on demand).

### `packages/shared` gotcha

It's consumed **compiled** (`dist/`), not from TS source directly — a root
`postinstall` builds it automatically after `npm install`/`npm ci`. If you
edit `packages/shared/src`, run `npm run build --workspace packages/shared`
(or reinstall) or changes won't be visible to `apps/api`, tests, or Docker.
(`main`/`types` in its `package.json` point at `./dist/index.js` on purpose —
pointing at `./src/index.ts` works under `tsx`/`vitest` but breaks
`node dist/server.js` in the real production build.)

## Architecture

### Ports & adapters (seams)

`apps/api` is designed for dev(sandbox)/prod(GCP) parity without ever
importing a cloud SDK from business logic. Everything goes through an
interface in `apps/api/src/ports/*`, and `apps/api/src/ports/index.ts`
(`createPorts()`) is the **single place** that knows which concrete
implementation is active:

| Port | Prod adapter | Dev/test adapter |
|---|---|---|
| `StoragePort` | `GcsStoragePort` (real GCS) | same class, pointed at `fake-gcs-server` via `STORAGE_EMULATOR_HOST`; tests use `InMemoryStoragePort` (`__tests__/in-memory-storage-port.ts`) |
| `DatabasePort` | `PgDatabasePort` | same class, local Postgres — same engine both sides, only the connection string differs |
| `SecretsPort` | `SecretManagerSecretsPort` | `EnvSecretsPort` (reads `.env`) — selected by `SECRETS_DRIVER` |
| `AuthPort` | `Argon2AuthPort` (password hashing skeleton only, no login/session yet — Épico 1) | same |
| `PreviewConversionPort` | reserved, **not implemented** — future change wires Office (doc/xls/ppt) preview conversion (LibreOffice headless on a Cloud Run Job) to the view-url endpoints | — |

Routes/middleware only ever depend on the `Ports` interface, never on a
concrete adapter or `process.env` directly (secrets always go through
`SecretsPort`).

### Tenancy: RLS is the real enforcement boundary

Isolation between units is a confidentiality requirement ("under no
circumstance"), so app-layer checks alone are considered fragile. The model
is: single schema, `unit_id` column on every tenant-scoped table, and
**Postgres Row-Level Security** as defense in depth — a buggy query still
can't cross units because the database itself filters rows.

- Every tenant-scoped table has `FORCE ROW LEVEL SECURITY` and a policy like
  `unit_id = current_setting('app.current_unit')::uuid OR
  current_setting('app.user_role') = 'global_admin'`
  (see `apps/api/src/db/migrations/0002_enable_rls.sql`).
- `DatabasePort.withTenantTransaction(ctx, fn)` opens a transaction and runs
  `SET LOCAL app.current_unit` / `app.user_role` before calling `fn`
  (`apps/api/src/adapters/pg-database-port.ts`). **Always `SET LOCAL`, never
  `SET`** — sessions are pooled (Cloud SQL + pooler in transaction mode), so
  a session-level `SET` would leak tenant context across requests.
  `withTransaction(fn)` (no tenant context) is for internal/migration use
  only; without a tenant context, `current_setting(..., true)` returns
  `NULL` and every policy denies by default (fail-closed).
- `role` is one of `collaborator` / `unit_admin` (scoped to their own unit)
  / `global_admin` (RLS bypass — aggregates across all units, needed for the
  management dashboard).
- `apps/api/src/middleware/tenant-context.ts` resolves `req.tenantContext`
  from an `x-gdoc-user-id` header — this is a **deliberate placeholder**,
  not real auth. Épico 1 (login/session) will replace it with a real
  session/JWT. Note the resolution step itself runs under a bypass
  (`global_admin`) transaction because the user's unit isn't known yet; each
  route handler then opens its own `withTenantTransaction` with the resolved
  context — `SET LOCAL` per transaction, never per session.
- Test pattern: `apps/api/src/__tests__/test-db.ts` provides
  `setupTestDatabase()`, `seedTwoUnits()`, and `withSystemBypass()` (runs
  under `global_admin` for test setup, since even the table owner is
  restricted by `FORCE ROW LEVEL SECURITY`). See
  `rls-isolation.test.ts` / `permission.test.ts` for the pattern.

### File access: signed URLs, never a public bucket

The bucket is 100% private (uniform bucket-level access, no public
principal). The API is the only component that checks permission; only
after checking does it mint a short-TTL signed URL, and the browser
transfers bytes directly to/from GCS.

- `POST /files/:id/view-url` → checks permission → **writes an audit row**
  (`view`) → signs a URL with `response-content-disposition=inline`, TTL
  ~5 min.
- `POST /files/:id/download-url` → same but `download` action,
  `attachment` disposition, TTL ~15–30 min.
- `POST /files/upload-url` → pre-checks the 10 GB/user quota against
  `declaredSizeBytes`, inserts a `pending` file row, then signs a **simple
  PUT** URL (not resumable — `fake-gcs-server` doesn't handle resumable
  sessions from a v4 path-style signed URL; real GCS would support either,
  but the contract stays "one URL, one PUT").
- `POST /internal/storage-events` reconciles post-upload: in prod this is
  the target of a GCS-finalize → Pub/Sub push subscription; in dev, it's
  called directly with the same payload (README documents the manual curl
  flow). It updates `users.storage_used_bytes` and flips the file's status
  to `active`/`over_quota`. **Known, documented, unclosed gap**: this
  endpoint has no OIDC/permission check of its own — Cloud Run has to allow
  unauthenticated invocation for the public SPA, so anyone can currently
  call it. Closing this is application work (validate the Pub/Sub push's
  OIDC JWT), tracked as pending before real data goes to prod (see
  `infra/terraform/README.md`).
- The audit point is **URL issuance**, not confirmed byte transfer — the
  MVP tradeoff is "requested = accessed". If no file is found (or RLS
  hides it because it belongs to another unit), the route returns `403`
  with **no URL issued and no audit row written**.
- A shared link to `/files/:id` is always safe to leak — it's an app route,
  always permission-checked; the actual signed URL is short-lived and isn't
  meant to be a shareable "link" at all.

### Request flow

```
Express request
  → healthRouter / storageEventsRouter (no tenant context needed)
  → attachTenantContext(ports)   — resolves req.tenantContext from x-gdoc-user-id
  → filesRouter(ports)           — every handler opens its own withTenantTransaction
```

`apps/api/src/ports/index.ts` builds the `Ports` object once at startup
(`createPorts()`, called from `server.ts`) and it's threaded through
`createApp(ports)` — routes and middleware are plain functions of `Ports`,
which is what makes them testable against `InMemoryStoragePort` + a real
local Postgres without touching GCS.

### Config

`apps/api/src/config.ts` is the only place reading `process.env` for
non-secret config (12-factor). It resolves `.env` relative to the **repo
root**, not `cwd` — because `npm run migrate --workspace apps/api` etc. run
with `cwd = apps/api`. Any relative filesystem path from env (e.g.
`STORAGE_SIGNER_KEY_PATH`) goes through `resolveRepoPath()` for the same
reason. Real `process.env` values (e.g. set by the SessionStart hook) always
win over `.env` — see `.env.example` for the full key reference.

### Migrations

Plain numbered `.sql` files in `apps/api/src/db/migrations/`, applied in
filename order by `apps/api/src/db/migrate.ts` (tracked in a
`schema_migrations` table, each file wrapped in its own transaction). No
migration framework/ORM — add a new file, don't edit an applied one.

## Infra (GCP, Terraform)

`infra/terraform/` provisions prod: Cloud Run (API), Cloud SQL (Postgres,
RLS as above), Cloud Storage (private bucket, prefix
`/{unit_id}/{owner_id}/{uuid}`), Cloud Scheduler → Cloud Run Jobs (daily
03:00 trash purge — job is a placeholder; the real purge logic is Épico 6,
not yet built), Secret Manager, Artifact Registry, Pub/Sub (upload finalize
notifications), and a bucket+CDN for the future SPA (load balancer/cert only
created once a real domain is configured). No service-account key files
anywhere: Cloud Run signs URLs via IAM Credentials API (`signBlob`) under
ADC, and GitHub Actions authenticates via Workload Identity Federation
(`infra/terraform/cicd.tf`). See `infra/terraform/README.md` for apply
instructions and the full list of known gaps. **Never applied in this repo's
history** — no live GCP project is attached to it.

## CI/CD

`.github/workflows/ci.yml` runs lint/build/test on every push/PR against a
real Postgres service container (RLS tests need real `SET LOCAL`
semantics — no GCS emulator needed since tests use `InMemoryStoragePort`).
`.github/workflows/deploy.yml` triggers on a successful CI run on `main`:
builds `apps/api/Dockerfile` (multi-stage, build context = repo root),
pushes to Artifact Registry, deploys to Cloud Run.
