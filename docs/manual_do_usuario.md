# Manual do Usuário — Doc7

Bem-vindo(a) ao **Doc7**, o repositório documental corporativo da organização. Este
manual explica, em linguagem simples, como usar o sistema no dia a dia. É um guia
**funcional**: fala do que você vê e faz na tela, não de como o sistema é construído
por dentro.

> **Endereço da aplicação (produção):**
> https://gdoc-prod-api-hmwigy67mq-uc.a.run.app/

Use um navegador atualizado (Chrome, Edge, Firefox ou Safari). Não é preciso instalar
nada.

---

## 1. O que é o Doc7

O Doc7 é um repositório de arquivos na nuvem com **controle rigoroso de acesso**. A
ideia central é simples: cada pessoa vê, baixa, envia, altera ou exclui **apenas
aquilo que criou ou que lhe foi liberado** — nada além disso. Tudo que acontece com
os arquivos importantes (visualizações e downloads) fica registrado, e cada unidade
da organização enxerga somente o seu próprio conteúdo.

Principais recursos:

- Navegador de arquivos com **pastas e subpastas** e trilha de navegação.
- **Envio** de vários arquivos de uma vez ou de uma pasta inteira, preservando a
  estrutura de subpastas.
- **Visualização** de arquivos sem precisar baixá-los.
- **Permissões granulares** por pasta ou por arquivo (visualizar, baixar, enviar,
  renomear, excluir).
- **Lixeira** com 30 dias para recuperar o que foi excluído.
- **Auditoria** de quem acessou cada arquivo.
- **Painel** gerencial de uso (para administradores).
- **Cota de 10 GB por pessoa**.

---

## 2. Perfis de usuário

O que você pode fazer no Doc7 depende do seu **perfil**, definido pela administração
quando sua conta é criada. Existem três:

| Perfil                       | O que enxerga                                                                                 | O que pode fazer                                                                                                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Colaborador**              | Apenas os arquivos e pastas que criou ou que lhe foram liberados.                             | Enviar, visualizar, baixar, renomear e excluir conforme sua permissão; ver a auditoria dos arquivos que enviou; trocar a própria senha.                                                     |
| **Administrador da unidade** | Tudo da **sua unidade** (pessoas, pastas, arquivos, permissões). Não enxerga outras unidades. | Tudo o que o colaborador faz, mais: cadastrar, editar, ativar/desativar pessoas da unidade e redefinir a senha delas; conceder e revogar permissões; ver o painel e a auditoria da unidade. |
| **Administrador global**     | **Todas as unidades**.                                                                        | Tudo o que o administrador de unidade faz, em escala global; além disso, cria e administra as **unidades** e define administradores de unidade.                                             |

> **Importante:** os perfis definem o **alcance** (o que você enxerga). Mesmo sendo
> administrador, você respeita o isolamento entre unidades — conteúdo de uma unidade
> nunca aparece para outra.

---

## 3. Primeiro acesso

O Doc7 **não tem autocadastro**. Sua conta é criada pela área administrativa, que lhe
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
- **Esqueci a senha:** peça à área administrativa da sua unidade que **redefina** sua
  senha. O sistema **gera** uma nova senha e a mostra **uma única vez** a quem fez a
  redefinição, que então lhe repassa. Ninguém consegue consultá-la depois — se ela se
  perder, basta redefinir novamente. Assim que a senha é redefinida, seus acessos
  abertos são encerrados e a senha anterior deixa de funcionar.

Depois de entrar, você pode trocar sua senha quando quiser em **Minha conta**
(seção 5.10).

Para **sair**, clique no seu perfil no canto superior direito e escolha **Sair**.

---

## 4. Conhecendo a tela

Na tela de **login** e no menu lateral, logo abaixo do nome **Doc7**, aparece a
identificação da sua organização (por exemplo, "SETES") — ela confirma que você
está na implantação correta quando existe mais de uma.

Depois de entrar, você vê um **menu lateral** à esquerda. Os itens disponíveis
dependem do seu perfil:

