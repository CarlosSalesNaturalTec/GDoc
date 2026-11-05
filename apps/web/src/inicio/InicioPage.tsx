import type { ReactNode } from 'react';
import { Card, Col, Empty, Result, Row, Space, Spin, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { IconePasta } from '../app/icons';
import { paleta } from '../app/theme';
import { useSession } from '../auth/session-context';
import { funcaoExibida, nomeExibido, saudacao, setorExibido } from '../shell/identidade';
import { NOME_ACESSIVEL_MANUAL } from '../shell/manual';
import { useFolderContents } from '../navegacao/queries';
import { atalhosDoPapel, type Atalho } from './atalhos';
import { textoDeNovos, useNewDocumentsCount } from './queries';
import { TabelaDeRecentes } from './TabelaDeRecentes';
import { TourGuiado } from '../tour/TourGuiado';
import { CartaoDeLeituras } from '../leitura/CartaoDeLeituras';
import { DESTINO_PEDIDO_DE_TOUR } from '../tour/pedido-de-tour';

/**
 * Estilo do link que **envolve** o cartão (design.md D1/D3 do change
 * `cartoes-de-atalho-acionaveis`).
 *
 * `display: block` para o link assumir a caixa do cartão — um `<a>` inline
 * deixaria de fora justamente a área que esta change existe para tornar
 * acionável. `color: inherit` e `textDecoration: none` porque, envolvendo o
 * cartão, o link herdaria cor e sublinhado para **todo** o conteúdo, pintando
 * de azul também a descrição secundária; a aparência de link fica no rótulo,
 * onde a informação está, e a cor vem do token. `height: 100%` para os
 * cartões de uma mesma linha terem a mesma altura.
 */
const ESTILO_DO_LINK_DE_CARTAO = {
  display: 'block',
  height: '100%',
  color: 'inherit',
  textDecoration: 'none',
} as const;

/**
 * Título de cartão que quebra linha em vez de truncar: em 375 px o link à
 * direita ("Ver histórico completo") deixa pouco espaço, e o padrão do design
 * system corta o título com reticências — título cortado foi exatamente o que
 * a fatia A2 eliminou do menu.
 */
const ESTILOS_DE_CARTAO_COM_LINK = { title: { whiteSpace: 'normal' } } as const;

/** Linhas de recentes na tela inicial (demanda nº 2, seção 1.3). */
const LINHAS_DE_RECENTES_NO_INICIO = 5;

/**
 * Cartão de atalho: ícone colorido, título e descrição (demanda nº 2, seção
 * 1.3). O cartão **inteiro** é o link (design.md D1 de
 * `cartoes-de-atalho-acionaveis`), e o nome acessível é o rótulo (D2) — a
 * descrição segue sendo texto do cartão, não parte do nome do destino. O do
 * manual sai da aplicação, e o nome acessível anuncia isso com o mesmo texto
 * do menu (change `conteudo-da-tela-inicio`, design.md D4).
 */
function CartaoDeAtalho({ atalho }: { atalho: Atalho }) {
  const Icone = atalho.icone;
  const conteudo = (
    <Card size="small" hoverable style={{ height: '100%' }}>
      <Space align="start" size="middle">
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 40,
            height: 40,
            borderRadius: 8,
            // Fundo translúcido do próprio tom do ícone — decorativo; o
            // ícone é `aria-hidden` e a informação está no rótulo.
            background: `${atalho.cor}1A`,
            color: atalho.cor,
            flex: 'none',
          }}
        >
          <Icone style={{ fontSize: 20 }} />
        </span>
        <div>
          <Typography.Text strong style={{ color: paleta.azulLink }}>
            {atalho.rotulo}
          </Typography.Text>
          <div>
            <Typography.Text type="secondary">{atalho.descricao}</Typography.Text>
          </div>
        </div>
      </Space>
    </Card>
  );

  if (atalho.externo) {
    return (
      <a
        href={atalho.destino}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={NOME_ACESSIVEL_MANUAL}
        style={ESTILO_DO_LINK_DE_CARTAO}
      >
        {conteudo}
      </a>
    );
  }
  return (
    <Link to={atalho.destino} aria-label={atalho.rotulo} style={ESTILO_DO_LINK_DE_CARTAO}>
      {conteudo}
    </Link>
  );
}

/**
 * Cartão reservado da coluna direita (design.md D8): diz por escrito o que vai
 * apresentar, e **não** afirma ausência — "nenhum aviso" seria verdadeiro só
 * por vacuidade. Resta só o de Avisos, cujo conteúdo chega com a fatia C3; o
 * de Leitura obrigatória virou `CartaoDeLeituras` (change
 * `superficies-de-pendencia`).
 */
function CartaoReservado({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <Card title={titulo} size="small">
      <Typography.Text type="secondary">{children}</Typography.Text>
    </Card>
  );
}

/**
 * Tela inicial (Épico 11, US 11.1/11.2, capability `tela-inicial`), na
 * composição da demanda nº 2, seção 1.3 (change `conteudo-da-tela-inicio`).
 *
 * Responde, sem clique, a "quem sou, onde estou, o que posso fazer e o que
 * mudou". As consultas da tela são **independentes e paralelas**: identidade
 * já resolvida na sessão, contagem de novos, pastas de primeiro nível e
 * alterações recentes. Cada área tem o seu próprio estado e aparece assim que
 * a sua resposta chega — uma consulta lenta ou com falha não bloqueia as
 * demais.
 *
 * Nada aqui decide permissão: as pastas, os documentos e a contagem são
 * exatamente os que a API devolveu.
 */
