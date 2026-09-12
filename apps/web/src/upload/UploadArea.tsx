import { useRef, useState } from 'react';
import { App, Button, List, Progress, Space, Typography, Upload } from 'antd';
import { FolderOpenOutlined, ReloadOutlined, UploadOutlined } from '@ant-design/icons';
import type { BatchUploadItemRequest, BatchUploadUrlRequest } from '@gdoc/shared';
import { UPLOAD_BATCH_MAX_ITEMS_DEFAULT } from '@gdoc/shared';
import { ApiError } from '../lib/api-client';
import { useNarrowMode } from '../app/responsive';
import { putObject } from './put-object';
import { deriveRelativePath } from './relative-path';
import { useInvalidateFolderContents, useRequestUploadUrls } from './queries';

const QUOTA_ERROR = 'quota exceeded';
const BATCH_LIMIT_ERROR = 'upload_batch_limit_exceeded';

/**
 * Transferências simultâneas (change `corrige-defeitos-envio-lote`,
 * design.md D4). O GCS fala HTTP/2, que multiplexa — **não** existe o teto
 * implícito de ~6 conexões por host do HTTP/1.1, então sem esta fila N PUTs
 * viram N streams disputando a mesma banda: todos rastejam juntos, nenhum
 * conclui cedo, e uma interrupção deixa N arquivos pela metade em vez de
 * alguns concluídos. Quatro é o suficiente para cobrir latência de handshake
 * e a variação de tamanho entre itens, mantendo alta a taxa de conclusão.
 */
const UPLOAD_CONCURRENCY = 4;

/**
 * Margem de vigência da URL assinada (design.md D5). O item pode esperar na
 * fila antes do PUT começar, e uma URL que vence no meio da transferência
 * falha igual a uma vencida antes dela.
 */
const URL_EXPIRY_MARGIN_MS = 60_000;

/**
 * A partir de quantas falhas consecutivas de PUT a URL é renovada mesmo
 * quando o relógio do cliente a julga vigente (design.md D5): o relógio do
 * navegador decide uma otimização — poupar uma requisição —, nunca a
 * correção.
 */
const FAILURES_BEFORE_FORCED_RENEWAL = 2;

/** Mensagem da recusa de envio de pasta por dispositivo (design.md D5, `web-responsividade`)
 * — `webkitdirectory` não existe em Safari iOS nem em Chrome Android; texto distinguível
 * da recusa por permissão insuficiente. */
const UPLOAD_FOLDER_DEVICE_REFUSAL =
  'Enviar pasta não está disponível neste dispositivo. Use um computador.';

interface UploadItem {
  uid: string;
  file: File;
  fileName: string;
  relativePath?: string;
  /** `queued` = aceito pelo servidor, aguardando vaga na fila (design.md D4). */
  status: 'queued' | 'uploading' | 'done' | 'error';
  percent: number;
  error?: string;
  /** Presente enquanto a URL assinada segue válida (design.md D4) — mantida mesmo após falha de PUT, para o repetir reusar. */
  uploadUrl?: string;
  /** Prazo da URL acima, devolvido pela API — base da renovação no retry (design.md D5). */
  expiresAt?: string;
  /** Falhas consecutivas de PUT deste item; zerado ao obter URL nova (design.md D5). */
  putFailures: number;
}