| Item do menu | Para quem            | Serve para                                                           |
| ------------ | -------------------- | -------------------------------------------------------------------- |
| **Início**   | Todos                | Página inicial de boas-vindas.                                       |
| **Arquivos** | Todos                | Navegar por pastas, enviar, baixar, visualizar e gerenciar arquivos. |
| **Buscar**   | Todos                | Encontrar arquivos por nome e filtros.                               |
| **Lixeira**  | Todos                | Recuperar ou acompanhar itens excluídos.                             |
| **Pessoas**  | Administradores      | Cadastrar, editar, ativar/desativar contas e redefinir senhas.       |
| **Painel**   | Administradores      | Ver estatísticas e gráficos de uso.                                  |
| **Unidades** | Administrador global | Criar, renomear e ativar/desativar unidades.                         |

No canto superior direito, ao lado do menu do seu perfil, fica o **sino de
notificações**. Um número sobre o sino indica quantas notificações você ainda não
leu. Clique nele para ver a lista — por exemplo, avisos de que você recebeu um
acesso temporário ou de que ele está prestes a vencer. Abrir uma notificação a
marca como lida, mas ela continua disponível na lista.

No canto superior direito fica também o **menu do seu perfil** (avatar e nome do
papel). Clicando nele, você acessa **Minha conta** e **Sair**.

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

Na página **Arquivos**, use os botões de envio para adicionar conteúdo à pasta atual:

- **Enviar arquivos** — selecione **vários arquivos de uma vez**. Cada um mostra seu
  **próprio progresso** e indica sucesso ou falha de forma independente. Se um falhar,
  os outros continuam salvos e você pode clicar em **Repetir** apenas no que falhou.
- **Enviar pasta** — selecione uma **pasta inteira**; a estrutura de subpastas é
  recriada igual dentro do sistema.

Ao enviar um arquivo, **você se torna o dono dele** e passa a poder consultar quem o
acessou.

> **Cota:** cada pessoa tem **10 GB**. Ao atingir o limite, novos envios são
> bloqueados com um aviso. Para voltar a enviar, libere espaço excluindo arquivos.

### 5.4 Visualizar sem baixar

Clique no **nome do arquivo** ou no botão **Visualizar**. O conteúdo abre direto na
tela, sem baixar. Formatos com visualização: **PDF, imagens, vídeos, áudios e
arquivos de texto**.

Outros formatos — inclusive **documentos do Office (Word, Excel, PowerPoint)** — não
têm pré-visualização nesta versão. Nesse caso o sistema avisa que a visualização não
está disponível e oferece o **download** (respeitando suas permissões), para você
abrir o arquivo no aplicativo do seu computador.

### 5.5 Baixar

Use o botão **Baixar** na linha do arquivo. O download respeita suas permissões: sem
permissão de baixar, a ação é recusada.

**Baixar uma pasta inteira.** Use **Baixar pasta**, disponível em toda pasta — inclusive
na raiz da unidade — para receber a pasta e suas subpastas num único arquivo
compactado (`.zip`), com a mesma estrutura de pastas original. O pacote contém
**apenas os arquivos que você tem permissão de baixar**: se parte do conteúdo estiver
fora do seu alcance, você é avisado de quantos itens foram incluídos em relação ao
total antes do download começar, e se **nenhum** item estiver disponível, nenhum
arquivo é gerado. Você pode acompanhar o progresso e **cancelar** a qualquer momento.

Pastas muito grandes são recusadas com uma mensagem que informa **qual** limite foi
atingido (quantidade de arquivos ou tamanho total) e orienta a baixar as subpastas
separadamente — os limites desta versão são de até **100 arquivos** e **50 MB** por
pacote.

### 5.6 Renomear e substituir arquivos

Se você tem permissão, use **Renomear** na linha do arquivo para mudar o nome ou
enviar uma **nova versão** no lugar do arquivo atual. A substituição troca o arquivo
vigente no mesmo local; **versões anteriores não ficam guardadas** para consulta. Sem
permissão, a ação é bloqueada com aviso.

Essa ação vale para **arquivos**. Pastas não são renomeadas nesta versão — se
precisar mudar o nome de uma pasta, crie a nova e mova o conteúdo reenviando-o.

### 5.7 Excluir (e a lixeira)

