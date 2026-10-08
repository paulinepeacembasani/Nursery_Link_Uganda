import { zodResolver } from '@hookform/resolvers/zod';
import { feedbackCreateSchema, feedbackKinds } from '@nurserylink/shared';
import { Button, Field, Input, Textarea, cn } from '@nurserylink/ui';
import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router';
import type { z } from 'zod';
import { PageHero } from '../components/PageHero';
import { usePageTitle } from '../components/usePageTitle';
import { en } from '../copy/en';
import { FormAlert } from '../features/auth/components';
import { useSendFeedback, useSiteSettings } from '../features/feedback/api';
import { applyApiError } from '../lib/forms';
import { useSession } from '../lib/session';

type FormInput = z.input<typeof feedbackCreateSchema>;
type FormOutput = z.output<typeof feedbackCreateSchema>;

const t = en.feedback;

/** A site path the person came from (?from=/nurseries), kept only if it looks like one. */
const fromPath = (raw: string | null) => (raw && /^\/[^\s]*$/.test(raw) && raw.length <= 200 ? raw : undefined);

/** Feedback from anyone, signed in or not (FR: ongoing feedback mechanism). */
const Feedback = () => {
  usePageTitle(t.title);
  const [params] = useSearchParams();
  const { user } = useSession();
  const site = useSiteSettings();
  const mutation = useSendFeedback();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, reset, control, formState: { errors } } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(feedbackCreateSchema),
    mode: 'onTouched',
    defaultValues: { kind: 'experience', message: '', name: '', contact: '' },
  });
  const kind = useWatch({ control, name: 'kind' });
  const surveyUrl = site.data?.survey_url ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHero title={t.title} intro={t.intro} photo="community-planting" />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section aria-label={t.title} className="flex flex-col gap-4 rounded-lg bg-paper p-5 shadow-card ring-1 ring-line md:p-6">
          {mutation.isSuccess ? (
            <div role="status" className="flex flex-col items-start gap-3">
              <CheckCircle2 aria-hidden className="size-10 text-forest" />
              <h2 className="text-2xl">{t.sent}</h2>
              <p>{t.sentBody}</p>
              <Button variant="secondary" onClick={() => { mutation.reset(); reset(); }}>{t.another}</Button>
            </div>
          ) : (
            <form
              noValidate
              className="flex flex-col gap-4"
              onSubmit={e => {
                setFormError(null);
                void handleSubmit(values => {
                  mutation.mutate(
                    { ...values, name: values.name || undefined, contact: values.contact || undefined, page: fromPath(params.get('from')) },
                    { onError: error => { setFormError(applyApiError(error, setError, ['kind', 'message', 'name', 'contact'])); } }
                  );
                })(e);
              }}
            >
              {formError && <FormAlert>{formError}</FormAlert>}
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 font-bold text-bark">{t.kind}</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {feedbackKinds.map(k => (
                    <label key={k} className={cn('flex cursor-pointer items-start gap-3 rounded-lg bg-paper p-3 ring-1', kind === k ? 'ring-2 ring-forest' : 'ring-line hover:ring-forest')}>
                      <input type="radio" value={k} {...register('kind')} className="mt-1 size-5 shrink-0 accent-forest" />
                      <span className="flex flex-col">
                        <span className="font-bold text-canopy">{t.kinds[k].title}</span>
                        <span className="text-sm text-bark-muted">{t.kinds[k].hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <Field label={t.message} hint={t.messageHint} error={errors.message?.message}>
                {({ id, describedBy, invalid }) => <Textarea id={id} aria-describedby={describedBy} invalid={invalid} rows={6} {...register('message')} />}
              </Field>
              {user ? (
                <p className="text-sm text-bark-muted">{t.signedInAs(user.full_name)}</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t.name} error={errors.name?.message}>
                    {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} invalid={invalid} autoComplete="name" {...register('name')} />}
                  </Field>
                  <Field label={t.contact} hint={t.contactHint} error={errors.contact?.message}>
                    {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} invalid={invalid} autoComplete="tel" {...register('contact')} />}
                  </Field>
                </div>
              )}
              <Button type="submit" size="lg" className="self-start" disabled={mutation.isPending}>{t.submit}</Button>
            </form>
          )}
        </section>

        {surveyUrl && (
          <aside className="flex flex-col items-start gap-3 self-start rounded-lg bg-sun-tint p-5 ring-1 ring-line">
            <h2 className="text-xl">{en.survey.title}</h2>
            <p>{t.surveyCta}</p>
            <Button asChild variant="gift"><Link to="/survey">{en.welcome.takeSurvey}</Link></Button>
          </aside>
        )}
      </div>
    </div>
  );
};

export default Feedback;
