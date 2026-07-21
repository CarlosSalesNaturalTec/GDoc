import { useMemo, useState } from 'react';
import { App, Breadcrumb, Button, Popconfirm, Result, Space, Spin, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CloudDownloadOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FileOutlined,
  FolderAddOutlined,
  FolderOutlined,
} from '@ant-design/icons';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { FileSummaryResponse, FolderResponse } from '@gdoc/shared';
import { ApiError } from '../lib/api-client';
import { PreviewModal } from '../visualizacao/PreviewModal';
import { useDownloadFile } from '../visualizacao/useDownloadFile';
import { useCreateFolder, useDeleteFile, useDeleteFolder, useFolderContents, useRenameFile } from './queries';
import { NewFolderModal } from './NewFolderModal';
import { RenameFileModal } from './RenameFileModal';
import { formatDate, formatFileSize } from './format';

type Row =
  | { key: string; kind: 'folder'; folder: FolderResponse }
  | { key: string; kind: 'file'; file: FileSummaryResponse };

/**
 * Explorador de pastas/arquivos (US 2.1, US 2.2, US 4.2 — `web-navegacao`).
 * `:folderId` ausente = raiz da unidade; deep-link a pasta sem `view` recebe
 * 403 do servidor e não renderiza conteúdo (design.md D6).
 */
