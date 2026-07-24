## ADDED Requirements

### Requirement: Alteração da própria senha

O sistema SHALL permitir que qualquer pessoa autenticada altere a própria senha em `POST /auth/password`, informando a senha atual e a nova senha. A senha atual SHALL ser verificada contra o hash armazenado como prova de posse, e a alteração SHALL ser recusada sem alterar dado algum quando ela não conferir. O papel da pessoa NÃO SHALL influenciar o acesso a esta rota — inclusive `global_admin`, cuja senha só muda por este caminho. Referência: PRD US 1.3.

#### Scenario: Troca válida altera a senha

- **WHEN** uma pessoa autenticada informa a senha atual correta e uma nova senha que atende à política
- **THEN** a senha é substituída pelo hash da nova, a pessoa segue autenticada na sessão corrente e passa a autenticar-se com a nova senha

#### Scenario: Senha atual incorreta é recusada com causa explícita

- **WHEN** a senha atual informada não confere com o hash armazenado
- **THEN** a alteração é recusada indicando que a senha atual está incorreta, e a senha vigente permanece inalterada

#### Scenario: Rota exige sessão

- **WHEN** `POST /auth/password` é chamado sem sessão válida
- **THEN** o sistema responde não autenticado e nenhuma senha é alterada

### Requirement: Política de tamanho mínimo de senha

O sistema SHALL recusar qualquer senha, em qualquer ponto de entrada (cadastro de pessoa e alteração da própria senha), cujo comprimento seja inferior ao mínimo definido, indicando o requisito não atendido e sem alterar dado algum. A senha gerada na redefinição administrativa SHALL sempre satisfazer essa política. A validação SHALL ocorrer no servidor; a validação equivalente na SPA é conveniência de UX e NÃO SHALL ser a linha de defesa. Senhas já armazenadas abaixo do mínimo NÃO SHALL ser invalidadas retroativamente — a política vale na entrada. Referência: PRD US 1.3 (cenário 3).

#### Scenario: Senha curta é recusada na troca

- **WHEN** uma pessoa informa uma nova senha menor que o mínimo exigido
- **THEN** a alteração é recusada com aviso do requisito não atendido, antes de qualquer escrita

#### Scenario: Senha curta é recusada no cadastro

- **WHEN** um administrador cadastra uma pessoa com senha inicial menor que o mínimo exigido
- **THEN** o cadastro é recusado e nenhuma conta é criada

#### Scenario: Login de senha legada continua funcionando

- **WHEN** uma pessoa cuja senha foi definida antes da política autentica-se com essa senha
- **THEN** o login é aceito normalmente, pois a política não é aplicada retroativamente

### Requirement: Redefinição administrativa de senha

O sistema SHALL permitir que a administração redefina a senha de outra pessoa em `POST /users/:id/password`, **sem** exigir a senha atual. O sistema SHALL **gerar** a nova senha — o solicitante NÃO SHALL informá-la — usando gerador criptograficamente seguro e alfabeto sem caracteres ambíguos, e SHALL devolvê-la em texto claro **exclusivamente** nesta resposta. A senha gerada NÃO SHALL ser persistida em texto claro, NÃO SHALL aparecer em log de aplicação nem em mensagem de erro, e NÃO SHALL ser recuperável por qualquer consulta posterior. Referência: PRD US 1.4 (cenário 1); design.md D7.

#### Scenario: Redefinição devolve a senha gerada uma única vez

- **WHEN** um administrador dentro do seu alcance redefine a senha de uma pessoa
- **THEN** o sistema grava o hash da senha gerada e devolve essa senha na resposta, e nenhuma consulta posterior a expõe

#### Scenario: Senha informada pelo solicitante é ignorada

- **WHEN** a requisição de redefinição inclui uma senha escolhida pelo solicitante
- **THEN** o sistema a ignora e usa a senha que gerou

#### Scenario: Senha gerada atende à política

- **WHEN** o sistema gera a senha de uma redefinição
- **THEN** ela satisfaz o tamanho mínimo da política e não contém caracteres ambíguos

### Requirement: Alcance da redefinição decidido pelo papel do alvo

