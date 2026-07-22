## MODIFIED Requirements

### Requirement: Política de cache por classe de artefato

O serving da SPA SHALL diferenciar cache por classe de artefato: assets com
hash de conteúdo no nome (`/assets/*`) SHALL sair com `Cache-Control` imutável
de longa duração, e o `index.html` SHALL sair sem cache, para que cada deploy
propague imediatamente. A detecção da classe do artefato (se o caminho está sob
`/assets/`) SHALL ser independente do separador de caminho do sistema
operacional, de modo que o header imutável seja emitido de forma idêntica em
Windows (`\`) e em ambientes POSIX (`/`).

#### Scenario: Asset com hash é imutável

- **WHEN** um navegador requisita um asset sob `/assets/`
- **THEN** a resposta inclui `Cache-Control` com `max-age` de longa duração e
  `immutable`.

#### Scenario: Asset com hash é imutável independente do SO

- **WHEN** a API roda em um sistema cujo separador de caminho é `\` (Windows) e
  um navegador requisita um asset sob `/assets/`
- **THEN** a resposta inclui o mesmo `Cache-Control` imutável de longa duração
  emitido em ambientes POSIX, sem cair no default de cache do servidor de
  estáticos (`max-age=0`).

#### Scenario: index.html nunca é cacheado

- **WHEN** um navegador requisita `/` ou qualquer caminho que resulta no
  fallback de `index.html`
- **THEN** a resposta inclui `Cache-Control: no-store`.
