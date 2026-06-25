import * as React from 'react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-neutral-50 px-4 py-12">
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-600 text-white font-bold text-xl">
          C
        </div>
        <span className="text-xl font-bold text-neutral-900">CIVORA</span>
      </div>
      {children}
    </div>
  );
}
