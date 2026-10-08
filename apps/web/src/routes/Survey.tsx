import { Button, Skeleton } from '@nurserylink/ui';
import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router';
import { PageHero } from '../components/PageHero';
import { usePageTitle } from '../components/usePageTitle';
import { en } from '../copy/en';
import { embeddableSurvey, useSiteSettings } from '../features/feedback/api';

const t = en.survey;

/**
 * The needs-assessment survey (a Google Form, set on the API as SURVEY_URL), inside the site when
 * Google allows it, with a link to open it on its own in any case.
 */
const Survey = () => {
  usePageTitle(t.title);
  const site = useSiteSettings();
  const url = site.data?.survey_url ?? null;
  const embed = url ? embeddableSurvey(url) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHero title={t.title} intro={t.intro} photo="nurseryman-kapchorwa" />
      {site.isPending ? (
        <Skeleton className="h-96 rounded-lg" />
      ) : !url ? (
        <div className="flex flex-col items-start gap-3 rounded-lg bg-paper p-5 shadow-card ring-1 ring-line">
          <p>{t.none}</p>
          <Button asChild variant="secondary"><Link to="/feedback">{t.feedbackCta}</Link></Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Button asChild variant="secondary" className="self-start">
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden />
              {t.open}
            </a>
          </Button>
          {embed && (
            <iframe
              src={embed}
              title={t.frameTitle}
              loading="lazy"
              className="h-[80dvh] min-h-[36rem] w-full rounded-lg bg-paper shadow-card ring-1 ring-line"
            >
              {t.loading}
            </iframe>
          )}
        </div>
      )}
    </div>
  );
};

export default Survey;
