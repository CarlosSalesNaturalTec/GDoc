import { useRef, useState } from 'react';
import { App, Button, List, Progress, Space, Typography, Upload } from 'antd';
import { FolderOpenOutlined, ReloadOutlined, UploadOutlined } from '@ant-design/icons';
import type { BatchUploadItemRequest, BatchUploadUrlRequest } from '@gdoc/shared';
import { ApiError } from '../lib/api-client';
import { putObject } from './put-object';
import { deriveRelativePath } from './relative-path';
import { useInvalidateFolderContents, useRequestUploadUrls } from './queries';

const QUOTA_ERROR = 'quota exceeded';

interface UploadItem {
  uid: string;
  file: File;
  fileName: string;
  relativePath?: string;
  status: 'uploading' | 'done' | 'error';
  percent: number;
  error?: string;
  /** Presente enquanto a URL assinada segue válida (design.md D4) — mantida mesmo após falha de PUT, para o repetir reusar. */
  uploadUrl?: string;
}

interface UploadAreaProps {
  /** Pasta corrente do explorador; `null` = raiz da unidade (design.md D9). */
  destinationFolderId: string | null;
}

function toBatchItem(file: File, relativePath: string | undefined): BatchUploadItemRequest {
  return {
    fileName: file.name,
    contentType: file.type || 'application/octet-stream',
    declaredSizeBytes: file.size,
    relativePath,
  };
}

function displayName(item: Pick<UploadItem, 'fileName' | 'relativePath'>): string {
  return item.relativePath ? `${item.relativePath}/${item.fileName}` : item.fileName;
}

function describeError(error: string | undefined): string {
  if (error === QUOTA_ERROR) return 'Cota de armazenamento atingida.';
  if (error === 'invalid item') return 'Arquivo inválido.';
  return 'Falha no envio.';
}

/**
 * Envio de múltiplos arquivos/pasta a partir do explorador (US 3.1, US 3.2,
 * RF #6/#13 — design.md D1-D9, `web-upload`). Dois gatilhos ("Enviar
 * arquivos"/"Enviar pasta") disparam **uma** chamada de lote antes de
 * qualquer PUT (D3); a lista abaixo mostra progresso/erro por item, com
 * repetir independente por item em falha (D4).
 */
