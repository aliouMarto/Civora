'use client';

import * as React from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { Providers } from '@/components/providers';
import { useCurrentAgence } from '@/hooks/use-current-agence';

function AppShell({ children }: { children: React.ReactNode }) {
  const agence = useCurrentAgence();

  return (
    <div className="flex h-full">
      <Sidebar agenceNom={agence?.nom} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto bg-neutral-50 p-6">{children}</main>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <AppShell>{children}</AppShell>
    </Providers>
  );
}
