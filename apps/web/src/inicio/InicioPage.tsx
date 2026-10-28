import { Card, Col, Empty, Result, Row, Space, Spin, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { IconePasta } from '../app/icons';
import { paleta } from '../app/theme';
import { useSession } from '../auth/session-context';
import { ROLE_LABEL } from '../shell/role-label';
import { nomeExibido, saudacao } from '../shell/identidade';
import { useFolderContents } from '../navegacao/queries';
import { atalhosDoPapel } from './atalhos';
import { TabelaDeRecentes } from './TabelaDeRecentes';

/**
 * Tela inicial (Épico 11, US 11.1/11.2, capability `tela-inicial`).
 *
 * Responde, sem clique, a "quem sou, onde estou, o que posso fazer e o que
 * mudou". Antes desta change a rota `/` era um `Result` com o favicon e a
 * frase "Bem-vindo ao PapelHub" — quem entrava precisava procurar no menu o
 * que veio fazer.
 *
 * As três consultas da tela são **independentes e paralelas** (design.md,
 * Risks): identidade já resolvida na sessão, pastas de primeiro nível e
 * alterações recentes. Cada área tem o seu próprio estado de carregamento e
 * aparece assim que a sua resposta chega — uma consulta lenta não bloqueia as
 * demais.
 *
 * Nada aqui decide permissão: os atalhos são filtrados pelo papel só para não
 * oferecer o que o servidor recusaria, e as pastas e os documentos são
 * exatamente os que a API devolveu.
 */
export function InicioPage() {
  const { identity } = useSession();
  // Pastas de **primeiro nível** da unidade: a raiz devolve só o que a
  // resolução de acesso do servidor liberou (design.md D4 — são pastas da
  // própria unidade, não as unidades do desenho do cliente, consequência de
  // manter o isolamento por unidade).
  const pastas = useFolderContents(null);

  if (!identity) return null;

  const nome = nomeExibido(identity);
  const atalhos = atalhosDoPapel(identity.role);

  return (
    <Space direction="vertical" size="large" style={{ display: 'flex' }}>
      <div>
        <Typography.Title level={3} style={{ marginBottom: 4 }}>
          {saudacao(nome)}
        </Typography.Title>
        {/* Função e unidade sempre presentes, com ou sem nome cadastrado
            (US 11.1 cenário 1): o identificador interno nunca aparece. */}
        <Typography.Text type="secondary">
          {ROLE_LABEL[identity.role]} · {identity.unitName}
        </Typography.Text>
      </div>

      <Card title="O que você pode fazer">
        <Row gutter={[16, 16]}>
          {atalhos.map((atalho) => (
            <Col key={atalho.chave} xs={24} sm={12} lg={8}>
              <Card size="small" hoverable>
                <Link to={atalho.destino}>{atalho.rotulo}</Link>
                <div>
                  <Typography.Text type="secondary">{atalho.descricao}</Typography.Text>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>

      <Card title="Suas pastas">
        {pastas.isLoading && <Spin style={{ display: 'block', margin: '24px auto' }} />}
        {pastas.isError && (
          <Result
            status="error"
            title="Não foi possível carregar suas pastas"
            subTitle="Verifique sua conexão e tente novamente."
          />
        )}
        {!pastas.isLoading && !pastas.isError && pastas.data && (
          <>
            {pastas.data.folders.length === 0 ? (
              // Ausência orientada, nunca área vazia sem explicação
              // (requisito "Sem pastas acessíveis a área orienta").
              <Empty description="Nenhuma pasta disponível para você no momento" />
            ) : (
              <Row gutter={[16, 16]}>
                {pastas.data.folders.map((pasta) => (
                  <Col key={pasta.id} xs={24} sm={12} lg={8}>
                    <Card size="small" hoverable>
                      <Link to={`/pastas/${pasta.id}`}>
                        <Space>
                          <IconePasta style={{ color: paleta.azulLink }} />
                          {pasta.name}
                        </Space>
                      </Link>
                    </Card>
                  </Col>
                ))}
              </Row>
            )}
          </>
        )}
      </Card>

      <Card title="Alterados recentemente" extra={<Link to="/recentes">Ver todos</Link>}>
        <TabelaDeRecentes />
      </Card>
    </Space>
  );
}
