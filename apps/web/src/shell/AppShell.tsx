import { useMemo, useState } from 'react';
import { Avatar, Button, Drawer, Dropdown, Layout, Menu, Space, Typography } from 'antd';
import type { MenuProps } from 'antd';
import {
  IconeArquivos,
  IconeBuscar,
  IconeColaboradores,
  IconeConta,
  IconeInicio,
  IconeLixeira,
  IconeManual,
  IconeMenu,
  IconePainel,
  IconeSair,
  IconeUnidades,
} from '../app/icons';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { UserRole } from '@gdoc/shared';
import { useSession } from '../auth/session-context';
import { useNarrowMode } from '../app/responsive';
import { DEGRADE_NAVEGACAO, TAMANHO_MINIMO_TEXTO, paleta } from '../app/theme';
import { BrandMark } from './BrandMark';
import { NotificationCenter } from './NotificationCenter';
import { ROLE_LABEL } from './role-label';

const { Header, Sider, Content } = Layout;

/** Chave do acesso auxiliar ao manual — nunca coincide com um `pathname`, então nunca entra em `selectedKeys`. */
const MANUAL_KEY = 'manual-do-usuario';

/** Shell de layout (design.md D6): itens de administração só aparecem para `unit_admin`/`global_admin`. */
export function AppShell() {
  const { identity, logout, publicConfig } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const isNarrow = useNarrowMode();

  const isAdmin =
    identity?.role === UserRole.UNIT_ADMIN || identity?.role === UserRole.GLOBAL_ADMIN;
  const isGlobalAdmin = identity?.role === UserRole.GLOBAL_ADMIN;

  // Prefixo (design.md D1, `web-navegacao`): qualquer rota sob `/pastas`
  // mantém "Arquivos" selecionado no menu, não só a raiz do explorador.
  const selectedKey = location.pathname.startsWith('/pastas') ? '/pastas' : location.pathname;

  // Origem única de itens (design.md D2/D3 desta change — reverte D6/D8 de
  // `acesso-ao-manual-no-shell`): destinos internos filtrados por papel, com
  // o manual como **último** item, consumida tanto pelo `Sider` (≥ lg) quanto
  // pelo painel sobreposto (< lg). Duas listas paralelas divergiriam em
  // silêncio quando um item de administração fosse acrescentado só num dos
  // lados — por isso este é o único lugar que monta a lista.
  const items: MenuProps['items'] = useMemo(() => {
    const destinations: MenuProps['items'] = [
      { key: '/', icon: <IconeInicio />, label: <Link to="/">Início</Link> },
      { key: '/pastas', icon: <IconeArquivos />, label: <Link to="/pastas">Arquivos</Link> },
      { key: '/busca', icon: <IconeBuscar />, label: <Link to="/busca">Buscar</Link> },
      { key: '/lixeira', icon: <IconeLixeira />, label: <Link to="/lixeira">Lixeira</Link> },
      ...(isAdmin
        ? [
            {
              key: '/admin/pessoas',
              icon: <IconeColaboradores />,
              label: <Link to="/admin/pessoas">Colaboradores</Link>,
            },
            {
              key: '/admin/painel',
              icon: <IconePainel />,
              label: <Link to="/admin/painel">Painel</Link>,
            },
          ]
        : []),
      ...(isGlobalAdmin
        ? [
            {
              key: '/admin/unidades',
              icon: <IconeUnidades />,
              label: <Link to="/admin/unidades">Unidades</Link>,
            },
          ]
        : []),
    ];

    // Acesso auxiliar ao manual do usuário, na última posição (design.md D3):
    // não é destino da SPA, então NÃO participa de `selectedKeys` — garantia
    // que migrou do `selectable={false}` do antigo menu separado para o
    // controle de `selectedKeys` abaixo, que nunca coincide com esta chave.
    // Sem a separação visual de antes, o nome acessível do link é agora a
    // **única** portadora da distinção "sai da aplicação"; afrouxá-lo seria
    // regressão de acessibilidade, não detalhe.
    if (publicConfig.manualUrl) {
      destinations.push({
        key: MANUAL_KEY,
        icon: <IconeManual />,
        title: 'Manual do usuário',
        label: (
          <a
            href={publicConfig.manualUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Manual do usuário (abre em nova aba, fora da aplicação)"
          >
            Manual do usuário
          </a>
        ),
      });
    }

    return destinations;
  }, [isAdmin, isGlobalAdmin, publicConfig.manualUrl]);

  // Painel sobreposto (design.md D2): tocar um destino interno navega e
  // fecha o painel; tocar o manual abre outra aba e não fecha — não há
  // navegação interna a refletir.
  function handleNavClick(info: { key: string }) {
    if (info.key !== MANUAL_KEY) {
      setNavOpen(false);
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  // Menu de identidade (change `troca-de-senha`, design.md D5/D6): "Minha
  // conta" é oferecida a qualquer papel, inclusive `collaborator` — não é
  // item de administração.
  const identityMenuItems: MenuProps['items'] = [
    {
      key: 'minha-conta',
      icon: <IconeConta />,
      label: <Link to="/minha-conta">Minha conta</Link>,
    },
    { type: 'divider' },
    { key: 'sair', icon: <IconeSair />, label: 'Sair', onClick: handleLogout },
  ];

  if (!identity) return null;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!isNarrow && (
        // Degradê azul-marinho da marca (change `identidade-visual-isetes`,
        // tasks 3.1): pintado na própria navegação, que é quem cobre a coluna
        // inteira — topo, menu e rodapé do colapso. O token `siderBg` do
        // design system fica transparente (theme.ts) para o fundo chapado
        // dele não vazar por cima. A cor vem dos tokens, nunca de literal.
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          style={{ background: DEGRADE_NAVEGACAO }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ minHeight: 48, margin: 16 }}>
              {collapsed ? (
                <div
                  style={{
                    color: paleta.branco,
                    fontWeight: 600,
                    fontSize: 18,
                    lineHeight: '24px',
                  }}
                >
                  PH
                </div>
              ) : (
                // Shell expandido (design.md D7): não há texto irmão do nome aqui, então
                // a logomarca carrega o nome acessível diretamente via `alt`.
                <BrandMark height={40} alt="PapelHub" />
              )}
              {/* Identificação do cliente só no estado expandido (design.md D6) —
                  o colapsado não tem largura para o subtítulo sem truncar. */}
              {!collapsed && publicConfig.clientName && (
                <div
                  style={{
                    color: paleta.textoSobreEscuro,
                    fontSize: TAMANHO_MINIMO_TEXTO,
                    lineHeight: '18px',
                  }}
                >
                  {publicConfig.clientName}
                </div>
              )}
            </div>
            <Menu theme="dark" mode="inline" selectedKeys={[selectedKey]} items={items} />
          </div>
        </Sider>
      )}
      <Layout>
        <Header
          style={{
            background: paleta.branco,
            display: 'flex',
            alignItems: 'center',
            justifyContent: isNarrow ? 'space-between' : 'flex-end',
            gap: 12,
            padding: '0 24px',
          }}
        >
          {isNarrow && (
            <Button
              type="text"
              icon={<IconeMenu style={{ fontSize: 18 }} />}
              aria-label="Abrir navegação"
              onClick={() => setNavOpen(true)}
            />
          )}
          <Space>
            <NotificationCenter />
            <Dropdown menu={{ items: identityMenuItems }} trigger={['click']}>
              <Space style={{ cursor: 'pointer' }}>
                <Avatar>{identity.id.slice(0, 2).toUpperCase()}</Avatar>
                <Typography.Text>{ROLE_LABEL[identity.role]}</Typography.Text>
              </Space>
            </Dropdown>
          </Space>
        </Header>
        <Content style={{ margin: isNarrow ? 12 : 24 }}>
          <Outlet />
        </Content>
      </Layout>
      {isNarrow && (
        <Drawer
          title={<BrandMark height={32} alt="PapelHub" />}
          placement="left"
          open={navOpen}
          onClose={() => setNavOpen(false)}
          width={280}
          /* O painel sobreposto é a navegação do modo estreito: recebe o mesmo
             degradê da coluna lateral (tasks 3.1), sem faixa de outra cor
             entre o cabeçalho e o menu. */
          styles={{
            body: { padding: 0, background: DEGRADE_NAVEGACAO },
            header: { background: DEGRADE_NAVEGACAO, borderBottom: 'none' },
            content: { background: DEGRADE_NAVEGACAO },
          }}
        >
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[selectedKey]}
            items={items}
            onClick={handleNavClick}
          />
        </Drawer>
      )}
    </Layout>
  );
}