Ao **Excluir** um arquivo ou pasta, ele **não some na hora**: vai para a **Lixeira**,
onde fica por **até 30 dias**. Nesse período você pode **restaurar** o item, que volta
ao local de origem com as permissões que tinha. Após 30 dias, uma rotina automática o
apaga em definitivo (não é mais possível recuperar).

Acesse pelo menu **Lixeira** para restaurar ou acompanhar seus itens excluídos. A
lista mostra a **data de exclusão** e quantos **dias restantes** faltam até o expurgo,
com destaque colorido quando o prazo está perto do fim.

### 5.8 Buscar e filtrar

No menu **Buscar**, procure por **nome** e combine filtros de **data** e **tipo de
arquivo** (imagens, vídeos, áudios, PDFs etc.).

A busca só é executada quando você **pede explicitamente** — clicando em **Buscar** ou
teclando Enter no campo de nome — e exige **ao menos um critério** preenchido; sem
isso, a tela apenas convida você a informar um filtro. Só aparecem itens que atendem a
todos os critérios **e** que você tem permissão de ver. O botão **Limpar filtros**
volta a tela ao estado inicial.

> Administradores contam ainda com o filtro por **autor**, para localizar arquivos
> enviados por uma pessoa específica da sua unidade.

### 5.9 Ver quem acessou seus arquivos (auditoria)

Como **dono** de um arquivo, você pode abrir a **Auditoria** dele para ver **quem**
visualizou ou baixou, com **data e hora**. Você vê apenas os registros dos arquivos
que **você enviou** — não os de outras pessoas.

### 5.10 Minha conta e troca de senha

Clique no seu perfil no canto superior direito e escolha **Minha conta**. A página tem
duas partes:

- **Dados cadastrais** — seu nome, e-mail, unidade e papel, apenas para consulta.
  Alterações nesses dados são feitas pela área administrativa.
- **Alterar senha** — informe a **senha atual** e a **nova senha** e confirme. A nova
  senha precisa ter **ao menos 8 caracteres**.

Ao trocar a senha, você **continua conectado** onde está, mas suas **demais sessões**
(outro navegador ou computador) são encerradas na hora e passam a exigir a nova senha.

Se a senha atual informada estiver errada, a troca é recusada e nada é alterado.

### 5.11 Acesso por link direto

Se alguém lhe passar o endereço direto de um arquivo para o qual você **não tem
permissão**, o acesso é **bloqueado** e nenhum conteúdo ou pré-visualização é
mostrado. Links diretos nunca contornam as permissões.

---

## 6. Guia do Administrador de Unidade

Além de tudo que o colaborador faz, o administrador de unidade gerencia **sua própria
unidade**. Seu alcance é **restrito à unidade** — você não enxerga nem gerencia
conteúdo de outras.

### 6.1 Cadastrar e editar pessoas

Abra **Pessoas** no menu e clique em **Nova pessoa**. Informe:

- **Nome**
- **E-mail** (único; será o login)
- **Senha inicial** (mínimo de 8 caracteres)
- **Telefone**
- **Função/cargo**
- **Área de trabalho**
- **Observação**
- **Papel** (Colaborador ou Administrador da unidade)

Confirme em **Cadastrar**. A pessoa passa a poder entrar com essas credenciais.

- Se o **e-mail já estiver em uso**, o cadastro é recusado e o campo é sinalizado —
  ajuste o e-mail sem perder o resto do preenchimento.
- Para **editar** uma pessoa, clique em **Editar** na linha dela. O **e-mail** não
  pode ser alterado na edição; os demais dados e o papel, sim.

A lista mostra nome, e-mail, função, papel e **status** (ativa ou desativada).

### 6.2 Ativar e desativar pessoas

Na linha da pessoa, use **Desativar** para cortar o acesso dela ao sistema. Os
**arquivos e a auditoria são preservados** — apenas o login deixa de funcionar. Use
**Ativar** para devolver o acesso.

> Você não encontra a ação de desativar na **sua própria linha** — isso evita que um
> administrador corte o próprio acesso por engano.

### 6.3 Redefinir a senha de uma pessoa

Quando alguém esquece a senha, clique em **Redefinir senha** na linha da pessoa e
confirme. O sistema:

1. **Gera** uma nova senha (você não a escolhe);
2. exibe essa senha **uma única vez**, num aviso com botão para **copiar**;
3. **encerra imediatamente** todos os acessos abertos daquela pessoa, e a senha
   anterior deixa de funcionar.

