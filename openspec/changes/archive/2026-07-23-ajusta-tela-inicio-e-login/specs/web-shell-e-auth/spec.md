## MODIFIED Requirements

### Requirement: Autenticação por login com sessão de servidor

A SPA SHALL oferecer uma página de **login** que envia e-mail e senha a
`POST /auth/login`; em caso de sucesso, SHALL registrar a identidade retornada
(`AuthenticatedIdentity`) e navegar **sempre para a tela de Início (`/`)** do
shell autenticado, independentemente da rota que a pessoa tenha tentado acessar
antes do login. Em caso de credenciais inválidas (`401`), SHALL exibir **uma
mensagem genérica** que não revela se o e-mail existe ou se a senha estava
errada (US 1.2 cenário 2). Em caso de conta desativada (`403`, resposta distinta
que a API já produz em `POST /auth/login`), SHALL exibir um **aviso específico de
conta indisponível**, sem confundir com a mensagem genérica de credenciais
inválidas (US 1.2 cenário 3). Ao abrir a aplicação, a SPA SHALL fazer
**bootstrap da sessão** por `GET /auth/me`; se houver sessão válida, entra
autenticada, caso contrário permanece deslogada. O **logout** SHALL chamar
`POST /auth/logout` e limpar o estado de sessão do cliente.

Referência: PRD US 1.2 (cenários 1, 2 e 3); design.md D3.

#### Scenario: Login com credenciais válidas navega para a Início
- **WHEN** a pessoa informa e-mail e senha corretos e confirma o login
- **THEN** a identidade é registrada no cliente e a aplicação navega para a tela
  de Início (`/`) do shell autenticado

#### Scenario: Login descarta o deep-link solicitado antes da autenticação
- **WHEN** uma pessoa sem sessão tenta abrir uma rota autenticada específica, é
  redirecionada ao login e então autentica com credenciais válidas
- **THEN** a aplicação navega para a tela de Início (`/`), e não para a rota
  originalmente solicitada

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
