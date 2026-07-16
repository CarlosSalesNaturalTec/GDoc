# Design — bootstrap-infrastructure

Detalha o *como* da fundação de infraestrutura do GDoc. Complementa
`proposal.md` (o *porquê* e o escopo). Nenhuma feature do PRD é implementada
aqui — apenas os trilhos, os seams e as decisões de arquitetura.

## Visão de arquitetura (produção — GCP)

```
                        Internet (HTTPS, domínio)
                               │
                     ┌─────────▼──────────┐
                     │  Cloud Load Bal.   │  (Cloud Armor opcional)
                     └─────────┬──────────┘
                  ┌────────────┼─────────────┐
                  ▼                          ▼
          ┌───────────────┐         ┌──────────────────┐
          │ Frontend SPA  │         │  Cloud Run: API  │◀── único guardião de permissão
          │ (bucket+CDN)  │         │  (Node/TS)       │
          └───────────────┘         └───┬───────┬──────┘
                                        │       │
                  ┌─────────────────────┘       └──────────────┐
                  ▼                                             ▼
         ┌──────────────────┐                        ┌────────────────────┐
         │ Cloud SQL (PG)   │  RLS por unit_id       │  Cloud Storage      │
         │ metadados/perm/  │                        │  bucket PRIVADO     │
         │ auditoria/cotas  │                        │  /{unit_id}/...     │
         └──────────────────┘                        └─────────▲──────────┘
                                                       URL assinada (TTL curto)
       ┌───────────────────────────────────────┐              │
       │ Cloud Scheduler → Cloud Run Jobs       │   Browser sobe/baixa direto,
       │  • expurgo lixeira 30d (03:00)         │   só com URL emitida após
       │  • avisos de expiração de permissão    │   checagem de permissão.
       └───────────────────────────────────────┘
   Secret Manager · Artifact Registry · IAM (least-priv) · Pub/Sub (finalize) — transversais
```

## Decisão 1 — Tráfego de bytes e auditoria

**Modelo: URLs assinadas híbridas.** O bucket é 100% privado (uniform
bucket-level access, sem principal público). A API é o único componente que
checa permissão; após checar, emite uma URL GCS assinada de vida curta e o
browser transfere os bytes direto do GCS.

**Ver × baixar distinguidos na API, não no GCS** (para o GCS ambos são um `GET`):

- `POST /files/:id/view-url` → checa permissão *visualizar* → grava auditoria
  `view` → assina URL com `response-content-disposition=inline`.
- `POST /files/:id/download-url` → checa permissão *baixar* → grava auditoria
  `download` → assina URL com `response-content-disposition=attachment`.

**Ponto de auditoria: no momento da emissão da URL.** É quando a permissão foi
checada e concedida — o evento relevante à governança. Escrita única e
transacional na API. Trade-off aceito para o MVP: **"solicitou = acessou"**
(um pedido de URL que não chega a transferir ainda conta como acesso).
Confirmação byte-level via GCS access logs fica como refino futuro, não
requisito agora. O registro contém: quem, arquivo, ação (view/download),
data/hora — atendendo US 7.1/7.2.

**TTL diferenciado por operação** (a janela da URL é a janela de vazamento):

| Operação | TTL | Racional |
|---|---|---|
| view-url | ~5 min | preview é rápido; re-emitir é barato |
| download-url | ~15–30 min | cabe vídeo grande + pausa/retomada por Range |
| upload-url | mesmo TTL do download (~15–30 min) | PUT direto (`action: 'write'`), *gated* por permissão + cota na emissão |

Nota de implementação: a emissão de upload usa PUT simples (`action: 'write'`),
não upload resumível (`action: 'resumable'`) — o fake-gcs-server usado em dev
não inicia corretamente uma sessão resumível a partir de uma URL assinada v4
no estilo de caminho (perde o nome do objeto), embora suporte PUT simples com
o mesmo esquema de assinatura sem problemas (validado manualmente). GCS real
aceita PUT simples normalmente; upload em pedaços/retomável, se necessário
para arquivos muito grandes em rede instável, fica como otimização de UX de
uma mudança de feature futura — o contrato do endpoint (uma URL, um PUT) não
muda.

Nota GCS: a expiração é validada no início de cada requisição; um download já
iniciado continua além do TTL, mas retomadas por *Range* disparam novos `GET`s
que precisam começar dentro da validade — daí o TTL de download ser mais folgado.

**"Link direto bloqueado" (US 4.2)** cai naturalmente: o endereço que uma pessoa
compartilharia é a rota da app (`/files/:id`), sempre protegida (403 sem preview).
O signed URL é efêmero e não é um "link" que se compartilha. O bucket **nunca**
público é o que sustenta o requisito.

**Cota 10 GB × upload direto** (bytes não passam pela API), dois passos:
1. **Pré-check** na emissão da URL: rejeita se `uso_atual + tamanho_declarado > 10 GB`.
2. **Reconciliação pós-upload:** notificação de finalização do objeto
   (GCS → Pub/Sub → API) atualiza o uso real e sinaliza/remove se estourou o limite.

