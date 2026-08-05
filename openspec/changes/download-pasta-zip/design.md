# Design — download-pasta-zip

## Context

Restrição central do projeto (CLAUDE.md, "Tráfego de bytes"):

> Bytes **nunca** passam pela API. A rota checa permissão → emite URL assinada de
> TTL curto do bucket privado → o cliente faz PUT/GET direto no storage.

Um arquivo compactado é, por definição, bytes reagrupados por **alguém**. Ou seja,
a US 3.3 obriga a escolher quem faz esse reagrupamento sem que a API vire pipe de
conteúdo.

Estado atual relevante:

- `POST /files/:id/download-url` (`routes/files.ts:123`) resolve `Permission.DOWNLOAD`
  via `hasAccess`, **grava a auditoria na emissão da URL** (`files.ts:132`,
  antes de qualquer byte trafegar) e devolve URL assinada com TTL de download.
- `lib/access.ts` resolve **dono OU admin da unidade OU grant do verbo**, **sem
  herança** — grant numa pasta não libera o conteúdo interno (`design.md D1` do
  `epico-4-permissoes-granulares`).
- `lib/folder-tree.ts` já tem `normalizeRelativePath` e `ensureFolderPath`, usados
  pelo **upload de pasta** (Épico 3) para recriar hierarquia a partir de caminhos
  relativos. O download precisa do caminho inverso.
- Itens na lixeira resolvem como inexistentes em toda via viva
  (`epico-6-lixeira-retencao` D2).

## Goals / Non-Goals

**Goals:**

- Entregar a pasta como um único pacote, preservando a hierarquia de subpastas.
- Filtrar o conteúdo pela permissão de **baixar** do solicitante, **item a item**,
  sem inventar herança.
- Manter bytes fora da API.
- Manter a auditoria por arquivo — é o núcleo de valor do produto.
- Tornar visível ao usuário quando o pacote é recorte parcial.

**Non-Goals:**

- Compactar no servidor nesta fatia (D1).
- Retomada, segundo plano, formatos alternativos, seleção de arquivos avulsos.
- Compactar itens da lixeira.

## Decisions

### D1 — Manifesto de URLs assinadas: o cliente compacta

A API **não** produz o `.zip`. Ela devolve um **manifesto**: para cada arquivo da
subárvore que o solicitante pode baixar, um item com caminho relativo, nome,
tamanho e URL assinada. O navegador baixa cada objeto **direto do bucket** e monta
o `.zip` em streaming.

```
    ESCOLHIDA — manifesto + zip no cliente        DESCARTADA (a) — job assíncrono
    ──────────────────────────────────────        ────────────────────────────────
    SPA ──► POST /folders/:id/                    SPA ──► POST .../zip-jobs
            download-manifest                         ◄── { jobId }
        ◄── [{ relativePath, url, … }] × N            ⋮  polling
             + { totalFiles, allowedFiles }       Cloud Run Job
             │                                      ├─ lê objetos do bucket
             │  (API só assinou e auditou)          ├─ monta .zip
             ▼                                      └─ grava /tmp-zips/{uuid}.zip
    Browser ──GET──► bucket (× N, direto)                    │
             │                                               ▼
             ▼                                      URL assinada do .zip
        zip em streaming ──► arquivo local
                                                  DESCARTADA (b) — stream na API
    ✅ invariante de bytes intacto                 ────────────────────────────────
    ✅ zero infraestrutura nova                    API lê N objetos e faz pipe
    ✅ permissão e auditoria inalteradas           ❌ VIOLA o invariante central
    ⚠️  limitado pela memória do navegador
```

_Por que não a (a) agora:_ o job resolve escala, mas cobra infraestrutura que não
existe — tabela de estado do pedido (tenant-scoped, portanto `unit_id` + RLS),
polling ou notificação, um prefixo de artefatos temporários com TTL e rotina de
limpeza, e a decisão de se o `.zip` intermediário conta na cota de 10 GB da
pessoa. É um épico, não uma fatia. **Caminho de migração preservado:** o contrato
do cliente é "peço o download da pasta e recebo um pacote"; trocar o mecanismo por
trás não muda os requisitos desta spec, apenas o meio. Se os limites de D5 se
mostrarem apertados em uso real, a (a) entra como mudança seguinte sem reescrever
o comportamento aqui normatizado.

_Por que não a (b):_ viola o invariante central do projeto. Não é negociável.

### D2 — Entrada pela pasta exige `view`; cada arquivo exige `download`

Duas checagens distintas, em camadas:

| Recurso | Verbo | Efeito se faltar |
|---|---|---|
| A pasta pedida | `view` | `403` fail-closed, sem vazar existência |
| Cada arquivo da subárvore | `download` | O arquivo é **omitido** do manifesto |
| Cada subpasta da subárvore | `view` | A subpasta e sua descendência são omitidas |

