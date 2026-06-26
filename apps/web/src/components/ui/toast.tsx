'use client';

import * as React from 'react';

export type ToastVariant = 'default' | 'success' | 'error' | 'warning';

interface Toast {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (input: { title: string; description?: string; variant?: ToastVariant }) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const toast = React.useCallback(
    ({ title, description, variant = 'default' }: { title: string; description?: string; variant?: ToastVariant }) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, title, description, variant }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4_000);
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto rounded-lg border bg-white p-3 shadow-lg ring-1 ${
              t.variant === 'success'
                ? 'border-emerald-200 ring-emerald-100'
                : t.variant === 'error'
                  ? 'border-red-200 ring-red-100'
                  : t.variant === 'warning'
                    ? 'border-orange-200 ring-orange-100'
                    : 'border-neutral-200 ring-neutral-100'
            }`}
          >
            <div className="text-sm font-medium text-neutral-900">{t.title}</div>
            {t.description ? (
              <div className="mt-0.5 text-xs text-neutral-600">{t.description}</div>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
