# Roadmap do Frontend (`apps/web`) — GDoc

Documento auxiliar para **implementação em partes**. Cataloga todas as fatias
necessárias para levar a SPA do GDoc de zero a paridade com o backend (Épicos
1–9, já completos). Cada fatia é uma **change OpenSpec** própria, referencia as
histórias do PRD (`docs/prd_final.md`) já implementadas no back e depende do
shell da fatia 1.

> **Como usar:** implemente uma fatia por vez, na ordem de dependência abaixo.
> Antes de cada fatia, releia a US correspondente no PRD (critérios de aceitação
> são vinculantes) e crie a change com `/opsx:propose`. A fatia 1
> (`web-shell-e-auth`) já tem proposta criada.

## Decisões de fundação (valem para todas as fatias)

- **Design system: Ant Design v5** (não Tailwind cru). Tema/tokens via
  `ConfigProvider` (`locale` pt-BR, cor primária/raio/tipografia); wrapper
  `<App>` para `message`/`notification`/`Modal`. O AntD cobre **UI**.
- **Estado de servidor: TanStack Query** (cache, invalidação, mutations) sobre um
  `apiClient` (`fetch`, `credentials: 'include'`). **Zod** valida a fronteira,
  espelhando `@gdoc/shared` (fonte única de DTOs).
- **Mesma origem para a sessão**: o cookie é `HttpOnly`/`SameSite=Strict` e a API
  não tem CORS ⇒ SPA e API partilham origem. **Dev**: proxy do Vite. **Prod**:
  `path_matcher` no url-map → Cloud Run NEG. O cliente **nunca** lê/persiste o
  token. `401` central → limpa sessão e vai a `/login`.
- **Roteamento: React Router** com rota-guarda por autenticação e por papel
  (`collaborator` / `unit_admin` / `global_admin`).
- **Transferência de bytes**: sempre via **URL assinada** — a SPA pede a URL à API
  (após checagem de permissão) e transfere direto ao GCS. Upload é **PUT
  simples** (não resumável).
- **Testes**: Vitest + Testing Library por fatia; cada cenário de spec é um teste.
- **Paridade dev**: a SPA roda sob demanda (`npm run dev:web`); o SessionStart
  hook não sobe a app.

## Fatias

### Fatia 1 — Shell + Autenticação  ✅ proposta criada
- **Capability**: `web-shell-e-auth`
- **PRD**: US 1.2 (login/sessão), NFR de Usabilidade (shell premium)
- **Endpoints**: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
- **Entrega**: projeto Vite/React/TS + AntD, `apiClient`+Query+Zod, roteador com
  guarda, contexto de sessão, página de login, shell (`Layout`/`Menu`/header com
  identidade+logout), e a decisão de mesma origem (proxy dev + url-map prod).
- **AntD**: `ConfigProvider`, `<App>`, `Layout`, `Menu`, `Form`, `Result`, `Spin`
- **Depende de**: — (base de todas)

### Fatia 2 — Navegação e explorador de arquivos/pastas  ✅ entregue
- **Capability**: `web-navegacao`
- **PRD**: Épico 2 (US 2.x), Épico 4 (visibilidade), RF #5
- **Endpoints**: `GET /folders/root/contents`, `GET /folders/:id/contents`,
  `POST /folders`, `DELETE /folders/:id`, `PATCH /files/:id`,
  `DELETE /files/:id`
- **Entrega**: explorador estilo file-manager com **breadcrumb**, listagem
  unificada (arquivos+subpastas), criar/excluir pasta, renomear/excluir
  arquivo com confirmação e aviso de permissão insuficiente em 403,
  deep-link bloqueado a pasta sem acesso (US 4.2)
- **AntD**: `Breadcrumb`, `Table`, `Modal`, `Popconfirm`, `Result`, `message`
- **Lacuna conhecida**: **renomear pasta** não está disponível — o backend
  não expõe `PATCH /folders/:id` (só `POST`/`GET contents`/`DELETE`/
  `restore`). Fica para uma change de backend futura que adicione o endpoint
  (dono-ou-grant `rename` + auditoria); o frontend ganha a ação correspondente
  quando ele existir.
- **Depende de**: Fatia 1

### Fatia 3 — Visualização e download  ✅ entregue
- **Capability**: `web-visualizacao`
- **PRD**: US 9.2 (cenários 1 e 2), Épico 2, RF #10/#16
- **Endpoints**: `POST /files/:id/view-url` (retorna `ViewUrlResponse`
  discriminado), `POST /files/:id/download-url`
- **Entrega**: nome do arquivo clicável e ação "Visualizar" abrem um `Modal`
  de preview que chama `view-url` uma vez e ramifica pela resposta —
  renderização inline por categoria de MIME (imagem, vídeo, áudio, PDF/texto
  em `<iframe>`) ou mensagem **"pré-visualização indisponível"** + botão de
  download **conforme `download.available`**; ação "Baixar" por navegação numa
  âncora para a URL assinada `attachment`; 403 em qualquer uma das duas
  chamadas exibe aviso de permissão insuficiente, sem expor conteúdo
