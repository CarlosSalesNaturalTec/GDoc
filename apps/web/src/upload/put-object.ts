export interface PutObjectCallbacks {
  onProgress?: (percent: number) => void;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

/**
 * PUT por `XMLHttpRequest` a uma URL assinada de GCS (design.md D2) — fora do
 * `apiClient`: cross-origin (sem cookie de sessão), `Content-Type` do próprio
 * arquivo, corpo cru. `fetch` não expõe progresso de upload; só
 * `xhr.upload.onprogress` o faz, exigido pelo `onProgress` do `Upload` do AntD.
 */
export function putObject(url: string, file: File, callbacks: PutObjectCallbacks = {}): void {
  const xhr = new XMLHttpRequest();
  xhr.open('PUT', url, true);
  xhr.setRequestHeader('Content-Type', file.type);

  xhr.upload.onprogress = (event) => {
    if (!event.lengthComputable) return;
    callbacks.onProgress?.(Math.round((event.loaded / event.total) * 100));
  };

  xhr.onload = () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      callbacks.onSuccess?.();
    } else {
      callbacks.onError?.(new Error(`upload failed with status ${xhr.status}`));
    }
  };

  xhr.onerror = () => {
    callbacks.onError?.(new Error('upload failed'));
  };

  xhr.send(file);
}
