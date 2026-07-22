import { cn } from '../../lib/utils';

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'muted';

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-slate-100 text-slate-700 border border-slate-200/60',
  primary: 'bg-indigo-50 text-indigo-700 border border-indigo-200/60 font-semibold',
  success: 'bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-semibold',
  warning: 'bg-amber-50 text-amber-800 border border-amber-200/60 font-semibold',
  danger: 'bg-rose-50 text-rose-700 border border-rose-200/60 font-semibold',
  muted: 'bg-slate-100/80 text-slate-600 border border-slate-200/50',
};

const dotColors: Record<BadgeVariant, string> = {
  default: 'bg-slate-400',
  primary: 'bg-indigo-600 pulse-dot',
  success: 'bg-emerald-500 pulse-dot',
  warning: 'bg-amber-500 pulse-dot',
  danger: 'bg-rose-500 pulse-dot',
  muted: 'bg-slate-400',
};

interface BadgeProps {
  variant?: BadgeVariant;
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = 'default', dot, children, className }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-sans transition-all duration-150',
      variantStyles[variant],
      className
    )}>
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotColors[variant])} />}
      {children}
    </span>
  );
}

const statusConfig: Record<string, { label: string; variant: BadgeVariant }> = {
  brouillon: { label: 'Brouillon', variant: 'muted' },
  en_revision: { label: 'En révision', variant: 'primary' },
  valide: { label: 'Validé', variant: 'success' },
  publie: { label: 'Publié', variant: 'warning' },
  archive: { label: 'Archivé', variant: 'danger' },
};

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || { label: status, variant: 'default' as BadgeVariant };
  return (
    <Badge variant={config.variant} dot>
      {config.label}
    </Badge>
  );
}
