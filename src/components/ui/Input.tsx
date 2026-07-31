import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const fallbackId = React.useId();
    const inputId = id || fallbackId;

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label htmlFor={inputId} className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={twMerge(
            clsx(
              'w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-950/50 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:focus:ring-cyan-500/50 focus:border-blue-500 dark:focus:border-cyan-500 transition-all duration-300',
              error && 'border-red-500 dark:border-red-500 focus:ring-red-500/50 dark:focus:ring-red-500/50 focus:border-red-500',
              className
            )
          )}
          {...props}
        />
        {error && (
          <span className="text-xs font-medium text-red-500 mt-0.5">{error}</span>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';