export function UploadArea({ destinationFolderId }: UploadAreaProps) {
  const { message, notification } = App.useApp();
  const requestUploadUrls = useRequestUploadUrls();
  const invalidate = useInvalidateFolderContents();

  const [items, setItems] = useState<UploadItem[]>([]);
  const itemsRef = useRef<UploadItem[]>([]);
  itemsRef.current = items;
  const nextUidRef = useRef(0);

  function nextUid(): string {
    nextUidRef.current += 1;
    return `upload-${nextUidRef.current}`;
  }

  function updateItem(uid: string, patch: Partial<UploadItem>) {
    setItems((prev) => prev.map((it) => (it.uid === uid ? { ...it, ...patch } : it)));
  }

  function notifyQuota() {
    notification.warning({
      message: 'Cota de armazenamento atingida',
      description: 'Este arquivo não pôde ser enviado: o limite de armazenamento por usuário foi atingido.',
    });
  }

  // design.md D7: destino inválido/sem permissão derruba o lote inteiro,
  // sem iniciar transferência alguma — mesmo padrão `handlePermissionError`
  // da Fatia 2. 401 segue tratado centralmente pelo apiClient.
  function handleDestinationError(err: unknown) {
    if (err instanceof ApiError && err.status === 403) {
      message.error('Permissão insuficiente para enviar arquivos neste destino.');
      return;
    }
    if (err instanceof ApiError && err.status === 404) {
      message.error('Pasta de destino não encontrada.');
      return;
    }
    message.error('Não foi possível solicitar o envio. Tente novamente.');
  }

  function runPut(uid: string, uploadUrl: string, file: File) {
    updateItem(uid, { status: 'uploading', percent: 0, error: undefined });
    putObject(uploadUrl, file, {
      onProgress: (percent) => updateItem(uid, { percent }),
      onSuccess: () => {
        // design.md D6: sucesso = PUT 2xx; invalida a listagem, sem esperar
        // `active` — a mensagem diz "enviado", não "disponível".
        updateItem(uid, { status: 'done', percent: 100 });
        invalidate();
        message.success(`"${file.name}" enviado.`);
      },
      onError: () => {
        updateItem(uid, { status: 'error', error: 'put failed' });
      },
    });
  }

  async function startBatch(files: File[]) {
    if (files.length === 0) return;

    const relativePaths = files.map((file) => deriveRelativePath(file));
    const requestItems: BatchUploadItemRequest[] = files.map((file, index) =>
      toBatchItem(file, relativePaths[index]),
    );
    const body: BatchUploadUrlRequest = {
      destinationFolderId: destinationFolderId ?? undefined,
      items: requestItems,
    };

    let response;
    try {
      response = await requestUploadUrls.mutateAsync(body);
    } catch (err) {
      handleDestinationError(err);
      return;
    }

    const newItems: UploadItem[] = files.map((file, index) => {
      const relativePath = relativePaths[index];
      const result = response!.results[index];
      const base = { uid: nextUid(), file, fileName: file.name, relativePath };
      if (result?.ok) {
        return { ...base, status: 'uploading' as const, percent: 0, uploadUrl: result.uploadUrl };
      }
      return { ...base, status: 'error' as const, percent: 0, error: result?.error ?? 'invalid item' };
    });

    setItems((prev) => [...prev, ...newItems]);

    for (const item of newItems) {
      if (item.status === 'error') {
        if (item.error === QUOTA_ERROR) notifyQuota();
        continue;
      }
      runPut(item.uid, item.uploadUrl!, item.file);
    }
  }

  // design.md D4: item sem URL válida (recusado pelo servidor) refaz uma
  // chamada de lote de 1 para reconquistar a folga de cota; item que só
  // falhou no PUT reusa a URL já obtida (ainda não expirada).
  async function retryItem(uid: string) {
    const item = itemsRef.current.find((it) => it.uid === uid);
    if (!item) return;

    if (item.uploadUrl) {
      runPut(uid, item.uploadUrl, item.file);
      return;
    }

    updateItem(uid, { status: 'uploading', percent: 0, error: undefined });
    try {
      const response = await requestUploadUrls.mutateAsync({
        destinationFolderId: destinationFolderId ?? undefined,
        items: [toBatchItem(item.file, item.relativePath)],
      });
      const result = response.results[0];
      if (result?.ok) {
        updateItem(uid, { uploadUrl: result.uploadUrl });
        runPut(uid, result.uploadUrl, item.file);
      } else {
        const error = result?.error ?? 'invalid item';
        updateItem(uid, { status: 'error', error });
        if (error === QUOTA_ERROR) notifyQuota();
      }
    } catch (err) {
      handleDestinationError(err);
      updateItem(uid, { status: 'error', error: item.error });
    }
  }

  // design.md D3: `fileList` de `beforeUpload` é a seleção inteira desta
  // operação — a chamada de lote dispara uma única vez, no primeiro arquivo,
  // e todo `beforeUpload` retorna `false` (o envio real é feito por `startBatch`/`putObject`).
  function handleBeforeUpload(file: File, fileList: File[]): boolean {
    if (file === fileList[0]) {
      void startBatch(fileList);
    }
    return false;
  }

  return (
    <div>
      <Space>
        <Upload multiple showUploadList={false} beforeUpload={handleBeforeUpload}>
          <Button icon={<UploadOutlined />}>Enviar arquivos</Button>
        </Upload>
        <Upload directory multiple showUploadList={false} beforeUpload={handleBeforeUpload}>
          <Button icon={<FolderOpenOutlined />}>Enviar pasta</Button>
        </Upload>
      </Space>
      {items.length > 0 && (
        <List
          size="small"
          style={{ marginTop: 16, maxWidth: 480 }}
          dataSource={items}
          renderItem={(item) => (
            <List.Item
              key={item.uid}
              actions={
                item.status === 'error'
                  ? [
                      <Button key="retry" size="small" icon={<ReloadOutlined />} onClick={() => retryItem(item.uid)}>
                        Repetir
                      </Button>,
                    ]
                  : undefined
              }
            >
              <List.Item.Meta
                title={displayName(item)}
                description={
                  item.status === 'error' ? (
                    <Typography.Text type="danger">{describeError(item.error)}</Typography.Text>
                  ) : (
                    <Progress percent={item.percent} size="small" status={item.status === 'done' ? 'success' : 'active'} />
                  )
                }
              />
            </List.Item>
          )}
        />
      )}
    </div>
  );
}
