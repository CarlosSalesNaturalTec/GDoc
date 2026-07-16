# gestao-arquivos Specification

## Purpose

Define os requisitos verificáveis de gestão do ciclo de vida de arquivos do
GDoc — renomear e substituir por nova versão — na fatia do Épico 2 / US 2.2
do PRD (`docs/prd_final.md`). Nesta fatia a checagem de permissão de
renomear/substituir é baseada em **dono**; a permissão granular concedida a
terceiros é o Épico 4. Os cenários Given/When/Then da US 2.2 são vinculantes e
este spec os torna verificáveis no backend.

## Requirements

### Requirement: Renomear arquivo

O sistema SHALL permitir que o dono de um arquivo o renomeie em `PATCH /files/:id`,
alterando o nome exibido sem trocar sua localização lógica nem seu conteúdo. Quem não
tem permissão (nesta fatia, quem não é o dono) NÃO SHALL conseguir renomear.
Referência: PRD US 2.2.

#### Scenario: Renomeação pelo dono
- **WHEN** o dono de um arquivo o renomeia
- **THEN** o nome exibido é atualizado no mesmo local, o conteúdo permanece o mesmo, e
  o evento fica registrado na auditoria

#### Scenario: Renomeação sem permissão é bloqueada
- **WHEN** uma pessoa que não tem permissão sobre um arquivo tenta renomeá-lo
- **THEN** a ação é bloqueada com aviso de permissão insuficiente e nada é alterado

### Requirement: Substituir arquivo por nova versão

O sistema SHALL permitir que o dono de um arquivo o substitua por uma nova versão em
`POST /files/:id/replace-url`, recebendo uma URL assinada de curta duração para enviar
o novo conteúdo. A nova versão SHALL ocupar o **mesmo local lógico** (mesma pasta e
mesmo nome) do arquivo vigente, e a versão anterior NÃO SHALL permanecer disponível
para consulta (sem histórico de versões — fora de escopo no PRD). A substituição SHALL
respeitar a cota do dono, considerando a diferença de tamanho entre a versão nova e a
antiga. Quem não é o dono NÃO SHALL conseguir substituir. Referência: PRD US 2.2.

#### Scenario: Substituição pelo dono preserva o local
- **WHEN** o dono envia uma nova versão para um arquivo sobre o qual tem permissão
- **THEN** o arquivo vigente é substituído no mesmo local, a versão anterior deixa de
  estar disponível, e o evento fica registrado na auditoria

#### Scenario: Substituição sem permissão é bloqueada
- **WHEN** uma pessoa que não tem permissão tenta substituir um arquivo
- **THEN** a ação é bloqueada com aviso de permissão insuficiente e o arquivo vigente
  permanece intacto

#### Scenario: Substituição respeita a cota pelo delta
- **WHEN** a nova versão faria o espaço utilizado do dono ultrapassar a cota,
  considerando a diferença para a versão anterior
- **THEN** a substituição é bloqueada com aviso de cota atingida e o arquivo vigente
  permanece intacto
