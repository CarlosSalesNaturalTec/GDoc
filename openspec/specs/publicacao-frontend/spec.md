# publicacao-frontend Specification

## Purpose

Definir os requisitos verificáveis da publicação da SPA (`apps/web`) em
produção a partir do mesmo serviço que atende a API, de modo que o cookie de
sessão `HttpOnly`/`Secure`/`SameSite=Strict` funcione sem CORS usando apenas a
URL bruta fornecida pela GCP (`*.run.app`), sem depender de domínio
customizado. Cobre o serving estático do build, a precedência das rotas de
API, a política de cache por classe de artefato e a entrega conjunta no
pipeline de deploy. Não cobre nenhuma feature de produto em si (login,
navegador, permissões de negócio, painel), que são definidas em suas próprias
mudanças.

## Requirements

### Requirement: SPA servida em produção na mesma origem que a API

Em produção, o sistema SHALL servir o build da SPA (`apps/web/dist`) a partir
do mesmo serviço (mesma origem) que atende a API, de modo que o cookie de
sessão `HttpOnly`/`Secure`/`SameSite=Strict` funcione sem CORS usando apenas a
URL bruta fornecida pela GCP (`*.run.app`), sem depender de domínio
customizado.

#### Scenario: Página inicial servida na raiz

- **WHEN** um navegador faz `GET /` na origem do serviço com o build da web
  configurado
- **THEN** a resposta é `200` com o `index.html` do build da SPA.

#### Scenario: Asset estático do build servido

- **WHEN** um navegador requisita um asset existente do build (ex.:
  `/assets/<nome-com-hash>.js`)
- **THEN** a resposta é `200` com o conteúdo do asset.

#### Scenario: Deep-link de rota client-side recarregável

- **WHEN** um navegador faz `GET` de um caminho de rota client-side da SPA
  (ex.: `/busca`, `/admin/painel`) que não corresponde a arquivo do build nem
  a prefixo de API
- **THEN** a resposta é `200` com o `index.html`, para o roteador
  client-side resolver a rota.

### Requirement: Rotas de API nunca sombreadas pelo estático

O fallback de `index.html` SHALL responder apenas a requisições `GET`/`HEAD`
fora dos prefixos de API. Sob qualquer prefixo de API (incluindo `/internal`),
o comportamento SHALL permanecer exatamente o da API — inclusive para caminhos
que não casam com nenhuma rota. A lista de prefixos usada pela guarda SHALL
espelhar `apps/web/vite.config.ts` (`API_PROXY_PREFIXES`) e
`infra/terraform/locals.tf` (`api_proxy_prefixes`).

#### Scenario: Caminho de API inexistente não vira index.html

- **WHEN** um cliente faz `GET` de um caminho sob prefixo de API que não casa
  com nenhuma rota (ex.: `GET /files/rota-inexistente`)
- **THEN** a resposta é a da API (ex.: `404`), nunca o `index.html` da SPA.

#### Scenario: Rotas de API continuam atendidas normalmente

- **WHEN** um cliente autenticado chama uma rota de API existente (ex.:
  `GET /auth/me`) na origem que também serve a SPA
- **THEN** a resposta é a da rota de API, com o mesmo contrato de antes do
  serving estático.

#### Scenario: Método não-GET fora de prefixo de API não recebe index.html

- **WHEN** um cliente faz `POST` (ou outro método não-`GET`/`HEAD`) para um
  caminho que não corresponde a nenhuma rota
- **THEN** o fallback não intercepta e a resposta é o `404` padrão, sem corpo
  de HTML da SPA.

### Requirement: Política de cache por classe de artefato

O serving da SPA SHALL diferenciar cache por classe de artefato: assets com
hash de conteúdo no nome (`/assets/*`) SHALL sair com `Cache-Control` imutável
de longa duração, e o `index.html` SHALL sair sem cache, para que cada deploy
propague imediatamente. A detecção da classe do artefato (se o caminho está sob
`/assets/`) SHALL ser independente do separador de caminho do sistema
operacional, de modo que o header imutável seja emitido de forma idêntica em
Windows (`\`) e em ambientes POSIX (`/`).

#### Scenario: Asset com hash é imutável

- **WHEN** um navegador requisita um asset sob `/assets/`
- **THEN** a resposta inclui `Cache-Control` com `max-age` de longa duração e
  `immutable`.

#### Scenario: Asset com hash é imutável independente do SO

- **WHEN** a API roda em um sistema cujo separador de caminho é `\` (Windows) e
  um navegador requisita um asset sob `/assets/`
- **THEN** a resposta inclui o mesmo `Cache-Control` imutável de longa duração
  emitido em ambientes POSIX, sem cair no default de cache do servidor de
  estáticos (`max-age=0`).

#### Scenario: index.html nunca é cacheado

- **WHEN** um navegador requisita `/` ou qualquer caminho que resulta no
  fallback de `index.html`
- **THEN** a resposta inclui `Cache-Control: no-store`.

### Requirement: Serving condicionado à configuração, com falha explícita

O serving estático SHALL ser ativado apenas quando o diretório do build é
configurado (`WEB_DIST_DIR`). Sem a configuração, a API SHALL comportar-se
exatamente como antes (nenhum estático servido) — preservando dev com Vite. Com
a configuração apontando para diretório inválido (inexistente ou sem
`index.html`), o processo SHALL falhar no arranque em vez de degradar
silenciosamente.

#### Scenario: Sem configuração, comportamento atual

- **WHEN** a API sobe sem `WEB_DIST_DIR` e um cliente faz `GET /` ou `GET`
  de um caminho desconhecido
- **THEN** a resposta é a mesma de hoje (nenhum `index.html` servido).

#### Scenario: Configuração inválida falha no arranque

- **WHEN** a API sobe com `WEB_DIST_DIR` apontando para um diretório
  inexistente ou sem `index.html`
- **THEN** o processo falha na inicialização com erro explícito, sem ficar no
  ar servindo só a API.

### Requirement: Artefato único de deploy entrega SPA e API

A imagem de container publicada pelo pipeline de deploy SHALL conter o build
da SPA junto com a API, com `WEB_DIST_DIR` apontando para ele, de modo que o
fluxo existente (`docker build` → push → `gcloud run deploy`) publique as duas
juntas e o rollback de revisão do Cloud Run reverta as duas atomicamente.

#### Scenario: Imagem construída contém a SPA

- **WHEN** a imagem da API é construída pelo Dockerfile do monorepo
- **THEN** ela contém o `dist/` de `apps/web` e define `WEB_DIST_DIR`
  apontando para ele, sem exigir mudança no workflow de deploy.
