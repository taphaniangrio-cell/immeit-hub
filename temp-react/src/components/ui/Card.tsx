import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  hover?: boolean;
  selected?: boolean;
  glass?: boolean;
}

export function Card({ className, children, hover, selected, glass, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border transition-all duration-200 ease-out',
        glass ? 'glass-card' : 'bg-surface-elevated border-slate-200/80 shadow-sm',
        hover && 'glow-card hover:border-indigo-500/30 cursor-pointer',
        selected && 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-md',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-6 py-4.5 border-b border-slate-100', className)} {...props}>
      {children}
    </div>
  );
}

export function CardContent({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-6 py-5', className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl', className)} {...props}>
      {children}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center glass-card rounded-2xl">
      {icon && <div className="mb-4 text-indigo-500/80 p-3 bg-indigo-50 rounded-2xl">{icon}</div>}
      <h3 className="text-base font-bold text-slate-900 mb-1">{title}</h3>
      {description && <p className="text-sm text-slate-500 max-w-sm mb-5 leading-relaxed">{description}</p>}
      {action}
    </div>
  );
}
