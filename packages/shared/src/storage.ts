/** Ação de acesso a um arquivo — distingue visualizar de baixar na auditoria e no TTL. */
export const FileAccessAction = {
  VIEW: 'view',
  DOWNLOAD: 'download',
} as const;

export type FileAccessAction = (typeof FileAccessAction)[keyof typeof FileAccessAction];

export interface SignedUrlRequest {
  fileId: string;
}

export interface SignedUrlResponse {
  url: string;
  expiresAt: string;
  action: FileAccessAction;
}

/**
 * Resposta de `POST /files/:id/view-url` (US 9.2 cenário 2, design.md D3):
 * ramo pré-visualizável é um superset aditivo de `SignedUrlResponse`; ramo
 * indisponível não emite URL e sinaliza a oferta de download conforme a
 * permissão do solicitante (design.md D5).
 */
export type ViewUrlResponse =
  | ({ previewAvailable: true } & SignedUrlResponse)
  | { previewAvailable: false; reason: 'unsupported_format'; download: { available: boolean } };

export interface UploadUrlRequest {
  fileName: string;
  contentType: string;
  declaredSizeBytes: number;
  /** Pasta de destino (da unidade do remetente); ausente = raiz da unidade. */
  folderId?: string;
}

export interface UploadUrlResponse {
  uploadUrl: string;
  objectPath: string;
  expiresAt: string;
}

/**
 * Notificação de finalização já normalizada para o formato interno consumido
 * pela reconciliação de cota. Em dev/E2E o endpoint recebe este payload direto;
 * em produção ele é derivado do envelope de push do Pub/Sub (ver abaixo).
 */
export interface StorageFinalizeNotification {
  bucket?: string;
  objectPath: string;
  sizeBytes: number;
}

/**
 * Envelope de entrega push do Pub/Sub. O corpo do POST tem a mensagem em
 * `message`, com o dado (metadata do objeto do GCS) codificado em base64 em
 * `data`. Ver https://cloud.google.com/pubsub/docs/push (formato do envelope).
 */
export interface PubSubPushEnvelope {
  message: {
    data: string;
    attributes?: Record<string, string>;
    messageId?: string;
    message_id?: string;
    publishTime?: string;
    publish_time?: string;
  };
  subscription?: string;
}

/**
 * Metadata do objeto do GCS entregue pela notificação com
 * `payload_format = "JSON_API_V1"` (infra/terraform/pubsub.tf). Só os campos
 * que a reconciliação usa são modelados; `name` é a chave do objeto dentro do
 * bucket (`{unit_id}/{owner_id}/{uuid}`), igual ao `object_path` gravado em
 * `files`, e `size` vem como string (int64 serializado em JSON).
 */
export interface GcsObjectMetadata {
  name: string;
  bucket: string;
  size: string;
  contentType?: string;
}

/** Resumo de arquivo usado na listagem de conteúdo de pasta (navegação). */
export interface FileSummaryResponse {
  id: string;
  ownerId: string;
  folderId: string | null;
  fileName: string;
  contentType: string | null;
  sizeBytes: number | null;
  status: string;
  createdAt: string;
}

export interface RenameFileRequest {
  fileName: string;
}

export interface ReplaceFileRequest {
  contentType: string;
  declaredSizeBytes: number;
}

/** Mesmo formato de `UploadUrlResponse`: URL assinada de PUT para o novo `object_path`. */
export type ReplaceFileResponse = UploadUrlResponse;

export interface BatchUploadItemRequest {
  fileName: string;
  contentType: string;
  declaredSizeBytes: number;
  /** Subpasta relativa ao destino (ex.: "Relatorios/2024"); ausente = direto no destino. */
  relativePath?: string;
}

export interface BatchUploadUrlRequest {
  /** Pasta-âncora (da unidade do remetente, da qual o remetente precisa ser dono); ausente = raiz da unidade. */
  destinationFolderId?: string;
  items: BatchUploadItemRequest[];
}

export interface BatchUploadItemSuccess {
  fileName: string;
  ok: true;
  uploadUrl: string;
  objectPath: string;
  folderId: string | null;
  expiresAt: string;
}

export interface BatchUploadItemFailure {
  fileName: string;
  ok: false;
  error: string;
}

/** Resultado por item, na mesma ordem de `BatchUploadUrlRequest.items` (design.md D1/D5). */
export type BatchUploadItemResult = BatchUploadItemSuccess | BatchUploadItemFailure;

export interface BatchUploadUrlResponse {
  results: BatchUploadItemResult[];
}
