import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nurserylink/api-client';
import { loginSchema, toE164UgandaMobile } from '@nurserylink/shared';
import { Button, Field, Input, toast } from '@nurserylink/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import type { z } from 'zod';
import { en } from '../../copy/en';
import { login, requestCode } from './api';
import { AuthCard, FormAlert, PasswordField } from './components';
import { safeNext, withNext } from '@nurserylink/ui';

type Input = z.input<typeof loginSchema>;
type Output = z.output<typeof loginSchema>;

const LoginPage = () => {
  const [params] = useSearchParams();
  const next = params.get('next');
  const location = useLocation();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const sentByGuard = (location.state as { reason?: string } | null)?.reason === 'auth';
  const { register, handleSubmit, getValues, formState: { errors } } = useForm<Input, unknown, Output>({ resolver: zodResolver(loginSchema), mode: 'onTouched' });

  const mutation = useMutation({
    mutationFn: login,
    onSuccess: user => {
      toast.success(en.auth.login.welcomeBack(user.full_name.split(' ')[0] ?? user.full_name));
      void navigate(safeNext(next), { replace: true });
    },
    onError: async err => {
      // Registered but never confirmed the number: send a fresh code and go to the code screen
      if (isApiError(err) && err.code === 'phone_not_verified') {
        const phone = toE164UgandaMobile(getValues('identifier'));
        if (phone) {
          await requestCode(phone).catch((e: unknown) => { console.warn('Could not resend the code', e); });
          toast(en.auth.login.notVerified);
          void navigate(withNext(`/verify?phone=${encodeURIComponent(phone)}`, next));
          return;
        }
      }
      setFormError(isApiError(err) ? err.message : en.states.loadFailed);
    },
  });

  return (
    <AuthCard
      title={en.auth.login.title}
      intro={sentByGuard ? en.auth.signInToContinue : undefined}
      footer={
        <p>
          {en.auth.login.noAccount} <Link to={withNext('/register', next)} className="underline">{en.auth.login.registerLink}</Link>
        </p>
      }
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={e => {
          setFormError(null);
          void handleSubmit(values => { mutation.mutate(values); })(e);
        }}
      >
        {formError && <FormAlert>{formError}</FormAlert>}
        <Field label={en.auth.login.identifierLabel} hint={en.auth.login.identifierHint} error={errors.identifier?.message && 'Enter your phone number or email'}>
          {({ id, describedBy, invalid }) => <Input id={id} autoComplete="username" autoCapitalize="none" aria-describedby={describedBy} invalid={invalid} {...register('identifier')} />}
        </Field>
        <PasswordField label={en.auth.passwordLabel} autoComplete="current-password" error={errors.password?.message && 'Enter your password'} {...register('password')} />
        <Button type="submit" size="lg" block busy={mutation.isPending}>
          {en.auth.login.submit}
        </Button>
        <Link to="/forgot-password" className="flex min-h-11 items-center self-center underline">
          {en.auth.login.forgot}
        </Link>
      </form>
    </AuthCard>
  );
};
export default LoginPage;
