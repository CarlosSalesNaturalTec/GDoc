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
| A1 | Função e setor na identidade | 1.3 (Atenção: Perfil), 3.1 | **entregue** | — | `funcao-e-setor-na-identidade` |
| A2 | Menu lateral e barra superior | 1.1, 1.2 | **entregue** | E1 (parcial) | `menu-lateral-e-barra-superior` |
| A3 | Conteúdo da tela Início | 1.3 | pendente | D1, D4 | — |
| A4 | Favoritos | 1.1 (menu) | pendente | — | — |
| A5 | Compartilhados comigo | 1.1 (menu) | **entregue** | — | `compartilhados-comigo` |
| A6 | Tour guiado | 1.1, 1.3 | pendente | — | — |
| B1 | Arquivo geral e pendente de cadastro | 2.3, 2.4 | **entregue** | — | `arquivo-geral-e-pendente-de-cadastro` |
| B2 | Tabela de cadastro no envio em lote | 2.1, 2.2 | **entregue** | — | `tabela-de-cadastro-no-envio-em-lote` |
| C1 | Núcleo da leitura obrigatória (marcar e dar ciência) | 3.1, 3.2 (etapas 1 e 3), 3.3, 3.4 | pendente | D3, D5 | — |
| C2 | Superfícies de pendência (menu, contador, cartão, abas) | 3.2 (etapa 2), 3.5 | pendente | C1, A2, A3 | — |
| C3 | Avisos e atrasos | 3.2 (etapas 2 e 4), 3.3 | pendente | C1, D3 | — |
| C4 | Acompanhamento e relatório exportável | 3.5 | pendente | C1, D5 | — |

Ordem sugerida: **A1 → A2 → A3 → (A4, A5, A6 em qualquer ordem) → B1 → B2 →
C1 → C2 → C3 → C4**. Na prática o bloco B foi antecipado e, entre A4 e A5, a
**A5 veio primeiro** — não exigia migração e fixou a forma de listagem plana
que a A4 consome.

> ✅ **A janela aberta pela B1 está fechada.** Entre a B1 e a B2, o servidor
> exigia os dados por item e a SPA não os enviava, de modo que todo envio em lote
> nascia Pendente de cadastro. Com a B2 entregue, o envio em lote publica o que
> está completo e deixa pendente só o que falta — verificado na app: três
> arquivos, dois publicados (um deles Arquivo geral), um pendente com aviso no
> sino.

Os blocos **A** (Fase 1), **B** (envio em lote) e **C** (Fase 2) são
independentes entre si, exceto por C2, que ocupa espaços de layout criados em
A2/A3. Se a prioridade do cliente mudar, o bloco B pode ser antecipado inteiro
sem tocar em A.

---

## Decisões pendentes do cliente

Cada uma trava as fatias indicadas. **Não resolver por conta própria** — são
decisões de produto, e duas delas mexem no núcleo de segurança do sistema.

> ✅ **D2, D3 e D4 foram perguntadas e respondidas.** O questionário está em
> `docs/questionario_a1_funcao_e_setor.txt` e as respostas, transcritas, em
> **`docs/respostas_a1_funcao_e_setor.txt`** (2026-11-04). **D2 e D4 estão
> resolvidas** e liberaram a A1 (change `funcao-e-setor-na-identidade`); **D3
> está parcialmente resolvida** — o alcance ficou definido, mas a **colisão do
> nome "Gestor" continua aberta** e segue travando C1 e C3. **D1** ficou de fora
> de propósito — é estrutural e vai com as alternativas e o custo de cada uma;
> o cliente confirmou que quer tratá-la separado.

> 📨 **D1, D3 (colisão de nome) e D5 foram perguntadas.** O questionário está
> em **`docs/questionario_d1_d3_d5_decisoes_estruturais.txt`** (2026-11-05), no
> mesmo formato do da A1, que funcionou. São 8 perguntas em três blocos, cada
> uma com o custo e o risco de cada caminho — as três mexem em alcance de
> dados, e duas delas podem reabrir o isolamento entre unidades. Enquanto não
> voltarem: **A3 e A6 seguem travadas** (bloco 1) e o **bloco C inteiro não
> começa** (bloco 2, a colisão do nome "Gestor"). As respostas devem ser
> transcritas num `docs/respostas_*.txt`, como foi feito na A1.
>
> O questionário também pergunta duas coisas menores que caem na mesma frase da
> tela: o "Y documentos novos desde o último acesso" (hoje não há registro de
> último acesso — ver a A3) e se o cartão da grade é clicável. Perguntar na
> mesma rodada evita voltar ao cliente duas vezes pela mesma linha de texto.

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

