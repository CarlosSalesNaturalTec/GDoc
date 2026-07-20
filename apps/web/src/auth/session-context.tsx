import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthenticatedIdentity, LoginRequest } from '@gdoc/shared';
import { apiClient, ApiError, setUnauthorizedHandler } from '../lib/api-client';
import { authenticatedIdentitySchema } from '../lib/schemas';

type SessionStatus = 'loading' | 'authenticated' | 'anonymous';

interface SessionContextValue {
  status: SessionStatus;
  identity: AuthenticatedIdentity | null;
  /** Lança `ApiError` (401) em credenciais inválidas — a página de login trata a mensagem genérica. */
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * Fonte de verdade do cliente para a sessão (design.md D3): o token é
 * `HttpOnly` — nunca lido pelo JS — então o estado de autenticação é sempre
 * derivado de `GET /auth/me` no bootstrap ou da resposta do login/logout.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [identity, setIdentity] = useState<AuthenticatedIdentity | null>(null);

  useEffect(() => {
    let cancelled = false;

    // design.md D4: 401 de qualquer chamada autenticada encerra a sessão no
    // cliente — o próprio bootstrap (`/auth/me`) sem sessão cai neste caminho.
    setUnauthorizedHandler(() => {
      if (cancelled) return;
      setIdentity(null);
      setStatus('anonymous');
    });

    apiClient
      .get<AuthenticatedIdentity>('/auth/me')
      .then((raw) => {
        if (cancelled) return;
        setIdentity(authenticatedIdentitySchema.parse(raw));
        setStatus('authenticated');
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) return; // já tratado pelo handler acima
        setStatus('anonymous');
      });

    return () => {
      cancelled = true;
      setUnauthorizedHandler(null);
    };
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      identity,
      async login(credentials) {
        const raw = await apiClient.post<AuthenticatedIdentity>('/auth/login', credentials);
        setIdentity(authenticatedIdentitySchema.parse(raw));
        setStatus('authenticated');
      },
      async logout() {
        await apiClient.post('/auth/logout');
        setIdentity(null);
        setStatus('anonymous');
      },
    }),
    [status, identity],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession deve ser usado dentro de <SessionProvider>');
  return ctx;
}