- **AntD**: `Modal`, `Image`, `<iframe>` (PDF/nativos), `Result`/`Empty`, `Button`
- **Depende de**: Fatia 2

### Fatia 4 — Upload (múltiplos arquivos e pasta)
- **Capability sugerida**: `web-upload`
- **PRD**: Épico 3 (US 3.x), RF #6, cota (RF #13)
- **Endpoints**: `POST /files/upload-url` (unitário), `POST /files/upload-urls`
  (lote/pasta, com `relativePath`), reconciliação por `storage-events` (server)
- **Entrega**: upload de múltiplos arquivos com **progresso individual** e
  **falha independente**; upload de **pasta** preservando hierarquia; aviso ao
  atingir a cota
- **AntD**: `Upload` (`customRequest` → pede URL assinada e faz PUT ao GCS com
  `onProgress`; `directory` para pasta), `Progress`, `notification`
- **Depende de**: Fatia 2

### Fatia 5 — Busca e filtros
- **Capability sugerida**: `web-busca`
- **PRD**: US 9.1, RF #15
- **Endpoints**: `GET /files/search` (nome + filtros tipo/autor/data)
- **Entrega**: página de busca com filtros combináveis e **botão de limpar
  filtros** (volta ao estado inicial permitido)
- **AntD**: `Input.Search`, `Select` (tipo/autor), `DatePicker.RangePicker`,
  `Button`, `Table`
- **Depende de**: Fatia 2 (reusa a listagem/visualização)

### Fatia 6 — Permissões granulares
- **Capability sugerida**: `web-permissoes`
- **PRD**: Épico 4 (US 4.x), RF #7/#8
- **Endpoints**: rotas de `grants` (conceder/revogar por pasta ou arquivos,
  verbos, expiração opcional)
- **Entrega**: diálogo de concessão por pasta/arquivo — seleção de pessoa(s),
  verbos (`view`/`download`/`upload`/`rename`/`delete`) e **prazo de expiração**;
  visão das permissões vigentes
- **AntD**: `Modal`, `Form`, `Select`, `Checkbox.Group`, `DatePicker`, `Table`
- **Depende de**: Fatia 2

### Fatia 7 — Lixeira e retenção
- **Capability sugerida**: `web-lixeira`
- **PRD**: Épico 6 (US 6.1), RF #12
- **Endpoints**: listar lixeira, restaurar (o expurgo é rotina do servidor)
- **Entrega**: tela de lixeira com itens excluídos, prazo de retenção e
  **restauração ao local de origem**
- **AntD**: `Table`, `Popconfirm`, `Tag` (dias restantes), `message`
- **Depende de**: Fatia 2

### Fatia 8 — Auditoria
- **Capability sugerida**: `web-auditoria`
- **PRD**: Épico 7 (US 7.x), RF #11
- **Endpoints**: consulta de auditoria de acesso a arquivo (por dono e por
  administrador dentro do alcance)
- **Entrega**: consulta do registro (pessoa, ação, data/hora) do arquivo, com o
  alcance respeitado
- **AntD**: `Table`, `DatePicker.RangePicker`, `Descriptions`
- **Depende de**: Fatia 2 (abre a partir do arquivo)

### Fatia 9 — Gestão de pessoas (admin)
- **Capability sugerida**: `web-pessoas`
- **PRD**: Épico 1 (US 1.1), RF #1/#2/#3
- **Endpoints**: rotas de `users` (criar/editar/desativar pessoas; sem
  autocadastro)
- **Entrega**: CRUD de pessoas (nome, unidade, telefone, e-mail, função, área,
  observação; e-mail único), restrito a administradores
- **AntD**: `Table`, `Modal`, `Form`, `Select`, `Switch` (ativo/inativo)
- **Depende de**: Fatia 1 (rota de administração, guarda por papel)

### Fatia 10 — Painel gerencial
- **Capability sugerida**: `web-painel`
- **PRD**: Épico 8 (US 8.2), RF #14
- **Endpoints**: `GET /dashboard` (cartões + séries agregadas)
- **Entrega**: cartões de estatística e gráficos (arquivos por tipo, envios por
  mês, espaço usado vs. disponível), respeitando o alcance do administrador
- **AntD**: `Card`, `Statistic`, `@ant-design/plots` (gráficos)
- **Depende de**: Fatia 1 (rota de administração)

## Grafo de dependências

```
Fatia 1 (shell + auth)  ──────────────┬──────────────┬───────────────┐
        │                              │              │               │
        ▼                              ▼              ▼               ▼
     Fatia 2 (navegação)           Fatia 9        Fatia 10        (guarda de
        │                          (pessoas)      (painel)         papel usa
        ├── Fatia 3 (visualização/download)                        a fatia 1)
        ├── Fatia 4 (upload)
        ├── Fatia 5 (busca)
        ├── Fatia 6 (permissões)
        ├── Fatia 7 (lixeira)
        └── Fatia 8 (auditoria)
```

Ordem de execução sugerida: **1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10**. As
fatias 9 e 10 (administração) dependem só da fatia 1 e podem ser antecipadas se
a prioridade for o valor gerencial; as fatias 3–8 dependem do explorador
(fatia 2).
