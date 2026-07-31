import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md',
  fullWidth = false, 
  isLoading = false,
  className, 
  disabled,
  ...props 
}) => {
  const base = "rounded-xl font-bold transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none relative flex items-center justify-center";
  
  const sizes = {
      sm: "py-2 px-4 text-sm",
      md: "py-3 px-6", // text-base is default
      lg: "py-4 px-8 text-lg"
  };

  const variants = {
    primary: "bg-blue-600 text-white shadow-lg shadow-blue-500/30 hover:bg-blue-700",
    secondary: "bg-gray-800 text-white border border-gray-700 hover:bg-gray-700",
    danger: "bg-red-500 text-white hover:bg-red-600",
    ghost: "bg-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-100"
  };

  return (
    <button 
      className={twMerge(base, sizes[size], variants[variant], fullWidth && "w-full", className)}
      disabled={isLoading || disabled}
      {...props}
    >
      <span className={clsx("flex items-center gap-2", isLoading && "invisible")}>
        {children}
      </span>
      {isLoading && (
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <svg className="animate-spin h-5 w-5 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </span>
      )}
    </button>
  );
};