# Manual do Usuário — GDoc

Bem-vindo(a) ao **GDoc**, o repositório documental corporativo da organização. Este
manual explica, em linguagem simples, como usar o sistema no dia a dia. É um guia
**funcional**: fala do que você vê e faz na tela, não de como o sistema é construído
por dentro.

> **Endereço da aplicação (produção):**
> https://gdoc-prod-api-434553790439.southamerica-east1.run.app/

Use um navegador atualizado (Chrome, Edge, Firefox ou Safari). Não é preciso instalar
nada.

---

## 1. O que é o GDoc

O GDoc é um repositório de arquivos na nuvem com **controle rigoroso de acesso**. A
ideia central é simples: cada pessoa vê, baixa, envia, altera ou exclui **apenas
aquilo que criou ou que lhe foi liberado** — nada além disso. Tudo que acontece com
os arquivos importantes (visualizações e downloads) fica registrado, e cada unidade
da organização enxerga somente o seu próprio conteúdo.

Principais recursos:

- Navegador de arquivos com **pastas e subpastas** e trilha de navegação.
- **Envio** de vários arquivos ou de uma pasta inteira; **download** de pastas
  compactadas.
- **Visualização** de arquivos sem precisar baixá-los.
- **Permissões granulares** por pasta ou por arquivo (visualizar, baixar, enviar,
  renomear, excluir), com prazo de validade opcional.
- **Lixeira** com 30 dias para recuperar o que foi excluído.
- **Auditoria** de quem acessou cada arquivo.
- **Painel** gerencial de uso (para administradores).
- **Cota de 10 GB por pessoa**.

---

## 2. Perfis de usuário

O que você pode fazer no GDoc depende do seu **perfil**, definido pela administração
quando sua conta é criada. Existem três:

| Perfil | O que enxerga | O que pode fazer |
| --- | --- | --- |
| **Colaborador** | Apenas os arquivos e pastas que criou ou que lhe foram liberados. | Enviar, visualizar, baixar, renomear e excluir conforme sua permissão; ver a auditoria dos arquivos que enviou. |
| **Administrador da unidade** | Tudo da **sua unidade** (pessoas, pastas, arquivos, permissões). Não enxerga outras unidades. | Tudo o que o colaborador faz, mais: cadastrar/editar pessoas da unidade, conceder e revogar permissões, ver o painel e a auditoria da unidade. |
| **Administrador global** | **Todas as unidades**. | Tudo o que o administrador de unidade faz, em escala global; define administradores de unidade e acompanha o painel geral. |

> **Importante:** os perfis definem o **alcance** (o que você enxerga). Mesmo sendo
> administrador, você respeita o isolamento entre unidades — conteúdo de uma unidade
> nunca aparece para outra.

---

## 3. Primeiro acesso

O GDoc **não tem autocadastro**. Sua conta é criada pela área administrativa, que lhe
informa o **e-mail** e a **senha inicial**.

1. Abra o endereço da aplicação no navegador.
2. Na tela de **login**, informe seu **e-mail** e **senha**.
3. Clique em entrar.

Ao entrar, você é levado ao seu ambiente com o conteúdo que lhe é permitido.

**Situações comuns no login:**

- **Senha incorreta:** o acesso é negado sem dizer se o erro foi no e-mail ou na
  senha (isso é proposital, por segurança). Confira os dados e tente de novo.
- **Conta desativada:** se a administração desativou sua conta, o login é negado com
  aviso de conta indisponível. Fale com quem administra o sistema.
- **Esqueci a senha:** procure a área administrativa da sua unidade para redefinição.

Para **sair**, use o botão **Sair** no canto superior direito.

---

## 4. Conhecendo a tela

Depois de entrar, você vê um **menu lateral** à esquerda. Os itens disponíveis
dependem do seu perfil:

| Item do menu | Para quem | Serve para |
| --- | --- | --- |
| **Início** | Todos | Página inicial de boas-vindas. |
| **Arquivos** | Todos | Navegar por pastas, enviar, baixar, visualizar e gerenciar arquivos. |
| **Buscar** | Todos | Encontrar arquivos por nome e filtros. |
| **Lixeira** | Todos | Recuperar ou acompanhar itens excluídos. |
| **Pessoas** | Administradores | Cadastrar e editar contas de usuários. |
| **Painel** | Administradores | Ver estatísticas e gráficos de uso. |

No topo da tela aparece seu **perfil** e o botão **Sair**.

---

## 5. Guia do Colaborador

### 5.1 Navegar pelos arquivos

Abra **Arquivos** no menu. Você vê suas pastas e arquivos em formato de lista, no
estilo "explorador de arquivos". Clique em uma pasta para entrar nela; use a **trilha
de navegação** (breadcrumb) no topo para voltar a qualquer nível anterior com um
clique.