### D2 — "Perfil" exibido: papel ou função?  ✅ respondida

> **Resposta 1 (a):** aparece o **cargo** do cadastro; sem cargo preenchido,
> o nível de acesso. A resposta 2 (b) confirma a correção de cadastro, mas os
> nomes vieram ocultados — é operação do cliente. Ver
> `docs/respostas_a1_funcao_e_setor.txt`.

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

> **Verificado no código (2026-11-04).** A linha é
> `apps/web/src/inicio/InicioPage.tsx:69` — `ROLE_LABEL[identity.role] · unitName`.
> `ROLE_LABEL` (`apps/web/src/shell/role-label.ts`) já mapeia `unit_admin` →
> **"Gestor"**, de modo que a tela escrever "Colaborador" significa que a pessoa
> **está cadastrada como `collaborator`** — não há defeito de leitura a corrigir.
> `job_title` e `work_area` existem ponta a ponta no cadastro de pessoas
> (`0003_people_fields.sql`, `routes/users.ts`, `PessoaFormModal.tsx`, rotulados
> "Função/cargo" e "Área de trabalho"), mas **não entram em
> `AuthenticatedIdentity`** (`packages/shared/src/auth.ts`: só `id`, `unitId`,
> `role`, `fullName`, `unitName`). É esse o acréscimo da A1.

### D3 — "Gestor" e "equipe": hierarquia nova  🔴 estrutural · ⚠️ parcial

> **Respostas 3 (b) e 4 (b):** opção (ii) — coordenador e gerente acompanham
> o **próprio setor**, diretor acompanha a **unidade inteira**; é papel
> **distinto** de quem administra (não cadastra pessoas nem libera permissão).
> A chefia nominal foi descartada pelo custo de manutenção. **Continua aberta
> a colisão de nome abaixo** — um dos dois "Gestor" tem de ser renomeado, e é
> decisão do cliente. Trava C1 e C3.

A seção 3.1 define um perfil **Gestor** que *"acompanha as pendências da própria
equipe"*, e 3.2 (etapa 4) manda avisar *"o gestor dele"*. Isso exige saber **quem
é gestor de quem** — relação que não existe em nenhuma tabela. Os três papéis
atuais não a expressam.

