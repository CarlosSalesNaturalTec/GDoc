# Spec Delta

## ADDED Requirements

### Requirement: Pasta sem conteúdo orienta em vez de apresentar tabela vazia

A SPA SHALL apresentar, numa pasta sem itens visíveis à pessoa, uma mensagem
que explique a ausência e ofereça o próximo passo disponível, em vez da tabela
vazia herdada do design system. A ação oferecida SHALL respeitar a permissão
já resolvida pelo servidor — nenhuma ação que a pessoa não possa executar SHALL
ser apresentada.

#### Scenario: Pasta vazia apresenta mensagem e ação de envio
- **WHEN** uma pessoa com permissão de envio abre uma pasta que não contém
  nenhum item
- **THEN** a tela apresenta mensagem informando que ainda não há documentos ali
  e oferece a ação de enviar documento

#### Scenario: Sem permissão de envio, a orientação não oferece a ação
- **WHEN** uma pessoa sem permissão de envio abre uma pasta que não contém
  nenhum item
- **THEN** a tela informa que não há documentos ali, sem oferecer a ação de
  enviar

#### Scenario: Pasta com itens não apresenta a orientação de vazio
- **WHEN** uma pessoa abre uma pasta que contém ao menos um item visível
- **THEN** a listagem é apresentada normalmente, sem a mensagem de pasta vazia