## Decisão 2 — Tenancy e isolamento por unidade

Isolamento é requisito de **confidencialidade** ("em nenhuma hipótese"), então
enforcement só na aplicação é frágil. **Modelo escolhido: schema único +
coluna `unit_id` em toda tabela tenant-scoped + Row-Level Security (RLS) no
Postgres** — defesa em profundidade: mesmo uma query com bug não cruza unidades
porque o banco filtra.

```
   Requisição autenticada → API abre transação e faz:
        SET LOCAL app.current_unit = <unidade do usuário>
        SET LOCAL app.user_role   = <collaborator|unit_admin|global_admin>

   Policy RLS em cada tabela tenant-scoped:
        USING ( unit_id = current_setting('app.current_unit')::uuid
                OR current_setting('app.user_role') = 'global_admin' )

   collaborator / unit_admin ─▶ só a própria unidade
   global_admin ─────────────▶ bypass → agrega todas as unidades (painel)
```

Por que não schema-por-unidade: o **admin global precisa somar tudo** (painel de
alcance global); schema único torna a agregação trivial e a policy dá o corte por
unidade "de graça" aos demais papéis. O **admin de unidade** usa a mesma policy com
`current_unit` = a dele.

**Fronteiras:** dentro da unidade, permissão atravessa donos (admin libera arquivo
de A para B); **entre unidades é fronteira dura** (compartilhamento entre unidades
é fora de escopo no PRD). RLS em `unit_id` modela exatamente isso.

**Storage:** um bucket privado + prefixo por unidade `/{unit_id}/{owner_id}/{uuid}`.
Preferido a bucket-por-unidade (evita provisionar N buckets por unidade nova e
simplifica as estatísticas de espaço do painel). Como a URL só é gerada após
checagem unit-scoped, o prefixo é camada extra, não o controle primário.

**Cuidado de implementação:** `SET LOCAL` (não `SET`) por transação, para ser
seguro com connection pooling (Cloud SQL + pooler em transaction mode). Um `SET`
de sessão vazaria contexto de unidade entre requisições.

## Decisão 3 — Paridade dev↔prod e SessionStart hook

Enquadramento: **o SessionStart hook é o "Terraform do sandbox"** — provisiona o
equivalente dev dos recursos GCP. O sandbox é efêmero, então tudo precisa ser
reproduzível a cada sessão.

```
   PROD (Terraform)                 DEV (SessionStart hook)
   ────────────────                 ───────────────────────
   Cloud SQL (Postgres)      ⇄      Postgres local + migrações + seed
   Cloud Storage (bucket)    ⇄      fake-gcs-server + bucket criado
   Secret Manager            ⇄      .env local
   imagens no Artifact Reg.  ⇄      npm ci
```

`fake-gcs-server` fala o mesmo protocolo do GCS → o código do `StoragePort` é
idêntico nos dois mundos.

**Fronteira de responsabilidade do hook:**
- Provisiona a *infra* dev: instala deps, sobe Postgres, migra, seed, sobe
  fake-gcs-server, cria bucket, health-check. Garante que testes e linters rodem
  na sessão web (propósito da skill `session-start-hook`).
- **Não** é dono do ciclo de vida da app (backend/frontend) — esses sobem sob
  demanda (`make dev`), mantendo o start da sessão rápido.

**Princípios:** idempotente (health-check antes de subir; migrações sempre; seed só
se vazio); serviços long-running sobem detached; **paridade de segurança** — o
Postgres local suporta RLS igual ao Cloud SQL, então o isolamento da Decisão 2 é
testável de verdade no sandbox, sem GCP.

## Decisão 4 — Terraform de produção: rede, assinatura e gaps conhecidos

**Cloud SQL com IP público, sem `authorized_networks`.** A API se conecta via
integração nativa do Cloud Run com o Cloud SQL (proxy gerenciado, autenticado
por IAM) — nenhuma rota de rede é liberada para ninguém. Evita o custo e a
complexidade de um conector Serverless VPC Access ou private service access
só para o MVP ("baixo custo" é decisão confirmada em `proposal.md`); a
superfície de ataque não muda, porque nenhum IP é autorizado de qualquer
forma.

**Assinatura de URL v4 sem chave exportada, em prod.** A service account do
Cloud Run assina via IAM Credentials API (`signBlob`), não com um arquivo de
chave — `@google-cloud/storage` cai nesse caminho automaticamente quando não
recebe `credentials` explícitas e roda sob ADC do Cloud Run. Só em dev existe
uma chave dummy (gerada localmente pelo SessionStart hook); nunca em prod.
Exige `roles/iam.serviceAccountTokenCreator` da própria service account sobre
si mesma.

