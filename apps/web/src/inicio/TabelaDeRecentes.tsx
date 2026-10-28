import { useState } from 'react';
import { Button, Empty, Result, Space, Spin, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { FileSummaryResponse, RecentDocumentResponse } from '@gdoc/shared';
import { Link } from 'react-router-dom';
import { RotuloDeEstado } from '../app/RotuloDeEstado';
import { RotuloDeTipoDocumental } from '../app/RotuloDeTipoDocumental';
import { AUSENTE, DOCUMENT_STATUS_TOM, rotuloDeSituacao } from '../shell/document-control-labels';
import { formatDate } from '../navegacao/format';
import { PreviewModal } from '../visualizacao/PreviewModal';
import { useRecentDocuments } from './queries';

/**
 * Lista de documentos alterados recentemente (US 11.2), consumida tanto pela
 * tela inicial quanto pelo destino "Recentes" da navegação — uma origem só,
 * para as duas não divergirem no que apresentam.
 *
 * A ordenação é a que o **servidor** devolveu (alteração mais recente
 * primeiro): a tela não reordena, porque o instante é derivado da auditoria e
 * do `created_at` no próprio `SELECT`, e reordenar aqui seria recalcular com
 * outra fonte. A situação de cada documento também vem apurada do servidor,
 * como na listagem de pasta.
 *
 * A ausência de alterações é **informada**, nunca uma tabela vazia sem
 * explicação (US 11.2, cenário 4).
 */
export function TabelaDeRecentes() {
  const { data, isLoading, isError } = useRecentDocuments();
  const [previewingFile, setPreviewingFile] = useState<FileSummaryResponse | null>(null);

  const columns: ColumnsType<RecentDocumentResponse> = [
    {
      title: 'Documento',
      key: 'name',
      render: (_, doc) => (
        <div>
          <Space>
            {/* Sigla do tipo junto ao nome, como na listagem de pasta
                (US 10.1 cenário 1) — a cor é redundância, nunca substituta. */}
            {doc.documentType && <RotuloDeTipoDocumental tipo={doc.documentType} />}
            <Button
              type="link"
              style={{ padding: 0, height: 'auto' }}
              onClick={() => setPreviewingFile(doc)}
            >
              {doc.fileName}
            </Button>
          </Space>
          {doc.documentCode && (
            <div>
              <Typography.Text type="secondary">{doc.documentCode}</Typography.Text>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Pasta',
      key: 'folder',
      render: (_, doc) =>
        doc.folderId === null ? (
          <Link to="/pastas">Documentos</Link>
        ) : (
          <Link to={`/pastas/${doc.folderId}`}>{doc.folderName ?? AUSENTE}</Link>
        ),
    },
    {
      title: 'Situação',
      key: 'documentStatus',
      render: (_, doc) => (
        <RotuloDeEstado tom={DOCUMENT_STATUS_TOM[doc.documentStatus]}>
          {rotuloDeSituacao(doc)}
        </RotuloDeEstado>
      ),
    },
    { title: 'Alterado em', key: 'changedAt', render: (_, doc) => formatDate(doc.changedAt) },
  ];

  if (isLoading) return <Spin style={{ display: 'block', margin: '24px auto' }} />;

  if (isError) {
    return (
      <Result
        status="error"
        title="Não foi possível carregar as alterações recentes"
        subTitle="Verifique sua conexão e tente novamente."
      />
    );
  }

  return (
    <>
      <Table<RecentDocumentResponse>
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={data?.documents ?? []}
        pagination={false}
        scroll={{ x: 'max-content' }}
        locale={{
          emptyText: <Empty description="Nenhuma alteração recente nos seus documentos" />,
        }}
      />
      <PreviewModal file={previewingFile} onClose={() => setPreviewingFile(null)} />
    </>
  );
}
