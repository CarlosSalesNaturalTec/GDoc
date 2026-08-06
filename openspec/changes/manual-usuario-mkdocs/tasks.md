# Tasks — manual-usuario-mkdocs

> Ordem sugerida: revisar o **conteúdo** (seção 1) antes de fatiá-lo (seção 2).
> Fatiar primeiro obriga a aplicar as mesmas correções espalhadas por várias
> páginas, multiplicando a chance de esquecer uma.
>
> A ativação do GitHub Pages (3.4) é **pré-requisito do merge**, não da
> implementação: sem ela o job de publicação falha no primeiro run em `main`.

## 1. Revisão de conteúdo (sobre o texto atual, ainda monolítico)

- [ ] 1.1 **Substituição de arquivo** (achado A, design.md D8): remover da seção
  5.6 a afirmação de que **Renomear** serve para "enviar uma nova versão no lugar
  do arquivo atual". A `RenameFileModal` tem um único campo (`Nome`) e chama
  `PATCH /files/:id`. Deixar apenas a alteração de nome.
- [ ] 1.2 Remover do FAQ a entrada "Substituí um arquivo e preciso da versão
  antiga" — ela pressupõe um recurso que a tela não oferece. **Não** substituir
  por uma promessa futura.
- [ ] 1.3 **Concessão de permissão pelo colaborador** (achado B): acrescentar ao
  guia do colaborador que ele **não** concede permissão sobre o próprio arquivo —
  `routes/grants.ts:37` restringe a `unit_admin`/`global_admin` e o botão
  **Permissões** só é renderizado para admin. Acrescentar entrada de FAQ
  correspondente ("Como compartilho um arquivo que enviei?").
- [ ] 1.4 **Rótulos de download de pasta** (achado C): distinguir **Baixar esta
  pasta** (barra superior; pasta atual, inclusive a raiz) de **Baixar pasta**
  (linha de cada subpasta). Corrigir também a tabela de tarefas rápidas.
- [ ] 1.5 Documentar **Excluir esta pasta** (barra superior), hoje ausente — o
  manual só descreve excluir pela linha do item.
- [ ] 1.6 **Aviso prévio de expiração** (achado D): trocar "conforme o vencimento
  se aproxima" pelo valor concreto — **7 dias** de antecedência
  (`grantExpiringNoticeWindowDays`), com a ressalva de ser configurável.
- [ ] 1.7 **Limites configuráveis** (achado E): revisar cota (10 GB), retenção
  (30 dias) e tetos do zip (100 arquivos / 50 MB) para que deixem de ser
  afirmados como lei do produto. O detalhamento vai para `referencia/limites.md`
  (2.4).
- [ ] 1.8 **Endereço de produção** (achado F): apresentar a URL como endereço
  **desta implantação**, não como endereço do produto.
- [ ] 1.9 Conferência final contra a tela: menu lateral e visibilidade por papel,
  painel (4 cartões + 3 gráficos), lixeira (`Data de exclusão` / `Dias
  restantes`), busca (acionamento explícito, ≥1 critério, filtro `Autor` só para
  admin), preview (PDF/imagem/vídeo/áudio/texto sim, Office não), reset de senha
  e matriz de alcance, unidades, ausência de renomear/mover pasta. Todos
  verificados como corretos na exploração — reconferir apenas o que a revisão
  tocar.

## 2. Estrutura MkDocs (`docs/manual/`)

- [ ] 2.1 `docs/manual/mkdocs.yml`: `site_name`, `docs_dir: docs`,
  `theme: material` com `language: pt-BR`, `strict: true` (design.md D6) e
  `site_url` do GitHub Pages do repositório. **Não** colocar na raiz — D2.
- [ ] 2.2 `docs/manual/requirements.txt` com `mkdocs` e `mkdocs-material` em
  **versões fixadas** (design.md D4), para que o site seja reproduzível a partir
  do commit.
- [ ] 2.3 Fatiar o conteúdo revisado nas ~18 páginas de `docs/manual/docs/`,
  conforme a árvore de design.md ("Estrutura resultante"), e declarar a `nav`
  explicitamente no `mkdocs.yml` (design.md D3).
