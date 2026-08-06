import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Modal, Progress, Space, Spin, Typography } from 'antd';
import type {
  FolderDownloadManifestLimitExceededResponse,
  FolderDownloadManifestResponse,
} from '@gdoc/shared';
import { ApiError } from '../lib/api-client';
import { formatFileSize } from './format';
import { useDownloadFolderManifest } from './queries';
import { buildFolderZip, triggerBlobDownload, type ZipDownloadProgress } from './zip-download';

type Phase =
  | { kind: 'loading-manifest' }
  | { kind: 'empty' }
  | { kind: 'limit-exceeded'; limit: FolderDownloadManifestLimitExceededResponse }
  | { kind: 'downloading'; progress: ZipDownloadProgress }
  | { kind: 'done' }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string };

/** Contagens do manifesto (design.md D3) — mantidas fora de `Phase` para o aviso de
 * recorte parcial continuar visível mesmo depois que o download conclui ou é
 * cancelado, em vez de desaparecer assim que a fase muda. */
type ManifestSummary = Pick<FolderDownloadManifestResponse, 'totalFiles' | 'allowedFiles'>;

interface DownloadFolderModalProps {
  open: boolean;
  folderId: string | null;
  folderName: string;
  onClose: () => void;
}

function isLimitExceededDetails(
  details: unknown,
): details is FolderDownloadManifestLimitExceededResponse {
  return (
    typeof details === 'object' &&
    details !== null &&
    (details as { error?: unknown }).error === 'download_manifest_limit_exceeded'
  );
}

function limitMessage(limit: FolderDownloadManifestLimitExceededResponse): string {
  if (limit.limit === 'maxFiles') {
    return `Esta pasta tem ${limit.found} arquivos (limite: ${limit.allowed}). Baixe subpastas separadamente.`;
  }
  return `Esta pasta tem ${formatFileSize(limit.found)} (limite: ${formatFileSize(limit.allowed)}). Baixe subpastas separadamente.`;
}

/**
 * Fluxo completo de "Baixar pasta" (US 3.3, design.md D1/D3/D5/D9, tasks
 * 4.1–4.7): busca o manifesto, avisa de recorte parcial ou pacote vazio,
 * compacta em streaming no cliente com progresso e cancelamento, e trata a
 * recusa por limite com a orientação da API.
 */
export function DownloadFolderModal({
  open,
  folderId,
  folderName,
  onClose,
}: DownloadFolderModalProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading-manifest' });
  const [manifestSummary, setManifestSummary] = useState<ManifestSummary | null>(null);
  const manifestMutation = useDownloadFolderManifest();
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    setPhase({ kind: 'loading-manifest' });
    setManifestSummary(null);

    // Um único `AbortController` cobre o manifesto e a compactação (design.md
    // D1, task 4.3): sem isso, o `useEffect` remontado uma vez pelo
    // StrictMode do React 18 em dev dispararia o pedido de manifesto duas
    // vezes antes que a primeira chamada pudesse ser interrompida — dobrando
    // URLs assinadas emitidas e eventos de auditoria gravados por um único
    // clique. A limpeza abaixo cancela a chamada "fantasma", deixando só a
    // segunda montagem completar.
    const controller = new AbortController();
    abortControllerRef.current = controller;
    let cancelled = false;
    manifestMutation
      .mutateAsync({ folderId, signal: controller.signal })
      .then((manifest) => {
        if (cancelled) return;
        if (manifest.allowedFiles === 0) {
          setPhase({ kind: 'empty' });
          return;
        }

        setManifestSummary({
          totalFiles: manifest.totalFiles,
          allowedFiles: manifest.allowedFiles,
        });
        setPhase({
          kind: 'downloading',
          progress: {
            completedFiles: 0,
            totalFiles: manifest.entries.length,
            downloadedBytes: 0,
            totalBytes: manifest.totalBytes,
            currentFileName: null,
          },
        });

        buildFolderZip(manifest.entries, manifest.totalBytes, {
          signal: controller.signal,
          onProgress: (progress) => {
            if (cancelled) return;
            setPhase((current) =>
              current.kind === 'downloading' ? { ...current, progress } : current,
            );
          },
        })
          .then((blob) => {
            if (cancelled) return;
            triggerBlobDownload(blob, `${folderName}.zip`);
            setPhase({ kind: 'done' });
          })
          .catch((err: unknown) => {
            if (cancelled) return;
            if (err instanceof DOMException && err.name === 'AbortError') {
              setPhase({ kind: 'cancelled' });
              return;
            }
            setPhase({
              kind: 'error',
              message: 'Não foi possível gerar o arquivo compactado. Tente novamente.',
            });
          });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 413 && isLimitExceededDetails(err.details)) {
          setPhase({ kind: 'limit-exceeded', limit: err.details });
          return;
        }
        if (err instanceof ApiError && err.status === 403) {
          setPhase({ kind: 'error', message: 'Permissão insuficiente para baixar esta pasta.' });
          return;
        }
        setPhase({
          kind: 'error',
          message: 'Não foi possível preparar o download. Tente novamente.',
        });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [open, folderId]);

  function handleCancelDownload() {
    abortControllerRef.current?.abort();
  }

  function handleClose() {
    if (phase.kind === 'downloading') {
      abortControllerRef.current?.abort();
    }
    onClose();
  }

  const partialWarning =
    manifestSummary && manifestSummary.allowedFiles < manifestSummary.totalFiles ? (
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message={`${manifestSummary.allowedFiles} de ${manifestSummary.totalFiles} itens disponíveis para você`}
      />
    ) : null;

  return (
    <Modal
      title={`Baixar pasta: ${folderName}`}
      open={open}
      onCancel={handleClose}
      footer={null}
      destroyOnClose
    >
      {partialWarning}
      {phase.kind === 'loading-manifest' && (
        <Space direction="vertical" align="center" style={{ width: '100%', padding: '24px 0' }}>
          <Spin />
          <Typography.Text>Preparando o pacote...</Typography.Text>
        </Space>
      )}

      {phase.kind === 'empty' && (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Typography.Text>Nenhum item disponível para download nesta pasta.</Typography.Text>
          <Button onClick={onClose}>Fechar</Button>
        </Space>
      )}

      {phase.kind === 'limit-exceeded' && (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert type="error" showIcon message={limitMessage(phase.limit)} />
          <Button onClick={onClose}>Fechar</Button>
        </Space>
      )}

      {phase.kind === 'error' && (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert type="error" showIcon message={phase.message} />
          <Button onClick={onClose}>Fechar</Button>
        </Space>
      )}

      {phase.kind === 'cancelled' && (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Typography.Text>Download cancelado.</Typography.Text>
          <Button onClick={onClose}>Fechar</Button>
        </Space>
      )}

      {phase.kind === 'done' && (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Typography.Text>Download concluído.</Typography.Text>
          <Button type="primary" onClick={onClose}>
            Fechar
          </Button>
        </Space>
      )}

      {phase.kind === 'downloading' && (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Progress
            percent={
              phase.progress.totalBytes === 0
                ? 0
                : Math.min(
                    100,
                    Math.round((phase.progress.downloadedBytes / phase.progress.totalBytes) * 100),
                  )
            }
          />
          <Typography.Text type="secondary">
            {phase.progress.completedFiles} de {phase.progress.totalFiles} arquivos
            {phase.progress.currentFileName ? ` — ${phase.progress.currentFileName}` : ''}
          </Typography.Text>
          <Button onClick={handleCancelDownload}>Cancelar</Button>
        </Space>
      )}
    </Modal>
  );
}
