# bootstrap-producao Specification

## Purpose

Define os requisitos verificáveis da inicialização segura de um ambiente de
produção do GDoc: a criação do primeiro administrador global a partir de
credenciais obrigatórias e de forma idempotente, executável como um job em
container sem acesso de rede direto ao banco, e a garantia de que o seed de
dados de demonstração nunca roda em produção. Referência: PRD `docs/prd_final.md`.

## Requirements

### Requirement: Bootstrap do administrador global inicial

O sistema SHALL prover um comando de inicialização de produção que crie o
primeiro administrador global (papel `global_admin`) a partir de credenciais
fornecidas por configuração, aplicando antes as migrações de schema pendentes,
de modo que um ambiente recém-provisionado passe a ter exatamente um
administrador capaz de fazer login e cadastrar as demais pessoas.

O comando SHALL criar **somente** o administrador global e a sua unidade —
nunca usuários, unidades ou quaisquer dados de demonstração.

#### Scenario: Inicialização de banco vazio

- **WHEN** o comando de bootstrap executa contra um banco sem nenhum
  `global_admin`, com as credenciais obrigatórias definidas
- **THEN** as migrações pendentes são aplicadas e é criado um único usuário
  `global_admin` com o e-mail informado, senha armazenada como hash argon2 e
  vínculo a uma unidade real, sem criar nenhum outro usuário ou unidade de
  exemplo.

#### Scenario: Login do administrador criado

- **WHEN** o administrador global recém-criado informa o e-mail e a senha usados
  no bootstrap
- **THEN** é autenticado e passa a poder cadastrar pessoas pela administração.

### Requirement: Credenciais de bootstrap obrigatórias (fail-closed)

O comando de bootstrap SHALL exigir e-mail e senha do administrador por
configuração e SHALL abortar com falha (código de saída diferente de zero, sem
alterar o banco) quando qualquer uma estiver ausente, vazia ou igual a um valor
padrão de desenvolvimento conhecido — nunca recorrendo a credenciais padrão
inseguras.

#### Scenario: Credenciais ausentes

- **WHEN** o comando de bootstrap executa sem o e-mail e/ou a senha do
  administrador definidos
- **THEN** o comando falha com mensagem clara indicando as variáveis exigidas e
  não cria nenhum registro.

#### Scenario: Senha padrão de desenvolvimento recusada

- **WHEN** o comando de bootstrap executa com a senha igual ao valor padrão de
  desenvolvimento conhecido
- **THEN** o comando falha e não cria nenhum registro, exigindo uma senha
  própria.

### Requirement: Bootstrap idempotente

O comando de bootstrap SHALL ser idempotente: se já existe pelo menos um
`global_admin`, ele SHALL terminar com sucesso sem criar, duplicar ou alterar
usuários, permitindo reexecução segura.

#### Scenario: Reexecução com administrador já presente

- **WHEN** o comando de bootstrap executa e já existe um `global_admin`
- **THEN** nenhum usuário é criado ou modificado e o comando termina com sucesso,
  registrando que a inicialização já havia ocorrido.

### Requirement: Bootstrap executável sem acesso de rede direto ao banco

O sistema SHALL permitir executar o bootstrap em produção como um job em
container que roda a mesma imagem da aplicação e se conecta ao banco pela
integração gerenciada do ambiente de execução, sem depender de rota de rede
direta ou proxy na máquina do operador.

#### Scenario: Execução sob demanda como job

- **WHEN** o operador dispara o job de bootstrap de produção uma vez
- **THEN** o job aplica migrações e cria o administrador global usando a senha
  obtida do cofre de segredos, sem exigir conexão de rede local ao banco.

### Requirement: Seed de demonstração proibido em produção

O seed de dados de desenvolvimento SHALL recusar-se a executar quando o
ambiente é de produção, de modo que unidades e usuários de demonstração com
senha pública nunca sejam criados em produção nem por engano.

#### Scenario: Seed de dev abortado em produção

- **WHEN** o comando de seed de desenvolvimento executa com o ambiente marcado
  como produção
- **THEN** ele aborta com falha e não cria nenhuma unidade ou usuário de
  demonstração.

#### Scenario: Seed de dev inalterado fora de produção

- **WHEN** o comando de seed executa no ambiente de desenvolvimento
- **THEN** ele mantém o comportamento atual (cria o dataset de exemplo quando o
  banco está vazio e é no-op quando já há administrador).
