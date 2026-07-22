import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline' | 'gradient';
type Size = 'sm' | 'md' | 'lg';

const variantStyles: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-dark shadow-sm hover:shadow-md hover:shadow-primary/25 active:scale-[0.98]',
  gradient: 'bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-700 text-white shadow-md shadow-indigo-500/25 hover:shadow-lg hover:shadow-indigo-500/35 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99]',
  secondary: 'bg-white text-text-primary border border-border hover:bg-surface-hover hover:border-slate-300 shadow-xs active:scale-[0.98]',
  outline: 'bg-transparent text-text-primary border border-slate-300 hover:bg-primary-50 hover:border-primary hover:text-primary transition-all active:scale-[0.98]',
  ghost: 'text-text-secondary hover:bg-surface-hover hover:text-text-primary active:scale-[0.98]',
  danger: 'bg-danger text-white hover:bg-red-600 shadow-xs shadow-red-500/20 active:scale-[0.98]',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs shadow-emerald-500/20 active:scale-[0.98]',
};

const sizeStyles: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg font-medium',
  md: 'h-9.5 px-4 text-sm gap-2 rounded-xl font-semibold',
  lg: 'h-11 px-5 text-sm gap-2.5 rounded-xl font-semibold',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center font-sans transition-all duration-200 ease-out',
          'disabled:opacity-50 disabled:pointer-events-none disabled:transform-none',
          'cursor-pointer select-none tracking-tight',
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {loading && (
          <svg className="animate-spin -ml-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
