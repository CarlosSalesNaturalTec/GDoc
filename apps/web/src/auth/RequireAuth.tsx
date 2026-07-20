import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import type { UserRole } from '@gdoc/shared';
import { useSession } from './session-context';

interface RequireAuthProps {
  /** Ausente = qualquer papel autenticado; presente = restrito a estes papéis (áreas de administração). */
  roles?: readonly UserRole[];
}

/**
 * Guarda de rota (design.md D6): sem identidade resolvida ⇒ `/login`; fora do
 * papel exigido ⇒ não renderiza a rota protegida. `status === 'loading'`
 * evita um flash para `/login` enquanto o bootstrap de `GET /auth/me` ainda
 * está em curso.
 */
export function RequireAuth({ roles }: RequireAuthProps) {
  const { status, identity } = useSession();
  const location = useLocation();

  if (status === 'loading') {
    return <Spin fullscreen />;
  }

  if (status === 'anonymous' || !identity) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (roles && !roles.includes(identity.role)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
