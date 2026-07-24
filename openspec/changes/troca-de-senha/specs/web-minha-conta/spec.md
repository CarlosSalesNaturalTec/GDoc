## ADDED Requirements

### Requirement: Página "Minha conta" acessível a qualquer pessoa autenticada

A SPA SHALL oferecer a página `/minha-conta` a **toda** pessoa autenticada, independentemente do papel, alcançável pelo menu de identidade do shell. A página SHALL exibir os dados cadastrais da pessoa — nome, e-mail, unidade e papel — obtidos de `GET /auth/profile`, e SHALL apresentá-los **somente para consulta**, sem qualquer campo editável, pois a alteração desses dados permanece atribuição da administração. Referência: PRD US 1.3 (cenário 5).

#### Scenario: Colaborador acessa a própria conta

- **WHEN** uma pessoa com papel `collaborator` navega até `/minha-conta`
- **THEN** a página é exibida com seu nome, e-mail, unidade e papel

#### Scenario: Dados cadastrais não são editáveis

- **WHEN** a pessoa visualiza seus dados em "Minha conta"
- **THEN** eles aparecem apenas para leitura, sem campo de edição nem ação de salvar

### Requirement: Formulário de alteração da própria senha

A SPA SHALL apresentar em "Minha conta" um formulário que solicita a senha atual e a nova senha e, ao confirmar, chama `POST /auth/password`. A SPA SHALL validar localmente o tamanho mínimo antes de enviar, como conveniência de UX, e NÃO SHALL tratar essa validação como linha de defesa — o servidor permanece o guardião. Em sucesso, a SPA SHALL limpar os campos e confirmar a alteração, mantendo a pessoa autenticada e sem redirecioná-la ao login. Referência: PRD US 1.3 (cenários 1 e 3).

#### Scenario: Troca bem-sucedida mantém a pessoa na aplicação

- **WHEN** a pessoa informa a senha atual correta e uma nova senha válida e confirma
- **THEN** a SPA exibe confirmação da alteração, limpa os campos e a pessoa continua navegando autenticada

#### Scenario: Nova senha curta é barrada antes do envio

- **WHEN** a pessoa informa uma nova senha menor que o mínimo exigido
- **THEN** a SPA sinaliza o requisito não atendido e não chama a API

#### Scenario: Senha atual incorreta é informada com clareza

- **WHEN** a API recusa a alteração por senha atual incorreta
- **THEN** a SPA exibe essa causa especificamente, preservando o preenchimento da nova senha para nova tentativa

### Requirement: Nova senha nunca sobrevive ao formulário

A SPA NÃO SHALL persistir a senha atual nem a nova senha em cache de consulta, armazenamento local, histórico de navegação ou estado global após a conclusão da operação; os valores SHALL existir apenas no estado do formulário e SHALL ser descartados ao final. Referência: PRD RNF de Segurança; design.md D7.

#### Scenario: Campos são descartados após a troca

- **WHEN** a alteração de senha é concluída com sucesso
- **THEN** os valores digitados são descartados do estado do formulário e não permanecem em nenhum cache do cliente
