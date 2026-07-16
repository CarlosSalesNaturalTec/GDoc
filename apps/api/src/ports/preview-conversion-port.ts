/**
 * Ponto de extensão RESERVADO para conversão de preview de Office
 * (LibreOffice headless em Cloud Run Job) — ver design.md, Decisão de
 * arquitetura "Preview de Office". Não implementado nesta mudança;
 * PDF/imagem/vídeo/áudio não precisam de conversão (preview nativo do
 * browser). Uma mudança futura fornece a implementação e liga este seam
 * aos endpoints de view-url para os tipos Office (doc/xls/ppt).
 */
export interface PreviewConversionPort {
  /** Converte o arquivo Office no `sourceObjectPath` para PDF, retornando o objectPath do resultado. */
  convertToPreviewPdf(sourceObjectPath: string): Promise<{ previewObjectPath: string }>;
}