O sistema SHALL autorizar a redefinição administrativa a partir do papel da **pessoa alvo**, lido do banco na mesma transação da operação, e NUNCA a partir de papel informado na requisição. Um `unit_admin` SHALL redefinir a senha apenas de `collaborator`, e o isolamento por unidade SHALL continuar imposto pela RLS de `users`, não apenas por checagem de aplicação. Um `global_admin` SHALL redefinir a senha de `collaborator` e de `unit_admin`. A senha de um `global_admin` NÃO SHALL ser redefinida por ninguém — nem por outro `global_admin` — restando apenas a alteração pela própria pessoa. Alvo fora do alcance SHALL ser recusado com permissão insuficiente, sem distinguir o subcaso de alvo inexistente ou escondido pela RLS (fail-closed). Referência: PRD US 1.4 (cenário 2); design.md D5.

#### Scenario: unit_admin redefine senha de colaborador da própria unidade

- **WHEN** um `unit_admin` redefine a senha de um `collaborator` da sua unidade
- **THEN** a operação é autorizada e a senha gerada é devolvida

#### Scenario: unit_admin não redefine senha de outro unit_admin

- **WHEN** um `unit_admin` tenta redefinir a senha de um `unit_admin`
- **THEN** a ação é recusada com permissão insuficiente e nenhuma senha é alterada

#### Scenario: unit_admin não redefine senha de global_admin da própria unidade

- **WHEN** um `unit_admin` tenta redefinir a senha de um `global_admin` lotado na sua própria unidade, cuja linha a RLS lhe expõe
- **THEN** a ação é recusada com permissão insuficiente e nenhuma senha é alterada

#### Scenario: unit_admin não alcança pessoa de outra unidade

- **WHEN** um `unit_admin` tenta redefinir a senha de uma pessoa de outra unidade
- **THEN** a ação é recusada de forma indistinguível do alvo inexistente, sem alterar dado algum

#### Scenario: global_admin redefine senha de unit_admin

- **WHEN** um `global_admin` redefine a senha de um `unit_admin`
- **THEN** a operação é autorizada e a senha gerada é devolvida

#### Scenario: Nenhum global_admin tem a senha redefinida por outrem

- **WHEN** um `global_admin` tenta redefinir a senha de outro `global_admin`
- **THEN** a ação é recusada com permissão insuficiente

#### Scenario: Colaborador não redefine senha de ninguém

- **WHEN** um `collaborator` chama `POST /users/:id/password`
- **THEN** a ação é recusada com permissão insuficiente

### Requirement: Encerramento dos acessos abertos ao mudar a senha

O sistema SHALL registrar em `users` o instante da última mudança de senha e SHALL recusar, na revalidação por requisição, qualquer sessão emitida antes desse instante. Alterar a própria senha SHALL encerrar as demais sessões da pessoa e SHALL preservar a sessão corrente, reemitindo-a. A redefinição administrativa SHALL encerrar **todas** as sessões da pessoa alvo, de imediato, sem depender da expiração do token. O instante gravado SHALL ser a única fonte de tempo usada para reemitir a sessão corrente, evitando divergência entre relógios. Referência: PRD US 1.3 (cenário 4) e US 1.4 (cenário 3); design.md D1/D2.

#### Scenario: Sessão anterior à troca é recusada

- **WHEN** chega uma requisição com sessão ainda não expirada, porém emitida antes da última mudança de senha da pessoa
- **THEN** o acesso é negado na revalidação por requisição, sem depender de expirar o token

#### Scenario: Sessão corrente sobrevive à própria troca

- **WHEN** uma pessoa altera a própria senha
- **THEN** a sessão em que ela realizou a operação continua válida nas requisições seguintes, e as demais sessões dela deixam de ser aceitas

#### Scenario: Redefinição administrativa corta o acesso em curso

- **WHEN** a senha de uma pessoa é redefinida pela administração enquanto ela tem acesso aberto
- **THEN** as requisições seguintes dessa sessão são recusadas e a senha anterior deixa de autenticar

### Requirement: Consulta do próprio perfil

O sistema SHALL expor `GET /auth/profile`, que devolve à pessoa autenticada seus dados cadastrais para consulta — nome, e-mail, nome da unidade e papel — e NÃO SHALL expor senha, hash de senha ou dados de terceiros. Esta rota NÃO SHALL oferecer escrita: a alteração de dados cadastrais permanece atribuição da administração. Referência: PRD US 1.3 (cenário 5); design.md D6.

#### Scenario: Perfil devolve dados da pessoa autenticada

- **WHEN** uma pessoa autenticada consulta `GET /auth/profile`
- **THEN** recebe seu nome, e-mail, nome da unidade e papel, sem qualquer material de senha

#### Scenario: Perfil exige sessão

- **WHEN** `GET /auth/profile` é chamado sem sessão válida
- **THEN** o sistema responde não autenticado