Exigir `view` na pasta de entrada é coerente com `GET /folders/:id/contents`, que
já é o gesto de "abrir a pasta" — não faria sentido baixar uma pasta que não se
pode abrir. Exigir `download` na pasta de entrada foi considerado e descartado: a
US 3.3 fala em "permissão de baixar sobre **os itens** de uma pasta", e o verbo
`download` sobre uma pasta não tem significado próprio no modelo (pasta não tem
bytes).

Falta de permissão em item interno **omite**, não falha — é literalmente o cenário
2 da US 3.3 ("apenas os itens permitidos são incluídos").

### D3 — Sem herança, inclusive aqui: o manifesto vazio é resultado válido

`hasAccess` não deriva permissão de ancestral, e esta fatia **não** abre exceção.
Consequência direta e contra-intuitiva: alguém com grant `download` **apenas na
pasta**, sem grant nos arquivos internos, pede o download e o manifesto volta
**vazio**.

Tecnicamente correto; péssimo se a interface entregar um `.zip` de 0 bytes sem
explicação. Por isso o manifesto carrega `totalFiles` (arquivos vivos na
subárvore) e `allowedFiles` (quantos entraram), e a interface é **obrigada** a
tratar `allowedFiles === 0` com mensagem explícita — nunca produzindo arquivo.

Isso não é enfeite de UX: é o que impede que a regra "sem herança" seja lida pelo
usuário como bug do sistema.

### D4 — Auditoria: N eventos `download`, na emissão do manifesto

Um evento por arquivo incluído, não um evento agregado de "baixou a pasta".

Razão de contrato: `POST /files/:id/download-url` já grava auditoria **na emissão
da URL** (`files.ts:132`), não na transferência. O manifesto é exatamente a mesma
operação repetida N vezes; auditar diferente criaria duas semânticas de `download`
no mesmo sistema. E a pergunta que a auditoria existe para responder — "quem
baixou **este arquivo**?" (RF #9/#11, Épico 7) — só continua respondível se cada
arquivo tiver seu próprio evento.

_Consequência assumida:_ o usuário pode cancelar depois do manifesto emitido, e a
auditoria registrará downloads que não se completaram. Isso **já é verdade hoje**
para o download unitário — a URL assinada pode ser emitida e nunca acessada. O
modelo audita **autorização de acesso concedida**, não bytes entregues; é a
semântica correta para prova de acesso à informação, e mudá-la para o caso da
pasta a quebraria para o caso unitário.

_Alternativa descartada:_ um evento `download_folder` mais N eventos. Duplicaria a
contagem no painel e na tela de auditoria do arquivo sem responder nenhuma
pergunta nova — o agrupamento por horário já é visível na listagem.

### D5 — Limites explícitos, com recusa clara

O `.zip` é montado na memória/disco do navegador. Sem limite, uma pasta de dezenas
de GB derruba a aba, e o usuário não entende por quê. Dois tetos configuráveis,
checados **antes** de assinar qualquer URL e antes de auditar:

- **soma máxima de bytes: 50 MB** (definido pelo cliente) — o teto que governa;
- **número máximo de arquivos: 100** (definido pelo cliente) — guarda secundária
  contra a pasta com muitos arquivos minúsculos, que passaria folgada nos 50 MB
  mas produziria centenas de requisições ao bucket e centenas de eventos de
  auditoria numa transação.

Os dois tetos se cruzam de forma útil: 100 arquivos dentro de 50 MB dá uma média
de 500 KB por arquivo. Pastas de documentos leves batem no teto de **contagem**;
pastas de digitalizações batem no de **bytes**. Por isso a recusa precisa dizer
**qual** dos dois foi atingido — a ação corretiva é a mesma (baixar subpastas),
mas o usuário só entende o porquê se souber qual limite o barrou.

Excedido ⇒ recusa com erro **específico** (não genérico), informando qual teto foi
atingido e orientando a baixar subpastas separadamente. Nada é assinado e **nada é
auditado** num pedido recusado — a ordem importa: validar limite → assinar →
auditar.

Ambos ficam em `config.ts`, não hardcoded, para ajuste sem deploy de código.

**O teto de 50 MB reforça D1.** Era o argumento que faltava: com esse volume, a
compactação no navegador é confortável — sem risco de estourar memória, sem
necessidade de disco temporário — e o job assíncrono seria infraestrutura
construída para um problema que o próprio limite já elimina. A decisão de compactar
no cliente deixa de ser "a mais barata por ora" e passa a ser a proporcional.

**Contrapartida a registrar:** 50 MB é restritivo para um repositório documental.
Uma pasta com algumas dezenas de PDFs digitalizados ultrapassa o teto, e o usuário
vai encontrar a recusa com frequência maior do que "caso extremo" — é por isso que
a mensagem de recusa precisa ser **acionável** (qual teto, e o que fazer), não um
erro genérico. Se o volume de recusas incomodar em uso real, o caminho é elevar o
teto (uma variável de ambiente) e, só se isso esbarrar na memória do navegador,
migrar para o job. O contrato do cliente não muda em nenhum dos dois passos.

### D6 — TTL e CORS: reuso do que já existe, sem afrouxar

