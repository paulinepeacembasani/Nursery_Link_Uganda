import { unwrap, type Schemas } from '@nurserylink/api-client';
import type { ServiceRequestStatus, ServiceType } from '@nurserylink/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

export type AdminServiceRequest = Schemas['AdminServiceRequest'];

export const useServiceRequests = (filter: { status: ServiceRequestStatus | null; service: ServiceType | null }, page: number) =>
  useQuery({
    queryKey: ['admin', 'service-requests', filter, page],
    queryFn: async () =>
      unwrap(api.GET('/admin/service-requests', {
        params: { query: { page, limit: 25, ...(filter.status ? { status: filter.status } : {}), ...(filter.service ? { service: filter.service } : {}) } },
      })),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });

export const useUpdateServiceRequest = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, note }: { id: string; status: Exclude<ServiceRequestStatus, 'new'>; note?: string }) =>
      (await unwrap(api.PUT('/admin/service-requests/{id}', { params: { path: { id } }, body: { status, ...(note ? { note } : {}) } }))).data,
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['admin'] }); },
  });
};
