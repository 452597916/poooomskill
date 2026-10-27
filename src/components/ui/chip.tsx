import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import type { ButtonHTMLAttributes } from 'react';

const chip = cva('rounded-full border px-2.5 py-0.5 text-[12px] transition-colors', {
  variants: {
    active: { true: 'border-brand bg-brand text-white', false: 'border-line bg-card text-muted hover:border-brand hover:text-brand' },
  },
  defaultVariants: { active: false },
});

export interface ChipProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof chip> {
  count?: number;
}

export function Chip({ className, active, count, ...props }: ChipProps) {
  return (
    <button className={cn(chip({ active }), className)} {...props}>
      {props.children}
      {typeof count === 'number' && <span className="ml-1 font-mono opacity-70">{count}</span>}
    </button>
  );
}
