# Plano de implementação — Demanda do cliente nº 2

Plano de execução de `docs/demanda_cliente_2.md` (PapelHub — ajustes da Fase 1,
envio em lote e leitura obrigatória). Mesmo papel que `docs/frontend_roadmap.md`
cumpriu para a SPA: **catalogar as fatias e guardar o estado em disco**, para que
a implementação não dependa de nenhuma janela de conversa.

> **O plano é o arquivo, não o chat.** Tudo o que é preciso para retomar está
> aqui, em `openspec/` e no histórico do git. Nenhuma fatia pressupõe contexto
> de uma sessão anterior.

---

## Como retomar (protocolo de cada sessão)

Execute na ordem, sem depender de memória de conversa:

1. **Situar-se**: `openspec list` (há change em voo?) e
   `ls openspec/changes/archive/ | tail -10` (o que foi entregue por último).
2. **Escolher a fatia**: na [tabela de status](#status-das-fatias), a primeira
   linha que não está `entregue` e cujas dependências estão satisfeitas.
3. **Carregar o contexto da fatia** — só estas leituras, nesta ordem:
   - a seção da fatia neste documento (o que entrega, do que depende, riscos);
   - a seção correspondente de `docs/demanda_cliente_2.md` (texto do cliente,
     vinculante);
   - a US indicada em `docs/prd_final.md` (critérios Dado/Quando/Então são
     vinculantes);
   - as specs listadas em `openspec/specs/` que a fatia altera.
4. **Conferir bloqueios**: ver [Decisões pendentes](#decisões-pendentes-do-cliente)
   e [Dependências externas](#dependências-externas-fora-do-código). Fatia com
   bloqueio aberto **não começa** — pule para a próxima liberada.
5. **Propor e implementar**: `/opsx:propose` (ou `/opsx:new` + `/opsx:continue`),
   depois `/opsx:apply`, `/opsx:verify` e `/opsx:archive`.
6. **Fechar o ciclo no mesmo commit da fatia**:
   - atualizar a linha da fatia na tabela de status (→ `entregue`, com o nome do
     change arquivado);
   - registrar aqui qualquer lacuna conhecida ou decisão nova;
   - atualizar a página correspondente de `docs/manual/` (regra já vigente no
     `CLAUDE.md`);
   - atualizar `docs/prd_final.md` quando a fatia acrescentar ou alterar uma US.

**O passo 6 é o que mantém o plano retomável.** Uma fatia entregue sem atualizar
esta tabela deixa o plano mentindo, e a sessão seguinte começa no escuro.

---

## Status das fatias

Legenda: `pendente` · `bloqueada` (ver coluna Bloqueio) · `em andamento` ·
`entregue`.

| # | Fatia | Seção da demanda | Situação | Bloqueio | Change arquivado |
| :-- | :--- | :--- | :--- | :--- | :--- |
| A1 | Função e setor na identidade | 1.3 (Atenção: Perfil), 3.1 | pendente | D2, D3 | — |
| A2 | Menu lateral e barra superior | 1.1, 1.2 | pendente | E1 (parcial) | — |
| A3 | Conteúdo da tela Início | 1.3 | pendente | D1, D4 | — |
| A4 | Favoritos | 1.1 (menu) | pendente | — | — |
| A5 | Compartilhados comigo | 1.1 (menu) | pendente | — | — |
| A6 | Tour guiado | 1.1, 1.3 | pendente | — | — |
| B1 | Arquivo geral e pendente de cadastro | 2.3, 2.4 | pendente | — | — |
| B2 | Tabela de cadastro no envio em lote | 2.1, 2.2 | pendente | B1 | — |
| C1 | Núcleo da leitura obrigatória (marcar e dar ciência) | 3.1, 3.2 (etapas 1 e 3), 3.3, 3.4 | pendente | D3, D5 | — |
| C2 | Superfícies de pendência (menu, contador, cartão, abas) | 3.2 (etapa 2), 3.5 | pendente | C1, A2, A3 | — |
| C3 | Avisos e atrasos | 3.2 (etapas 2 e 4), 3.3 | pendente | C1, D3 | — |
| C4 | Acompanhamento e relatório exportável | 3.5 | pendente | C1, D5 | — |

Ordem sugerida: **A1 → A2 → A3 → (A4, A5, A6 em qualquer ordem) → B1 → B2 →
C1 → C2 → C3 → C4**.

Os blocos **A** (Fase 1), **B** (envio em lote) e **C** (Fase 2) são
independentes entre si, exceto por C2, que ocupa espaços de layout criados em
A2/A3. Se a prioridade do cliente mudar, o bloco B pode ser antecipado inteiro
sem tocar em A.

---

## Decisões pendentes do cliente

Cada uma trava as fatias indicadas. **Não resolver por conta própria** — são
decisões de produto, e duas delas mexem no núcleo de segurança do sistema.

### D1 — "Minhas unidades": acesso a mais de uma unidade  🔴 estrutural

A demanda (1.3) pede uma grade de unidades e a frase *"você tem acesso a X
unidades"*. O sistema de hoje é o oposto: **`users.unit_id` é `NOT NULL` e
único** — cada pessoa pertence a exatamente uma unidade, o RLS do Postgres
filtra por `app.current_unit` (um valor), e `access.ts` é *fail-closed* para
recurso de outra unidade. Nem o administrador global enxerga conteúdo alheio.

Opções:

| | Caminho | Custo | Risco |
| :-- | :--- | :--- | :--- |
| **a** | Manter a tenancy. Os cartões listam **pastas de primeiro nível da própria unidade** (comportamento atual do change `shell-e-inicio`), com o título "Minhas unidades" e o tratamento visual pedido | baixo | diferença visível em relação ao Anexo A — precisa de aceite explícito |
| **b** | Pertencimento múltiplo: tabela `user_units`, `app.current_unit` passa a conjunto, policies RLS de `=` para `IN`, alternador de unidade na interface | alto | mexe no invariante de isolamento; exige revisão de todas as rotas e dos testes de isolamento |
| **c** | Pessoa segue em uma unidade, mas concessões podem atravessar unidades para recursos específicos | médio | abre exceção no *fail-closed* do `access.ts`; isolamento deixa de ser absoluto |

**Recomendação: (a) nesta rodada**, com aceite formal da diferença; (b) só como
change própria, isolada, com os testes de isolamento reescritos antes do código.
A frase da saudação, se (a) for aceita, vira contagem de pastas, não de unidades.

> Observação: a mesma decisão reaparece em **3.1** — *"Governança (Sede)
> acompanha todas as leituras"*. Relatório nominal de pessoas de outras unidades
> é alcance cross-unit, exatamente o que a trava do bypass de `global_admin`
> proíbe hoje. Ver **D5**.

### D2 — "Perfil" exibido: papel ou função?

A demanda (1.3) reporta: *"para a gerente de Governança aparece Colaborador"*.
Não é leitura errada do cadastro — é descasamento de conceito. O sistema tem
**papel** (`collaborator` / `unit_admin` / `global_admin`, que define permissão)
e **função/cargo** (`job_title`, texto livre, sem efeito em permissão). A tela
mostra o papel; o cliente espera ler a função.

Opções: (i) exibir `job_title` quando preenchido, caindo para o papel quando não
— sem efeito em permissão; (ii) rever o cadastro dessas pessoas para
`unit_admin`, se a intenção é que elas realmente administrem a unidade.

Provavelmente **as duas**: (i) resolve a tela, (ii) resolve a permissão. Precisa
do cliente para saber qual é o caso de cada pessoa.

### D3 — "Gestor" e "equipe": hierarquia nova  🔴 estrutural

A seção 3.1 define um perfil **Gestor** que *"acompanha as pendências da própria
equipe"*, e 3.2 (etapa 4) manda avisar *"o gestor dele"*. Isso exige saber **quem
é gestor de quem** — relação que não existe em nenhuma tabela. Os três papéis
atuais não a expressam.

Opções: (i) gestor = `unit_admin` da unidade, e "equipe" = a unidade inteira
(barato, perde o recorte por setor); (ii) gestor por setor (depende de **D4**):
"equipe" = pessoas do mesmo setor; (iii) chefia nominal (`users.manager_id`),
explícita e precisa, com custo de manutenção do cadastro.

### D4 — "Setor": texto livre ou entidade?

Hoje existe `users.work_area` (texto livre, sem validação) e, em documentos,
`responsible_sector` (também livre). A demanda usa setor como **critério de
público** (3.2: *"unidades, setores, perfis ou pessoas, combináveis"*), como
recorte de relatório (3.5) e na saudação (1.3).

Texto livre não serve de critério de público: "Governança", "governanca" e
"Gov." viram três setores. Para 3.2 e 3.5 funcionarem, setor precisa ser
**entidade por unidade** (tabela `sectors` com `unit_id` + RLS, `users.sector_id`
apontando para ela), com migração dos valores livres existentes.

Se o cliente aceitar adiar o público por setor, D4 cai para "só exibição" e fica
barata.

### D5 — Alcance do relatório de acompanhamento

Ligada a **D1**. A seção 3.5 quer Governança vendo todos os documentos,
publicador vendo os que marcou e gestor vendo só a própria equipe. As duas
últimas visões cabem no modelo atual; a primeira, não — é leitura nominal
cross-unit.

Opções: (i) Governança vê tudo **da Sede**, e cada unidade tem a sua
Governança local; (ii) papel novo de auditor cross-unit, restrito a
*agregados e nomes de leitura obrigatória* (sem bytes, sem auditoria de acesso)
— exceção estreita e explícita à trava do bypass, documentada em `design.md`;
(iii) resolver junto com D1(b).

### D6 — Formato e prazo (menores)

- **Exportação Excel e PDF** (3.5): não há precedente no repositório — a
  auditoria tem "sem exportação" como lacuna conhecida. Decidir entre
  geração no cliente (sem dependência nova no servidor, tetos de volume) ou
  biblioteca no servidor. Recomendação: cliente, como já se faz no `.zip` de
  pasta (`client-zip`), mantendo a regra de que a API não monta artefato.
- **Prazo da Fase 2** (seção 5): o cliente pede o prazo da leitura obrigatória.
  Só estimável depois de D3 e D5 — são elas que definem o tamanho de C1 e C4.

---

## Dependências externas (fora do código)

| | Item | Responsável | Trava |
| :-- | :--- | :--- | :--- |
| **E1** | Logo ISETES branca (150 px) e símbolo em PNG transparente, para o menu e as marcas d'água | Governança | A2 e A3 só fecham com os arquivos; a estrutura pode ser implementada antes, com o ativo atual |
| **E2** | Prints das telas de Documentos e de acesso para homologação | TI | entrega de homologação, não bloqueia código |
| **E3** | Ambiente de homologação e contato de TI para a tela de acesso | TI + Governança | o contato de suporte já é configurável por implantação (`identidade-visual`); falta o valor |

---

## Fatias

### A1 — Função e setor na identidade

- **Capabilities**: `autenticacao` (modificada), `gestao-pessoas` (modificada),
  possivelmente `setores` (nova, se D4 = entidade)
- **Demanda**: 1.3 (Atenção → Perfil), 1.3 (linha da saudação), 3.1
- **PRD**: US 1.1 (cadastro), US 11.1 (saudação)
- **Entrega**: a identidade devolvida à interface passa a carregar função e
  setor, de modo que a saudação e o cartão do usuário mostrem o que o cadastro
  diz. Resolve a queixa do "Colaborador" conforme **D2**. Se **D4** apontar para
  entidade, entrega a tabela de setores (com `unit_id` e policy RLS, como manda
  o `CLAUDE.md`) e a migração dos `work_area` existentes.
- **Depende de**: — (mas está travada por D2 e D3/D4)
- **Risco**: tabela nova exige coluna `unit_id` + policy RLS; esquecer a policy
  é furo de isolamento, não detalhe.
- **Por que primeiro**: A3 (saudação), C1 (público por setor) e C3 (aviso ao
  gestor) dependem desses dados. Fazer depois obriga a voltar às três.

### A2 — Menu lateral e barra superior

- **Capabilities**: `web-shell-e-auth` (modificada), `identidade-visual`
  (modificada), `web-busca` (modificada), `sistema-de-design` (modificada)
- **Demanda**: 1.1 e 1.2 (as duas tabelas, item a item)
- **PRD**: US 11.1
- **Entrega**: menu com 264 px e nenhum rótulo truncado; logo branca de 150 px
  com "PapelHub" e "Gestão de Documentos"; itens compactos com área de
  acionamento de 44 px; agrupamento por rótulo **NAVEGAÇÃO** e **AJUDA**;
  cartão do usuário no rodapé (iniciais, nome, perfil, unidade) + **Sair**,
  preservando o recolher; marca d'água do símbolo no pé do menu (200 px, 14%).
  No topo: busca à esquerda com 600 px e lupa dentro do campo, com o texto de
  apoio pedido; botão verde **Enviar documento** para quem tem permissão de
  envio; sino com contador de não lidas; botão de Ajuda; avatar sai do topo.
- **Depende de**: — (E1 para o ativo final)
- **Decisão de escopo**: os itens de menu **Favoritos**, **Compartilhados
  comigo** e **Leitura obrigatória** pertencem a fatias que ainda não existem
  (A4, A5, C2). Esta fatia entrega a **estrutura dos grupos** e os destinos que
  já funcionam; cada item entra junto com a sua fatia. Menu com item que não
  leva a nada é regressão — a capability `tela-inicial` já normatiza que "atalho
  apresentado conduz a uma ação executável".
- **Risco**: o contador do sino consome a contagem de não lidas que
  `notificacoes` já expõe — conferir antes de criar rota nova.

### A3 — Conteúdo da tela Início

- **Capabilities**: `tela-inicial` (modificada), `controle-documental`
  (consumida na tabela de recentes)
- **Demanda**: 1.3 (tabela inteira)
- **PRD**: US 11.1 e 11.2
- **Entrega**: saudação por horário ("Bom dia/Boa tarde/Boa noite, [primeiro
  nome]"); linha de contexto com setor, unidade escrita como no cadastro e as
  contagens; link do tour à direita da saudação (destino em A6); quatro cartões
  soltos, sem título de seção, com ícone colorido, título e descrição;
  "Minhas unidades" conforme **D1**; "Documentos recentes" com as colunas
  pedidas (Tipo como etiqueta, Documento com código abaixo, Unidade, Revisão,
  Situação, Atualizado) em 5 linhas, com link para o histórico completo; coluna
  direita de 340 px com os espaços de "Leitura obrigatória" e "Avisos" — **o
  layout nesta fatia, as funções em C2**; marca d'água à direita (420 px, 6%,
  não clicável).
- **Depende de**: A1 (setor e função na saudação), A2 (chrome)
- **Requisito escondido**: *"Y documentos novos desde o último acesso"* exige
  registrar o último acesso de cada pessoa — **não existe hoje** (não há
  `last_login_at` nem tabela de sessões). É coluna nova em `users`, gravada no
  login. Se o cliente aceitar, a alternativa barata é "nos últimos 7 dias".
- **Risco**: a contagem de documentos novos não pode ampliar alcance — tem de
  passar pela mesma resolução de acesso da listagem, como já exige a capability
  `tela-inicial` ("a lista de recentes não amplia alcance").

### A4 — Favoritos

- **Capabilities**: `favoritos` (nova), `web-navegacao` (modificada)
- **Demanda**: 1.1 (item de menu)
- **PRD**: US nova (Épico 11) — **reentrada de escopo**: favoritos foi excluído
  "por decisão do cliente" no change `shell-e-inicio`; o PRD precisa registrar a
  volta.
- **Entrega**: marcar/desmarcar arquivo ou pasta como favorito, destino de menu
  listando os favoritos vigentes. Tabela com `unit_id` + RLS; favorito **não é
  permissão** — perder acesso ao recurso o remove da lista, sem erro.
- **Depende de**: A2 (o item entra no menu)

### A5 — Compartilhados comigo

- **Capabilities**: `compartilhados-comigo` (nova), `permissoes-granulares`
  (consumida)
- **Demanda**: 1.1 (item de menu)
- **PRD**: US nova (Épico 11) — também **reentrada de escopo**.
- **Entrega**: destino listando os recursos sobre os quais a pessoa tem
  concessão vigente de outra pessoa (não os que ela mesma criou). Dado já
  existe: a tabela de concessões, com a vigência avaliada no SQL pelo relógio do
  Postgres. Nenhuma coluna nova.
- **Depende de**: A2
- **Risco**: a listagem não pode revelar recurso excluído ou de outra unidade —
  *fail-closed* igual ao `access.ts`.

### A6 — Tour guiado

- **Capabilities**: `tour-guiado` (nova)
- **Demanda**: 1.1 (AJUDA → Tour guiado), 1.3 ("Primeira vez aqui?")
- **PRD**: US nova (Épico 11) — **reentrada de escopo**.
- **Entrega**: tour de ~2 minutos pelas áreas da tela, acionável pelo menu e
  pelo link da saudação, com memória de "já fiz" por pessoa.
- **Depende de**: A2, A3 (os pontos que o tour aponta precisam existir)
- **Nota**: o tour só percorre o que a pessoa pode ver — passo apontando para
  item fora do perfil é bug de alcance, não de layout.

### B1 — Arquivo geral e pendente de cadastro

- **Capabilities**: `controle-documental` (**modificada**), `gestao-arquivos`
  (modificada), `busca` (modificada), `notificacoes` (modificada)
- **Demanda**: 2.3 e 2.4; a **Regra** no topo da seção 2
- **PRD**: **US 10.5 alterada** — ver risco abaixo
- **Entrega**:
  - **Tipo "Arquivo geral"** (2.4): nono valor do conjunto fechado de tipos
    (hoje são oito, sem ele). Pede só o título; não tem código, revisão nem
    situação; **não pode ser marcado como leitura obrigatória** (trava que C1
    precisa respeitar). Distinto de "sem dados preenchidos": é declaração
    deliberada de que o arquivo não é documento da Matriz.
  - **Estado "Pendente de cadastro"** (2.3): arquivo fica na pasta, **não
    aparece para leitores nem na busca**, visível só para quem enviou e para a
    Governança, etiquetado; quem enviou é avisado no sino até completar; ao
    completar, publica normalmente.
- **Depende de**: — (D4 só se a visibilidade da "Governança" exigir setor)
- **Risco (o maior do bloco)**: isto **reverte** comportamento já arquivado. A
  spec `controle-documental` tem hoje o cenário *"Envio em lote dispensa os
  dados"* e a US 10.5 cenário 2 diz que o lote "não exige os dados". A fatia tem
  de **alterar** requisito e US, não acrescentar ao lado — deixar os dois textos
  conviver é spec contraditória. O acervo anterior continua protegido pelo
  cenário 3 da US 10.5 ("acervo anterior não é invalidado"): arquivo antigo sem
  dados **não** vira "Pendente de cadastro" retroativamente.
- **Risco 2**: "não aparece na busca" é regra de alcance. Precisa de teste de
  isolamento próprio, no mesmo nível dos testes de obsoleto.

### B2 — Tabela de cadastro no envio em lote

- **Capabilities**: `web-upload` (modificada), `envio-lote` (modificada)
- **Demanda**: 2.1 (passo a passo) e 2.2 (campos)
- **PRD**: US 10.5 (na forma alterada por B1), US 3.1/3.2
- **Entrega**: ao selecionar ou arrastar vários arquivos (ou uma pasta), abre-se
  uma tabela com **uma linha por arquivo**; Título pré-preenchido com o nome do
  arquivo; sugestão de Tipo e Código quando o nome segue `SIGLA-AREA-Nº`; linha
  **"Aplicar a todos"** no topo preenchendo Tipo, Revisão, Responsável e Próxima
  revisão de uma vez, com cada linha ainda editável depois; indicador de
  completa/incompleta por linha; botão **"Publicar completos"**; incompletas
  salvas como Pendente de cadastro.
- **Depende de**: **B1** (o estado e o tipo precisam existir antes)
- **Risco**: a unicidade de código é por unidade e já está especificada
  (`controle-documental`: "Código do documento é único dentro da unidade"). A
  tabela precisa barrar duplicata **também dentro do próprio lote**, antes de
  enviar — dois arquivos do mesmo lote com o mesmo código não podem passar pela
  checagem individual e colidir no servidor.
- **Risco 2**: o envio em lote já tem teto de itens por requisição e reserva de
  cota consciente do lote (`envio-lote`). A tabela de cadastro não muda esses
  tetos — e a publicação parcial ("só os completos") tem de conviver com a
  reserva de cota sem vazar reserva dos itens não publicados.

### C1 — Núcleo da leitura obrigatória (marcar e dar ciência)

- **Capabilities**: `leitura-obrigatoria` (nova), `controle-documental`
  (consumida), `auditoria` (consumida)
- **Demanda**: 3.1, 3.2 (etapas 1 e 3), 3.3, 3.4
- **PRD**: épico novo (**Épico 12**), com US para marcar e para dar ciência
- **Entrega**:
  - **Marcação** (etapa 1): na etapa final do envio ou depois, em "Mais opções";
    só documento **controlado e Vigente** (portanto nunca "Arquivo geral", trava
    de B1); público combinável (unidades, setores, perfis, pessoas), prazo com
    padrão de 15 dias, mensagem opcional; **prévia da contagem de pessoas antes
    de confirmar**. Só publicador com permissão de envio marca.
  - **Ciência** (etapa 3): botão no rodapé do visualizador, habilitado só depois
    que o documento abre; confirmação com a declaração nominal ("Declaro que li
    e compreendi o documento [código] - [título], Rev. [nº]"); **irreversível**;
    o item sai de Pendentes e vai para Concluídas.
  - **Registros** (3.4): marcação (documento, código, revisão, público, prazo,
    mensagem, quem marcou, data e hora) e ciência (usuário, unidade, setor,
    documento, código, revisão, data e hora).
  - **Regras** (3.3): ciência **vale por revisão**; nova revisão pergunta ao
    publicador se pede nova ciência, preservando o histórico; pendências de
    revisão que virou Obsoleto são encerradas automaticamente; pendências de
    pessoa desligada saem do cálculo de adesão.
- **Depende de**: — (travada por **D3** e **D5**; **D4** se o público por setor
  entrar nesta fatia)
- **Risco**: as duas tabelas novas precisam de `unit_id` + policy RLS. Público
  que atravessa unidades é a mesma questão de D1 — se a tenancy continuar como
  está, "unidades" no público significa **a unidade do documento**, e isso tem
  de estar escrito na spec, não implícito.
- **Risco 2**: "pessoa nova no público recebe a pendência com prazo de 15 dias a
  partir da entrada" (3.3) significa que o público é **resolvido na consulta**,
  não congelado na marcação. Decisão de design a fixar no `design.md`: público
  como critério (reavaliado) + pendências materializadas na primeira vez que a
  pessoa é alcançada.
- **Por que uma fatia só**: marcar sem dar ciência não entrega valor, e dar
  ciência sem marcar não existe. Separá-las produziria duas fatias
  inutilizáveis.

### C2 — Superfícies de pendência

- **Capabilities**: `leitura-obrigatoria` (modificada), `tela-inicial`
  (modificada), `web-shell-e-auth` (modificada), `web-navegacao` (modificada),
  `web-visualizacao` (modificada)
- **Demanda**: 3.2 (etapa 2), 3.5 (linhas Início, Menu, Documentos, Visualizador)
- **PRD**: Épico 12
- **Entrega**: contador no item **Leitura obrigatória** do menu; cartão na
  coluna direita da tela Início (documento, prazo e botão "Ler e confirmar
  ciência"), ocupando o espaço criado em A3; destino de menu com abas
  **Pendentes** e **Concluídas** para todos; ícone de leitura obrigatória na
  linha do arquivo em Documentos.
- **Depende de**: **C1** (não há pendência a mostrar antes), **A2** (item de
  menu e contador), **A3** (espaço da coluna direita)
- **Nota**: a aba **Acompanhamento** é de C4 — aqui entram só as duas abas de
  todo mundo.

### C3 — Avisos e atrasos

- **Capabilities**: `leitura-obrigatoria` (modificada), `notificacoes`
  (modificada), `platform-infrastructure` (job + scheduler)
- **Demanda**: 3.2 (etapa 2, item 1; etapa 4, itens 1 e 2), 3.3
- **PRD**: Épico 12
- **Entrega**: notificação no sino ao surgir pendência; **"Atrasada" em
  vermelho** depois do prazo, com a pendência **continuando aberta** (o prazo não
  encerra nada); aviso de atraso ao leitor **e ao gestor dele** (conforme D3).
- **Depende de**: **C1**, **D3**
- **Risco**: a emissão é idempotente por `(recipientUserId, kind, sourceRef)` —
  a rotina de atraso roda todo dia e **não pode** reavisar a cada execução; o
  `sourceRef` tem de incluir a competência do aviso. O padrão já está resolvido
  em `notificacoes` ("reexecução no mesmo dia não duplica aviso").
- **Risco 2**: job novo exige script em `package.json` **e** par job+scheduler
  no Terraform (`infra/terraform/scheduler.tf`) — regra do `CLAUDE.md`. E a
  situação "Atrasada" é **apurada na consulta** pelo relógio do Postgres, nunca
  dependente do job ter rodado, como já se faz na situação do documento.

### C4 — Acompanhamento e relatório exportável

- **Capabilities**: `leitura-obrigatoria` (modificada)
- **Demanda**: 3.5 (linha Acompanhamento) e a nota de visibilidade
- **PRD**: Épico 12
- **Entrega**: aba **Acompanhamento** para publicador, gestores e Governança —
  por documento: total do público, confirmados, pendentes, atrasados e **% de
  adesão**; lista nominal com nome, unidade, setor, data e hora; filtros por
  unidade, setor e situação; exportação em **Excel e PDF**.
- **Depende de**: **C1**, **D5** (alcance), **D6** (formato de exportação)
- **Risco**: é a fatia que mais pressiona o isolamento — lista **nominal** com
  unidade e setor. Três visões distintas (Governança / publicador / gestor) são
  três recortes de alcance, e cada um precisa de teste próprio. O cálculo de
  adesão exclui pessoa desligada (3.3).

---

## Grafo de dependências

```
  A1 (função e setor) ──┐
                        ├──▶ A3 (conteúdo do Início) ──┐
  A2 (menu e topo) ─────┤                              │
       │                └──▶ A4 (favoritos)            │
       │                └──▶ A5 (compartilhados)       │
       │                                               │
       └──────────────────▶ A6 (tour) ◀────────────────┘

  B1 (arquivo geral + pendente) ──▶ B2 (tabela de cadastro no lote)

  C1 (marcar + ciência) ──┬──▶ C2 (superfícies) ◀── A2, A3
                          ├──▶ C3 (avisos e atrasos)
                          └──▶ C4 (acompanhamento e relatório)
```

Blocos A, B e C são independentes; o único laço entre eles é **C2 → A2/A3**
(a coluna direita e o item de menu têm de existir antes de receberem função).

---

## Fora do código (rastreio da seção 5 da demanda)

| Ação | Responsável | Situação |
| :--- | :--- | :--- |
| Ajustar a tela Início (seção 1) | TI | fatias A1–A3 |
| Enviar prints de Documentos e Login | TI | E2 — pendente |
| Implementar envio em lote (seção 2) | TI | fatias B1–B2 |
| Informar prazo da leitura obrigatória (Fase 2) | TI | estimável após D3 e D5 |
| Enviar logo branca e símbolo em PNG | Governança | E1 — pendente |
| Definir ambiente de homologação e contato de TI | TI + Governança | E3 — pendente |

---

## Invariantes que nenhuma fatia pode violar

Repetidos aqui porque este plano é lido fora de contexto, e todas as fatias
tocam em alcance de dados:

1. **Tabela nova com dado de unidade exige coluna `unit_id` e policy RLS.**
   Vale para setores (A1), favoritos (A4), marcação e ciência (C1).
2. **Isolamento por unidade é *fail-closed*** — recurso inexistente ou de outra
   unidade responde igual, sem distinguir os casos.
3. **O administrador global não é olho universal** sobre bytes, listagem de
   itens ou auditoria de outra unidade. D1 e D5 são pedidos para abrir essa
   trava; nenhuma fatia a abre sem decisão registrada em `design.md`.
4. **Vigência e situação são apuradas no relógio do Postgres, na consulta** —
   nunca dependentes de rotina ter rodado. Vale para o prazo de leitura (C3).
5. **Bytes nunca passam pela API** — o visualizador de C1 usa a URL assinada que
   já existe; "confirmar ciência" não é motivo para servir conteúdo pela
   aplicação.
6. **A API não monta artefato de download** — o `.zip` de pasta é montado no
   cliente, e a exportação de C4 segue o mesmo princípio (ver D6).
7. **Prefixo de rota de topo novo entra em três listas** —
   `apps/api/src/lib/api-prefixes.ts`, `apps/web/vite.config.ts` e
   `infra/terraform/locals.tf`.
8. **Documentação na mesma entrega** — tela visível ajusta a página
   correspondente de `docs/manual/`, com fidelidade ao que foi efetivamente
   entregue.
