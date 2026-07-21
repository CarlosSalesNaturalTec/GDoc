# web-lixeira Specification

## Purpose

Define os requisitos verificáveis da tela de **Lixeira** da SPA do GDoc — a
rota `/lixeira`, aberta a **qualquer papel**, que lista as raízes de exclusão
no alcance do requisitante via `GET /trash` (nome, tipo, data de exclusão e Tag
de dias restantes por urgência) e oferece restauração por linha, despachando
por tipo do item para `POST /files/:id/restore` ou `POST /folders/:id/restore`.
Implementa o lado de frontend da **US 6.1** (cenário 1) e do **RF #12** do PRD
(`docs/prd_final.md`), consumindo as rotas já entregues pelo backend do
Épico 6, sem re-descrever seus cenários.

## Requirements

### Requirement: Tela de lixeira lista os itens excluídos no alcance

A SPA SHALL oferecer uma **tela de lixeira** (rota `/lixeira`, sob autenticação,
para **qualquer papel**) que chama `GET /trash` e exibe **exclusivamente os itens
retornados pelo servidor** — as raízes de exclusão no alcance do requisitante
(próprias, com grant `delete`, ou toda a unidade se administrador). A SPA NÃO
SHALL inferir alcance nem filtrar itens no cliente. Cada linha SHALL mostrar
**nome**, **tipo** (arquivo ou pasta), **data de exclusão** e **dias restantes**
até o vencimento. A coluna de dias restantes SHALL ser derivada de `expiresAt`
com um `Tag` cuja cor sinaliza urgência: **até 3 dias restantes em vermelho**,
até 7 dias em laranja/aviso, e neutro acima disso. Quando a lixeira não tem item
algum, a SPA SHALL exibir um estado vazio claro, sem erro.

Referência: PRD US 6.1 (cenário 1), RF #12; design.md D1/D4.

#### Scenario: Lista mostra os itens de GET /trash com dias restantes
- **WHEN** o usuário abre a tela de lixeira e há itens na lixeira no seu alcance
- **THEN** a SPA chama `GET /trash` e exibe cada item com nome, tipo, data de
  exclusão e um `Tag` de dias restantes derivado de `expiresAt`

#### Scenario: Item próximo do vencimento é destacado em vermelho
- **WHEN** um item tem 3 dias ou menos até o vencimento
- **THEN** a SPA exibe o `Tag` de dias restantes desse item em vermelho

#### Scenario: Lixeira vazia exibe estado vazio
- **WHEN** `GET /trash` não retorna item algum
- **THEN** a SPA exibe uma indicação clara de lixeira vazia, sem erro

### Requirement: Restaurar item volta ao local de origem

Cada linha SHALL oferecer uma ação **"Restaurar"**, confirmada por `Popconfirm`,
que **despacha pelo tipo do item**: um **arquivo** chama
`POST /files/:id/restore` e uma **pasta** chama `POST /folders/:id/restore`. Ao
restaurar com sucesso, a SPA SHALL remover o item da lista da lixeira e SHALL
invalidar as listagens do explorador (`web-navegacao`) para que o item reapareça
no seu local sem recarregar a página. A SPA NÃO SHALL oferecer exclusão
permanente nem "esvaziar lixeira" — o expurgo é exclusivamente a rotina diária de
servidor.

Referência: PRD US 6.1 (cenário 1), RF #12; design.md D2/D5.

#### Scenario: Restaurar um arquivo chama a rota de arquivo
- **WHEN** o usuário aciona "Restaurar" numa linha cujo tipo é arquivo e confirma
- **THEN** a SPA chama `POST /files/:id/restore`, remove o item da lixeira e
  invalida as listagens do explorador

#### Scenario: Restaurar uma pasta chama a rota de pasta
- **WHEN** o usuário aciona "Restaurar" numa linha cujo tipo é pasta e confirma
- **THEN** a SPA chama `POST /folders/:id/restore`, remove o item da lixeira e
  invalida as listagens do explorador

### Requirement: Aviso quando o arquivo volta à raiz

Ao restaurar um **arquivo**, a SPA SHALL interpretar o campo `redirectedToRoot`
da resposta: quando `false`, SHALL informar que o arquivo foi **restaurado ao
local de origem**; quando `true` (a pasta de origem não existe mais), SHALL
informar de forma **distinta** que a pasta de origem não existe mais e que o
arquivo foi restaurado na **raiz da unidade**. Ao restaurar uma **pasta**, a SPA
SHALL sempre informar restauração ao local de origem (pasta nunca muda de local).

Referência: PRD US 6.1 (cenário 1); design.md D3.

#### Scenario: Arquivo restaurado ao local de origem
- **WHEN** a restauração de um arquivo retorna `redirectedToRoot: false`
- **THEN** a SPA informa que o arquivo foi restaurado ao seu local de origem

#### Scenario: Arquivo redirecionado à raiz é avisado de forma distinta
- **WHEN** a restauração de um arquivo retorna `redirectedToRoot: true`
- **THEN** a SPA informa, de forma distinta, que a pasta de origem não existe
  mais e que o arquivo foi restaurado na raiz da unidade

### Requirement: 403 na restauração exibe aviso e recarrega

A SPA SHALL tratar um **403** na restauração — quando o item já foi expurgado,
deixou de ser uma raiz de exclusão, ou a permissão foi perdida entre listar e
restaurar — exibindo um **aviso de permissão insuficiente** e recarregando a
lista da lixeira. A SPA NÃO SHALL distinguir os subcasos do 403 (que o servidor
unifica de propósito) nem expor conteúdo.

Referência: PRD US 6.1 (cenário 1); design.md D6.

#### Scenario: Restauração negada avisa e recarrega
- **WHEN** uma tentativa de restauração retorna 403
- **THEN** a SPA exibe aviso de permissão insuficiente e recarrega a lista da
  lixeira, refletindo o estado atual do servidor
