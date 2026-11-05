import { useMemo, useState } from 'react';
import { Button, Drawer, Layout, Menu, Space, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import {
  IconeAjuda,
  IconeArquivos,
  IconeColaboradores,
  IconeCompartilhados,
  IconeEnviar,
  IconeFavorito,
  IconeInicio,
  IconeLixeira,
  IconeManual,
  IconeMenu,
  IconeTour,
  IconePainel,
  IconeRecentes,
  IconeUnidades,
} from '../app/icons';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { UserRole } from '@gdoc/shared';
import { useSession } from '../auth/session-context';
import { useNarrowMode } from '../app/responsive';
import { DEGRADE_NAVEGACAO, LARGURA_NAVEGACAO, paleta } from '../app/theme';
import { DESTINO_PEDIDO_DE_ENVIO } from '../navegacao/pedido-de-envio';
import { MarcaDoProduto } from './MarcaDoProduto';
import { CartaoDoUsuario } from './CartaoDoUsuario';
import { NotificationCenter } from './NotificationCenter';
import { BuscaNoCabecalho } from './BuscaNoCabecalho';
import { NOME_ACESSIVEL_MANUAL } from './manual';
import { DESTINO_PEDIDO_DE_TOUR } from '../tour/pedido-de-tour';

const { Header, Sider, Content } = Layout;

/** Chave do acesso auxiliar ao manual — nunca coincide com um `pathname`, então nunca entra em `selectedKeys`. */
const MANUAL_KEY = 'manual-do-usuario';

/**
 * Chave do tour guiado (change `tour-guiado`, design.md D7): acesso auxiliar
 * **interno** — também nunca coincide com um `pathname`, então não marca tela
 * corrente; e, por navegar, fecha o painel sobreposto como um destino.
 */
const TOUR_KEY = 'tour-guiado';

/** Altura do gatilho de recolher do design system, reservada no rodapé da coluna. */
const ALTURA_GATILHO_RECOLHER = 64;

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
  // mantém "Documentos" selecionado no menu, não só a raiz do explorador.
  const selectedKey = location.pathname.startsWith('/pastas') ? '/pastas' : location.pathname;

  // Origem única de itens, agora **agrupada por natureza** (design.md D2 do
  // change `menu-lateral-e-barra-superior`): NAVEGAÇÃO reúne os destinos
  // internos filtrados por papel, AJUDA reúne os acessos auxiliares. A lista
  // é consumida tanto pelo `Sider` (≥ lg) quanto pelo painel sobreposto
  // (< lg) — duas listas paralelas divergiriam em silêncio quando um item
  // fosse acrescentado só num dos lados.
  //
  // Os grupos entram como itens `type: 'group'` na **mesma** lista, e não como
  // dois componentes `Menu` empilhados: dois `Menu` reintroduziriam as listas
  // paralelas e exigiriam entregar `selectedKeys` a ambos, com o risco de dois
  // itens selecionados ao mesmo tempo. O rótulo de grupo do design system já
  // não é acionável (`role="presentation"`) e não participa de `selectedKeys`.
  const items: MenuProps['items'] = useMemo(() => {
    // Conjunto de destinos internos (capability `web-shell-e-auth`): tela
    // inicial, documentos, recentes e lixeira, mais os destinos de
    // administração permitidos ao papel. A **busca não ocupa destino** — está
    // permanentemente acessível na barra superior (capability `web-busca`).
    //
    // "Compartilhados comigo" (A5) e "Favoritos" (A4) entraram junto com os
    // seus destinos. Leitura obrigatória pertence à fatia C2 e **não entra
    // aqui** até que o seu destino exista: item de menu que não leva a nada é regressão (`tela-inicial`,
    // "atalho apresentado conduz a uma ação executável").
    const destinos: MenuProps['items'] = [
      { key: '/', icon: <IconeInicio />, label: <Link to="/">Início</Link> },
      { key: '/pastas', icon: <IconeArquivos />, label: <Link to="/pastas">Documentos</Link> },
      { key: '/recentes', icon: <IconeRecentes />, label: <Link to="/recentes">Recentes</Link> },
      // Favoritos entre Recentes e Compartilhados, na ordem da tabela 1.1 da
      // demanda nº 2 (change `favoritos`), para qualquer papel.
      {
        key: '/favoritos',
        icon: <IconeFavorito />,
        label: <Link to="/favoritos">Favoritos</Link>,
      },
      {
        key: '/compartilhados',
        icon: <IconeCompartilhados />,
        label: <Link to="/compartilhados">Compartilhados comigo</Link>,
      },
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

    const grupos: MenuProps['items'] = [
      { key: 'grupo-navegacao', type: 'group', label: 'NAVEGAÇÃO', children: destinos },
    ];

    // Grupo AJUDA (change `tour-guiado`, design.md D7): o tour guiado é
    // acesso auxiliar **interno** — sempre presente, sem anúncio de saída — e
    // o manual, externo, entra só quando a implantação o tem. Com o tour, o
    // grupo nunca fica vazio; a regra "grupo sem item não apresenta rótulo"
    // continua valendo para qualquer grupo futuro.
    const ajuda: NonNullable<MenuProps['items']> = [];
    if (publicConfig.manualUrl) {
      ajuda.push({
        key: MANUAL_KEY,
        icon: <IconeManual />,
        title: 'Manual do usuário',
        label: (
          // O nome acessível anuncia a saída da aplicação a quem não enxerga
          // a tela; o rótulo do grupo só acrescenta a distinção visual.
          <a
            href={publicConfig.manualUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={NOME_ACESSIVEL_MANUAL}
          >
            Manual do usuário
          </a>
        ),
      });
    }
    ajuda.push({
      key: TOUR_KEY,
      icon: <IconeTour />,
      title: 'Tour guiado',
      label: <Link to={DESTINO_PEDIDO_DE_TOUR}>Tour guiado</Link>,
    });
    grupos.push({ key: 'grupo-ajuda', type: 'group', label: 'AJUDA', children: ajuda });

    return grupos;
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

  if (!identity) return null;

  // Conteúdo da navegação, idêntico nos dois modos de apresentação: marca,
  // menu agrupado e identidade no rodapé, nessa ordem. É esta função que
  // sustenta o requisito "Painel sobreposto oferece os mesmos itens do modo
  // largo", agora incluindo a identidade.
  function navegacao(modoColapsado: boolean, reservaDoGatilho = false) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          // O gatilho de recolher do design system é **fixo** ao pé da
          // viewport; sem reservar a altura dele o cartão do rodapé fica por
          // baixo. O painel sobreposto não tem gatilho, então não reserva.
          paddingBottom: reservaDoGatilho ? ALTURA_GATILHO_RECOLHER : 0,
        }}
      >
        <div style={{ margin: 16 }}>
          {modoColapsado ? (
            // Colapsado continua com a forma abreviada em **texto**, sem a
            // logomarca e sem o descritor — não há largura para eles sem
            // truncar (capability `identidade-visual`).
            <div style={{ color: paleta.branco, fontWeight: 600, fontSize: 18 }}>PH</div>
          ) : (
            <MarcaDoProduto clientName={publicConfig.clientName || undefined} />
          )}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={items}
          onClick={handleNavClick}
          style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
        />
        <CartaoDoUsuario identity={identity!} collapsed={modoColapsado} onLogout={handleLogout} />
      </div>
    );
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!isNarrow && (
        // Degradê azul-marinho da marca (change `identidade-visual-isetes`,
        // tasks 3.1): pintado na própria navegação, que é quem cobre a coluna
        // inteira. O token `siderBg` do design system fica transparente
        // (theme.ts) para o fundo chapado dele não vazar por cima.
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          width={LARGURA_NAVEGACAO}
          /* A coluna é **fixa à viewport**, não ao documento. Sem isto ela
             cresce junto com o conteúdo da página, e o cartão do rodapé vai
             parar abaixo da dobra — a medição na app o encontrou em y=977
             numa viewport de 900px, isto é, fora da tela. O rodapé da
             navegação só é rodapé se a navegação ocupar a altura visível. */
          data-tour="navegacao"
          style={{
            background: DEGRADE_NAVEGACAO,
            position: 'sticky',
            top: 0,
            height: '100vh',
          }}
        >
          {navegacao(collapsed, true)}
        </Sider>
      )}
      <Layout>
        <Header
          style={{
            background: paleta.branco,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '0 24px',
          }}
        >
          {isNarrow && (
            <Button
              type="text"
              icon={<IconeMenu style={{ fontSize: 18 }} />}
              aria-label="Abrir navegação"
              data-tour="navegacao"
              onClick={() => setNavOpen(true)}
            />
          )}
          {/* Busca à **esquerda** da barra (demanda 1.2), antes das ações.
              Ela é o elemento elástico: `flex: 1` com teto de largura. */}
          {/* Alvo do tour (change `tour-guiado`): o invólucro não altera o
              layout — `display: contents` deixa o campo continuar sendo o
              item elástico da barra. */}
          <div data-tour="busca" style={{ display: 'contents' }}>
            <BuscaNoCabecalho />
          </div>
          <Space>
            {/* Ação principal da aplicação. Oferecida a **qualquer** papel:
                permissão de envio é por pasta e vem do servidor (`canUpload`),
                nunca do papel — um `collaborator` com concessão de envio pode
                enviar, e filtrar por papel o deixaria sem o botão. O
                explorador atende o pedido só depois do veredito, de modo que
                o atalho não conduz a recusa (design.md D4; `tela-inicial`,
                "O atalho de envio não conduz a uma recusa"). */}
            {/* Abaixo do limiar o rótulo sai e fica o ícone: a medição em
                375px mostrou que, com ele, o campo de busca colapsava para
                24px — caixa visível em que não se digita. O nome acessível
                permanece, de modo que a ação não perde identidade para quem
                não enxerga a tela. */}
            <Tooltip title={isNarrow ? 'Enviar documento' : undefined}>
              <Button
                type="primary"
                icon={<IconeEnviar />}
                aria-label={isNarrow ? 'Enviar documento' : undefined}
                data-tour="enviar"
                onClick={() => navigate(DESTINO_PEDIDO_DE_ENVIO)}
              >
                {isNarrow ? null : 'Enviar documento'}
              </Button>
            </Tooltip>
            <span data-tour="avisos">
              <NotificationCenter />
            </span>
            {/* Ajuda: mesma `manualUrl` do grupo AJUDA — uma origem, dois
                acessos, que nunca divergem. Omitida quando a implantação não
                a tem, para não oferecer acionador sem destino.
                **Omitida também no modo estreito**, pela largura: o mesmo
                recurso continua a um toque, no grupo AJUDA do painel
                sobreposto, de modo que nenhum acesso é perdido. */}
            {publicConfig.manualUrl && !isNarrow && (
              <Tooltip title="Ajuda">
                <Button
                  type="text"
                  href={publicConfig.manualUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Ajuda (abre o manual em nova aba, fora da aplicação)"
                  data-tour="ajuda"
                  icon={<IconeAjuda style={{ fontSize: 18 }} />}
                />
              </Tooltip>
            )}
          </Space>
        </Header>
        <Content style={{ margin: isNarrow ? 12 : 24 }}>
          <Outlet />
        </Content>
      </Layout>
      {isNarrow && (
        <Drawer
          placement="left"
          open={navOpen}
          onClose={() => setNavOpen(false)}
          width={LARGURA_NAVEGACAO}
          closable={false}
          /* O painel sobreposto é a navegação do modo estreito: recebe o mesmo
             degradê da coluna lateral (tasks 3.1), sem faixa de outra cor
             entre o cabeçalho e o menu. O cabeçalho próprio do painel sai: a
             marca agora vem de `navegacao()`, origem única dos dois modos. */
          styles={{
            body: { padding: 0, background: DEGRADE_NAVEGACAO },
            content: { background: DEGRADE_NAVEGACAO },
          }}
        >
          {navegacao(false)}
        </Drawer>
      )}
    </Layout>
  );
}
