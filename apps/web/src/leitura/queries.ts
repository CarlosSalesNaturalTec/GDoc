import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ReadingStatus, UserRole } from '@gdoc/shared';
import type {
  CreateReadingCampaignRequest,
  MyReadingsResponse,
  ReadingAudience,
  ReadingAudienceOptionsResponse,
  ReadingCampaignResponse,
  ReadingFileStateResponse,
  ReadingPreviewResponse,
} from '@gdoc/shared';
import { apiClient } from '../lib/api-client';
import { fileSummaryResponseSchema } from '../lib/schemas';

/**
 * Fronteira da leitura obrigatória (change `leitura-obrigatoria`). Schemas
 * aqui, junto das consultas, porque só esta pasta os consome — a C2 vai
 * reaproveitar `useMyReadings` para as abas.
 */
const audienceSchema: z.ZodType<ReadingAudience> = z.object({
  wholeUnit: z.boolean(),
  sectorIds: z.array(z.string()),
  roles: z.array(z.enum([UserRole.COLLABORATOR, UserRole.UNIT_ADMIN, UserRole.GLOBAL_ADMIN])),
  userIds: z.array(z.string()),
});

const campaignSchema: z.ZodType<ReadingCampaignResponse> = z.object({
  id: z.string(),
  fileId: z.string(),
  documentRevision: z.number(),
  documentCode: z.string(),
  documentTitle: z.string(),
  audience: audienceSchema,
  dueDate: z.string(),
  message: z.string().nullable(),
  createdAt: z.string(),
  assignedCount: z.number(),
});

const fileStateSchema: z.ZodType<ReadingFileStateResponse> = z.object({
  canMark: z.boolean(),
  ineligibleReason: z.enum(['not_controlled', 'not_in_force', 'not_previewable']).nullable(),
  currentRevision: z.number().nullable(),
  current: campaignSchema.nullable(),
  previous: campaignSchema.nullable(),
});

const audienceOptionsSchema: z.ZodType<ReadingAudienceOptionsResponse> = z.object({
  sectors: z.array(z.object({ id: z.string(), name: z.string() })),
  people: z.array(
    z.object({ id: z.string(), name: z.string(), sectorName: z.string().nullable() }),
  ),
});

const myReadingsSchema: z.ZodType<MyReadingsResponse> = z.object({
  items: z.array(
    z.object({
      assignmentId: z.string(),
      campaignId: z.string(),
      status: z.enum([
        ReadingStatus.PENDING,
        ReadingStatus.LATE,
        ReadingStatus.DONE,
        ReadingStatus.CLOSED,
      ]),
      dueDate: z.string(),
      acknowledgedAt: z.string().nullable(),
      documentRevision: z.number(),
      documentCode: z.string(),
      documentTitle: z.string(),
      message: z.string().nullable(),
      file: fileSummaryResponseSchema.nullable(),
    }),
  ),
});

export const READING_FILE_KEY = 'reading-file';
export const MY_READINGS_KEY = 'my-readings';

export function useReadingFileState(fileId: string | null) {
  return useQuery({
    queryKey: [READING_FILE_KEY, fileId],
    enabled: fileId !== null,
    queryFn: async () =>
      fileStateSchema.parse(
        await apiClient.get<ReadingFileStateResponse>(`/reading/files/${fileId}`),
      ),
  });
}

export function useAudienceOptions(fileId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['reading-audience-options', fileId],
    enabled: enabled && fileId !== null,
    queryFn: async () =>
      audienceOptionsSchema.parse(
        await apiClient.get<ReadingAudienceOptionsResponse>(
          `/reading/files/${fileId}/audience-options`,
        ),
      ),
  });
}

/** Prévia da contagem (demanda 3.2, etapa 1, item 4). */
export function useAudiencePreview() {
  return useMutation({
    mutationFn: async (body: { fileId: string; audience: ReadingAudience }) =>
      apiClient.post<ReadingPreviewResponse>('/reading/preview', body),
  });
}

export function useCreateReadingCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateReadingCampaignRequest) =>
      campaignSchema.parse(
        await apiClient.post<ReadingCampaignResponse>('/reading/campaigns', body),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [READING_FILE_KEY] }),
  });
}

/** Leituras da própria pessoa, com a situação apurada pelo servidor (design.md D3). */
export function useMyReadings(enabled = true) {
  return useQuery({
    queryKey: [MY_READINGS_KEY],
    enabled,
    queryFn: async () =>
      myReadingsSchema.parse(await apiClient.get<MyReadingsResponse>('/reading/mine')),
  });
}

export function useAcknowledgeReading() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (assignmentId: string) =>
      apiClient.post(`/reading/assignments/${assignmentId}/acknowledge`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [MY_READINGS_KEY] }),
  });
}