> **Colisão de nome a resolver antes da spec.** "Gestor" **já é o rótulo de
> `unit_admin` na interface** (decisão de nomenclatura do cliente, change
> `identidade-visual-isetes`, design.md D7). O "Gestor" da seção 3.1 — *"diretor,
> gerente ou coordenador da unidade ou setor"* que acompanha pendências — pode
> ser a mesma pessoa ou um papel distinto, que acompanha leituras sem administrar
> a unidade. Se for distinto, a interface passa a ter dois "Gestor" com alcances
> diferentes, o que `nomenclatura-interface` proíbe ("rótulo do papel é idêntico
> em toda a interface"). Um dos dois tem de ser renomeado — decisão do cliente.

Opções: (i) gestor = `unit_admin` da unidade, e "equipe" = a unidade inteira
(barato, perde o recorte por setor); (ii) gestor por setor (depende de **D4**):
"equipe" = pessoas do mesmo setor; (iii) chefia nominal (`users.manager_id`),
explícita e precisa, com custo de manutenção do cadastro.

### D4 — "Setor": texto livre ou entidade?  ✅ respondida

> **Respostas 5 (a) e 6 (a):** setor **é** critério de público e recorte de
> relatório, e **é o mesmo conceito** de "Área de trabalho" — aproveitar o que
> está cadastrado, padronizando a escrita. Logo: **entidade por unidade**,
> entregue pela A1. A pergunta 7 (lista oficial, com Ana) segue pendente e
> **não trava**: a lista inicial nasce do acervo e é padronizada por
> renomeação.

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

### A2 — Menu lateral e barra superior  ✅ entregue

> Change `menu-lateral-e-barra-superior`. **Desvios do previsto aqui,
> decididos durante a especificação e a implementação:**
>
> - **O contador do sino já existia.** `NotificationCenter` consome
>   `useUnreadNotificationCount` e envolve o botão num `Badge` desde antes. O
>   relato de "sino sem contador" descreve contagem **zero**, que o design
>   system não desenha. Nenhuma rota nova, nenhum requisito novo em
>   `notificacoes` — o risco anotado nesta seção se resolveu na conferência.
> - **Os 600 px de busca viraram teto, não medida.** No limiar de 992 px a
>   barra dispõe de 680 px e o campo divide com sino, ajuda e envio: 600 fixos
>   estourariam a linha e produziriam a rolagem horizontal que
>   `web-responsividade` proíbe. Medido na app: 400 px em 992, 432 em 1024 e o
>   teto de 600 a partir de 1280.
> - **O `Input.Search` foi descartado.** Ele renderiza o acionador num
>   `ant-input-group-addon` — **fora** da caixa do campo — com ou sem
>   `enterButton`, o oposto do que a demanda pede. O acionador é `suffix` de um
>   `Input` comum.
> - **O botão de envio não é filtrado por papel.** `canUpload` é por pasta e vem
>   do servidor; permissão de envio nasce de concessão, não de papel. O botão
>   reusa o pedido pelo endereço de `cartoes-de-atalho-acionaveis`, e o
>   explorador o atende só depois do veredito — é assim que o atalho não conduz
>   a recusa. `PARAM_PEDIDO_DE_ENVIO` saiu de `inicio/atalhos.ts` para
>   `navegacao/pedido-de-envio.ts`, já que agora tem três consumidores.
> - **Dois defeitos que só a medição em navegador pegou:** o campo de busca
>   colapsava para **24 px** em 375 px (corrigido com piso de 120 px, botão de
>   envio só com ícone e ajuda fora da barra no modo estreito — o manual segue
>   a um toque no grupo AJUDA do painel), e o cartão do usuário ficava em
>   **y=977 numa viewport de 900 px**, fora da tela, porque o `Sider` cresce com
>   o conteúdo da página (coluna passou a `sticky`/`100vh`, com reserva da
>   altura do gatilho de recolher).
> - **O avatar exigiu requisito novo em `sistema-de-design`.** `#9ED8F6` mede
>   11,12:1 com o texto escuro e **1,54:1 com branco**, e o `Avatar` escreve em
>   branco por padrão. O rótulo de grupo também: o padrão do design system para
>   título de grupo no menu escuro é um branco translúcido que reprova no piso.
>
> **Lacunas conhecidas, aceitas:**
>
> - Quatro itens de menu não entraram, por não terem destino: **Favoritos**,
>   **Compartilhados comigo** (A4, A5), **Leitura obrigatória** (C2) e **Tour
>   guiado** (A6). A homologação da A2 verá um menu diferente do Anexo A por
>   isso.
> - **E1 segue aberto, e a medida de 150 px não se aplica ao ativo atual**: ele
>   é retrato (301×502), de modo que 150 px de largura dariam 250 px de altura
>   num menu de 264 px. A logomarca foi de 40 para 96 px de altura e a queixa de
>   "miniatura ilegível" é resolvida pelo **nome em texto**, que não depende de
>   ativo. A marca d'água do símbolo (200 px, 14%) continua fora: o JPEG é
>   opaco, e a 14% apresentaria um retângulo cinza.
> - O cartão do usuário exibe o **papel**, não a função do cadastro. É a A1,
>   travada por **D2** — e o cartão é a única superfície que apresenta o dado,
>   então a troca fica contida nele.

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
- **Consome a forma fixada pela A5**: a listagem plana de recursos em
  profundidade arbitrária (localização = pasta-mãe, arquivo abre no
  visualizador, pasta abre no explorador, ações só dos verbos concedidos,
  perda de alcance remove sem erro) já está resolvida em
  `compartilhados-comigo`. Favoritos é a mesma tela sobre outro dado —
  inventar uma segunda forma é o que faria as duas divergirem.

### A5 — Compartilhados comigo  ✅ entregue

> Change `compartilhados-comigo`. **Desvios do previsto aqui, decididos durante
> a especificação e a implementação:**
>
> - **Não é reentrada de escopo.** Esta seção classificava a fatia como tal, por
>   analogia com Favoritos e Tour guiado. A lista de Fora de Escopo do PRD
>   exclui *compartilhamento entre unidades* e *notificação a cada
>   compartilhamento recebido* — **não** a listagem do que foi compartilhado
>   comigo. Entrou como **US 4.4, no Épico 4** (permissões granulares), e não no
>   Épico 11: o que a fatia entrega é a contrapartida da concessão granular, não
>   orientação da tela inicial.
> - **Os fragmentos de alcance de `lib/access.ts` não servem a esta tela**
>   (design.md D1) — e esta é a descoberta que mais moldou a change.
>   `resourceScopeClause` devolve **`TRUE`** para quem é administrador da
>   unidade da listagem, o que é correto para a listagem de pasta e
>   apresentaria **todo o acervo da unidade** ao `unit_admin` sob o título
>   "Compartilhados comigo". A lista parte da **concessão**; `hasAccess` depois
>   apenas confirma. O teste que fixa isso (admin com uma concessão recebida vê
>   um item, não o acervo) é o mais importante da fatia.
> - **As regras restritivas entram por `hasAccess`, não por cláusula SQL
>   reescrita** (design.md D2). O plano previa reusar `nonObsoleteClause` e
>   `visibleRegistrationClause` como fragmentos; o precedente de
>   `GET /files/recent` é mais forte — *"nenhuma segunda expressão da regra de
>   acesso"* —, e uma chamada por recurso basta, porque as regras restritivas
>   são propriedade do recurso, não do verbo.
> - **Nenhum prefixo de rota novo.** `GET /grants/received` vive sob `/grants`,
>   que já está nas três listas — o invariante 7 não foi tocado. Em compensação,
>   é a primeira rota de `/grants` aberta a `collaborator`, e por isso
>   `permissoes-granulares` passou a distinguir **administrar as concessões de
>   um recurso** de **ler as próprias**.
> - **O prazo acompanha o verbo, não o item** (design.md D5). Conceder vários
>   verbos numa operação dá a todos o mesmo prazo, mas reconceder um subconjunto
>   com prazo diferente é permitido, e um prazo "do item" teria de escolher
>   entre mentir e omitir.
> - **A localização é só a pasta-mãe** (design.md D7), pelo precedente de
>   `GET /files/recent`. Durante a conferência: `buildBreadcrumb`
>   (`routes/folders.ts:71`) **sobe os pais sem checar acesso em nenhum deles**,
>   de modo que a trilha do explorador nomeia pastas que a pessoa não alcança.
>   É **pré-existente** (alcançável hoje por quem digita o endereço) e não foi
>   ampliado aqui — a lista não acrescenta nome de ancestral nenhum. Fica como
>   fatia futura, não como passageira desta.
> - **Dois achados de passagem, corrigidos**: o enum de verbos estava escrito à
>   mão duas vezes em `lib/schemas.ts` e a terceira cópia entraria com esta
>   fatia (extraído para `permissionSchema`); e a ordem dos verbos na resposta
>   dependia da ordem das linhas de `grants`, indeterminada sem `ORDER BY` —
>   agora é a ordem canônica do enum.
>
> **A forma da listagem plana ficou fixada aqui, para a A4 consumir**: o que
> mostrar como localização, o que o clique faz em arquivo e em pasta, que ações
> oferecer (só as dos verbos que vieram) e o que acontece quando o alcance cai.
> Favoritos é a mesma forma sobre outro dado.
>
> **Lacuna conhecida, aceita**: a lista não tem paginação nem filtros. O tamanho
> é ditado pelo que a administração concedeu nominalmente, e ambos são aditivos.

- **Capabilities**: `compartilhados-comigo` (**nova**), `permissoes-granulares`
  (**modificada**), `web-shell-e-auth` (**modificada**)
- **Demanda**: 1.1 (item de menu)
- **PRD**: **US 4.4 nova, no Épico 4** — ver o desvio acima
- **Entrega**: destino listando os recursos sobre os quais a pessoa tem
  concessão vigente de outra pessoa (não os que ela mesma criou), um item por
  recurso com o conjunto dos verbos. Dado já existia: a tabela de concessões,
  com a vigência avaliada no SQL pelo relógio do Postgres. **Nenhuma migração.**
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

### B1 — Arquivo geral e pendente de cadastro  ✅ entregue

> Change `arquivo-geral-e-pendente-de-cadastro`. **Desvios do previsto aqui,
> decididos durante a especificação e a implementação:**
>
> - **`busca` e `gestao-arquivos` não foram modificadas.** Por precedente: a
>   regra do documento obsoleto declara a ocultação **uma vez**, em
>   `controle-documental`, cobrindo "listagem, busca e acesso direto". A
>   visibilidade do pendente segue a mesma forma — uma regra, quatro caminhos —
>   em vez de espalhar cláusulas por capability de consulta. `web-navegacao`
>   entrou (apresentação da etiqueta).
> - **O requisito antigo entrou sob REMOVED, não MODIFIED.** O cenário "Envio em
>   lote dispensa os dados" nomeia a dispensa; mantê-lo sob MODIFIED produziria
>   nome de cenário em contradição com o corpo. Mesmo tratamento que a change
>   `identidade-visual-isetes` deu ao caso equivalente, com Reason e Migration.
> - **O conjunto exigido foi de quatro para cinco campos** (entrou o
>   responsável, pela tabela 2.2 da demanda), o que altera também o **envio
>   unitário** já entregue.
> - **Duas migrações, não uma**: a `0019` precisou ampliar o `CHECK` de
>   `notifications.kind`, que recusava o valor novo — e recusava **em silêncio**,
>   porque a emissão do aviso é deliberadamente engolida para não impedir o
>   envio. Só o teste revelou.
> - **Defeito corrigido de passagem**: a fronteira Zod da SPA convertia toda
>   situação desconhecida em "Sem controle de revisão" (`.catch`), que não é
>   fallback neutro mas afirmação — uma SPA mais antiga que a API apresentaria
>   arquivo pendente como acervo em circulação.
> - **Lacuna conhecida**: a checagem de código duplicado **dentro do próprio
>   lote** foi implementada no servidor (sem ela a colisão abortaria a transação
>   e derrubaria o lote inteiro), mas a pré-checagem no cliente, que avisa antes
>   de enviar, continua sendo da B2.

- **Capabilities**: `controle-documental` (**modificada**), `envio-lote`
  (modificada), `notificacoes` (modificada), `web-navegacao` (modificada)
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

### B2 — Tabela de cadastro no envio em lote  ✅ entregue

> Change `tabela-de-cadastro-no-envio-em-lote`. **Desvios do previsto aqui,
> decididos durante a especificação e a implementação:**
>
> - **Dois defeitos vivos entraram no escopo**, não previstos nesta seção. A B1
>   levou o conjunto exigido de quatro para cinco campos no servidor, e o
>   formulário do **envio unitário** ficou em quatro: quem não preenchia o
>   responsável recebia a recusa do servidor em vez da validação local. E o tipo
>   **Arquivo geral** era inalcançável pela interface — o formulário exigia os
>   três campos que o servidor recusa para ele.
> - **A causa desses dois foi atacada, não só o sintoma** (design.md D9): o
>   conjunto exigido e a lista de campos recusados pelo Arquivo geral subiram
>   para `packages/shared`, e a API passou a lê-los de lá. Era uma constante
>   duplicada à mão nos dois lados; é isso que produz "servidor exige cinco,
>   tela exige quatro".
> - **O requisito do envio unitário entrou sob REMOVED + ADDED, não MODIFIED**,
>   pelo precedente que a B1 fixou: o cenário "Envio de vários arquivos não
>   apresenta o formulário" **nomeia** a dispensa que esta fatia extingue, e
>   mantê-lo sob MODIFIED produziria nome de cenário em contradição com o corpo.
> - **`envio-lote` foi modificada para declarar comportamento já implementado**:
>   a recusa por conflito de código **por item** — com o acervo e dentro do
>   próprio lote — e a retomada do código preso a envio pendente de quem pede
>   existiam desde a B1 e não estavam na spec. Nenhum código de servidor mudou
>   nesta fatia; entraram três casos de teste.
> - **A marca de sugestão é textual, não colorida.** O fundo âmbar funciona no
>   campo de código, mas o `Select` do tipo pinta o próprio fundo por cima — e
>   `controle-documental` já fixou que informação não depende de cor. Cada
>   célula sugerida carrega "sugerido pelo nome do arquivo" por escrito.
> - **Siglas do cliente ≠ siglas da interface** (design.md D4): o reconhecedor
>   aceita `POL/NOR`, `FOR/CHK`, `TC` e `CI` da tabela 2.2 **e** as da interface
>   (`POL`, `FRM`, `TCO`, `COM`), porque um reconhecedor com as da interface
>   falharia justamente nos nomes que o acervo do cliente traz.
> - **Lacunas conhecidas, aceitas:** (a) o cadastro digitado na tabela **não é
>   rascunho** — fechar a tela, cancelar, ou a pausa por falta de espaço no meio
>   do envio o perdem; persistir rascunho exigiria armazenamento e ciclo de vida
>   próprios; (b) **nenhuma pré-checagem do código contra o acervo** antes de
>   enviar — a guarda segue sendo o servidor, que recusa o item antes de
>   qualquer byte, e a linha recusada volta corrigível com o cadastro
>   preservado; (c) o botão de publicar nomeia os dois grupos ("Publicar
>   completos (N) e enviar M como pendente(s)"), mais longo que o "Publicar
>   completos" da demanda, porque o rótulo curto mentiria sobre o destino das
>   linhas incompletas.

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
