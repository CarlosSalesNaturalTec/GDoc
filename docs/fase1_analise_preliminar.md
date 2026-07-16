# Análise Preliminar de Discovery — GDoc (Gestão Documental Segura)

> Artefato interno de Engenharia/Produto. **Não é um PRD.** É o insumo de handoff que o orquestrador da Fase 2 vai consumir junto com as respostas do cliente ao questionário.

## 1. Desconstrução do Problema

* **Dor Real do Negócio:** O cliente precisa centralizar o armazenamento de arquivos de uma organização (aparentemente com múltiplas "unidades") num repositório único, mas onde o acesso à informação seja **controlado e auditável**. A dor central não é "guardar arquivos" — é **governança**: garantir que cada pessoa só veja/baixe/edite o que lhe é permitido, com rastro de quem fez o quê, e evitar vazamento por acesso indevido (inclusive por URL direta). Há também uma dor secundária de **visibilidade gerencial** (quanto espaço está sendo usado, que tipos de arquivo, evolução de uploads).

* **Solução Assumida pelo Cliente:** O cliente já chega com a solução muito bem desenhada: um "Google Drive/SharePoint corporativo" próprio, com navegador estilo Windows Explorer, permissões granulares, painel admin, dashboard, lixeira e visualizadores embutidos. Criticamente, o cliente descreveu **features de UI** com riqueza, mas foi omisso em **regras de negócio de fundo** (identidade, tenancy, cotas, expiração). Há risco de tratar o produto como "um front-end bonito sobre um bucket" quando o valor real está no **motor de autorização** — que é a parte menos especificada. O modelo de permissões granulares por arquivo/pasta **com herança em árvore aninhada** é a maior fonte de complexidade oculta e precisa de validação antes de qualquer estimativa.

## 2. Mapeamento de Personas Ocultas

* **Administrador Global:** vê tudo, gerencia usuários, grupos, permissões e cotas. Explícito no texto.
* **Usuário Comum (colaborador):** só vê arquivos/pastas onde recebeu permissão ou que criou. Explícito.
* **Gestor de Unidade (implícito):** o campo "unidade" no cadastro sugere que a organização tem várias unidades. Muito provavelmente existe alguém que administra *apenas a sua unidade* — uma persona intermediária entre admin global e usuário comum, não confirmada.
* **Auditor / Compliance (implícito):** alguém que consome o registro de auditoria para fins de conformidade. Pode ser o próprio admin ou um papel separado (somente leitura dos logs).
* **Dono do Arquivo (implícito):** quem faz upload vira dono e ganha direitos automáticos — precisa ser modelado.
* **Operador do sistema/DevOps (implícito):** responsável pelo ambiente GCP, cotas de bucket e pelo workflow diário de limpeza da lixeira.

## 3. Avaliação de Maturidade e Lacunas Críticas

O material tem **alta maturidade de escopo funcional de interface**, mas **baixa maturidade em regras de identidade, autorização e limites**. Lacunas que bloqueiam o PRD:

* **Autenticação / identidade — NÃO MAPEADA (crítico).** Não há uma palavra sobre *como* as pessoas entram no sistema: login e senha próprios, conta Google (natural, já que o ambiente é GCP), ou integração com login corporativo existente (AD/SSO). Isso muda arquitetura, esforço e o próprio cadastro de usuário.
* **Provisionamento de usuários — omisso.** O cadastro lista campos, mas não diz quem cria as contas: só o admin? Auto-cadastro com aprovação? Convite por e-mail?
* **Tenancy / "unidade" — ambíguo (crítico).** O campo "unidade" pode significar (a) apenas um rótulo informativo, ou (b) uma **separação real de dados** — unidades que não podem ver os arquivos umas das outras. As duas interpretações produzem produtos radicalmente diferentes.
* **Modelo de cota — ambíguo.** "Cota de 10 GB": é o total do sistema, por usuário ou por unidade? E o comportamento ao estourar (bloquear upload, avisar, degradar)? O dashboard depende disso.
* **Semântica das permissões — parcial.** Cinco verbos citados (visualizar, baixar, enviar, editar, excluir), mas "**editar**" não está definido: renomear? Substituir o conteúdo? Editar online? Também não está claro se a permissão em uma pasta **herda** para subpastas e arquivos (essencial numa árvore aninhada) e o que acontece quando uma permissão **expira** (revoga sozinha? avisa alguém?).
* **Grupos — pouco especificado.** Existem grupos e permissões por grupo, mas não como são definidos, quem os gerencia, e se há relação com "unidade".
* **Auditoria — retenção e acesso.** Quem pode ver os logs (só admin? dono do arquivo?), por quanto tempo são guardados, e se precisam ser exportáveis para compliance.
* **Limites operacionais — omissos.** Tamanho máximo por arquivo (impacta upload direto vs. upload assinado ao bucket), volume total esperado, número de usuários. Impacta diretamente a arquitetura de upload/download e o "download de pasta em ZIP".
* **Notificações — omissas.** Há avisos por e-mail (compartilhamento recebido, permissão prestes a expirar, cota quase cheia)? Não mencionado.
* **Concorrência / integridade — não mapeada.** Dois usuários editando/movendo a mesma pasta; substituição de arquivo de mesmo nome no upload. Sem menção.
* **Versionamento — ausente.** Não se sabe se substituir um arquivo mantém versões anteriores (relevante junto com "editar" e lixeira).

## 4. Estratégia de Mitigação de Riscos (MVP)

Premissas a validar **antes** de escrever o PRD, para não desperdiçar escopo:

* **Fixar o modelo de identidade primeiro.** Recomendação técnica: login com conta Google (Identity Platform/Firebase Auth no GCP) reduz muito o esforço de segurança. Toda a modelagem de usuário e permissão depende dessa decisão — é o item nº 1 a destravar no questionário.
* **Decidir tenancy cedo.** Se "unidade" for separação real de dados, isso vira um requisito estrutural de autorização e precisa entrar no núcleo do MVP; se for só um rótulo, sai do caminho crítico. Não dá para adiar.
* **Definir a autorização como o coração do produto.** O motor de permissões granulares com herança em árvore + regra "dono vê o que criou" + bloqueio de acesso por URL direta é o maior risco de engenharia. Sugere-se prototipá-lo primeiro (walking skeleton) antes das features de conforto (dashboard, filtros, ZIP de pasta).
* **Escopo de MVP proposto para debate:** (1) auth + cadastro; (2) navegador de pastas com upload/download/visualização; (3) motor de permissões com herança e controle de acesso ativo; (4) lixeira com expurgo agendado; (5) auditoria de visualização/download. Deixar para uma segunda onda: dashboard analítico completo, upload de pasta inteira, download de pasta em ZIP e visualizador Office via Google Docs Viewer — todos de alto valor percebido, porém não bloqueantes do valor central de governança.
* **Confirmar o comportamento de cota e de expiração de permissão** antes de modelar o banco/estado — são regras que "vazam" para várias telas (dashboard, upload, admin) e são caras de mudar depois.