/** Item admitido na fila de transferência (design.md D4). */
interface QueuedTransfer {
  uid: string;
  uploadUrl: string;
  file: File;
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
 * Vigência da URL assinada pelo relógio do cliente (design.md D5). Sem
 * `expiresAt` a resposta é "não confiável" — item vindo de antes deste
 * conserto, ou resposta sem o campo —, e o retry pede URL nova: mais barato
 * que repetir um PUT que já se sabe condenado.
 */
function urlStillFresh(item: Pick<UploadItem, 'uploadUrl' | 'expiresAt'>): boolean {
  if (!item.uploadUrl || !item.expiresAt) return false;
  const restante = new Date(item.expiresAt).getTime() - Date.now();
  return Number.isFinite(restante) && restante > URL_EXPIRY_MARGIN_MS;
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
  const isNarrow = useNarrowMode();
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

  function notifyBatchLimit(found: number, allowed: number) {
    // design.md D2: recusa por **quantidade**, nunca a mensagem genérica que
    // convida a repetir a mesma operação — repetir não muda o número.
    notification.warning({
      message: 'Seleção acima do limite por envio',
      description: `Você selecionou ${found} arquivos e o limite é ${allowed} por envio. Envie em partes.`,
    });
  }

  function notifyQuota() {
    notification.warning({
      message: 'Cota de armazenamento atingida',
      description:
        'Este arquivo não pôde ser enviado: o limite de armazenamento por usuário foi atingido.',
    });
  }

  // design.md D7: destino inválido/sem permissão derruba o lote inteiro,
  // sem iniciar transferência alguma — mesmo padrão `handlePermissionError`
  // da Fatia 2. 401 segue tratado centralmente pelo apiClient.
  function handleDestinationError(err: unknown) {
    // Rede de segurança do teto (design.md D2): a recusa antecipada usa o
    // padrão compartilhado, mas a implantação pode ter um teto menor — e aí
    // o `allowed` do servidor é a fonte da verdade.
    const details =
      err instanceof ApiError ? (err.details as Record<string, unknown> | null) : null;
    if (details?.error === BATCH_LIMIT_ERROR) {
      notifyBatchLimit(Number(details.found), Number(details.allowed));
      return;
    }
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

  // Fila de transferência (design.md D4). Vive em refs, não em estado: a
  // vaga liberada precisa ser ocupada no próprio callback do XHR, sem
  // esperar um ciclo de render.
  const queueRef = useRef<QueuedTransfer[]>([]);
  const activeRef = useRef(0);

  function enqueueTransfers(transfers: QueuedTransfer[]) {
    queueRef.current.push(...transfers);
    pumpQueue();
  }

  function pumpQueue() {
    while (activeRef.current < UPLOAD_CONCURRENCY && queueRef.current.length > 0) {
      const next = queueRef.current.shift()!;
      activeRef.current += 1;
      startTransfer(next);
    }
  }

  /** Libera a vaga e puxa o próximo — por sucesso **ou** por falha (design.md D4). */
  function releaseSlot() {
    activeRef.current = Math.max(0, activeRef.current - 1);
    pumpQueue();
  }

  function startTransfer({ uid, uploadUrl, file }: QueuedTransfer) {
    updateItem(uid, { status: 'uploading', percent: 0, error: undefined });
    putObject(uploadUrl, file, {
      onProgress: (percent) => updateItem(uid, { percent }),
      onSuccess: () => {
        // design.md D6: sucesso = PUT 2xx; invalida a listagem, sem esperar
        // `active` — a mensagem diz "enviado", não "disponível".
        updateItem(uid, { status: 'done', percent: 100, putFailures: 0 });
        invalidate();
        message.success(`"${file.name}" enviado.`);
        releaseSlot();
      },
      onError: () => {
        // A contagem alimenta a renovação forçada de D5: se o relógio disse
        // "vigente" e o PUT falhou duas vezes, o relógio não é confiável.
        const anterior = itemsRef.current.find((it) => it.uid === uid)?.putFailures ?? 0;
        updateItem(uid, { status: 'error', error: 'put failed', putFailures: anterior + 1 });
        releaseSlot();
      },
    });
  }

  async function startBatch(files: File[]) {
    if (files.length === 0) return;

    // design.md D2: recusa **antes** da requisição, pelo padrão compartilhado
    // em `packages/shared`, sem endpoint de leitura novo. O servidor segue
    // validando — isto é conveniência de UX, nunca a guarda.
    if (files.length > UPLOAD_BATCH_MAX_ITEMS_DEFAULT) {
      notifyBatchLimit(files.length, UPLOAD_BATCH_MAX_ITEMS_DEFAULT);
      return;
    }

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
      const base = { uid: nextUid(), file, fileName: file.name, relativePath, putFailures: 0 };
      if (result?.ok) {
        // Nasce `queued`, não `uploading`: quem vira transferência de fato é
        // a fila (design.md D4), e um item parado não deve parecer travado.
        return {
          ...base,
          status: 'queued' as const,
          percent: 0,
          uploadUrl: result.uploadUrl,
          expiresAt: result.expiresAt,
        };
      }
      return {
        ...base,
        status: 'error' as const,
        percent: 0,
        error: result?.error ?? 'invalid item',
      };
    });

    setItems((prev) => [...prev, ...newItems]);

    const transfers: QueuedTransfer[] = [];
    for (const item of newItems) {
      if (item.status === 'error') {
        if (item.error === QUOTA_ERROR) notifyQuota();
        continue;
      }
      transfers.push({ uid: item.uid, uploadUrl: item.uploadUrl!, file: item.file });
    }
    enqueueTransfers(transfers);
  }