export function InicioPage() {
  const { identity, publicConfig } = useSession();
  // Pastas de **primeiro nível** da unidade: a raiz devolve só o que a
  // resolução de acesso do servidor liberou. São pastas, não unidades — cada
  // pessoa pertence a uma unidade só (resposta 1a do cliente,
  // `docs/respostas_d1_d3_d5_decisoes_estruturais.txt`).
  const pastas = useFolderContents(null);
  const novos = useNewDocumentsCount();

  if (!identity) return null;

  const atalhos = atalhosDoPapel(identity.role, publicConfig.manualUrl);

  // Função, setor e unidade sempre presentes, com ou sem nome cadastrado (US
  // 11.1 cenário 1): o identificador interno nunca aparece. A função do
  // cadastro no lugar do papel (change `funcao-e-setor-na-identidade`); setor
  // omitido quando não existe. A contagem de novos entra depois, só quando
  // chegou — carregando ou com falha, a linha continua inteira sem ela.
  const contexto = [funcaoExibida(identity), setorExibido(identity), identity.unitName]
    .filter((parte): parte is string => parte !== null)
    .join(' · ');

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
      {/* Conteúdo principal e coluna direita sem media query (design.md D8):
          lado a lado o espaço livre vai quase todo para o principal (999:1) e
          a coluna fica em ~340px; quando os dois não cabem, a coluna desce e
          ocupa a largura inteira. `minWidth: 0` deixa a tabela rolar dentro
          do próprio contêiner em vez de alargar a página. */}
      <div style={{ flex: '999 1 480px', minWidth: 0 }}>
        <Space direction="vertical" size="large" style={{ display: 'flex' }}>
          <div>
            {/* Convite ao tour à direita da saudação, só para quem ainda não
                o fez (change `tour-guiado`, design.md D6) — refazer continua no
                menu, em AJUDA. */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                columnGap: 16,
              }}
            >
              <Typography.Title level={3} style={{ marginBottom: 4 }}>
                {saudacao(nomeExibido(identity))}
              </Typography.Title>
              {!identity.tourCompleted && (
                <Link to={DESTINO_PEDIDO_DE_TOUR}>Primeira vez aqui? Faça o tour de 2 minutos</Link>
              )}
            </div>
            <Typography.Text type="secondary">
              {contexto}
              {novos.data && ` — ${textoDeNovos(novos.data)}`}
            </Typography.Text>
          </div>

          {/* Cartões soltos, sem título de seção (demanda nº 2, seção 1.3). */}
          <Row gutter={[16, 16]} data-tour="atalhos">
            {atalhos.map((atalho) => (
              <Col key={atalho.chave} xs={24} sm={12} xxl={6}>
                <CartaoDeAtalho atalho={atalho} />
              </Col>
            ))}
          </Row>

          <Card
            data-tour="pastas"
            title="Pastas da unidade"
            extra={<Link to="/pastas">Ver todas as pastas</Link>}
            styles={ESTILOS_DE_CARTAO_COM_LINK}
          >
            {pastas.isLoading && <Spin style={{ display: 'block', margin: '24px auto' }} />}
            {pastas.isError && (
              <Result
                status="error"
                title="Não foi possível carregar as pastas"
                subTitle="Verifique sua conexão e tente novamente."
              />
            )}
            {!pastas.isLoading && !pastas.isError && pastas.data && (
              <>
                {pastas.data.folders.length === 0 ? (
                  // Ausência orientada, nunca área vazia sem explicação.
                  <Empty description="Nenhuma pasta disponível para você no momento" />
                ) : (
                  <Row gutter={[16, 16]}>
                    {pastas.data.folders.map((pasta) => (
                      <Col key={pasta.id} xs={24} sm={12} lg={8}>
                        {/* Mesma forma dos atalhos: as áreas de cartão da tela
                            têm uma única regra de clique. Sem `aria-label` — o
                            ícone é decorativo e o nome acessível do link é o
                            nome da pasta. */}
                        <Link to={`/pastas/${pasta.id}`} style={ESTILO_DO_LINK_DE_CARTAO}>
                          <Card size="small" hoverable style={{ height: '100%' }}>
                            <Space>
                              <IconePasta style={{ color: paleta.azulLink }} />
                              <Typography.Text style={{ color: paleta.azulLink }}>
                                {pasta.name}
                              </Typography.Text>
                            </Space>
                          </Card>
                        </Link>
                      </Col>
                    ))}
                  </Row>
                )}
              </>
            )}
          </Card>

          <Card
            data-tour="recentes"
            title="Documentos recentes"
            extra={<Link to="/recentes">Ver histórico completo</Link>}
            styles={ESTILOS_DE_CARTAO_COM_LINK}
          >
            <TabelaDeRecentes limite={LINHAS_DE_RECENTES_NO_INICIO} />
          </Card>
        </Space>
      </div>

      <aside
        aria-label="Leitura obrigatória e avisos"
        data-tour="coluna-direita"
        style={{ flex: '1 1 340px', minWidth: 0 }}
      >
        <Space direction="vertical" size="large" style={{ display: 'flex' }}>
          <CartaoDeLeituras />
          <CartaoReservado titulo="Avisos">
            Aqui vão aparecer os avisos sobre leituras obrigatórias. Os demais avisos continuam no
            sino, no topo da tela.
          </CartaoReservado>
        </Space>
      </aside>
      <TourGuiado />
    </div>
  );
}
