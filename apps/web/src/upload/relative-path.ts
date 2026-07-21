/**
 * Deriva `relativePath` de `webkitRelativePath` (design.md D5): o trecho de
 * diretório sem o nome do arquivo, preservando a pasta-raiz selecionada —
 * `"Pasta/Sub/arquivo.txt"` vira `"Pasta/Sub"`. Arquivo sem
 * `webkitRelativePath` (envio plano) não tem `relativePath`; a normalização
 * de segmentos é responsabilidade do servidor (`normalizeRelativePath`).
 */
export function deriveRelativePath(file: File): string | undefined {
  const path = file.webkitRelativePath;
  if (!path) return undefined;
  const lastSlash = path.lastIndexOf('/');
  if (lastSlash <= 0) return undefined;
  return path.slice(0, lastSlash);
}
