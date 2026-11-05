# Tasks

## 1. Banco e contrato

- [ ] 1.1 Migração `0023_reading_oversight.sql`: `reading_oversight` com `CHECK`
  de valores, `reading_oversight_set_by`/`_set_at`, `CHECK` de setor (D1, D2,
  D5).
- [ ] 1.2 `ReadingOversight` e o campo em `PersonResponse`,
  `CreatePersonRequest`, `UpdatePersonRequest` e `AuthenticatedIdentity`.

## 2. API

- [ ] 2.1 `POST /users` e `PATCH /users/:id`: validar valor, `all_units` só por
  `global_admin` (D3), trava de auto-edição (D4), registrar quem e quando (D5),
  traduzir o `CHECK` de setor em 409 (D2).
- [ ] 2.2 Identidade: `readingOversight` na releitura, no login e em
  `/auth/me` (D6).
- [ ] 2.3 Testes: cada cenário de `gestao-pessoas`, inclusive "não concede
  acesso" por `hasAccess` e retirada valendo na requisição seguinte (D7).

## 3. Web

- [ ] 3.1 Rótulos de origem única (D8); campo no `PessoaFormModal` com a opção
  de todas as unidades só para `global_admin`; mensagem da recusa por setor.
- [ ] 3.2 Coluna na listagem.
- [ ] 3.3 Testes dos cenários de `web-pessoas`.

## 4. Documentação e fechamento

- [ ] 4.1 Manual `administrador/pessoas.md`.
- [ ] 4.2 PRD: Épico 12 com a US 12.1.
- [ ] 4.3 Plano: C0 entregue.
- [ ] 4.4 `lint`, `build`, `test`, `format:check`; conferir no navegador.