  // design.md D4: item sem URL válida (recusado pelo servidor) refaz uma
  // chamada de lote de 1 para reconquistar a folga de cota; item que só
  // falhou no PUT reusa a URL já obtida — **enquanto ela estiver vigente**.
  //
  // design.md D5: antes deste conserto a mera presença de `uploadUrl` mandava
  // direto para o PUT, então um item que falhou *porque a URL venceu* era
  // retentado com a mesma URL vencida, para sempre. Duas condições agora
  // forçam URL nova: prazo fora da margem (relógio do cliente, otimização) e
  // falhas consecutivas (rede de segurança quando o relógio mente).
  async function retryItem(uid: string) {
    const item = itemsRef.current.find((it) => it.uid === uid);
    if (!item) return;

    const forcarRenovacao = item.putFailures >= FAILURES_BEFORE_FORCED_RENEWAL;
    if (item.uploadUrl && urlStillFresh(item) && !forcarRenovacao) {
      enqueueTransfers([{ uid, uploadUrl: item.uploadUrl, file: item.file }]);
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
        // URL nova zera a contagem: o histórico de falhas era da URL antiga.
        updateItem(uid, {
          uploadUrl: result.uploadUrl,
          expiresAt: result.expiresAt,
          putFailures: 0,
        });
        enqueueTransfers([{ uid, uploadUrl: result.uploadUrl, file: item.file }]);
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
      <Space wrap>
        <Upload multiple showUploadList={false} beforeUpload={handleBeforeUpload}>
          <Button icon={<UploadOutlined />}>Enviar arquivos</Button>
        </Upload>
        {/* design.md D5 (`web-responsividade`): `webkitdirectory` não existe em
            Safari iOS nem em Chrome Android — abaixo do limiar o botão
            permanece visível e recusa no acionamento, em vez de abrir um
            seletor de pasta que a plataforma não suporta. O `<Upload>`
            permanece montado nos dois modos (identidade estável do
            componente); a recusa intercepta o clique com
            `stopPropagation`, antes que o `rc-upload` abra o seletor. */}
        <Upload directory multiple showUploadList={false} beforeUpload={handleBeforeUpload}>
          <Button
            icon={<FolderOpenOutlined />}
            onClick={(e) => {
              if (isNarrow) {
                e.stopPropagation();
                message.error(UPLOAD_FOLDER_DEVICE_REFUSAL);
              }
            }}
          >
            Enviar pasta
          </Button>
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
                      <Button
                        key="retry"
                        size="small"
                        icon={<ReloadOutlined />}
                        onClick={() => retryItem(item.uid)}
                      >
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
                  ) : item.status === 'queued' ? (
                    // design.md D4: item aguardando vaga precisa ser
                    // distinguível de item em transferência — sem isto, uma
                    // barra parada em 0% lê-se como travada ou falha.
                    <Typography.Text type="secondary">Aguardando envio…</Typography.Text>
                  ) : (
                    <Progress
                      percent={item.percent}
                      size="small"
                      status={item.status === 'done' ? 'success' : 'active'}
                    />
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
