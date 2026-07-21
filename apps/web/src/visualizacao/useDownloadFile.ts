import { App } from 'antd';
import { ApiError } from '../lib/api-client';
import { triggerDownload } from './download';
import { useDownloadUrl } from './queries';

/**
 * Fluxo de download compartilhado (design.md D4/D6): emite a URL assinada,
 * dispara a navegação numa âncora e trata o 403 como aviso — usado pela ação
 * "Baixar" do explorador e pelo ramo `previewAvailable: false` do modal.
 */
export function useDownloadFile() {
  const { message } = App.useApp();
  const downloadUrl = useDownloadUrl();

  async function download(fileId: string) {
    try {
      const result = await downloadUrl.mutateAsync(fileId);
      triggerDownload(result.url);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        message.error('Permissão insuficiente para baixar este arquivo.');
        return;
      }
      message.error('Não foi possível baixar o arquivo. Tente novamente.');
    }
  }

  return { download, isPending: downloadUrl.isPending };
}
