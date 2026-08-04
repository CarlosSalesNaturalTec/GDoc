# Design — rebranding-doc7-setes

## Context

O nome `GDoc` aparece hoje em duas camadas com riscos opostos:

**Camada de apresentação** (o que o cliente vê) — `apps/web/index.html:7`,
`apps/web/src/auth/LoginPage.tsx:70`, `apps/web/src/shell/AppShell.tsx:95`
(`'GD'` / `'GDoc'`), `apps/web/src/app/HomePage.tsx:4`,
`apps/api/src/server.ts:9`, mais seis arquivos de teste que ancoram o nome e a
documentação em `docs/`.

**Camada de identificadores** (o que ninguém vê) — scope npm `@gdoc/*` (109
ocorrências), `gdoc_dev`/`gdoc_ci`, `gdoc-dev-bucket`, `gdoc-storage-finalize`,
`db_user = "gdoc_app"` e `name_prefix = "gdoc"` em `infra/terraform/variables.tf`.

O pedido do cliente é sobre a primeira. A segunda entra aqui só para ser
**explicitamente excluída** (D5).

Restrições herdadas e não renegociadas (CLAUDE.md + config.yaml):

- A SPA é servida na **mesma origem** da API, e o fallback de `index.html` não
  pode sombrear rota de API — a lista `API_PREFIXES` precisa ficar em sincronia
  com `vite.config.ts` e `infra/terraform/locals.tf`.
- Configuração 12-factor por variável de ambiente, sempre atrás do seam
  `SecretsPort` quando for segredo.
- Nenhuma rota nova pode reabrir o furo de bypass do `global_admin`.

## Goals / Non-Goals

**Goals:**

- `Doc7` como nome exibido em toda a camada de apresentação.
- Identificação do cliente (`SETES`) exibida **abaixo** do nome, na tela de login
  e no shell, como valor **configurado**, não literal no código.
- Entregar essa configuração ao SPA **antes da autenticação**, sem quebrar o
  invariante de prefixos nem introduzir flash de conteúdo.
- Degradar em silêncio: sem `APP_CLIENT_NAME`, a aplicação funciona e não exibe
  subtítulo.

**Non-Goals:**

- Renomear identificadores internos, infraestrutura ou o scope npm (D5).
- Marca por unidade/tenant (D3).
- Logo, paleta, tipografia, i18n.
- Transformar `/auth/public-config` num canal geral de configuração do cliente
  (D4 fixa o contrato estreito).

## Decisions

### D1 — Entrega em runtime por endpoint público, não em build-time

`APP_CLIENT_NAME` é lida pela **API** e exposta em `GET /auth/public-config`;
o SPA busca no bootstrap.

_Alternativas descartadas:_

**(a) Build-time via `VITE_APP_CLIENT_NAME`.** O Vite assaria o valor no bundle.
Funciona, mas trocar a identificação exigiria **rebuild + redeploy**, e atender a
um segundo cliente exigiria um bundle por cliente. Além disso, o nome escolhido
pelo cliente — `APP_CLIENT_NAME`, sem prefixo `VITE_` — segue a convenção do
`.env.example`, que é integralmente server-side/Secret Manager. Build-time
contraria a própria nomenclatura pedida.

**(b) Injeção no `index.html` ao servir.** A API substituiria um placeholder (ou
injetaria `window.__APP_CONFIG__`) no HTML servido. Tem a vantagem de não custar
requisição nenhuma — mas **quebra no modo com domínio**: `locals.tf:28`
(`create_frontend_lb = var.frontend_domain != ""`) prevê o load balancer roteando
`api_proxy_prefixes` para a Cloud Run e **todo o resto para o bucket + CDN**.
Nessa topologia o `index.html` sai do bucket e a API nunca o toca. Uma solução
que só funciona na fase sem domínio é dívida com data marcada.

A opção escolhida funciona idêntica nas duas topologias, porque
`/auth/public-config` é rota de API em ambas.

