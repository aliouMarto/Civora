import * as React from 'react';

export function Label({
  children,
  className = '',
  required,
  htmlFor,
}: {
  children: React.ReactNode;
  className?: string;
  required?: boolean;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={`block text-sm font-medium text-neutral-700 ${className}`}
    >
      {children}
      {required ? <span className="ml-0.5 text-red-500">*</span> : null}
    </label>
  );
}
