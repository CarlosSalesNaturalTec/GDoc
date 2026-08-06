import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { GrantResourceType, NotificationKind, Permission, UserRole } from '@gdoc/shared';
import type { NotificationResponse } from '@gdoc/shared';
import { mockFetch } from './mock-fetch';
import { renderApp } from './render-app';

const COLLABORATOR = { id: 'user-1', unitId: 'unit-1', role: UserRole.COLLABORATOR };

function notification(overrides: Partial<NotificationResponse> & { id: string }): NotificationResponse {
  return {
    kind: NotificationKind.GRANT_EXPIRING,
    payload: {
      resourceType: GrantResourceType.FILE,
      resourceId: 'file-1',
      permissions: [Permission.VIEW],
      expiresAt: '2099-01-01T00:00:00.000Z',
    },
    createdAt: '2026-07-10T10:00:00.000Z',
    readAt: null,
    ...overrides,
  };
}

/**
 * Change `expiracao-permissoes`, tasks.md 8.3/10.3 — central de notificações
 * do shell: contagem de não lidas visível e marcação de lida.
 */
describe('Central de notificações do shell (change expiracao-permissoes)', () => {
  it('10.3: contagem de não lidas aparece no shell e reflete a caixa da pessoa', async () => {
    mockFetch({
      'GET /auth/me': { status: 200, body: COLLABORATOR },
      'GET /folders/root/contents': { status: 200, body: { folder: null, breadcrumb: [], folders: [], files: [] } },
      'GET /notifications/unread-count': { status: 200, body: { count: 2 } },
      'GET /notifications': {
        status: 200,
        body: { notifications: [notification({ id: 'notif-1' }), notification({ id: 'notif-2' })] },
      },
    });

    renderApp(['/pastas']);

    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument());
  });

  it('10.3: abrir a central lista as notificações e marcar como lida chama POST /notifications/:id/read', async () => {
    mockFetch({
      'GET /auth/me': { status: 200, body: COLLABORATOR },
      'GET /folders/root/contents': { status: 200, body: { folder: null, breadcrumb: [], folders: [], files: [] } },
      'GET /notifications/unread-count': [{ status: 200, body: { count: 1 } }, { status: 200, body: { count: 0 } }],
      'GET /notifications': [
        { status: 200, body: { notifications: [notification({ id: 'notif-1' })] } },
        { status: 200, body: { notifications: [notification({ id: 'notif-1', readAt: '2026-07-11T00:00:00.000Z' })] } },
      ],
      'POST /notifications/notif-1/read': { status: 204 },
    });

    renderApp(['/pastas']);
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());

    const bell = document.querySelector('.anticon-bell')!.closest('button') as HTMLElement;
    await userEvent.click(bell);

    await screen.findByText('Marcar como lida');
    await userEvent.click(screen.getByText('Marcar como lida'));

    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof import('vitest').vi.fn>).mock.calls;
      expect(calls.some((call: unknown[]) => String(call[0]).includes('/notifications/notif-1/read'))).toBe(true);
    });
  });
});
