import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { UserRole } from '@gdoc/shared';
import { LoginPage } from '../auth/LoginPage';
import { RequireAuth } from '../auth/RequireAuth';
import { AppShell } from '../shell/AppShell';
import { HomePage } from './HomePage';
import { PlaceholderPage } from './PlaceholderPage';

/**
 * Guarda por papel aninhada (design.md D6): as próximas fatias só declaram a
 * rota e o papel exigido. Exportado separado do router de produção para que
 * os testes montem um `createMemoryRouter(routes, ...)` isolado, sem tocar o
 * histórico real do browser.
 */
export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <HomePage /> },
          {
            element: <RequireAuth roles={[UserRole.UNIT_ADMIN, UserRole.GLOBAL_ADMIN]} />,
            children: [
              { path: '/admin/pessoas', element: <PlaceholderPage title="Gestão de pessoas" /> },
              { path: '/admin/painel', element: <PlaceholderPage title="Painel gerencial" /> },
            ],
          },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
