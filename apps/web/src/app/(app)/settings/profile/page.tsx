'use client';

import * as React from 'react';
import { useAuthStore } from '@/lib/store/auth.store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { t } from '@/lib/i18n/config';

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">{t('profile.title')}</h1>
        <p className="mt-1 text-sm text-neutral-500">{t('profile.subtitle')}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Informations personnelles</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              <div className="flex items-center justify-between">
                <dt className="text-sm text-neutral-500">Prénom</dt>
                <dd className="text-sm font-medium text-neutral-900">{user?.prenom ?? '—'}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-sm text-neutral-500">Nom</dt>
                <dd className="text-sm font-medium text-neutral-900">{user?.nom ?? '—'}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-sm text-neutral-500">Email</dt>
                <dd className="text-sm font-medium text-neutral-900">{user?.email ?? '—'}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-sm text-neutral-500">Rôle</dt>
                <dd><Badge>{user?.role ?? '—'}</Badge></dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Agence</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              <div className="flex items-center justify-between">
                <dt className="text-sm text-neutral-500">Agence</dt>
                <dd className="text-sm font-medium text-neutral-900">{user?.agence_nom ?? '—'}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-sm text-neutral-500">ID</dt>
                <dd className="font-mono text-xs text-neutral-500">{user?.agence_id ?? '—'}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
