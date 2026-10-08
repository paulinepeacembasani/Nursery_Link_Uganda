import { Button, Dialog } from '@nurserylink/ui';
import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { en } from '../../copy/en';
import { useSiteSettings } from './api';

const t = en.welcome;
const SEEN_KEY = 'nl-welcome-seen';

const seen = () => {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    // Storage blocked (private mode): show the notice, it just can't be remembered
    return false;
  }
};
const remember = () => {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // As above: nothing to do when storage is blocked
  }
};

/**
 * Shown once per browser on the first visit: the nursery data is sample data and the site is still
 * being built, and (when a survey link is set) an invitation to the needs-assessment survey.
 * Not shown on the nursery's order map (/o/…), which nurseries open from an SMS.
 */
const WelcomeNotice = () => {
  const site = useSiteSettings();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(() => !seen());
  const settings = site.data;
  if (!open || !settings || pathname.startsWith('/o/') || pathname === '/survey') return null;
  const survey = settings.survey_url !== null;
  if (!settings.demo_notice && !survey) return null;

  const close = () => {
    remember();
    setOpen(false);
  };

  return (
    <Dialog
      open
      onOpenChange={o => { if (!o) close(); }}
      title={t.title}
      closeLabel={t.close}
      footer={
        <>
          <Button variant={survey ? 'secondary' : 'primary'} onClick={close}>{t.continue}</Button>
          {survey && (
            <Button asChild>
              <Link to="/survey" onClick={close}>{t.takeSurvey}</Link>
            </Button>
          )}
        </>
      }
    >
      {settings.demo_notice && (
        <div className="flex flex-col gap-1 rounded-md bg-amber-tint p-3 text-amber">
          <p className="font-bold">{t.demoTitle}</p>
          <p>{t.demoBody}</p>
        </div>
      )}
      {survey && (
        <div className="flex flex-col gap-1 rounded-md bg-sun-tint p-3 text-canopy">
          <p className="font-bold">{t.surveyTitle}</p>
          <p>{t.surveyBody}</p>
        </div>
      )}
    </Dialog>
  );
};

export default WelcomeNotice;
