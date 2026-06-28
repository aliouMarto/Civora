'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  email: string;
  nom: string;
  prenom: string;
  role: string;
  agence_id: string;
  agence_nom: string;
  permissions: string[];
}

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  setSession: (accessToken: string, user: AuthUser) => void;
  clearSession: () => void;
  updateAccessToken: (accessToken: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,

      setSession: (accessToken, user) => set({ accessToken, user }),

      clearSession: () => set({ accessToken: null, user: null }),

      updateAccessToken: (accessToken) => set({ accessToken }),
    }),
    {
      name: 'civora-auth',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? window.localStorage : (undefined as unknown as Storage),
      ),
      partialize: (state) => ({ accessToken: state.accessToken, user: state.user }),
    },
  ),
);
