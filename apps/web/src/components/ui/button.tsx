'use client';

import * as React from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /**
   * Si fourni, remplace l'élément racine `<button>` par cet élément (typiquement
   * `<Link>` Next). Inspiré de l'API shadcn/Radix Slot, version minimaliste : on
   * clone l'enfant et lui passe les classes calculées.
   */
  asChild?: boolean;
}

const variants: Record<Variant, string> = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700 focus-visible:ring-primary-500',
  secondary: 'bg-neutral-100 text-neutral-800 hover:bg-neutral-200 focus-visible:ring-neutral-400',
  ghost: 'text-neutral-600 hover:bg-neutral-100 focus-visible:ring-neutral-400',
  danger: 'bg-danger-600 text-white hover:bg-danger-700 focus-visible:ring-danger-500',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-6 text-base',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, disabled, asChild, className = '', children, ...props }, ref) => {
    const classes = [
      'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
      'disabled:pointer-events-none disabled:opacity-50',
      variants[variant],
      sizes[size],
      className,
    ].join(' ');

    if (asChild && React.isValidElement(children)) {
      // Clone l'enfant (typiquement <Link>) en lui ajoutant les classes calculées.
      const childProps = (children.props ?? {}) as { className?: string };
      return React.cloneElement(children as React.ReactElement<{ className?: string }>, {
        className: `${classes} ${childProps.className ?? ''}`,
      });
    }

    return (
      <button
        ref={ref}
        disabled={disabled ?? loading}
        className={classes}
        {...props}
      >
        {loading && (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';
