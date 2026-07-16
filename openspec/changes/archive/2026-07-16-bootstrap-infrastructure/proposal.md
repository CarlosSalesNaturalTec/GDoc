# Proposal — bootstrap-infrastructure

## Contexto

O GDoc (ver `docs/prd_final.md`) é um repositório documental corporativo cujo núcleo
de valor é **governança de acesso**: permissão granular validada no servidor,
isolamento entre unidades, auditoria confiável, lixeira com expurgo diário às 3h,
cotas por pessoa e painel gerencial. Nenhuma dessas capacidades pode ser construída
sem antes existir uma fundação de infraestrutura, dos ambientes e das "costuras"
(seams) que o restante do produto vai consumir.

Esta mudança entrega **apenas o esqueleto de infraestrutura** — os trilhos sobre os
quais as épicas do PRD (acesso, arquivos, permissões, auditoria, lixeira, cotas,
painel, busca) serão implementadas como mudanças subsequentes.

## Por quê

- O PRD define um ambiente de nuvem, mas deixa explicitamente as decisões de
  arquitetura e componentes "para a fase de arquitetura, fora deste documento"
  (Requisitos Não Funcionais → Ambiente). Esta proposal preenche essa lacuna.
- O requisito central de segurança — "acesso sempre validado no servidor a cada
  ação; links diretos nunca contornam a verificação" — é uma **decisão de
  infraestrutura**, não de feature: depende de bucket privado, backend como único
  guardião e URLs assinadas de vida curta. Precisa estar certo desde o primeiro dia.
- Desenvolvimento acontece no **Claude Code web/sandbox** (efêmero, sem GCP), e
  produção no **Google Cloud (GCP)**. Sem uma estratégia de paridade dev↔prod
  desde o início, o produto corre o risco clássico de "funciona no dev, quebra na
  nuvem". A costura de storage/DB atrás de interface resolve isso.

## Decisões confirmadas

| Decisão | Escolha |
|---|---|
| Stack de aplicação | **Node/TypeScript** — backend (NestJS/Express) + frontend React (Vite), monorepo |
| Tráfego de bytes | **URLs assinadas (híbrido)** — bucket privado; API checa permissão e emite URL GCS de TTL curto; upload/download resumável direto do browser |
| Ambientes | **dev (sandbox) + prod (GCP)** — staging fica para mudança futura, se necessário |
| Preview de Office | **Apenas reservar o seam** — serviço de conversão (LibreOffice headless em Cloud Run Job) vira mudança própria; PDF/imagem/vídeo/áudio nativos do browser não precisam de serviço |

## O que muda (escopo desta mudança)

1. **Estrutura do monorepo** — layout `apps/` (backend, frontend), `packages/`
   (contratos/tipos compartilhados), `infra/` (Terraform), `scripts/`.
2. **IaC em Terraform para produção (GCP)** provisionando:
   - Cloud Run (serviço da API)
   - Cloud SQL (PostgreSQL) — metadados, permissões, auditoria, cotas
   - Cloud Storage (bucket **privado**, uniform bucket-level access) — bytes dos arquivos
   - Cloud Scheduler → Cloud Run Jobs — expurgo da lixeira (3h) e avisos de expiração
   - Secret Manager, Artifact Registry, IAM com privilégio mínimo, bucket+CDN para o SPA
3. **Ambiente de desenvolvimento no sandbox** com paridade de protocolo:
   - PostgreSQL local + `fake-gcs-server` (mesma API do GCS)
   - Orquestração local (docker-compose ou processos) + SessionStart hook para preparar
     a sessão web automaticamente
   - Config por variáveis de ambiente / `.env` local (espelha o Secret Manager)
4. **Seams de aplicação** (interfaces sem regra de negócio):
   - `StoragePort` (GCS real ↔ fake-gcs-server)
   - `DatabasePort` / camada de migrações (mesmo Postgres nos dois mundos)
   - `AuthPort` (esqueleto de hash de senha argon2/bcrypt; sem telas/CRUD)
   - `SecretsPort` (Secret Manager ↔ env)
   - Ponto de extensão reservado para conversão de Office (preview)
5. **CI/CD skeleton** — pipeline de lint/build/test + build de imagem para o Artifact
   Registry e caminho de deploy para o Cloud Run (sem publicar features ainda).
6. **Prova de ponta a ponta ("hello, secured world")** — um endpoint de saúde e um
   fluxo mínimo de upload→URL assinada→download que exercita GCS + Postgres nos dois
   ambientes, comprovando que os trilhos funcionam. Sem nenhuma feature do PRD.

## Fora de escopo (viram mudanças próprias)

- Login, telas e CRUD de pessoas (Épico 1)
- Motor de permissões granulares e bloqueio por link direto na camada de aplicação (Épico 4)
- Navegador de arquivos, upload/download em lote, zip (Épicos 2 e 3)
- Auditoria, lixeira, cotas, painel, busca e preview de Office como features (Épicos 6–9)
- Ambiente de staging no GCP
- Login por Google / SSO corporativo (fora do MVP no próprio PRD)

## Impacto

- **Specs afetadas:** nova capability de plataforma (ex.: `platform-infrastructure`),
  a ser detalhada no `spec.md` desta mudança.
- **Código:** cria a estrutura base do repositório; nenhum código de feature do PRD.
- **Custo/risco:** provisiona recursos GCP mínimos (Cloud Run e Cloud SQL escaláveis a
  baixo custo em MVP). Risco principal a mitigar no design: garantir que o bucket
  jamais seja público e que toda emissão de URL assinada passe pela checagem de
  permissão — pilar do requisito de confidencialidade.

## Próximos passos

1. `design.md` — decisões de arquitetura detalhadas (topologia GCP, modelo de tenancy,
   TTL das URLs assinadas, layout do Terraform, estratégia do SessionStart hook).
2. `specs/platform-infrastructure/spec.md` — requisitos verificáveis da fundação.
3. `tasks.md` — passos de implementação.
