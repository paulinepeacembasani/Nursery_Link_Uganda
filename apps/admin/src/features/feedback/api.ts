import { unwrap, type Schemas } from '@nurserylink/api-client';
import type { FeedbackKind, FeedbackStatus } from '@nurserylink/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

export type AdminFeedback = Schemas['AdminFeedback'];

export const useFeedback = (filter: { status: FeedbackStatus | null; kind: FeedbackKind | null }, page: number) =>
  useQuery({
    queryKey: ['admin', 'feedback', filter, page],
    queryFn: async () =>
      unwrap(api.GET('/admin/feedback', {
        params: { query: { page, limit: 25, ...(filter.status ? { status: filter.status } : {}), ...(filter.kind ? { kind: filter.kind } : {}) } },
      })),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });

export const useUpdateFeedback = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, note }: { id: string; status: FeedbackStatus; note?: string }) =>
      (await unwrap(api.PUT('/admin/feedback/{id}', { params: { path: { id } }, body: { status, ...(note ? { note } : {}) } }))).data,
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['admin'] }); },
  });
};
