'use client';

import * as React from 'react';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  side?: 'left' | 'right';
}

export function Sheet({ open, onClose, children, side = 'left' }: SheetProps) {
  React.useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={[
          'fixed inset-y-0 z-50 flex w-72 flex-col bg-white shadow-xl transition-transform',
          side === 'left' ? 'left-0' : 'right-0',
        ].join(' ')}
      >
        {children}
      </div>
    </>
  );
}
