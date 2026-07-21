/**
 * Dispara o download de uma URL assinada por navegação simples numa âncora
 * (design.md D4) — o GCS não expõe CORS para `fetch`+blob, e a disposição
 * `attachment` da URL já faz o browser baixar sem sair da SPA nem abrir aba.
 */
export function triggerDownload(url: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
