'use client';

import { useAuthStore } from '@/lib/store/auth.store';

export interface CurrentAgence {
  id: string;
  nom: string;
}

export function useCurrentAgence(): CurrentAgence | null {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;
  return { id: user.agence_id, nom: user.agence_nom };
}
