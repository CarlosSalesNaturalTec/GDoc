import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationListResponse, UnreadNotificationCountResponse } from '@gdoc/shared';
import { apiClient } from '../lib/api-client';
import { notificationListResponseSchema, unreadNotificationCountResponseSchema } from '../lib/schemas';

const NOTIFICATIONS_KEY = 'notifications';
const UNREAD_COUNT_KEY = 'notifications-unread-count';

/** `GET /notifications` (design.md D4, capability `notificacoes`): próprias notificações, mais recentes primeiro. */
export function useNotifications(enabled = true) {
  return useQuery({
    queryKey: [NOTIFICATIONS_KEY],
    enabled,
    queryFn: async () => {
      const raw = await apiClient.get<NotificationListResponse>('/notifications');
      return notificationListResponseSchema.parse(raw);
    },
  });
}

/** `GET /notifications/unread-count`: contagem exibida no shell. */
export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: [UNREAD_COUNT_KEY],
    queryFn: async () => {
      const raw = await apiClient.get<UnreadNotificationCountResponse>('/notifications/unread-count');
      return unreadNotificationCountResponseSchema.parse(raw).count;
    },
  });
}

/** `POST /notifications/:id/read`: marcar como lida preserva a notificação (design.md D4). */
export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<void>(`/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [NOTIFICATIONS_KEY] });
      queryClient.invalidateQueries({ queryKey: [UNREAD_COUNT_KEY] });
    },
  });
}
