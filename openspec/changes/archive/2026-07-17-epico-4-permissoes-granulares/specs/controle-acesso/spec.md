# Spec — controle-acesso (delta)

Capability nova. Implementa o Épico 4 / **US 4.2** do PRD (`docs/prd_final.md`) e
completa a **US 2.1, cenário 2** (Épico 2). Trata da **imposição** da permissão no
servidor a cada ação, sobre o motor `grants` da capability `permissoes-granulares`.
Os cenários Given/When/Then das US são vinculantes. A regra de resolução é
**dono OU grant do verbo exigido**, sem herança, fail-closed (ver design.md D2/D3).

## ADDED Requirements

### Requirement: Acesso a conteúdo exige posse ou permissão do verbo correspondente

Toda ação sobre um arquivo ou pasta SHALL ser autorizada no servidor a cada
requisição pela regra **dono do recurso OU detentor de grant do verbo exigido** pela
ação, independentemente da interface ou de o link ter sido obtido diretamente. Os
verbos exigidos SHALL ser: `view` para emitir URL de visualização e para abrir/listar
uma pasta; `download` para emitir URL de download; `rename` para renomear ou
substituir um arquivo; `upload` para enviar para dentro de uma pasta de outra pessoa.
Enviar para a raiz da unidade ou para pasta própria NÃO SHALL exigir grant. A regra
SHALL valer para todos os papéis — inclusive `unit_admin` e `global_admin` — sem
que o papel de administrador, por si só, conceda acesso a conteúdo de terceiros
(alcance administrativo amplo é o Épico 5). Referência: PRD US 4.1, RF #10, NFR de
confidencialidade.

#### Scenario: Não-dono da mesma unidade sem permissão é bloqueado
- **WHEN** uma pessoa solicita a URL de visualização ou de download de um arquivo da
  sua unidade que não lhe pertence e sobre o qual não tem o verbo correspondente
- **THEN** o acesso é negado com 403, nenhuma URL assinada é emitida e nenhum
  registro de auditoria é gravado

#### Scenario: Detentor do verbo acessa e é auditado
- **WHEN** uma pessoa com grant `view` (ou `download`) sobre um arquivo solicita a
  URL correspondente
- **THEN** a URL assinada de TTL curto é emitida e o acesso é registrado na auditoria
  com a ação correspondente

#### Scenario: Renomear/substituir exige o verbo rename
- **WHEN** uma pessoa sem posse e sem grant `rename` tenta renomear ou substituir um
  arquivo
- **THEN** a ação é bloqueada com 403; e, com grant `rename`, a ação é permitida

#### Scenario: Enviar para pasta de outra pessoa exige o verbo upload
- **WHEN** uma pessoa tenta enviar um arquivo para dentro de uma pasta que não lhe
  pertence, sem grant `upload` sobre essa pasta
- **THEN** o envio é bloqueado; e, com grant `upload` sobre a pasta, o envio é
  permitido

### Requirement: Bloqueio de acesso por link direto sem exposição de conteúdo

O acesso direto pela rota de um arquivo sem permissão SHALL ser bloqueado sem expor
nenhum conteúdo nem pré-visualização do arquivo, e sem distinguir "arquivo
inexistente" de "arquivo existente sem permissão" (não vazar existência). Como a URL
assinada só é emitida **após** a checagem de permissão no servidor e o bucket é
100% privado, um link direto ao objeto nunca SHALL contornar a verificação.
Referência: PRD US 4.2, cenário 1.

#### Scenario: Link direto a arquivo sem permissão
- **WHEN** uma pessoa aciona a rota de um arquivo para o qual não tem permissão,
  ainda que conheça seu identificador
- **THEN** recebe 403, nenhuma URL nem pré-visualização é retornada, e a resposta não
  revela se o arquivo existe

### Requirement: Listagem de pasta restrita a itens próprios ou liberados

A listagem do conteúdo de uma pasta (e da raiz da unidade) SHALL retornar apenas os
itens que a pessoa **criou** OU sobre os quais possui grant `view` — arquivos e
subpastas —, nunca itens de terceiros sem liberação. Abrir uma pasta SHALL exigir
posse ou grant `view` sobre a própria pasta. Como não há herança, abrir uma pasta
liberada SHALL mostrar apenas os filhos igualmente próprios ou liberados. Referência:
PRD US 2.1, cenário 2; US 4.1, cenário 2.

#### Scenario: Listagem mostra criados e liberados, oculta o resto
- **WHEN** uma pessoa abre uma pasta que contém itens próprios, itens liberados a ela
  e itens de terceiros sem liberação
- **THEN** vê apenas os itens que criou e os que lhe foram liberados, e os itens sem
  permissão não aparecem

#### Scenario: Abrir pasta sem posse nem view é negado
- **WHEN** uma pessoa tenta abrir/listar uma pasta que não lhe pertence e sobre a
  qual não tem grant `view`
- **THEN** o acesso é negado com 403, sem revelar o conteúdo nem a existência da pasta