Copie e repasse a senha com segurança antes de fechar o aviso — **ela não pode ser
consultada depois**. Se a senha se perder, é só redefinir de novo.

**Quem pode redefinir a senha de quem:**

| Quem redefine            | Pode redefinir de                                                             |
| ------------------------ | ----------------------------------------------------------------------------- |
| Administrador da unidade | Colaboradores da própria unidade                                              |
| Administrador global     | Colaboradores e administradores de unidade                                    |
| Ninguém                  | Administrador global — a senha dele só muda por ele mesmo, em **Minha conta** |

Quando a ação não é permitida para determinada pessoa, o botão **Redefinir senha**
simplesmente não aparece na linha dela.

### 6.4 Conceder e revogar permissões

As permissões são geridas **por recurso** (pasta ou arquivo), na própria página
**Arquivos**. Na linha do item, clique em **Permissões**:

1. Escolha a **pessoa**.
2. Marque os **verbos** desejados: **Visualizar, Baixar, Enviar, Renomear, Excluir**.
3. Opcionalmente, informe um **prazo de expiração**. Deixe em branco para uma
   concessão **permanente**, que vale até ser revogada manualmente.
4. Clique em **Conceder**.

As concessões aparecem em **Concessões**, cada uma marcada como **vigente** (com a
data do vencimento, se houver) ou **expirada**. Você pode **Revogar** qualquer uma
individualmente, vigente ou expirada.

> **Expirar não é revogar.** Quando o prazo é atingido, o acesso é encerrado
> automaticamente, mas a concessão **permanece registrada** na lista, marcada como
> expirada — isso preserva o histórico de quem teve acesso e até quando. Só
> **Revogar** remove a concessão da lista.

> **Reconceder atualiza o prazo.** Conceder de novo o mesmo verbo para a mesma
> pessoa sobre o mesmo recurso substitui o prazo anterior pelo novo — estendendo ou
> encurtando o acesso. Reconceder **sem** informar prazo torna a concessão
> **permanente**, mesmo que ela tivesse um prazo antes.

> **Avisos automáticos.** Quando você concede um acesso **com prazo**, a pessoa é
> avisada na hora, pela central de notificações. Conforme o vencimento se aproxima,
> ela recebe um novo aviso. Quando o prazo é atingido e o acesso é encerrado, a
> **administração da unidade** (você) recebe um aviso identificando a pessoa, o
> recurso e o verbo cortado.

> **Sem herança automática:** conceder permissão sobre uma **pasta** libera **apenas
> aquela pasta** — não os arquivos e subpastas internos, que precisam de concessão
> própria. Isso é intencional, para evitar liberar mais do que o pretendido. A tela
> exibe um aviso lembrando disso ao conceder sobre pasta.

### 6.5 Auditoria da unidade

Você pode consultar a **auditoria** de qualquer arquivo da sua unidade: quem
visualizou ou baixou, qual ação e quando. É a comprovação de acesso à informação.

### 6.6 Painel gerencial

Abra **Painel** para ver **cartões** com os números principais — total de arquivos,
total de pessoas, espaço utilizado e percentual da cota — e **gráficos** de:

- quantidade de **arquivos por tipo**;
- **envios por mês**;
- **espaço utilizado versus disponível**.

Os números refletem o **alcance da sua unidade**.

---

## 7. Guia do Administrador Global

O administrador global faz tudo que o administrador de unidade faz, porém com alcance
sobre **todas as unidades**.

### 7.1 Administrar unidades

O menu **Unidades** é exclusivo do administrador global. Nele você:

- **Nova unidade** — informe o nome e confirme.
- **Renomear** — altera o nome de uma unidade existente.
- **Desativar** — só é possível desativar uma unidade **sem pessoas vinculadas**; a
  ação é **reversível** pelo botão **Ativar**.

Uma unidade desativada **não aceita novos cadastros de pessoas** — ao tentar, o
seletor de unidade sinaliza que ela está desativada e pede outra escolha.

### 7.2 Pessoas em qualquer unidade