### D2 — Pendurar em `/auth`, não criar prefixo de topo

O endpoint poderia ser `GET /config` ou `GET /public-config`. Não é. Qualquer
prefixo de topo novo obriga a sincronizar **três** listas — `apps/api/src/lib/
api-prefixes.ts`, `apps/web/vite.config.ts` (`API_PROXY_PREFIXES`) e
`infra/terraform/locals.tf` (`api_proxy_prefixes`) — sob pena de o fallback de
`index.html` sombrear a rota (cobertura em `__tests__/web-serving.test.ts`).

`/auth` já está nas três listas. `GET /auth/public-config` custa **zero** churn
nesse invariante, e a semântica não fica forçada: é a configuração que a tela de
autenticação precisa para se desenhar.

### D3 — Configuração por implantação, não por unidade

`APP_CLIENT_NAME` é uma variável de ambiente única do serviço. Marca **por
unidade** foi considerada e descartada: a tela de login é pré-autenticação, então
não há unidade resolvida no momento em que o subtítulo precisa aparecer — só
depois do login se sabe a que unidade a pessoa pertence. Marca por tenant exigiria
descobrir a unidade pelo hostname (subdomínio por cliente), o que é uma decisão de
topologia de domínio que ninguém tomou. Uma implantação, um cliente, uma marca.

### D4 — O endpoint é anônimo, então o contrato nasce estreito

`GET /auth/public-config` **não** passa por `attachTenantContext` — tem que
responder sem sessão, senão não serve à tela de login. Isso o torna legível por
qualquer um na internet que alcance o serviço.

Consequência assumida no contrato: ele devolve **exclusivamente**
`{ appName: string, clientName: string }` — branding, e nada mais. `appName` é
constante da build; `clientName` é `APP_CLIENT_NAME` (string vazia quando não
configurada). Ambos são informação que já está impressa na tela de login para
qualquer visitante, então expô-los não adiciona superfície.

A regra que fica cravada na spec: **nenhum outro valor de configuração pode ser
acrescentado a esta resposta.** Ports, flags, limites, nomes de bucket, versão —
nada. Se o SPA precisar de configuração autenticada no futuro, o lugar é
`GET /auth/me`, que já roda sob contexto. Sem essa trava, um endpoint anônimo de
config vira, com o tempo, um despejo de ambiente.

### D5 — Identificadores internos ficam como estão

Renomear `name_prefix = "gdoc"` no Terraform **não** é uma renomeação: o atributo
compõe o nome de recursos com identidade imutável. O `terraform apply` resultante
**destrói e recria** o bucket de storage (bytes dos clientes), a instância Cloud
SQL (todo o banco) e o tópico Pub/Sub. O próprio `variables.tf:20` já registra
esse tipo de risco para a região ("migração planejada... não a simples troca deste
valor"). Em produção isso é incidente, não rebranding.

Os demais identificadores (`@gdoc/*`, `gdoc_dev`, `gdoc_ci`, `db_user`) são
seguros de trocar, mas:

- não são vistos por ninguém fora do time;
- `@gdoc/*` são 109 linhas de churn que poluem o diff desta mudança e dificultam
  revisar o que realmente importa (a marca);
- misturá-los aqui acopla uma mudança cosmética de baixo risco a um refactor
  mecânico de médio risco.

Se incomodar, `@gdoc/*` → `@doc7/*` é uma mudança própria, posterior e isolada.
Infraestrutura, só numa migração planejada com janela — ou nunca.

### D6 — Subtítulo fora do heading (acessibilidade)

`LoginPage.tsx:51` já carrega o cuidado explícito:

> _"O ícone fica FORA do heading para não poluir seu nome acessível (a US 1.2 e os
> testes exigem 'GDoc' puro)."_

`SETES` segue a mesma regra. Se entrasse dentro do `<Typography.Title>`, o nome
acessível do heading viraria `"Doc7 SETES"` — quebrando o padrão que a US 1.2
estabeleceu e os testes que ancoram o heading por nome. Vai como elemento irmão,
imediatamente abaixo:

