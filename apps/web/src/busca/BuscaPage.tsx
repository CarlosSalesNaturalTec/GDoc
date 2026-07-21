import { useMemo, useState } from 'react';
import { Button, DatePicker, Empty, Input, Result, Select, Space, Spin, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ClearOutlined, CloudDownloadOutlined, EyeOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import type { FileCategory, FileSummaryResponse, SearchFilesQuery } from '@gdoc/shared';
import { UserRole, fileCategory } from '@gdoc/shared';
import { useSession } from '../auth/session-context';
import { PreviewModal } from '../visualizacao/PreviewModal';
import { useDownloadFile } from '../visualizacao/useDownloadFile';
import { formatDate, formatFileSize } from '../navegacao/format';
import { useAuthorOptions, useSearchFiles } from './queries';

const { RangePicker } = DatePicker;

/** Rótulo pt-BR por categoria de tipo (design.md D4) — fonte única é o enum `FileCategory` de `@gdoc/shared`. */
const CATEGORY_LABEL: Record<FileCategory, string> = {
  image: 'Imagem',
  video: 'Vídeo',
  audio: 'Áudio',
  pdf: 'PDF',
  office: 'Documento de escritório',
  text: 'Texto',
  other: 'Outros',
};

const CATEGORY_OPTIONS = (Object.keys(CATEGORY_LABEL) as FileCategory[]).map((value) => ({
  value,
  label: CATEGORY_LABEL[value],
}));

interface FilterState {
  q: string;
  type: FileCategory | undefined;
  author: string | undefined;
  dateRange: [Dayjs, Dayjs] | null;
}

const EMPTY_FILTERS: FilterState = { q: '', type: undefined, author: undefined, dateRange: null };

/** Converte o estado dos controles para a query de `GET /files/search` (design.md D3/D4). */
function toSearchQuery(filters: FilterState): SearchFilesQuery {
  const [from, to] = filters.dateRange ?? [undefined, undefined];
  return {
    q: filters.q || undefined,
    type: filters.type,
    author: filters.author,
    dateFrom: from?.format('YYYY-MM-DD'),
    dateTo: to?.format('YYYY-MM-DD'),
  };
}

/**
 * Página de busca transversal (US 9.1, `web-busca`): nome + filtros
 * combináveis sobre `GET /files/search`, com "estado inicial permitido" =
 * busca sem critérios (design.md D1/D3).
 */
export function BuscaPage() {
  const { identity } = useSession();
  const isAdmin = identity?.role === UserRole.UNIT_ADMIN || identity?.role === UserRole.GLOBAL_ADMIN;

  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const query = useMemo(() => toSearchQuery(filters), [filters]);

  const { data, isLoading, isError } = useSearchFiles(query);
  const authorOptions = useAuthorOptions(identity?.role);
  const [previewingFile, setPreviewingFile] = useState<FileSummaryResponse | null>(null);
  const { download, isPending: downloading } = useDownloadFile();

  const columns: ColumnsType<FileSummaryResponse> = [
    {
      title: 'Tipo',
      key: 'type',
      width: 160,
      render: (_, file) => CATEGORY_LABEL[fileCategory(file.contentType)],
    },
    {
      title: 'Nome',
      key: 'name',
      render: (_, file) => (
        <Button type="link" style={{ padding: 0, height: 'auto' }} onClick={() => setPreviewingFile(file)}>
          {file.fileName}
        </Button>
      ),
    },
    { title: 'Tamanho', key: 'size', render: (_, file) => formatFileSize(file.sizeBytes) },
    { title: 'Data', key: 'createdAt', render: (_, file) => formatDate(file.createdAt) },
    {
      title: 'Ações',
      key: 'actions',
      render: (_, file) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setPreviewingFile(file)}>
            Visualizar
          </Button>
          <Button
            size="small"
            icon={<CloudDownloadOutlined />}
            loading={downloading}
            onClick={() => download(file.id)}
          >
            Baixar
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space wrap style={{ marginBottom: 16 }}>
        <Input.Search
          allowClear
          placeholder="Buscar por nome"
          style={{ width: 240 }}
          value={filters.q}
          onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))}
        />
        <Select
          allowClear
          placeholder="Tipo"
          style={{ width: 200 }}
          options={CATEGORY_OPTIONS}
          value={filters.type}
          onChange={(value) => setFilters((prev) => ({ ...prev, type: value }))}
        />
        <RangePicker
          value={filters.dateRange}
          onChange={(range) => setFilters((prev) => ({ ...prev, dateRange: range as [Dayjs, Dayjs] | null }))}
        />
        {isAdmin && (
          <Select
            allowClear
            showSearch
            placeholder="Autor"
            style={{ width: 200 }}
            loading={authorOptions.isLoading}
            options={authorOptions.data ?? []}
            optionFilterProp="label"
            value={filters.author}
            onChange={(value) => setFilters((prev) => ({ ...prev, author: value }))}
          />
        )}
        <Button icon={<ClearOutlined />} onClick={() => setFilters(EMPTY_FILTERS)}>
          Limpar filtros
        </Button>
      </Space>

      {isLoading && <Spin size="large" style={{ display: 'block', margin: '48px auto' }} />}

      {isError && (
        <Result
          status="error"
          title="Não foi possível carregar os resultados"
          subTitle="Verifique sua conexão e tente novamente."
        />
      )}

      {!isLoading && !isError && data && (
        <Table<FileSummaryResponse>
          rowKey="id"
          columns={columns}
          dataSource={data.files}
          pagination={false}
          locale={{ emptyText: <Empty description="Nenhum resultado" /> }}
        />
      )}

      <PreviewModal file={previewingFile} onClose={() => setPreviewingFile(null)} />
    </div>
  );
}
