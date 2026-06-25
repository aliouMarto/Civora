'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { loginAction, type LoginResult } from '@/app/actions/auth';
import { useAuthStore } from '@/lib/store/auth.store';
import { decodeAccessToken } from '@/lib/auth/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t } from '@/lib/i18n/config';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setSession } = useAuthStore();

  const [state, formAction, isPending] = useActionState<LoginResult | null, FormData>(
    loginAction,
    null,
  );

  React.useEffect(() => {
    if (state?.ok) {
      const payload = decodeAccessToken(state.access_token);
      if (payload) {
        setSession(state.access_token, {
          id: payload.sub,
          email: payload.email,
          nom: payload.nom ?? '',
          prenom: payload.prenom ?? '',
          role: payload.role,
          agence_id: payload.agence_id,
          agence_nom: payload.agence_nom ?? '',
          permissions: payload.permissions ?? [],
        });
      }
      const from = searchParams.get('from') ?? '/dashboard';
      router.replace(from);
    }
  }, [state, router, searchParams, setSession]);

  const errorMsg = state && !state.ok ? t(state.error) : null;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white px-8 py-10 shadow-sm">
      <h1 className="text-xl font-bold text-neutral-900">{t('auth.login.title')}</h1>
      <p className="mt-1 text-sm text-neutral-500">{t('auth.login.subtitle')}</p>

      <form action={formAction} className="mt-6 flex flex-col gap-4">
        {errorMsg && (
          <div className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-600">
            {errorMsg}
          </div>
        )}

        <Input
          label={t('auth.login.email')}
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="directeur@agence.ci"
        />

        <Input
          label={t('auth.login.password')}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
        />

        <Button type="submit" loading={isPending} className="mt-2 w-full">
          {isPending ? t('auth.login.submitting') : t('auth.login.submit')}
        </Button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="w-full max-w-sm">
      <React.Suspense fallback={<div className="h-72 rounded-2xl bg-white animate-pulse" />}>
        <LoginForm />
      </React.Suspense>
    </div>
  );
}