export function ExplorerPage() {
  const { folderId } = useParams<{ folderId?: string }>();
  const currentFolderId = folderId ?? null;
  const navigate = useNavigate();
  const { message } = App.useApp();

  const { data, isLoading, isError, error } = useFolderContents(currentFolderId);
  const createFolder = useCreateFolder();
  const renameFile = useRenameFile();
  const deleteFile = useDeleteFile();
  const deleteFolder = useDeleteFolder();

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [renamingFile, setRenamingFile] = useState<FileSummaryResponse | null>(null);
  const [previewingFile, setPreviewingFile] = useState<FileSummaryResponse | null>(null);
  const { download, isPending: downloading } = useDownloadFile();

  // US 2.2 cenário 2 / design.md D4: o cliente não infere permissão, oferece
  // a ação e trata o 403 do servidor com um aviso — sem aplicar a mudança.
  function handlePermissionError(err: unknown) {
    if (err instanceof ApiError && err.status === 403) {
      message.error('Permissão insuficiente para executar esta ação.');
      return;
    }
    message.error('Não foi possível concluir a ação. Tente novamente.');
  }

  async function handleCreateFolder(name: string) {
    try {
      await createFolder.mutateAsync({ name, parentId: currentFolderId ?? undefined });
      setNewFolderOpen(false);
    } catch (err) {
      handlePermissionError(err);
    }
  }

  async function handleRenameFile(fileName: string) {
    if (!renamingFile) return;
    try {
      await renameFile.mutateAsync({ fileId: renamingFile.id, fileName });
      setRenamingFile(null);
    } catch (err) {
      handlePermissionError(err);
    }
  }

  async function handleDeleteFile(fileId: string) {
    try {
      await deleteFile.mutateAsync(fileId);
    } catch (err) {
      handlePermissionError(err);
    }
  }

  async function handleDeleteChildFolder(id: string) {
    try {
      await deleteFolder.mutateAsync(id);
    } catch (err) {
      handlePermissionError(err);
    }
  }

  // design.md D5: excluir a pasta corrente (de dentro dela) navega ao pai
  // antes de invalidar — a listagem-pai é recarregada na nova rota.
  async function handleDeleteCurrentFolder() {
    if (!data?.folder) return;
    const parentId = data.folder.parentId;
    try {
      await deleteFolder.mutateAsync(data.folder.id);
      navigate(parentId ? `/pastas/${parentId}` : '/pastas');
    } catch (err) {
      handlePermissionError(err);
    }
  }

  const breadcrumbItems = useMemo(() => {
    if (!data) return [];
    if (data.folder === null) {
      return [{ title: 'Arquivos' }];
    }
    return [
      { title: <Link to="/pastas">Arquivos</Link> },
      ...data.breadcrumb.map((crumb) => ({
        key: crumb.id,
        title: <Link to={`/pastas/${crumb.id}`}>{crumb.name}</Link>,
      })),
      { title: data.folder.name },
    ];
  }, [data]);

  const rows: Row[] = useMemo(() => {
    if (!data) return [];
    return [
      ...data.folders.map((folder) => ({ key: folder.id, kind: 'folder' as const, folder })),
      ...data.files.map((file) => ({ key: file.id, kind: 'file' as const, file })),
    ];
  }, [data]);

  const columns: ColumnsType<Row> = [
    {
      title: 'Tipo',
      key: 'type',
      width: 56,
      render: (_, row) => (row.kind === 'folder' ? <FolderOutlined /> : <FileOutlined />),
    },
    {
      title: 'Nome',
      key: 'name',
      render: (_, row) =>
        row.kind === 'folder' ? (
          <Link to={`/pastas/${row.folder.id}`}>{row.folder.name}</Link>
        ) : (
          <Space>
            <Button type="link" style={{ padding: 0, height: 'auto' }} onClick={() => setPreviewingFile(row.file)}>
              {row.file.fileName}
            </Button>
            {row.file.status !== 'active' && <Tag>{row.file.status}</Tag>}
          </Space>
        ),
    },
    {
      title: 'Tamanho',
      key: 'size',
      render: (_, row) => (row.kind === 'file' ? formatFileSize(row.file.sizeBytes) : '—'),
    },
    {
      title: 'Data',
      key: 'createdAt',
      render: (_, row) => formatDate(row.kind === 'folder' ? row.folder.createdAt : row.file.createdAt),
    },
    {
      title: 'Ações',
      key: 'actions',
      render: (_, row) =>
        row.kind === 'folder' ? (
          <Popconfirm
            title="Excluir pasta"
            description="A pasta e seu conteúdo vão para a lixeira."
            okText="Sim, excluir"
            cancelText="Cancelar"
            onConfirm={() => handleDeleteChildFolder(row.folder.id)}
          >
            <Button danger size="small" icon={<DeleteOutlined />}>
              Excluir
            </Button>
          </Popconfirm>
        ) : (
          <Space>
            <Button size="small" icon={<EyeOutlined />} onClick={() => setPreviewingFile(row.file)}>
              Visualizar
            </Button>
            <Button
              size="small"
              icon={<CloudDownloadOutlined />}
              loading={downloading}
              onClick={() => download(row.file.id)}
            >
              Baixar
            </Button>
            <Button size="small" icon={<EditOutlined />} onClick={() => setRenamingFile(row.file)}>
              Renomear
            </Button>
            <Popconfirm
              title="Excluir arquivo"
              description="O arquivo vai para a lixeira."
              okText="Sim, excluir"
              cancelText="Cancelar"
              onConfirm={() => handleDeleteFile(row.file.id)}
            >
              <Button danger size="small" icon={<DeleteOutlined />}>
                Excluir
              </Button>
            </Popconfirm>
          </Space>
        ),
    },
  ];

  if (isLoading) {
    return <Spin size="large" style={{ display: 'block', margin: '48px auto' }} />;
  }

  if (isError) {
    // design.md D6: 403 do GET de conteúdo (pasta inexistente, de outra
    // unidade ou sem `view`) bloqueia sem renderizar nome/conteúdo algum.
    if (error instanceof ApiError && error.status === 403) {
      return (
        <Result
          status="403"
          title="Sem permissão"
          subTitle="Você não tem permissão para acessar esta pasta."
        />
      );
    }
    return (
      <Result
        status="error"
        title="Não foi possível carregar o conteúdo"
        subTitle="Verifique sua conexão e tente novamente."
      />
    );
  }

  if (!data) return null;

  return (
    <div>
      <Breadcrumb items={breadcrumbItems} style={{ marginBottom: 16 }} />
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<FolderAddOutlined />} onClick={() => setNewFolderOpen(true)}>
          Nova pasta
        </Button>
        {data.folder !== null && (
          <Popconfirm
            title="Excluir esta pasta"
            description="A pasta e seu conteúdo vão para a lixeira."
            okText="Sim, excluir"
            cancelText="Cancelar"
            onConfirm={handleDeleteCurrentFolder}
          >
            <Button danger icon={<DeleteOutlined />}>
              Excluir esta pasta
            </Button>
          </Popconfirm>
        )}
      </Space>
      <Table<Row> rowKey="key" columns={columns} dataSource={rows} pagination={false} />
      <NewFolderModal
        open={newFolderOpen}
        submitting={createFolder.isPending}
        onCancel={() => setNewFolderOpen(false)}
        onSubmit={handleCreateFolder}
      />
      <RenameFileModal
        file={renamingFile}
        submitting={renameFile.isPending}
        onCancel={() => setRenamingFile(null)}
        onSubmit={handleRenameFile}
      />
      <PreviewModal file={previewingFile} onClose={() => setPreviewingFile(null)} />
    </div>
  );
}
