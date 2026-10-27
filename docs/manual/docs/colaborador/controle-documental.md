# Controle documental

O PapelHub não guarda só arquivos: guarda **documentos controlados**. Cada documento
pode carregar, além do nome, cinco dados de controle — e é a partir deles que a
listagem diz, de relance, se o documento ainda vale.

## O que cada dado significa

| Dado | Para que serve |
| --- | --- |
| **Tipo** | Classifica o documento entre os oito tipos previstos. Aparece na listagem como uma **sigla** colorida ao lado do nome (por exemplo `PRT` para Protocolo). A cor acompanha a sigla; a informação é a sigla. |
| **Código** | Identificador do documento dentro da sua unidade (por exemplo `PRT-NSP-001`). Serve para citar e para **encontrar**: a busca por nome também procura pelo código. |
| **Revisão** | Número da versão vigente, apresentado como `Rev. 02`. |
| **Setor responsável** | Quem responde pelo documento — a quem procurar para falar dele. |
| **Próxima revisão** | A data em que o documento precisa ser revisto. É dela que nasce a situação. |

Os oito tipos e suas siglas: **PRT** Protocolo, **POP** Procedimento, **POL**
Política/Norma, **FRM** Formulário/Checklist, **FLX** Fluxograma, **MAN** Manual,
**TCO** Termo de Consentimento e **COM** Comunicado Interno.

## A situação de um documento

A coluna **Situação** é calculada **pelo servidor, no momento em que você consulta** —
nunca por uma rotina que roda de madrugada. Não existe intervalo em que a tela afirme
"Vigente" sobre um documento que já venceu: a virada do prazo vale na consulta
seguinte.

| Situação | Quando aparece |
| --- | --- |
| **Vigente** | A próxima revisão está a mais de 60 dias. |
| **Vence em N dias** | A próxima revisão ocorre dentro dos próximos 60 dias, e a tela diz em quantos dias. |
| **Em revisão** | Alguém declarou que o documento está sendo reescrito. Prevalece sobre a data. |
| **Revisão vencida** | A data da próxima revisão já passou. |
| **Obsoleto** | O documento foi declarado fora de uso. Prevalece sobre a data. |
| **Sem controle de revisão** | O documento não tem data de próxima revisão informada. Não é contado entre os documentos a vencer nem entre os vencidos. |

!!! note "Sem controle de revisão não é erro"
    Todo arquivo enviado **em lote** ou **em pasta**, e todo o acervo que já existia
    antes do controle documental, fica nesta situação. Esses arquivos continuam
    plenamente acessíveis, com as mesmas permissões de sempre — eles apenas não têm
    prazo de revisão a cobrar. Quando quiser, preencha os dados depois (abaixo).

## Quando os dados são exigidos

- **Enviando um único arquivo** (não vindo de pasta): o PapelHub pede **tipo, código,
  revisão e data de próxima revisão** antes de publicar. Sem eles o envio é recusado, e
  a tela diz exatamente quais dados faltam. O **setor responsável** é opcional.
- **Enviando vários arquivos, ou uma pasta**: nada é pedido. O envio corre como
  descrito em [Enviar arquivos](enviar.md), e os arquivos ficam **Sem controle de
  revisão**.

O código precisa ser **único na sua unidade**. Se já existir outro documento ativo com
aquele código, a publicação é recusada com um aviso específico de **código em uso** —
diferente do aviso de dado faltante e do aviso de permissão. O mesmo código pode
existir em outra unidade sem conflito algum.

## Preencher ou corrigir os dados depois

Na listagem, a ação **Dados de controle** de cada documento abre o formulário de
edição. Ela aparece apenas para quem pode **alterar** aquele documento — o dono dele, a
administração da unidade, ou quem recebeu a permissão **Renomear** sobre ele (ver
[Permissões](../administrador/permissoes.md)). Quem não pode não vê a ação: o sistema
não oferece o que recusaria em seguida.

Alterar esses dados:

- **não** troca o arquivo enviado e **não** avança a revisão por si só;
- **reapura a situação** na hora, a partir da nova data;
- permite declarar a situação como **Vigente**, **Em revisão** ou **Obsoleto**.

!!! note "Não há histórico de versões"
    O PapelHub mantém apenas a **versão vigente** de cada documento. A revisão é um
    número que avança; versões anteriores não ficam disponíveis para consulta.

## Documento obsoleto sai de circulação

Um documento declarado **Obsoleto** deixa de aparecer para quem não é administrador da
unidade: não aparece na listagem da pasta, não é encontrado pela busca (nem pelo nome,
nem pelo código), não entra no download da pasta e não abre por link direto — nem para
o próprio dono, se ele não for administrador da unidade. É assim por desenho: ninguém
deve seguir um procedimento substituído.

Para a **administração da unidade**, o documento continua visível, claramente marcado
como **Obsoleto**, e pode ser reativado pela ação **Dados de controle**. A
obsolescência não atravessa unidades: um administrador alcança apenas os documentos da
própria unidade, como em todo o resto do sistema.

!!! warning "Código de documento excluído e restauração"
    O código de um documento na **lixeira** fica livre para ser reusado. Se outro
    documento tomar aquele código e você tentar **restaurar** o original, a restauração
    é recusada com um aviso que diz **qual documento** ocupa o código — mude o código
    do ocupante (ou do documento restaurado, depois) para resolver.
