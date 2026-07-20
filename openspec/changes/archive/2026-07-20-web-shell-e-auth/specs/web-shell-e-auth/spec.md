## ADDED Requirements

### Requirement: SPA servida na mesma origem da API

A aplicação web SHALL ser servida na **mesma origem** da API, de modo que o
cookie de sessão `HttpOnly`/`SameSite=Strict` acompanhe as requisições sem
necessidade de CORS e sem qualquer alteração no backend. Em desenvolvimento,
o servidor de dev SHALL encaminhar (proxy) os prefixos de API existentes
(`/auth`, `/files`, `/folders`, `/users`, `/grants`, `/trash`, `/audit`,
`/dashboard`, `/search`, `/health`) para a API local. Em produção, o url-map
do load balancer SHALL rotear esses mesmos prefixos para a API (Cloud Run) e as
demais rotas para o bucket estático da SPA. O cliente NÃO SHALL ler nem
persistir o token de sessão (é `HttpOnly`).

Referência: PRD US 1.2, NFR de Segurança; `apps/api/src/lib/session-cookie.ts`;
design.md D1/D2/D3 do change `web-shell-e-auth`.

#### Scenario: Requisição autenticada carrega o cookie de sessão
- **WHEN** a SPA faz uma chamada a um endpoint de API pela mesma origem
- **THEN** o cookie de sessão é enviado automaticamente pelo browser, sem CORS,
  e o cliente não manipula o token diretamente

### Requirement: Autenticação por login com sessão de servidor

A SPA SHALL oferecer uma página de **login** que envia e-mail e senha a
`POST /auth/login`; em caso de sucesso, SHALL registrar a identidade retornada
(`AuthenticatedIdentity`) e navegar para o shell autenticado. Em caso de
credenciais inválidas (`401`), SHALL exibir **uma mensagem genérica** que não
revela se o e-mail existe ou se a senha estava errada (US 1.2 cenário 2). Em
caso de conta desativada (`403`, resposta distinta que a API já produz em
`POST /auth/login`), SHALL exibir um **aviso específico de conta indisponível**,
sem confundir com a mensagem genérica de credenciais inválidas (US 1.2
cenário 3). Ao abrir a aplicação, a SPA SHALL fazer **bootstrap da sessão** por
`GET /auth/me`; se houver sessão válida, entra autenticada, caso contrário
permanece deslogada. O **logout** SHALL chamar `POST /auth/logout` e limpar o
estado de sessão do cliente.

Referência: PRD US 1.2 (cenários 1, 2 e 3); design.md D3.

#### Scenario: Login com credenciais válidas
- **WHEN** a pessoa informa e-mail e senha corretos e confirma o login
- **THEN** a identidade é registrada no cliente e a aplicação navega para o
  shell autenticado

#### Scenario: Login com credenciais inválidas mostra mensagem genérica
- **WHEN** a pessoa informa e-mail inexistente ou senha incorreta
- **THEN** a SPA exibe uma única mensagem genérica de credenciais inválidas, sem
  distinguir e-mail de senha, e permanece na página de login

#### Scenario: Conta desativada mostra aviso específico no login
- **WHEN** a pessoa informa credenciais corretas de uma conta desativada pela
  administração
- **THEN** a SPA exibe um aviso específico de conta indisponível (distinto da
  mensagem genérica de credenciais inválidas) e permanece na página de login

#### Scenario: Bootstrap de sessão ao abrir a aplicação
- **WHEN** a aplicação é aberta e existe uma sessão válida no cookie
- **THEN** `GET /auth/me` resolve a identidade e a aplicação entra autenticada
  sem exigir novo login

#### Scenario: Logout encerra a sessão no cliente
- **WHEN** a pessoa aciona o logout
- **THEN** a SPA chama `POST /auth/logout`, limpa o estado de sessão e volta à
  página de login

### Requirement: Guarda de rota por autenticação e por papel

As rotas autenticadas SHALL ser protegidas: sem identidade resolvida, o acesso
SHALL redirecionar para `/login`. As áreas restritas a administração (gestão de
pessoas, painel gerencial e consulta ampla de auditoria) SHALL exigir papel
`unit_admin` ou `global_admin`; um `collaborator` que tente acessá-las SHALL ser
impedido no cliente. Uma resposta **401** de qualquer chamada autenticada
(sessão expirada ou conta desativada, revalidada pelo servidor a cada
requisição) SHALL encerrar a sessão no cliente e redirecionar para `/login`.

Referência: PRD US 1.2 (cenário 3), RF #3; design.md D4/D6.

#### Scenario: Rota protegida sem sessão redireciona ao login
- **WHEN** uma pessoa sem sessão tenta abrir uma rota autenticada
- **THEN** é redirecionada para `/login`, sem renderizar a rota protegida

#### Scenario: 401 em chamada autenticada encerra a sessão
- **WHEN** uma chamada autenticada retorna 401 (sessão expirada ou conta
  desativada)
- **THEN** o cliente limpa o estado de sessão e redireciona para `/login`

#### Scenario: Área de administração exige papel de administrador
- **WHEN** um `collaborator` tenta acessar uma rota restrita a administração
- **THEN** o acesso é impedido no cliente (o item de menu não é oferecido e a
  rota não é renderizada para o papel)

### Requirement: Shell de layout com identidade e navegação

A aplicação autenticada SHALL apresentar um **shell** de layout (usando o design
system Ant Design) com área de navegação, cabeçalho exibindo a identidade e o
papel do usuário corrente e a ação de logout, e uma área de conteúdo onde as
demais fatias montam suas telas. Os itens de navegação SHALL respeitar o papel
do usuário (itens de administração só aparecem para administradores).

Referência: PRD NFR de Usabilidade ("interface limpa e premium, navegação
familiar"); design.md D5/D6.

#### Scenario: Shell mostra identidade e navegação conforme o papel
- **WHEN** uma pessoa autenticada visualiza o shell
- **THEN** vê seu nome/identidade e papel, a ação de logout e apenas os itens de
  navegação permitidos ao seu papel
