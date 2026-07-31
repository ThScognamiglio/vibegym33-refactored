import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'glass';
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', children, ...props }, ref) => {
    const variants = {
      default: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 border border-gray-200 dark:border-gray-700',
      primary: 'bg-blue-100 text-blue-800 dark:bg-cyan-900/50 dark:text-cyan-400 border border-blue-200 dark:border-cyan-800',
      success: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400 border border-green-200 dark:border-green-800',
      warning: 'bg-yellow-100 text-yellow-800 dark:bg-amber-900/50 dark:text-amber-400 border border-yellow-200 dark:border-amber-800',
      danger: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-400 border border-red-200 dark:border-red-800',
      glass: 'bg-white/20 dark:bg-gray-800/50 backdrop-blur-md text-gray-900 dark:text-white border border-white/20 shadow-sm',
    };

    return (
      <span
        ref={ref}
        className={twMerge(
          clsx(
            'inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider transition-colors duration-300',
            variants[variant],
            className
          )
        )}
        {...props}
      >
        {children}
      </span>
    );
  }
);
Badge.displayName = 'Badge';