```
    ╭──────────────────╮           ╭──────────────────╮
    │      ( 📁 )       │           │      ( 📁 )       │
    │                  │           │                  │
    │      GDoc        │  ──────►  │      Doc7        │  ← h3, nome acessível puro
    │  Acesse sua      │           │      SETES       │  ← identificação do cliente
    │     conta        │           │  Acesse sua      │  ← contexto da tela
    │                  │           │     conta        │
    ╰──────────────────╯           ╰──────────────────╯
```

No **shell**, a marca do sider tem dois estados. Expandido: `Doc7` com `SETES`
abaixo, em tipo menor e cor secundária. **Colapsado**: só `D7` — não há largura
para o subtítulo, e espremê-lo produziria truncamento ilegível. O subtítulo
simplesmente não é renderizado no estado colapsado.

### D7 — Bootstrap: aproveitar o gate de loading que já existe

`session-context.tsx:24` já mantém `status: 'loading' | 'authenticated' |
'anonymous'` e só libera a árvore depois do `GET /auth/me` inicial. A busca de
`/auth/public-config` entra **em paralelo** nesse mesmo bootstrap, e o gate só
abre quando as duas resolvem. Resultado: nenhum flash de "Doc7" sem subtítulo
seguido de "Doc7 + SETES", e nenhum estado de carregamento novo na UI.

Falha da chamada (rede, 5xx) **não** bloqueia a aplicação: trata-se como
"sem identificação de cliente" e o login renderiza normalmente. Branding nunca
pode ser motivo de indisponibilidade de login.

### D8 — `APP_CLIENT_NAME` é env var comum, não segredo

O valor é exibido na tela de login para qualquer visitante — é o oposto de
segredo. Vai como variável de ambiente do serviço Cloud Run, **não** pelo
`SecretsPort`/Secret Manager. Usar o caminho de segredo para dado público
adicionaria uma rotação e um custo de leitura sem nenhum ganho.

## Risks / Trade-offs

- **Uma requisição a mais no boot.** Mitigado por D7 (paralela ao `/auth/me`, sob
  o gate existente). Custo real ≈ 0 ms de latência percebida.
- **Endpoint anônimo novo.** Superfície mínima (dois campos públicos, `GET`, sem
  parâmetros), mas é superfície. Mitigação é o contrato estreito de D4 cravado na
  spec, mais o fato de não haver dado de unidade envolvido — a rota não abre
  transação tenant nem toca `attachTenantContext`.
- **Divergência nome exibido ↔ identificadores internos.** Quem abrir o Terraform
  ou o `package.json` vai ler `gdoc`. É dívida cosmética consciente, documentada
  em D5, e preferível ao risco de recriar Cloud SQL.
- **Seis testes mudam de âncora.** São contrato, não descarte: a atualização é
  literal (`'GDoc'` → `'Doc7'`), e o requisito de nome acessível puro ganha
  cobertura própria para não regredir.

## Migration Plan

Nenhuma migração de banco e nenhuma mudança de dado. A ordem de aplicação é:

1. `packages/shared` (DTO) → rebuild de `dist`, porque api e web consomem
   compilado.
2. API (`config.ts`, `routes/auth.ts`, `server.ts`).
3. Web (bootstrap, login, shell, `index.html`).
4. Testes e documentação.

`APP_CLIENT_NAME` ausente é estado válido — implantações que ainda não a
definiram continuam funcionando sem subtítulo, então não há janela de
incompatibilidade entre o deploy da API e o do SPA (que, de todo modo, vão no
mesmo artefato, conforme `publicacao-frontend`).

## Open Questions

- `SETES` é sigla de quê? Se houver forma por extenso que o cliente prefira como
  `title` do documento (ex.: `Doc7 — SETES`), o `<title>` pode incorporá-la; a
  spec deixa o `<title>` como "nome da aplicação", e incluir o cliente ali é
  ajuste de uma linha.
