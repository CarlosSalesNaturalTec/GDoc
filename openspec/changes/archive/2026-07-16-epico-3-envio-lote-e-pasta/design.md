# Design — epico-3-envio-lote-e-pasta

## Context

A fundação e os Épicos 1–2 já entregam: RLS por `unit_id` com
`withTenantTransaction` (`SET LOCAL app.current_unit` / `app.user_role` por
requisição), identidade real via sessão (`attachTenantContext` popula
`req.tenantContext = { userId, unitId, role }`), o fluxo de URL assinada
(`StoragePort`: `getUploadUrl`, `buildObjectPath`, …), e a **árvore de pastas**:

- `folders` (migração `0004`): `unit_id`, `owner_id`, `parent_id` (nulo = raiz da
  unidade), `name`, sob `FORCE ROW LEVEL SECURITY`. Índice `(unit_id, parent_id)`.
  **Sem** unicidade de nome por pai — hoje duas pastas irmãs podem ter o mesmo nome.
- `files.folder_id` (nulo = raiz). `POST /folders { name, parentId? }` cria uma
  pasta, exigindo `parent.owner_id = ctx.userId` (dono cria na própria árvore).
- `POST /files/upload-url` (singular): pré-checa a cota de 10 GB contra
  `users.storage_used_bytes`, insere a linha `pending` e assina **um** PUT.
  `storage_used_bytes` só é incrementado no finalize (`POST /internal/storage-events`).

Restrições de arquitetura (herdadas, não renegociadas): backend é o único guardião
de permissão; toda tabela tenant-scoped mantém `unit_id` + policy RLS; nunca `SET`
de sessão (pooler em modo transação); bytes trafegam por URL assinada de TTL curto
emitida só após checagem no servidor; bucket 100% privado; migração aplicada não é
editada — sempre um arquivo novo.

## Goals / Non-Goals

**Goals:**

- Emitir URLs de envio para **vários arquivos numa requisição**, com resultado
  (URL ou erro) **independente por item**, para que falha parcial não derrube o
  lote e a nova tentativa seja só do item que falhou (US 3.1).
- Tornar o pré-check de cota **consciente do lote inteiro** (soma dos itens + envios
  pendentes), não só do volume já finalizado.
- Recriar **idempotentemente** a hierarquia de subpastas a partir do `relativePath`
  de cada arquivo, ancorada na pasta de destino (ou raiz), preservando a estrutura
  original (US 3.2).
- Preservar intactos o mecanismo de tenancy, o fluxo de URL assinada e a
  reconciliação por objeto (`storage-events` não muda).

**Non-Goals:**

- Qualquer UI/SPA (`apps/web` segue reservado) — barra de progresso por arquivo é
  consumo do contrato pelo frontend, não desta fatia.
- **Download compactado de pasta (US 3.3)** — depende da permissão de download por
  item do Épico 4; adiado por design (ver D6).
- Permissões granulares (Épico 4); alcance administrativo sobre itens de terceiros
  (Épico 5); lixeira (Épico 6); busca e filtros (Épico 9).
- Mover/reparentar pasta; renomear pasta; histórico de versões — fora desta fatia.

## Decisions

### D1 — `POST /files/upload-urls` (lote), resultado por item

Novo endpoint plural, ao lado do singular já existente (que permanece para arquivo
único). Contrato:

```
POST /files/upload-urls
{
  destinationFolderId?: uuid,          // pasta-âncora; ausente = raiz da unidade
  items: [
    { fileName, contentType, declaredSizeBytes, relativePath?: "Relatorios/2024" }
  ]
}
→ 200 { results: [
    // por item, MESMA ordem da entrada, independente:
    { fileName, ok: true,  uploadUrl, objectPath, folderId, expiresAt },
    { fileName, ok: false, error: "quota exceeded" | "invalid item" | ... }
  ] }
```

Cada item bem-sucedido segue **o mesmo ciclo** do singular: linha `pending`
inserida, PUT direto no storage pelo cliente, reconciliação por
`POST /internal/storage-events`. Assim, progresso individual, sucesso/falha por
arquivo e nova tentativa **só do que falhou** são propriedades do contrato, não
lógica nova de servidor.

Por quê um endpoint plural e não deixar o cliente iterar o singular: (a) a **reserva
de cota** precisa enxergar o lote inteiro de uma vez (D2) — N chamadas
independentes ao singular veem o mesmo `storage_used_bytes` e furam a cota; (b) a
**garantia de árvore de pastas** (D3) deve ser atômica e idempotente por lote, não
N criações concorrentes disputando o mesmo caminho.

Validação/erro por item nunca aborta o lote: um item malformado (sem `fileName`,
`declaredSizeBytes` inválido, `relativePath` fora da unidade) vira
`{ ok: false, error }` na sua posição; os demais seguem. O lote só falha inteiro em
erro de pré-condição global (ex.: `destinationFolderId` de outra unidade → 403,
espelhando D3).

### D2 — Reserva de cota consciente do lote + pendentes

