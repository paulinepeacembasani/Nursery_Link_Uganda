import { zodResolver } from '@hookform/resolvers/zod';
import { serviceRequestCreateSchema, serviceTypes, type ServiceType } from '@nurserylink/shared';
import { Badge, Button, Field, Input, Select, Skeleton, Textarea, formatRelative, toast } from '@nurserylink/ui';
import { LogIn } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation } from 'react-router';
import type { z } from 'zod';
import { en } from '../../copy/en';
import { applyApiError } from '../../lib/forms';
import { useSession } from '../../lib/session';
import { FormAlert } from '../auth/components';
import { useMyServiceRequests, useRequestService, type ServiceRequest } from './api';

type FormInput = z.input<typeof serviceRequestCreateSchema>;
type FormOutput = z.output<typeof serviceRequestCreateSchema>;

const t = en.services.request;

const STATUS_TONE: Record<ServiceRequest['status'], 'neutral' | 'positive' | 'info'> = {
  new: 'neutral',
  contacted: 'info',
  scheduled: 'positive',
  done: 'positive',
  cancelled: 'neutral',
};

const MyRequests = ({ titles }: { titles: Record<ServiceType, string> }) => {
  const mine = useMyServiceRequests(true);
  if (mine.isPending) return <Skeleton className="h-16 rounded-md" />;
  if (!mine.data || mine.data.length === 0) return null;
  return (
    <section aria-labelledby="my-requests" className="flex flex-col gap-2 border-t border-line pt-4">
      <h3 id="my-requests" className="text-lg">{t.mine}</h3>
      <ul className="flex flex-col gap-2">
        {mine.data.map(r => (
          <li key={r.id} className="flex flex-col gap-1 rounded-md bg-mist p-3 ring-1 ring-line">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-canopy">{titles[r.service]}</span>
              <Badge tone={STATUS_TONE[r.status]}>{t.statuses[r.status]}</Badge>
            </div>
            <p className="text-sm text-bark-muted">
              {r.location}
              {r.land_acres !== null && ` · ${t.acresValue(String(r.land_acres))}`} · {t.asked(formatRelative(r.created_at))}
            </p>
            {r.admin_note && <p className="text-sm"><span className="font-bold">{t.teamNote}</span> {r.admin_note}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
};

/** Ask for a tree-planting service: the team phones the buyer back on their account number. */
export const RequestService = ({ chosen, titles }: { chosen: ServiceType | null; titles: Record<ServiceType, string> }) => {
  const { user, restoring } = useSession();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);
  const mutation = useRequestService();
  const { register, handleSubmit, setValue, setError, reset, formState: { errors } } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(serviceRequestCreateSchema),
    mode: 'onTouched',
    defaultValues: { service: chosen ?? 'farm_plan', location: '', notes: '' },
  });

  // Choosing "Ask for this" on a card picks that service here
  useEffect(() => {
    if (chosen) setValue('service', chosen);
  }, [chosen, setValue]);

  return (
    <section id="request" aria-labelledby="request-heading" className="flex scroll-mt-20 flex-col gap-4 rounded-lg bg-paper p-5 shadow-card ring-1 ring-line md:p-6">
      <div className="flex flex-col gap-1">
        <h2 id="request-heading" className="text-2xl">{t.heading}</h2>
        <p className="text-bark-muted">{t.body}</p>
      </div>

      {restoring ? (
        <Skeleton className="h-40 rounded-md" />
      ) : !user ? (
        <>
          <p>{t.signInHint}</p>
          <Button asChild size="lg" className="self-start">
            <Link to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}>
              <LogIn aria-hidden />
              {t.signIn}
            </Link>
          </Button>
        </>
      ) : user.role !== 'buyer' ? (
        <p className="rounded-md bg-amber-tint p-3 text-amber">{t.adminNote}</p>
      ) : (
        <>
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={e => {
              setFormError(null);
              void handleSubmit(values => {
                mutation.mutate(
                  { ...values, notes: values.notes || undefined },
                  {
                    onSuccess: created => {
                      toast.success(t.sent, t.sentBody);
                      // An uncontrolled input is only cleared by '' (undefined keeps what was typed)
                      reset({ service: created.service, location: '', notes: '', land_acres: '' as unknown as undefined });
                    },
                    onError: error => { setFormError(applyApiError(error, setError, ['service', 'location', 'land_acres', 'notes'])); },
                  }
                );
              })(e);
            }}
          >
            {formError && <FormAlert>{formError}</FormAlert>}
            <Field label={t.service} error={errors.service?.message}>
              {({ id, describedBy, invalid }) => (
                <Select id={id} aria-describedby={describedBy} invalid={invalid} {...register('service')}>
                  {serviceTypes.map(type => <option key={type} value={type}>{titles[type]}</option>)}
                </Select>
              )}
            </Field>
            <Field label={t.location} hint={t.locationHint} error={errors.location?.message}>
              {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} invalid={invalid} autoComplete="address-level2" {...register('location')} />}
            </Field>
            <Field label={t.acres} error={errors.land_acres?.message}>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  inputMode="decimal"
                  className="sm:max-w-40"
                  {...register('land_acres', { setValueAs: (v: string) => (v.trim() === '' ? undefined : Number(v.replace(',', '.'))) })}
                />
              )}
            </Field>
            <Field label={t.notes} hint={t.notesHint} error={errors.notes?.message}>
              {({ id, describedBy, invalid }) => <Textarea id={id} aria-describedby={describedBy} invalid={invalid} rows={3} {...register('notes')} />}
            </Field>
            <Button type="submit" size="lg" className="self-start" disabled={mutation.isPending}>
              {t.submit}
            </Button>
          </form>
          <MyRequests titles={titles} />
        </>
      )}
    </section>
  );
};
