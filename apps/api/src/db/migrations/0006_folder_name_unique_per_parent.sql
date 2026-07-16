-- Épico 3 (US 3.2): unicidade de nome de pasta por pai, para permitir
-- "garantir caminho" idempotente no envio de pasta (ensureFolderPath,
-- design.md D3/D4) sem depender de lock aplicacional. Arquivo novo — 0004
-- aplicada não é editada.

-- O Épico 2 não impôs unicidade, então esta migração pode encontrar
-- duplicatas pré-existentes. Como o produto nunca foi a produção e o seed
-- de dev não cria pastas homônimas, falha explícita aqui é preferível a
-- quebrar silenciosamente ou descartar dado sem aviso (design.md D4).
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT 1
    FROM folders
    GROUP BY unit_id, parent_id, lower(name)
    HAVING count(*) > 1
  ) dups;

  IF dup_count > 0 THEN
    RAISE EXCEPTION
      'folders: % grupo(s) duplicado(s) de (unit_id, parent_id, lower(name)) encontrado(s) — deduplicar antes de aplicar 0006',
      dup_count;
  END IF;
END $$;

-- Case-insensitive: "Relatorios" e "relatorios" no mesmo pai seriam
-- confusão para o usuário e quebrariam a idempotência do reenvio de pasta.
-- NULL != NULL em índice único do Postgres, então este índice não cobre a
-- raiz (parent_id IS NULL) — ensureFolderPath trata a raiz com uma leitura
-- explícita (`parent_id IS NOT DISTINCT FROM $parent`) antes do insert.
CREATE UNIQUE INDEX folders_unit_parent_name_uidx
  ON folders (unit_id, parent_id, lower(name));
