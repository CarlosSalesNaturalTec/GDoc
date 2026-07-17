## MODIFIED Requirements

### Requirement: Acesso a conteúdo exige posse ou permissão do verbo correspondente

Toda ação sobre um arquivo ou pasta SHALL ser autorizada no servidor a cada
requisição pela regra **dono do recurso OU detentor de grant do verbo exigido OU
administrador da unidade do recurso**, independentemente da interface ou de o link
ter sido obtido diretamente. Os verbos exigidos SHALL ser: `view` para emitir URL
de visualização e para abrir/listar uma pasta; `download` para emitir URL de
download; `rename` para renomear ou substituir um arquivo; `upload` para enviar
para dentro de uma pasta de outra pessoa. Enviar para a raiz da unidade ou para
pasta própria NÃO SHALL exigir grant. Um `unit_admin` SHALL ser autorizado em
qualquer verbo sobre qualquer recurso da **própria unidade**, sem grant, por ser
administrador daquela unidade (US 5.1). O `global_admin` NÃO SHALL, apenas pelo
papel, receber acesso a conteúdo — seu bypass de RLS serve a agregados, não à
leitura de arquivos. Para o colaborador, o papel por si só não concede acesso a
conteúdo de terceiros. Referência: PRD US 4.1, US 5.1 cenário 1, RF #10, NFR de
confidencialidade.

#### Scenario: Não-dono da mesma unidade sem permissão é bloqueado
- **WHEN** um colaborador solicita a URL de visualização ou de download de um
  arquivo da sua unidade que não lhe pertence e sobre o qual não tem o verbo
  correspondente
- **THEN** o acesso é negado com 403, nenhuma URL assinada é emitida e nenhum
  registro de auditoria é gravado

#### Scenario: Detentor do verbo acessa e é auditado
- **WHEN** uma pessoa com grant `view` (ou `download`) sobre um arquivo solicita a
  URL correspondente
- **THEN** a URL assinada de TTL curto é emitida e o acesso é registrado na auditoria
  com a ação correspondente

#### Scenario: Administrador da unidade acessa sem grant
- **WHEN** um `unit_admin` solicita a URL de visualização ou de download de um
  arquivo da sua unidade que pertence a outra pessoa, sem grant sobre ele
- **THEN** a URL é emitida e o acesso é auditado, por ser administrador daquela
  unidade; o mesmo recurso em outra unidade continua negado com 403

#### Scenario: Renomear/substituir exige o verbo rename
- **WHEN** uma pessoa sem posse, sem grant `rename` e que não seja administrador da
  unidade do arquivo tenta renomear ou substituir um arquivo
- **THEN** a ação é bloqueada com 403; e, com grant `rename` (ou sendo `unit_admin`
  da unidade do arquivo), a ação é permitida

#### Scenario: Enviar para pasta de outra pessoa exige o verbo upload
- **WHEN** uma pessoa tenta enviar um arquivo para dentro de uma pasta que não lhe
  pertence, sem grant `upload` sobre essa pasta e sem ser administrador da unidade
- **THEN** o envio é bloqueado; e, com grant `upload` sobre a pasta (ou sendo
  `unit_admin` da unidade da pasta), o envio é permitido

### Requirement: Listagem de pasta restrita a itens próprios ou liberados

A listagem do conteúdo de uma pasta (e da raiz da unidade) SHALL retornar, para o
colaborador, apenas os itens que ele **criou** OU sobre os quais possui grant
`view` — arquivos e subpastas —, nunca itens de terceiros sem liberação. Para o
`unit_admin`, a listagem SHALL retornar **todo** o conteúdo do nível dentro da sua
unidade, independentemente de dono ou grant. Abrir uma pasta SHALL exigir posse,
grant `view` OU ser administrador da unidade da pasta. Como não há herança, abrir
uma pasta liberada como colaborador SHALL mostrar apenas os filhos igualmente
próprios ou liberados. Em nenhum caso a listagem SHALL cruzar unidade — a RLS por
`unit_id` restringe as linhas à unidade do solicitante. Referência: PRD US 2.1
cenário 2; US 4.1 cenário 2; US 5.1 cenário 1.

#### Scenario: Listagem mostra criados e liberados, oculta o resto
- **WHEN** um colaborador abre uma pasta que contém itens próprios, itens liberados
  a ele e itens de terceiros sem liberação
- **THEN** vê apenas os itens que criou e os que lhe foram liberados, e os itens sem
  permissão não aparecem

#### Scenario: Abrir pasta sem posse nem view é negado
- **WHEN** um colaborador tenta abrir/listar uma pasta que não lhe pertence e sobre a
  qual não tem grant `view`
- **THEN** o acesso é negado com 403, sem revelar o conteúdo nem a existência da pasta

#### Scenario: Administrador lista todo o conteúdo da própria unidade
- **WHEN** um `unit_admin` abre a raiz ou uma pasta da sua unidade contendo itens de
  várias pessoas
- **THEN** vê todas as pastas e arquivos daquele nível e pode abrir pastas de
  terceiros da sua unidade, sem que apareça qualquer item de outra unidade