O pré-check do lote calcula, numa única transação tenant:

```
reservado = SUM(size_bytes) das linhas `pending`/`replacing` do usuário
base      = users.storage_used_bytes           (volume finalizado)
disponivel = 10 GB − base − reservado
```

Então percorre os itens **em ordem**, debitando `declaredSizeBytes` de `disponivel`;
o item que couber recebe URL e tem sua linha `pending` inserida (passando a contar
como reserva para os itens seguintes do mesmo lote); o que não couber vira
`{ ok:false, error:"quota exceeded" }` **sem inserir linha**.

Por quê somar os `pending` e não só `storage_used_bytes` (como o singular faz hoje):
o singular tem uma folga conhecida — como a cota só é debitada no finalize, envios
paralelos podem sobre-provisionar, e a rede de segurança é o `over_quota` no
finalize. Num lote isso deixa de ser aceitável (o usuário estouraria os 10 GB numa
tacada), então apertamos aqui. A rede de segurança do finalize permanece para o caso
de corrida entre requisições. **Não** alteramos o singular nesta mudança (para não
mexer em requisito já publicado do Épico 2); a diferença é assumida e documentada.

Consistência sob concorrência: o `SELECT SUM(...)` das linhas pendentes roda na
mesma transação da inserção; duas requisições simultâneas do mesmo usuário podem,
no pior caso, sobre-reservar até a folga de uma delas — o finalize (`over_quota`)
continua sendo o corte final. Aceito e documentado (mesma classe do gap já existente
no singular), sem introduzir lock pessimista por usuário nesta fatia.

### D3 — Garantia idempotente da árvore a partir de `relativePath`

Helper `ensureFolderPath(client, ctx, anchorId, relativePath)`:

- Normaliza `relativePath` em segmentos (`"Relatorios/2024"` → `["Relatorios",
  "2024"]`), rejeitando segmentos vazios, `.`/`..` e caracteres de path traversal —
  um caminho inválido torna o **item** `{ ok:false, error:"invalid path" }`, sem
  afetar os demais.
- Caminha nível a nível a partir de `anchorId` (a `destinationFolderId`, validada
  como da mesma unidade e do dono; ou `null` = raiz): para cada segmento, tenta ler
  a pasta filha de mesmo nome sob o pai corrente; se não existir, cria (`unit_id =
  ctx.unitId`, `owner_id = ctx.userId`, `parent_id = pai corrente`). Devolve o `id`
  da pasta-folha, ao qual o arquivo é vinculado.
- Reaproveita a lógica de criação já existente em `POST /folders` (extraída para um
  helper compartilhado), preservando a checagem de dono na âncora.

Idempotência real vem do índice único (D4): se duas iterações do mesmo lote (ou dois
lotes concorrentes) tentarem criar o mesmo nível, o `INSERT ... ON CONFLICT
(unit_id, parent_id, lower(name)) DO NOTHING` seguido de `SELECT` devolve a pasta
existente em vez de duplicar. Sem o índice, "garantir caminho" seria uma corrida.

Por quê caminhar nível a nível e não materialized path/`ltree`: a profundidade é a
de navegação humana e o Épico 2 já modelou `parent_id` auto-referente; recriar uma
árvore de poucos níveis por lote é barato e reusa o modelo existente sem introduzir
extensão de banco. O download recursivo (US 3.3), que seria o caso a favor de
`ltree`, está adiado.

### D4 — Unicidade de nome por pai (migração `0006`)

```sql
-- 0006_folder_name_unique_per_parent.sql (aditiva, não edita 0004)
CREATE UNIQUE INDEX folders_unit_parent_name_uidx
  ON folders (unit_id, parent_id, lower(name));
```

Índice **único** case-insensitive que trata a raiz corretamente: como `parent_id`
é `NULL` na raiz e `NULL` distingue linhas num índice único do Postgres, duas pastas
raiz `Relatorios` **ainda colidiriam** apenas se `parent_id` fosse igual — e dois
`NULL` não são iguais. Para a raiz, o `ON CONFLICT` do `ensureFolderPath` usa o
predicado com `parent_id IS NOT DISTINCT FROM $parent` na etapa de leitura antes do
insert, garantindo o reaproveitamento também na raiz; o índice cobre os níveis
internos (o caso dominante do envio de pasta).

Pré-condição de dados: o Épico 2 não impôs unicidade, então a migração pode
encontrar duplicatas pré-existentes. Como o produto ainda não foi para produção e o
seed de dev não cria pastas homônimas, a criação do índice é segura; ainda assim a
migração **verifica** e falha explicitamente se houver colisão (em vez de quebrar
silenciosamente), documentando a necessidade de deduplicar antes — não há dado real
a preservar neste momento.

Por quê `lower(name)` (case-insensitive): "Relatorios" e "relatorios" no mesmo pai
seriam confusão para o usuário e quebrariam a idempotência do reenvio de pasta
(sistemas de arquivo de origem variam no casing). Alinha com a expectativa de "a
estrutura original é recriada de forma idêntica".

