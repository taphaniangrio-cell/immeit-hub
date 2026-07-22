import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full h-10 px-3.5 text-sm rounded-xl border bg-white transition-all duration-200',
            'placeholder:text-slate-400 text-slate-900',
            'border-slate-200 hover:border-slate-300 shadow-xs',
            'focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 focus:outline-none',
            error && 'border-red-500 focus:border-red-500 focus:ring-red-500/10',
            className
          )}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-red-500 font-medium">{error}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, options, placeholder, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">{label}</label>}
        <select
          ref={ref}
          className={cn(
            'w-full h-10 px-3.5 pr-9 text-sm rounded-xl border bg-white transition-all duration-200 appearance-none cursor-pointer text-slate-900 shadow-xs',
            'border-slate-200 hover:border-slate-300',
            'focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 focus:outline-none',
            'bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20width%3D%2712%27%20height%3D%2712%27%20viewBox%3D%270%200%2012%2012%27%3E%3Cpath%20d%3D%27M3%204.5L6%207.5L9%204.5%27%20stroke%3D%27%2364748B%27%20stroke-width%3D%271.5%27%20fill%3D%27none%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27/%3E%3C/svg%3E")] bg-[length:12px] bg-[right_12px_center] bg-no-repeat',
            className
          )}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    );
  }
);
Select.displayName = 'Select';

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string }>(
  ({ className, label, error, id, ...props }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={textareaId} className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            'w-full px-3.5 py-3 text-sm rounded-xl border bg-white transition-all duration-200 resize-y min-h-[90px] shadow-xs text-slate-900',
            'placeholder:text-slate-400',
            'border-slate-200 hover:border-slate-300',
            'focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 focus:outline-none',
            error && 'border-red-500 focus:border-red-500 focus:ring-red-500/10',
            className
          )}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-red-500 font-medium">{error}</p>}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';
