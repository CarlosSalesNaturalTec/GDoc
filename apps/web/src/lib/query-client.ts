import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api-client';

/**
 * 401 é tratado centralmente pelo `apiClient`/`SessionProvider` (design.md
 * D4) — nunca retentar automaticamente uma chamada que já sabemos exigir
 * novo login.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status === 401) return false;
        return failureCount < 2;
      },
    },
  },
});