As URLs do manifesto usam o **mesmo TTL de download** já praticado (~15–30 min) —
não um TTL estendido "porque são muitas". Um pacote que não termina dentro da
janela é sinal de que os limites de D5 estão largos demais, não de que o TTL está
curto; afrouxar TTL para acomodar volume aumentaria a janela de vazamento de uma
URL assinada.

O bucket já precisa de CORS para `GET` do navegador — é o mesmo mecanismo do
download unitário, normatizado em `platform-infrastructure` (requisito de CORS do
bucket) e configurado por `cors_allowed_origins` no Terraform. **Nenhuma origem
nova é necessária**; se a compactação em streaming exigir header adicional na
resposta do bucket, isso é ajuste de configuração existente, não requisito novo.

### D7 — Caminhos relativos: inverso do upload de pasta

O upload de pasta (Épico 3) recebe caminhos relativos e recria a hierarquia via
`normalizeRelativePath` + `ensureFolderPath`. O download faz o inverso: percorre a
subárvore viva e emite, para cada arquivo, o caminho relativo **à pasta pedida**.

Simetria deliberada — enviar uma pasta e baixá-la de volta deve reproduzir a mesma
estrutura. As mesmas regras de normalização se aplicam (sem `..`, sem caminho
absoluto, separador normalizado), agora como **saída** confiável em vez de entrada
a validar.

Pastas cujo conteúdo foi inteiramente filtrado por permissão **não** geram entrada
no pacote — um `.zip` não representa diretório vazio de forma útil, e materializar
pastas vazias revelaria ao solicitante a existência de estrutura que ele não pode
ver. Omitir é também a escolha mais segura.

### D8 — Itens na lixeira nunca entram

A travessia usa o mesmo filtro `deleted_at IS NULL` de toda via viva
(`visibleResourceClause`). Item na lixeira resolve como inexistente, inclusive
para o admin da unidade — a exceção `includeTrash` de `hasAccess` existe só para
`restore` e **não** pode ser combinada com uma rota de conteúdo vivo.

## Risks / Trade-offs

- **Memória do navegador é o teto real.** Mitigado por D5 (limites + recusa
  explícita) e por compactação em streaming, que não retém todos os arquivos
  simultaneamente. Ainda assim, é o motivo de D1 preservar o caminho para o job.
- **N requisições ao bucket em vez de uma.** Para pastas com muitos arquivos
  pequenos, a latência acumula. Aceitável dentro dos limites de D5; se virar
  problema medido, é argumento a favor do job (D1), não de mudar o contrato.
- **Auditoria de downloads não concluídos.** Assumido em D4, consistente com o
  comportamento já existente do download unitário.
- **Manifesto vazio surpreende.** Mitigado por D3 (contadores obrigatórios +
  mensagem explícita). É consequência da regra "sem herança", que é decisão de
  produto já consolidada, não algo a corrigir aqui.
- **Uma pasta grande gera muitos eventos de auditoria de uma vez.** A tabela já
  tem índice por arquivo (`0009_audit_file_index.sql`); o volume é o mesmo que N
  downloads unitários, apenas concentrado. Gravar em lote na mesma transação evita
  N round-trips.

## Migration Plan

Sem migração de banco e sem mudança de infraestrutura. Ordem:

1. `packages/shared` (DTOs) → rebuild de `dist`.
2. `lib/folder-tree.ts` (travessia + caminho relativo) com teste unitário próprio,
   antes da rota.
3. `routes/folders.ts` (manifesto) + limites em `config.ts`.
4. Web (ação, progresso, recorte parcial, cancelamento).
5. Manual do usuário: mover o item da seção 10 para a 5.5.

O recurso nasce desligado de qualquer dado existente — nenhuma rota atual muda de
comportamento, então não há janela de incompatibilidade entre versões.

### D9 — A ação é oferecida em toda pasta, inclusive na raiz da unidade

A ação "Baixar pasta" SHALL aparecer uniformemente, sem esconder-se onde o
pedido provavelmente será recusado — inclusive na **raiz da unidade**, onde os
tetos de D5 barrarão o pedido em praticamente qualquer unidade com uso real.

_Alternativa descartada:_ omitir a ação na raiz. Uma ação que existe em toda pasta
menos numa vira defeito aparente: o usuário procura, não encontra, e não tem como
saber por quê. Pior, a fronteira seria arbitrária — se a raiz é escondida por ser
grande demais, uma subpasta de 400 MB deveria ser também, e aí a regra de exibição
teria que consultar o tamanho antes de desenhar o menu.

Deixar a recusa explicar transforma um mistério de interface numa mensagem que
ensina o modelo: *"esta pasta tem 312 arquivos (limite: 100). Baixe subpastas
separadamente."* O usuário aprende o limite e a saída no mesmo gesto. Isso só
funciona porque a recusa é acionável por contrato (D5) — com erro genérico, esta
decisão seria hostil.

## Open Questions

- **Nome do arquivo gerado.** `{nome-da-pasta}.zip` é o óbvio; se houver colisão
  de nome no diretório de downloads do usuário, o navegador resolve sozinho.
