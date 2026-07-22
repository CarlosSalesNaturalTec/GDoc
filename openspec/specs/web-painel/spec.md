# web-painel Specification

## Purpose

Define os requisitos verificáveis do painel gerencial da SPA do GDoc (rota
`/admin/painel`): a página consome `GET /dashboard` (capability `painel`) e
apresenta ao administrador os cartões de estatística e os três gráficos —
arquivos por tipo, envios por mês e espaço utilizado versus disponível — no
alcance imposto pelo servidor. Implementa o lado de frontend da **US 8.2**
do PRD (`docs/prd_final.md`, RF #14).

## Requirements

### Requirement: Painel acessível pelo menu lateral com cartões e gráficos

A SPA SHALL apresentar em `/admin/painel` — rota sob a guarda de papel
`unit_admin`/`global_admin` e acessível pelo item "Painel" do menu lateral
(**US 8.2 cenário 1**) — o resultado de uma única chamada a `GET /dashboard`:

- **Cartões de estatística** (`Card`/`Statistic`): total de arquivos, total de
  pessoas, espaço utilizado (formatado em unidade legível) e percentual da
  cota consumido.
- **Arquivos por tipo**: gráfico de barras com a contagem por categoria.
- **Envios por mês**: gráfico de barras com a contagem mensal dos últimos 12
  meses.
- **Espaço utilizado versus disponível**: proporção usado/capacidade
  (`Progress`) acompanhada dos valores absolutos de espaço utilizado,
  capacidade total e espaço disponível.

A SPA NÃO SHALL recalcular, filtrar ou reconciliar os agregados — apresenta o
que o servidor retornou, no alcance que o servidor impôs (global ou de
unidade). Os gráficos SHALL ser renderizados em SVG/HTML próprio estilizado
pelos tokens do tema Ant Design, sem biblioteca de gráficos (design.md D1),
com o valor de cada barra visível como texto.

#### Scenario: Administrador vê cartões e os três gráficos (US 8.2 cenário 1)
- **WHEN** um administrador autenticado abre o painel pelo menu lateral e
  `GET /dashboard` responde com os agregados do seu alcance
- **THEN** a página exibe os quatro cartões de estatística e os três blocos —
  arquivos por tipo, envios por mês e espaço utilizado versus disponível —
  com os números retornados pelo servidor

#### Scenario: Estado de carregamento
- **WHEN** a chamada a `GET /dashboard` ainda não respondeu
- **THEN** a página exibe um indicador de carregamento, sem cartões nem
  gráficos parciais

### Requirement: Rótulos e formatação em pt-BR

A SPA SHALL apresentar os dados do painel com rótulos legíveis em pt-BR:

- **Categorias** de `FileCategory` mapeadas a rótulos fixos ("Imagens",
  "Vídeos", "Áudios", "PDFs", "Documentos de escritório", "Texto", "Outros"),
  exibidas em ordem fixa de apresentação e incluindo, com contagem zero, as
  categorias ausentes da resposta (design.md D3).
- **Meses** `YYYY-MM` formatados como rótulo curto pt-BR (ex.: `2026-07` →
  "jul/26"), preservando a ordem cronológica retornada pelo servidor — a
  série de 12 posições com zeros já vem normalizada do backend e NÃO SHALL
  ser reordenada nem preenchida pela SPA.
- **Bytes** formatados pelo utilitário compartilhado de tamanho de arquivo já
  existente; percentual da cota com precisão de uma casa decimal.

#### Scenario: Série de 12 meses com zeros e rótulos pt-BR
- **WHEN** `uploadsByMonth` contém 12 entradas em ordem cronológica, algumas
  com contagem zero
- **THEN** o gráfico de envios por mês exibe as 12 barras na mesma ordem, com
  rótulos de mês em pt-BR e as contagens zero visíveis como zero

#### Scenario: Categorias com rótulo pt-BR incluindo zeradas
- **WHEN** `filesByType` retorna contagens para um subconjunto das categorias
- **THEN** o gráfico de arquivos por tipo exibe as sete categorias com rótulo
  pt-BR na ordem fixa de apresentação, com zero nas ausentes

### Requirement: Coerência do bloco de espaço com a resposta do servidor

O bloco de espaço utilizado versus disponível SHALL derivar exclusivamente do
objeto `storage` da resposta: proporção `usedBytes / capacityBytes`, absolutos
`usedBytes`, `capacityBytes` e `availableBytes` formatados. Um painel sem
nenhum arquivo NÃO SHALL ser tratado como erro: cartões e gráficos exibem
zeros (estado vazio coerente com o cenário de meses vazios da capability
`painel`).

#### Scenario: Usado versus disponível coerente com storage
- **WHEN** o servidor responde com `storage` (usado, cota por pessoa,
  pessoas, capacidade, disponível)
- **THEN** a proporção exibida e os valores absolutos correspondem exatamente
  aos campos retornados, sem recálculo a partir de outras fontes

#### Scenario: Repositório vazio não é erro
- **WHEN** o servidor responde com zero arquivos e zero bytes usados
- **THEN** a página exibe os cartões zerados e os gráficos com todas as
  barras em zero, sem mensagem de erro

### Requirement: Falha de permissão fail-closed com aviso neutro

Um `403` de `GET /dashboard` SHALL exibir o aviso neutro padrão de permissão
insuficiente (`Result`), sem expor nenhum número nem detalhar a causa — o
servidor é o único guardião; a guarda de rota do cliente é conveniência.
Demais erros SHALL cair num estado de erro genérico com opção de tentar
novamente.

#### Scenario: 403 exibe aviso neutro sem dados
- **WHEN** `GET /dashboard` responde `403`
- **THEN** a página exibe o aviso neutro de permissão insuficiente, sem
  cartões nem gráficos
