import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { UserRole } from '@gdoc/shared';
import { LoginPage } from '../auth/LoginPage';
import { RequireAuth } from '../auth/RequireAuth';
import { AppShell } from '../shell/AppShell';
import { ExplorerPage } from '../navegacao/ExplorerPage';
import { BuscaPage } from '../busca/BuscaPage';
import { LixeiraPage } from '../lixeira/LixeiraPage';
import { PessoasPage } from '../pessoas/PessoasPage';
import { UnidadesPage } from '../unidades/UnidadesPage';
import { PainelPage } from '../painel/PainelPage';
import { HomePage } from './HomePage';

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
          { path: '/pastas', element: <ExplorerPage /> },
          { path: '/pastas/:folderId', element: <ExplorerPage /> },
          { path: '/busca', element: <BuscaPage /> },
          { path: '/lixeira', element: <LixeiraPage /> },
          {
            element: <RequireAuth roles={[UserRole.UNIT_ADMIN, UserRole.GLOBAL_ADMIN]} />,
            children: [
              { path: '/admin/pessoas', element: <PessoasPage /> },
              { path: '/admin/painel', element: <PainelPage /> },
            ],
          },
          {
            // Gestão de unidades é exclusiva do global_admin (design.md D1).
            element: <RequireAuth roles={[UserRole.GLOBAL_ADMIN]} />,
            children: [{ path: '/admin/unidades', element: <UnidadesPage /> }],
          },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
