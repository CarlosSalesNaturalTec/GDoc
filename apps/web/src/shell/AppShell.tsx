import { useMemo, useState } from 'react';
import { Avatar, Button, Layout, Menu, Space, Typography } from 'antd';
import {
  DashboardOutlined,
  FolderOutlined,
  HomeOutlined,
  LogoutOutlined,
  SearchOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { UserRole } from '@gdoc/shared';
import { useSession } from '../auth/session-context';

const { Header, Sider, Content } = Layout;

const ROLE_LABEL: Record<UserRole, string> = {
  [UserRole.COLLABORATOR]: 'Colaborador',
  [UserRole.UNIT_ADMIN]: 'Administrador da unidade',
  [UserRole.GLOBAL_ADMIN]: 'Administrador global',
};

/** Shell de layout (design.md D6): itens de administração só aparecem para `unit_admin`/`global_admin`. */
export function AppShell() {
  const { identity, logout } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const isAdmin =
    identity?.role === UserRole.UNIT_ADMIN || identity?.role === UserRole.GLOBAL_ADMIN;

  // Prefixo (design.md D1, `web-navegacao`): qualquer rota sob `/pastas`
  // mantém "Arquivos" selecionado no menu, não só a raiz do explorador.
  const selectedKey = location.pathname.startsWith('/pastas') ? '/pastas' : location.pathname;

  const items = useMemo(
    () => [
      { key: '/', icon: <HomeOutlined />, label: <Link to="/">Início</Link> },
      { key: '/pastas', icon: <FolderOutlined />, label: <Link to="/pastas">Arquivos</Link> },
      { key: '/busca', icon: <SearchOutlined />, label: <Link to="/busca">Buscar</Link> },
      ...(isAdmin
        ? [
            {
              key: '/admin/pessoas',
              icon: <TeamOutlined />,
              label: <Link to="/admin/pessoas">Pessoas</Link>,
            },
            {
              key: '/admin/painel',
              icon: <DashboardOutlined />,
              label: <Link to="/admin/painel">Painel</Link>,
            },
          ]
        : []),
    ],
    [isAdmin],
  );

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  if (!identity) return null;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed}>
        <div style={{ height: 48, margin: 16, color: '#fff', fontWeight: 600, fontSize: 18 }}>
          {collapsed ? 'GD' : 'GDoc'}
        </div>
        <Menu theme="dark" mode="inline" selectedKeys={[selectedKey]} items={items} />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 12,
            padding: '0 24px',
          }}
        >
          <Space>
            <Avatar>{identity.id.slice(0, 2).toUpperCase()}</Avatar>
            <Typography.Text>{ROLE_LABEL[identity.role]}</Typography.Text>
          </Space>
          <Button icon={<LogoutOutlined />} onClick={handleLogout}>
            Sair
          </Button>
        </Header>
        <Content style={{ margin: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
