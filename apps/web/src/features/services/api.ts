import { unwrap, type Schemas } from '@nurserylink/api-client';
import type { ServiceRequestCreate } from '@nurserylink/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

export type ServiceRequest = Schemas['ServiceRequest'];

/** The signed-in buyer's service requests (personal: never cached offline). */
export const useMyServiceRequests = (enabled: boolean) =>
  useQuery({
    queryKey: ['me', 'service-requests'],
    enabled,
    queryFn: async () => (await unwrap(api.GET('/service-requests/me', { params: { query: { limit: 50 } } }))).data,
  });

export const useRequestService = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (body: ServiceRequestCreate) => (await unwrap(api.POST('/service-requests', { body }))).data,
    onSuccess: () => client.invalidateQueries({ queryKey: ['me', 'service-requests'] }),
  });
};
