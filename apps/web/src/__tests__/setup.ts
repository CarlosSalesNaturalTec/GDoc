import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// CI é mais lento que o dev local, especialmente no primeiro teste do arquivo
// (cold start de módulos/JIT) — o timeout padrão de 1000ms do
// findBy/waitFor causava falha intermitente sem indicar bug real.
configure({ asyncUtilTimeout: 5000 });

// jsdom não implementa matchMedia — o Sider/useBreakpoint do Ant Design o exige.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

afterEach(() => {
  cleanup();
  // `mockFetch` usa `vi.stubGlobal('fetch', ...)`, que não se desfaz sozinho
  // entre arquivos de teste — sem isto, o mock de um arquivo vaza para o
  // próximo e quebra suas chamadas de fetch.
  vi.unstubAllGlobals();
});
