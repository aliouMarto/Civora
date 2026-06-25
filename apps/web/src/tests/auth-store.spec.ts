import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '@/lib/store/auth.store';

const MOCK_USER = {
  id: 'user-1',
  email: 'admin@agence.ci',
  nom: 'Diallo',
  prenom: 'Mariama',
  role: 'directeur',
  agence_id: 'agence-abc',
  agence_nom: 'Agence ABC',
  permissions: ['*:*'],
};

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.getState().clearSession();
  });

  it('démarre sans session', () => {
    const { accessToken, user } = useAuthStore.getState();
    expect(accessToken).toBeNull();
    expect(user).toBeNull();
  });

  it('setSession stocke le token et l\'utilisateur', () => {
    useAuthStore.getState().setSession('tok123', MOCK_USER);
    const { accessToken, user } = useAuthStore.getState();
    expect(accessToken).toBe('tok123');
    expect(user?.email).toBe('admin@agence.ci');
  });

  it('clearSession efface tout', () => {
    useAuthStore.getState().setSession('tok123', MOCK_USER);
    useAuthStore.getState().clearSession();
    const { accessToken, user } = useAuthStore.getState();
    expect(accessToken).toBeNull();
    expect(user).toBeNull();
  });

  it('updateAccessToken ne touche pas user', () => {
    useAuthStore.getState().setSession('old-tok', MOCK_USER);
    useAuthStore.getState().updateAccessToken('new-tok');
    const { accessToken, user } = useAuthStore.getState();
    expect(accessToken).toBe('new-tok');
    expect(user?.id).toBe('user-1');
  });
});
