import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { UserRole } from '@gdoc/shared';
import { SessionProvider, useSession } from '../auth/session-context';
import { apiClient, ApiError } from '../lib/api-client';
import { mockFetch } from './mock-fetch';

/** Harness mínimo: expõe o estado de `useSession` e dispara uma chamada autenticada arbitrária. */
function Harness() {
  const { status, identity } = useSession();

  async function triggerAuthenticatedCall() {
    try {
      await apiClient.get('/dashboard');
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
    }
  }

  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="identity">{identity?.id ?? ''}</span>
      <button onClick={triggerAuthenticatedCall}>disparar chamada autenticada</button>
    </div>
  );
}

describe('Tratamento central de 401 (design.md D4)', () => {
  it('401 em qualquer chamada autenticada encerra a sessão no cliente', async () => {
    mockFetch({
      'GET /auth/me': {
        status: 200,
        body: { id: 'user-1', unitId: 'unit-1', role: UserRole.COLLABORATOR },
      },
      'GET /dashboard': { status: 401, body: { error: 'not authenticated' } },
    });

    render(
      <SessionProvider>
        <Harness />
      </SessionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('identity')).toHaveTextContent('user-1');

    await userEvent.click(screen.getByRole('button', { name: 'disparar chamada autenticada' }));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'));
    expect(screen.getByTestId('identity')).toHaveTextContent('');
  });
});