Ao cadastrar uma pessoa, você escolhe a **unidade** de lotação (apenas unidades
ativas aparecem na lista). Esse campo só existe no **cadastro** — a unidade não é
alterada pela edição. A lista de **Pessoas** ganha uma coluna **Unidade**, para você
distinguir contas de unidades diferentes.

Você também define quem é **administrador de unidade** e acompanha o **painel** e a
**auditoria** no âmbito global.

> Mesmo com alcance global, o **isolamento entre unidades é preservado**: o conteúdo
> (arquivos, listagens, auditoria de bytes) de uma unidade continua pertencendo a ela.
> A visão global serve para governança e acompanhamento agregado, não para expor o
> conteúdo de uma unidade a outra.

---

## 8. Tarefas rápidas (resumo)

| Quero...                       | Onde          | Como                                                      |
| ------------------------------ | ------------- | --------------------------------------------------------- |
| Entrar no sistema              | Tela de login | E-mail + senha fornecidos pela administração              |
| Trocar minha senha             | Minha conta   | Menu do perfil (canto superior direito) → **Minha conta** |
| Criar uma pasta                | Arquivos      | Botão **Nova pasta**                                      |
| Enviar arquivos                | Arquivos      | Botão **Enviar arquivos**                                 |
| Enviar uma pasta inteira       | Arquivos      | Botão **Enviar pasta**                                    |
| Visualizar sem baixar          | Arquivos      | Clicar no nome ou em **Visualizar**                       |
| Baixar um arquivo              | Arquivos      | Botão **Baixar** na linha do arquivo                      |
| Baixar uma pasta inteira       | Arquivos      | Botão **Baixar pasta** (gera um `.zip`)                   |
| Renomear/substituir um arquivo | Arquivos      | Botão **Renomear** (precisa de permissão)                 |
| Excluir                        | Arquivos      | Botão **Excluir** (vai para a Lixeira)                    |
| Recuperar algo excluído        | Lixeira       | **Restaurar** (dentro de 30 dias)                         |
| Encontrar um arquivo           | Buscar        | Nome e/ou filtros + botão **Buscar**                      |
| Ver quem acessou meu arquivo   | Arquivos      | Botão **Auditoria** (dono/admin)                          |
| Conceder permissão             | Arquivos      | Botão **Permissões** (admin)                              |
| Cadastrar pessoa               | Pessoas       | **Nova pessoa** (admin)                                   |
| Ativar/desativar pessoa        | Pessoas       | Botão **Ativar**/**Desativar** (admin)                    |
| Redefinir a senha de alguém    | Pessoas       | Botão **Redefinir senha** (admin)                         |
| Ver uso e gráficos             | Painel        | Menu **Painel** (admin)                                   |
| Criar ou desativar unidade     | Unidades      | Menu **Unidades** (admin global)                          |

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
O Doc7 não guarda versões anteriores: a substituição troca o arquivo vigente. Guarde
uma cópia por fora antes de substituir, se precisar do histórico.

**Cliquei em visualizar um Word (ou Excel) e não abriu na tela.**
Documentos do Office não têm pré-visualização nesta versão. O sistema avisa e oferece
o **download** — baixe e abra no aplicativo do seu computador.

**Quero baixar uma pasta inteira de uma vez.**
Use **Baixar pasta** (seção 5.5): você recebe um `.zip` com a estrutura de subpastas
preservada, contendo os arquivos que você tem permissão de baixar. Pastas acima de
100 arquivos ou 50 MB são recusadas com orientação para baixar subpastas separadamente.

**Esqueci minha senha.**
Peça à área administrativa que a **redefina**. Você recebe uma senha nova, gerada pelo
sistema, e pode trocá-la depois em **Minha conta**.

**Troquei minha senha e fui desconectado em outro computador.**
É esperado: trocar a senha encerra as demais sessões, mantendo apenas aquela em que
você fez a troca.

**Por que não vejo os menus "Pessoas", "Painel" ou "Unidades"?**
"Pessoas" e "Painel" são exclusivos de administradores, e "Unidades" é exclusivo do
administrador global. Se você precisa deles, converse com a área administrativa sobre
o seu perfil.

---

_Este manual cobre o uso funcional do Doc7. Para dúvidas sobre políticas de acesso da
sua organização, procure a área administrativa da sua unidade._
