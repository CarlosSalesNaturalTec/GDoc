import { vi } from 'vitest';

type XhrRouteEntry = { status: number } | { networkError: true };

type XhrRouteTable = Record<string, XhrRouteEntry>;

/**
 * Substitui `global.XMLHttpRequest` por um stub controlado por tabela
 * `url -> desfecho`, para exercitar `upload/put-object.ts` sem tráfego real
 * (`web-upload`, tasks 5.1). Emite um evento de progresso (50%) antes do
 * desfecho, para exercitar `xhr.upload.onprogress`.
 */
export function mockXhr(table: XhrRouteTable): void {
  class FakeXMLHttpRequest {
    upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    status = 0;
    private url = '';

    open(_method: string, url: string): void {
      this.url = url;
    }

    setRequestHeader(): void {}

    send(): void {
      const entry = table[this.url];
      queueMicrotask(() => {
        this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 } as ProgressEvent);
        queueMicrotask(() => {
          if (!entry || 'networkError' in entry) {
            this.onerror?.();
            return;
          }
          this.status = entry.status;
          this.onload?.();
        });
      });
    }
  }

  vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
}
