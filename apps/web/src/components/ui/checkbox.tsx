import * as React from 'react';

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox({ className = '', ...props }, ref) {
    return (
      <input
        ref={ref}
        type="checkbox"
        className={`h-4 w-4 rounded border-neutral-300 text-primary-600 focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 ${className}`}
        {...props}
      />
    );
  },
);
