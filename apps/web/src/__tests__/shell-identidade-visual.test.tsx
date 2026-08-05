import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { UserRole } from '@gdoc/shared';
import { mockFetch } from './mock-fetch';
import { renderApp } from './render-app';

describe('Identidade visual no shell (identidade-visual)', () => {
  it('identificação do cliente aparece no estado expandido e some no colapsado, mantendo a marca abreviada', async () => {
    mockFetch({
      'GET /auth/me': {
        status: 200,
        body: { id: 'user-1', unitId: 'unit-1', role: UserRole.COLLABORATOR },
      },
      'GET /auth/public-config': { status: 200, body: { appName: 'Doc7', clientName: 'SETES' } },
    });
    renderApp(['/']);

    await screen.findByText('Doc7');
    expect(screen.getByText('SETES')).toBeInTheDocument();

    const trigger = document.querySelector('.ant-layout-sider-trigger') as HTMLElement;
    await userEvent.click(trigger);

    await screen.findByText('D7');
    expect(screen.queryByText('SETES')).not.toBeInTheDocument();
  });
});