Você só vê os itens que **criou** ou que lhe foram **liberados**. Se uma pasta contém
itens sem permissão para você, eles simplesmente não aparecem.

### 5.2 Criar pastas

Dentro de **Arquivos**, clique em **Nova pasta**, dê um nome e confirme. A pasta é
criada no local onde você está.

### 5.3 Enviar arquivos

Na página **Arquivos**, use a **área de envio** para adicionar arquivos à pasta atual.
Você pode:

- Enviar **vários arquivos de uma vez** — cada um mostra seu **próprio progresso** e
  indica sucesso ou falha de forma independente. Se um falhar, os outros continuam
  salvos e você pode **tentar novamente apenas o que falhou**.
- Enviar uma **pasta inteira** — a estrutura de subpastas é recriada igual dentro do
  sistema.

Ao enviar um arquivo, **você se torna o dono dele** e passa a poder consultar quem o
acessou.

> **Cota:** cada pessoa tem **10 GB**. Ao atingir o limite, novos envios são
> bloqueados com um aviso. Para voltar a enviar, libere espaço excluindo arquivos.

### 5.4 Visualizar sem baixar

Clique no **nome do arquivo** ou no botão **Visualizar**. O conteúdo abre direto na
tela, sem baixar. Formatos com visualização: **PDF, imagens, vídeos, áudios, arquivos
de texto e documentos do Office (Word, Excel, PowerPoint)**.

Se o formato não tiver visualização disponível, o sistema avisa e oferece o
**download** (respeitando suas permissões).

### 5.5 Baixar

- **Um arquivo:** botão **Baixar** na linha do arquivo.
- **Uma pasta inteira:** você recebe um único **arquivo compactado** com o conteúdo.
  Só entram no pacote os itens para os quais você tem permissão de baixar.

### 5.6 Renomear e substituir

Se você tem permissão, use **Renomear** para mudar o nome ou enviar uma **nova
versão** no lugar do arquivo atual. A substituição troca o arquivo vigente no mesmo
local; **versões anteriores não ficam guardadas** para consulta. Sem permissão, a
ação é bloqueada com aviso.

### 5.7 Excluir (e a lixeira)

Ao **Excluir** um arquivo ou pasta, ele **não some na hora**: vai para a **Lixeira**,
onde fica por **até 30 dias**. Nesse período você pode **restaurar** o item, que volta
ao local de origem com as permissões que tinha. Após 30 dias, uma rotina automática o
apaga em definitivo (não é mais possível recuperar).

Acesse pelo menu **Lixeira** para restaurar ou acompanhar seus itens excluídos.

### 5.8 Buscar e filtrar

No menu **Buscar**, procure por **nome** e combine filtros de **data**, **tipo de
arquivo** (imagens, vídeos, áudios, PDFs etc.) e **autor**. Só aparecem itens que
atendem a todos os critérios **e** que você tem permissão de ver. Um botão **limpar
filtros** volta a lista ao estado inicial.

### 5.9 Ver quem acessou seus arquivos (auditoria)

Como **dono** de um arquivo, você pode abrir a **Auditoria** dele para ver **quem**
visualizou ou baixou, com **data e hora**. Você vê apenas os registros dos arquivos
que **você enviou** — não os de outras pessoas.

### 5.10 Acesso por link direto

Se alguém lhe passar o endereço direto de um arquivo para o qual você **não tem
permissão**, o acesso é **bloqueado** e nenhum conteúdo ou pré-visualização é
mostrado. Links diretos nunca contornam as permissões.

---

## 6. Guia do Administrador de Unidade

Além de tudo que o colaborador faz, o administrador de unidade gerencia **sua própria
unidade**. Seu alcance é **restrito à unidade** — você não enxerga nem gerencia
conteúdo de outras.

### 6.1 Cadastrar pessoas

Abra **Pessoas** no menu e clique em **Nova pessoa**. Informe:

- **Nome**
- **E-mail** (único; será o login)
- **Senha inicial**
- **Telefone**
- **Função/cargo**
- **Área de trabalho**
- **Observação**
- **Papel** (Colaborador ou Administrador da unidade)

Confirme em **Cadastrar**. A pessoa passa a poder entrar com essas credenciais.

- Se o **e-mail já estiver em uso**, o cadastro é recusado e o campo é sinalizado —
  ajuste o e-mail sem perder o resto do preenchimento.
- Para **editar** uma pessoa, clique nela na lista. O **e-mail** não pode ser alterado
  na edição; os demais dados e o papel, sim.

### 6.2 Conceder e revogar permissões

As permissões são geridas **por recurso** (pasta ou arquivo), na própria página
**Arquivos**. Na linha do item, clique em **Permissões**:

1. Escolha a **pessoa**.
2. Marque os **verbos** desejados: **Visualizar, Baixar, Enviar, Renomear, Excluir**.
3. Clique em **Conceder**.

As concessões ativas aparecem em **Concessões vigentes**, onde você pode **Revogar**
cada uma individualmente.

> **Sem herança automática:** conceder permissão sobre uma **pasta** libera **apenas
> aquela pasta** — não os arquivos e subpastas internos, que precisam de concessão
> própria. Isso é intencional, para evitar liberar mais do que o pretendido. A tela
> exibe um aviso lembrando disso ao conceder sobre pasta.

### 6.3 Prazo de expiração de permissões

Uma permissão pode ter **data de validade** opcional. Quando o vencimento se aproxima,
a **pessoa é avisada** de que o acesso vai terminar. No vencimento, o acesso é
**cortado automaticamente** e a **área administrativa é avisada** do corte. Assim,
acessos temporários se encerram sozinhos, sem depender de alguém lembrar de remover.

### 6.4 Auditoria da unidade

Você pode consultar a **auditoria** de qualquer arquivo da sua unidade: quem
visualizou ou baixou, qual ação e quando. É a comprovação de acesso à informação.

### 6.5 Painel gerencial

Abra **Painel** para ver **cartões** com as estatísticas principais e **gráficos** de:

- quantidade de **arquivos por tipo**;
- **envios por mês**;
- **espaço utilizado versus disponível**.

Os números refletem o **alcance da sua unidade**.

---

## 7. Guia do Administrador Global

O administrador global faz tudo que o administrador de unidade faz, porém com alcance
sobre **todas as unidades**. Suas atribuições típicas:

- Cadastrar e desativar pessoas em qualquer unidade.
- Definir quem é **administrador de unidade**.
- Acompanhar o **painel** e a **auditoria** no âmbito global.

> Mesmo com alcance global, o **isolamento entre unidades é preservado**: o conteúdo
> (arquivos, listagens, auditoria de bytes) de uma unidade continua pertencendo a ela.
> A visão global serve para governança e acompanhamento agregado, não para expor o
> conteúdo de uma unidade a outra.

---

## 8. Tarefas rápidas (resumo)

| Quero... | Onde | Como |
| --- | --- | --- |
| Entrar no sistema | Tela de login | E-mail + senha fornecidos pela administração |
| Criar uma pasta | Arquivos | Botão **Nova pasta** |
| Enviar arquivos | Arquivos | Área de envio da pasta atual |
| Enviar uma pasta inteira | Arquivos | Selecionar a pasta na área de envio |
| Visualizar sem baixar | Arquivos | Clicar no nome ou em **Visualizar** |
| Baixar uma pasta compactada | Arquivos | Ação de download da pasta |
| Renomear/substituir | Arquivos | Botão **Renomear** (precisa de permissão) |
| Excluir | Arquivos | Botão **Excluir** (vai para a Lixeira) |
| Recuperar algo excluído | Lixeira | **Restaurar** (dentro de 30 dias) |
| Encontrar um arquivo | Buscar | Nome + filtros de data/tipo/autor |
| Ver quem acessou meu arquivo | Arquivos | Botão **Auditoria** (dono/admin) |
| Conceder permissão | Arquivos | Botão **Permissões** (admin) |
| Cadastrar pessoa | Pessoas | **Nova pessoa** (admin) |
| Ver uso e gráficos | Painel | Menu **Painel** (admin) |

---

## 9. Perguntas frequentes

**Não consigo ver um arquivo que sei que existe.**
Você provavelmente não recebeu permissão para ele, ou ele pertence a outra unidade.
Peça a um administrador que conceda o acesso.

**Excluí um arquivo por engano. E agora?**
Vá à **Lixeira** e **restaure** — desde que dentro de 30 dias. Após esse prazo, o
item é apagado permanentemente.

**Meus envios pararam de funcionar.**
Você pode ter atingido sua **cota de 10 GB**. Exclua arquivos para liberar espaço.

**Substituí um arquivo e preciso da versão antiga.**
O GDoc não guarda versões anteriores: a substituição troca o arquivo vigente. Guarde
uma cópia por fora antes de substituir, se precisar do histórico.

**Recebi um aviso de que uma permissão vai expirar.**
É esperado: permissões podem ter prazo. Se ainda precisar do acesso após o
vencimento, peça a um administrador que renove.

**Por que não vejo os menus "Pessoas" e "Painel"?**
Esses itens são exclusivos de administradores. Se você precisa deles, converse com a
área administrativa sobre o seu perfil.

---

*Este manual cobre o uso funcional do GDoc. Para dúvidas sobre políticas de acesso da
sua organização, procure a área administrativa da sua unidade.*
