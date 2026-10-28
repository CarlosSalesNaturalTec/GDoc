import { Space, Typography } from 'antd';
import { TabelaDeRecentes } from './TabelaDeRecentes';

/**
 * Destino "Recentes" da navegação (change `shell-e-inicio`, tasks 4.1).
 *
 * Deliberadamente sem paginação nem filtros (design.md, Non-Goals): é o mesmo
 * recorte curto da tela inicial, numa tela própria para quem chega pelo menu.
 * Quem precisa procurar usa a busca — é para isso que ela está no cabeçalho.
 */
export function RecentesPage() {
  return (
    <Space direction="vertical" size="middle" style={{ display: 'flex' }}>
      <div>
        <Typography.Title level={3} style={{ marginBottom: 4 }}>
          Alterados recentemente
        </Typography.Title>
        <Typography.Text type="secondary">
          Documentos ao seu alcance publicados, substituídos, renomeados ou movidos nos últimos
          dias.
        </Typography.Text>
      </div>
      <TabelaDeRecentes />
    </Space>
  );
}