### D5 — Independência por item e nova tentativa isolada

Não há estado de "lote" persistido: cada item vira (ou não) uma linha `files`
`pending` independente, exatamente como no singular. A "nova tentativa apenas do
item que falhou" (US 3.1 cenário 2) é simplesmente **reenviar aquele item** — como
um lote de tamanho 1 ou pelo singular. Itens que já concluíram estão `active` e não
são tocados. Isso mantém o backend sem máquina de estado de lote, delegando o
acompanhamento de progresso ao cliente (que já tem uma URL por arquivo).

### D6 — US 3.3 (download ZIP) deliberadamente adiada

O cenário 2 da US 3.3 exige que o ZIP contenha "apenas os itens para os quais tenho
permissão de baixar". A permissão de download **por item** é o motor do Épico 4
(`grants`), que não existe: hoje o acesso é só unidade + posse. Implementar o filtro
agora significaria (a) filtrar por um critério degradado (posse), que não é o que a
US pede, e (b) reescrever esse filtro quando o Épico 4 chegar. Além disso, gerar/
transmitir um ZIP de pasta grande a partir do GCS levanta uma decisão de execução
(stream na request do Cloud Run vs. Job assíncrono) que é melhor tomada junto do
modelo de permissão. Por isso a US 3.3 fica registrada como fatia futura, dependente
do Épico 4 — decisão coerente com o fatiamento "depender de permissão fica para o
Épico 4" já usado nos Épicos 2 e nesta proposta.

## Risks / Trade-offs

- **Sobre-reserva de cota sob corrida entre requisições do mesmo usuário (D2)** →
  aceito e documentado: mesma classe do gap já existente no singular; o corte final
  é o `over_quota` do finalize. Sem lock pessimista por usuário nesta fatia.
- **Divergência entre singular e plural na conferência de cota (D2)** → intencional:
  o plural aperta (soma pendentes) para não estourar num lote; o singular não é
  alterado para não mexer em requisito publicado do Épico 2. Documentado como
  diferença conhecida; unificar é candidato ao Épico 8 (cotas/painel).
- **Migração `0006` pode encontrar duplicatas pré-existentes (D4)** → mitigação: a
  migração falha explícita e cedo se houver colisão; não há dado de produção a
  preservar (produto nunca foi a prod). Rollback é redeploy da imagem anterior +
  `DROP INDEX` (aditivo).
- **`relativePath` como vetor de path traversal (D3)** → mitigação: normalização
  rejeita `.`/`..`/segmentos vazios/separadores estranhos antes de qualquer
  operação; o caminho nunca vira caminho físico no bucket (o `object_path` continua
  vindo de `buildObjectPath` com uuid), só define a árvore lógica de `folders`.
- **US 3.3 ausente do Épico 3 (D6)** → assumido: o Épico 3 sai parcial; a fatia de
  ingestão entrega valor imediato e a de download nasce correta depois do Épico 4.

## Migration Plan

1. Migração `0006_folder_name_unique_per_parent.sql`: índice único
   `(unit_id, parent_id, lower(name))` em `folders`, com verificação prévia de
   duplicatas. Rodar `npm run migrate`. Não edita migração aplicada.
2. Contratos em `packages/shared` (DTOs de envio em lote: item de entrada com
   `relativePath` opcional; item de saída com URL/objeto/pasta ou erro) e
   `npm run build --workspace packages/shared`.
3. `routes/files.ts`: `POST /files/upload-urls` (lote) — pré-check de cota somando
   lote + pendentes (D2), `ensureFolderPath` por item (D3), inserção `pending` e
   assinatura por item, montando `results[]` na ordem da entrada.
4. Extrair de `routes/folders.ts` o helper compartilhado de criação/garantia de
   pasta (reuso da checagem de dono/unidade) consumido por `ensureFolderPath`.
5. `routes/storage-events.ts`: **sem mudança** — já reconcilia por objeto; cada item
   do lote é uma linha `pending` como qualquer upload.
6. Testes: falha parcial de lote (um item recusado, demais concluem); cota de lote
   que estoura no conjunto (itens que cabem vs. que excedem); recriação idempotente
   de subpastas (reenvio não duplica; pasta existente reaproveitada); ancoragem na
   pasta de destino; RLS (destino/relativePath de outra unidade recusado); rejeição
   de path traversal no `relativePath`.

**Rollback:** a migração `0006` é aditiva (índice novo); reverter é redeploy da
imagem anterior + `DROP INDEX`. Nenhum dado é destruído.

## Open Questions

- Tamanho máximo do lote (nº de itens por requisição) — proposta: limite de sanidade
  configurável, sem bloquear o design; decidir na implementação.
- Comprimento/caracteres válidos de segmento de `relativePath` além do path
  traversal — detalhe de validação, sem impacto em spec.
- Ordenação de `results[]` — fixada como a ordem de entrada (D1), para o cliente
  correlacionar com sua própria lista sem depender de `fileName` único.