**Frontend sem domínio ainda.** O bucket+CDN do SPA existem desde o primeiro
`apply`; o balanceador de carga e o certificado gerenciado só são criados
quando um domínio real é definido (o Google exige isso para emitir o
certificado) — condicional por `count`, não um recurso quebrado por padrão.

**Gap de segurança conhecido, não fechado nesta mudança:** o endpoint
`POST /internal/storage-events` recebe o push do Pub/Sub com um JWT OIDC, mas
o Cloud Run também precisa conceder `allUsers:run.invoker` (a API é a porta
de entrada pública do SPA) — então a checagem de IAM do Cloud Run não isola
esse endpoint especificamente; hoje qualquer um pode chamá-lo. Fechar isso é
trabalho de **aplicação** (validar o JWT OIDC do Pub/Sub no handler, audience
+ assinatura), não de infraestrutura — tornar todo o Cloud Run privado
quebraria o acesso público do SPA. Fica como item pendente antes de produção
com dados reais (ver `infra/terraform/README.md`).

## Stack e estrutura do monorepo

```
gdoc/
├── apps/
│   ├── api/          # backend Node/TS (NestJS ou Express) — o guardião
│   └── web/          # frontend React (Vite) — SPA
├── packages/
│   └── shared/       # contratos/tipos compartilhados (DTOs, enums de permissão)
├── infra/
│   └── terraform/    # IaC do ambiente GCP (prod)
├── scripts/          # SessionStart hook, dev-up, seed
└── docs/             # PRD e artefatos existentes
```

## Segredos e configuração

Config por variáveis de ambiente (12-factor). Em prod, valores sensíveis no
**Secret Manager**, injetados no Cloud Run; em dev, `.env` local (espelha as
mesmas chaves). Seam `SecretsPort` abstrai a origem. Senhas de usuário com
hash **argon2** (esqueleto do `AuthPort`; sem telas/CRUD nesta mudança).

## CI/CD (skeleton)

Pipeline: lint → build → test → build de imagem → push para o Artifact Registry
→ caminho de deploy para o Cloud Run. Sem publicar features nesta mudança; o
alvo é provar que o pipeline e o deploy funcionam com a "hello, secured world".

**Implementação:** dois workflows do GitHub Actions.
`.github/workflows/ci.yml` roda lint/build/test em todo push/PR, com um
Postgres real como serviço (os testes abrem transação e fazem `SET LOCAL`
de verdade — mesma garantia da Decisão 3; não precisa de emulador de GCS
porque os testes usam `InMemoryStoragePort`). `.github/workflows/deploy.yml`
dispara quando o CI termina com sucesso em `main`: builda a imagem
(`apps/api/Dockerfile`), publica no Artifact Registry e faz
`gcloud run deploy`. Autenticação no GCP por **Workload Identity
Federation** (`infra/terraform/cicd.tf`) — mesma postura de "sem chave
exportada" da Decisão 4 (signBlob): o GitHub Actions troca seu próprio
OIDC token por credenciais de curta duração, sem nenhum JSON de service
account guardado como secret.

**Achado de implementação corrigido nesta mudança:** `packages/shared`
apontava `main`/`types` para `./src/index.ts` (fonte TS). Em dev/test isso
funciona porque `tsx`/`vitest` transpila na hora, mas quebra o build de
produção de verdade — `node dist/server.js` puro não sabe importar `.ts`.
Corrigido apontando para `./dist/index.js` compilado, com um `postinstall`
na raiz que builda `packages/shared` logo após `npm install`/`npm ci` (assim
o hook de dev, o CI e o Docker build sempre encontram o `dist/` pronto).
Validado rodando os três caminhos de execução (`node` puro, `vitest`, `tsx`)
depois da correção — os três resolvem `@gdoc/shared` corretamente agora.

## Riscos e spikes em aberto

- **[SPIKE] Docker no sandbox?** Decide o mecanismo do hook:
  `docker-compose` (postgres + fake-gcs-server) se disponível; senão binários
  nativos (fake-gcs-server é um binário Go único; Postgres via pacote nativo).
  O hook deve prever ambos os caminhos e detectar em runtime.
- **Reconciliação de cota via Pub/Sub** precisa de endpoint de notificação na API
  e IAM para o GCS publicar — validar no design de detalhe.
- **Seam de preview de Office reservado** (LibreOffice headless em Cloud Run Job);
  implementação vira mudança própria.
- **RLS + pooling:** garantir `SET LOCAL` por transação em toda a camada de acesso.

## Deixado para mudanças futuras

- Ambiente de staging no GCP.
- Serviço de conversão para preview de Office.
- Confirmação de auditoria byte-level via GCS access logs.
- Deploy da imagem real da API no Cloud Run (o `apply` deixou a imagem
  placeholder `us-docker.pkg.dev/cloudrun/container/hello`; publicar a
  imagem do GDoc é responsabilidade do `.github/workflows/deploy.yml`,
  seção 7).
- Login por Google / SSO corporativo (fora do MVP no PRD).
