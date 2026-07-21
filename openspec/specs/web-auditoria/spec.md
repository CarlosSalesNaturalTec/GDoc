# web-auditoria Specification

## Purpose

Define os requisitos verificáveis da consulta de **auditoria de acesso** na SPA
do GDoc — a ação **"Auditoria"** por-linha de arquivo no explorador
(`web-navegacao`), visível a **dono ou administrador**, que abre um modal
listando os eventos `view`/`download` do arquivo via `GET /files/:id/audit`
(pessoa via `actor.name ?? actor.email`, ação como `Tag` pt-BR, data/hora), do
mais recente ao mais antigo, com estado vazio (não-erro) e 403 fail-closed
neutro. Implementa o lado de frontend das **US 7.1** e **US 7.2** e do **RF
#11** do PRD (`docs/prd_final.md`), consumindo a rota já entregue pelo backend
do Épico 7 (`apps/api/src/routes/audit.ts`), sem re-descrever seus cenários.

## Requirements

### Requirement: Ação "Auditoria" no explorador, visível a dono ou administrador

O explorador (`web-navegacao`) SHALL oferecer, em **cada linha de arquivo**, uma
ação **"Auditoria"** que abre a consulta de acesso daquele arquivo. Pastas NÃO
SHALL ter essa ação (não há auditoria de acesso a pasta). A ação SHALL aparecer
quando o solicitante for **administrador** (`unit_admin`/`global_admin`) **OU**
for o **dono do arquivo** (`file.ownerId === identity.id`) — espelhando o gate já
usado pela ação "Permissões", estendido ao dono que a US 7.2 autoriza. O
colaborador que não é dono NÃO SHALL ver a ação naquele arquivo.

Esconder a ação é **conveniência de UX, não linha de defesa**: o servidor
(`canReadAudit`) permanece o único guardião e SHALL ser sempre quem autoriza a
consulta — a SPA NÃO SHALL tratar a visibilidade da ação como garantia de acesso.

Referência: PRD US 7.1, US 7.2, RF #11; design.md D1.

#### Scenario: Administrador vê a ação em qualquer arquivo da unidade
- **WHEN** um administrador (`unit_admin` ou `global_admin`) vê a linha de um
  arquivo no explorador
- **THEN** a SPA exibe a ação "Auditoria" nessa linha

#### Scenario: Dono vê a ação no próprio arquivo (US 7.2)
- **WHEN** um colaborador vê a linha de um arquivo cujo `ownerId` é o seu próprio
  identificador
- **THEN** a SPA exibe a ação "Auditoria" nessa linha

#### Scenario: Colaborador não vê a ação em arquivo alheio (US 7.2)
- **WHEN** um colaborador vê a linha de um arquivo do qual não é dono
- **THEN** a SPA NÃO exibe a ação "Auditoria" nessa linha

#### Scenario: Pasta não tem ação de auditoria
- **WHEN** o explorador exibe a linha de uma pasta
- **THEN** a SPA NÃO exibe a ação "Auditoria" nessa linha

### Requirement: Modal lista os acessos do arquivo

Ao acionar "Auditoria", a SPA SHALL abrir um **modal** que chama
`GET /files/:id/audit` **uma vez ao abrir** e exibe **exclusivamente os eventos
retornados pelo servidor** — os acessos `view`/`download` do arquivo, **do mais
recente ao mais antigo**. A SPA NÃO SHALL reordenar nem filtrar os eventos no
cliente. Cada linha SHALL mostrar **quem** realizou o acesso, **qual** ação e
**quando**:

- **quem**: o nome do ator (`actor.name`); quando o nome é nulo (pessoa que nunca
  o preencheu), a SPA SHALL exibir o **e-mail** (`actor.email`) em seu lugar.
- **qual**: a ação `view` como **"Visualizar"** e `download` como **"Baixar"**,
  em `Tag` pt-BR. Somente `view`/`download` são retornados pela consulta; a SPA
  NÃO SHALL exibir outros tipos de evento.
- **quando**: a data e hora do acesso (`createdAt`), formatada.

É uma **leitura pura**: abrir o modal NÃO SHALL produzir efeito colateral (a
consulta não registra novo evento) — a chamada fica habilitada apenas enquanto o
modal está aberto.

Referência: PRD US 7.1 (cenário 1), US 7.2 (cenário 1); design.md D2/D3/D4.

#### Scenario: Registro de acesso consultável (US 7.1 cenário 1)
- **WHEN** uma pessoa autorizada abre a auditoria de um arquivo que já teve
  visualizações e/ou downloads
- **THEN** a SPA chama `GET /files/:id/audit` e exibe cada acesso com quem
  realizou, a ação (Visualizar ou Baixar) e a data e hora, do mais recente ao
  mais antigo

#### Scenario: Ação exibida como rótulo pt-BR
- **WHEN** um evento tem ação `view` e outro tem ação `download`
- **THEN** a SPA exibe "Visualizar" para o primeiro e "Baixar" para o segundo, em
  `Tag`

#### Scenario: Ator sem nome cai no e-mail
- **WHEN** um evento tem `actor.name` nulo
- **THEN** a SPA exibe o `actor.email` desse ator em vez do nome

### Requirement: Estado vazio e 403 fail-closed da consulta

Um arquivo sem nenhum acesso registrado SHALL exibir um **estado vazio** claro
("nenhum acesso registrado"), sem erro — o servidor retorna lista vazia, que a
SPA NÃO SHALL tratar como falha. Um **403** na consulta — arquivo de outra
unidade, inexistente, na lixeira, ou solicitante que não é dono nem
administrador — SHALL exibir um aviso de **permissão insuficiente** neutro, **sem
distinguir os subcasos** (que o servidor unifica de propósito) e **sem** expor
conteúdo do arquivo.

Referência: PRD US 7.1, US 7.2; design.md D5.

#### Scenario: Arquivo sem acessos exibe estado vazio
- **WHEN** `GET /files/:id/audit` retorna uma lista de eventos vazia
- **THEN** a SPA exibe uma indicação clara de "nenhum acesso registrado", sem erro

#### Scenario: Consulta negada exibe aviso neutro
- **WHEN** `GET /files/:id/audit` retorna 403
- **THEN** a SPA exibe um aviso de permissão insuficiente, sem distinguir se o
  arquivo não existe, é de outra unidade ou o acesso foi negado, e sem expor
  conteúdo