- [ ] 2.4 Escrever `referencia/limites.md` (novo): cota, retenção da lixeira,
  tetos do download compactado e antecedência do aviso, todos marcados como
  **padrões da implantação** (design.md D9).
- [ ] 2.5 Converter os avisos que hoje são citações `>` em admonitions do Material
  (`!!! note`, `!!! warning`) — em especial os quatro blocos de permissões
  (expirar ≠ revogar, reconceder atualiza prazo, avisos automáticos, sem herança).
- [ ] 2.6 Revisar os links internos criados pelo fatiamento: as referências
  cruzadas hoje são numéricas ("seção 5.10") e precisam virar links de página.
- [ ] 2.7 Build local: `pip install -r docs/manual/requirements.txt` e
  `mkdocs build -f docs/manual/mkdocs.yml --strict`. Zero aviso.

## 3. Publicação (GitHub Pages)

- [ ] 3.1 `.github/workflows/docs.yml`: job de **build** (checkout, setup-python,
  instalar `requirements.txt`, `mkdocs build --strict`, `upload-pages-artifact`) e
  job de **deploy** (`deploy-pages`), este último apenas em push na `main`.
- [ ] 3.2 Gatilhos (design.md D7): `push` em `main` com
  `paths: ['docs/manual/**', '.github/workflows/docs.yml']` e `pull_request` nos
  mesmos caminhos. O job de deploy **não** roda em pull request (D6).
- [ ] 3.3 Permissões mínimas (`contents: read`, `pages: write`,
  `id-token: write`) e `concurrency: { group: pages, cancel-in-progress: false }`
  (design.md D5).
- [ ] 3.4 **Passo manual, uma vez:** habilitar GitHub Pages em Settings → Pages
  com origem **GitHub Actions** (hoje `has_pages: false`). Sem isso o
  `deploy-pages` falha. Fazer **antes** do merge.
- [ ] 3.5 Conferir que `mkdocs gh-deploy` **não** é usado e que nenhuma branch
  `gh-pages` é criada (design.md D5).

## 4. Remoção do monólito e ajustes de repositório

- [ ] 4.1 Remover `docs/manual_do_usuario.md` (design.md D1). **Sem** stub — não
  há referência viva ao caminho.
- [ ] 4.2 **Não tocar** em `openspec/changes/archive/`, onde estão as 11
  ocorrências restantes do caminho antigo. É histórico imutável.
- [ ] 4.3 `.gitignore`: acrescentar `site/` (saída do build do MkDocs).
- [ ] 4.4 `CLAUDE.md`: registrar que a documentação do usuário mora em
  `docs/manual/` (site MkDocs publicado no Pages), como é organizada e que
  continua sendo atualizada dentro do commit da feature — senão a próxima change
  procura um arquivo que não existe mais.
- [ ] 4.5 `README.md`: como buildar e servir a documentação localmente
  (`mkdocs serve -f docs/manual/mkdocs.yml`) e o endereço do site publicado.

## 5. Verificação

- [ ] 5.1 `npm run lint && npm run build && npm run test` na raiz — deve passar
  inalterado (nenhum código foi tocado).
- [ ] 5.2 `npm run format:check` — confirmar que `docs/manual/**` fica fora do
  escopo do Prettier pelo `.prettierignore` existente (design.md D2), sem precisar
  de nova entrada.
- [ ] 5.3 Abrir o pull request e confirmar que o job de build da documentação roda
  e **não** publica.
- [ ] 5.4 Verificar o gate: introduzir temporariamente um link interno quebrado,
  confirmar que o build falha, e desfazer.
- [ ] 5.5 Após o merge, confirmar a publicação e navegar o site — sumário, busca
  em português e as páginas de todos os perfis.
- [ ] 5.6 Confirmar que o merge seguinte, tocando **apenas** `docs/manual/**`,
  publica a documentação **sem** disparar o deploy da aplicação (allowlist
  docs-only do `deploy.yml` — design.md D7).
