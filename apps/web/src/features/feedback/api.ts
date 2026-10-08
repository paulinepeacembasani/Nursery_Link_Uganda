import { unwrap } from '@nurserylink/api-client';
import type { FeedbackCreate } from '@nurserylink/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

/** Same query as the checkout's payment methods: /health is fetched once and shared. */
const health = { queryKey: ['health'], queryFn: async () => (await unwrap(api.GET('/health', {}))).data, staleTime: 5 * 60_000 };

/** The first-visit notice and the survey link, set on the API (DEMO_NOTICE, SURVEY_URL). */
export const useSiteSettings = () => useQuery({ ...health, select: d => d.site });

export const useSendFeedback = () =>
  useMutation({ mutationFn: async (body: FeedbackCreate) => (await unwrap(api.POST('/feedback', { body }))).data });

/**
 * A Google Form link that can sit in the page: docs.google.com/forms/…/viewform gets ?embedded=true.
 * Other links (forms.gle short links, other tools) open in a new tab instead.
 */
export const embeddableSurvey = (url: string): string | null => {
  try {
    const u = new URL(url);
    if (u.hostname !== 'docs.google.com' || !u.pathname.startsWith('/forms/') || !u.pathname.endsWith('/viewform')) return null;
    u.searchParams.set('embedded', 'true');
    return u.toString();
  } catch {
    // Not a valid URL: link to it rather than embed it
    return null;
  }
};
