import { cva } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import { BrandMark } from './brand';
import type { StateResponse } from '../../api';

const bar = cva('mt-10 border-t border-line bg-surface/60');
const inner = cva('mx-auto flex w-full max-w-[1240px] flex-wrap items-center gap-x-3 gap-y-1 px-5 py-4 text-[11.5px] text-muted');
const item = cva('inline-flex items-center gap-1.5');
const link = cva('text-brand hover:underline');

export interface FooterProps {
  state: Pick<StateResponse, 'product' | 'version' | 'publisher' | 'homepage' | 'contact' | 'copyright' | 'runtime'>;
  className?: string;
}

/** 全站页脚：展示版权、官网与联系方式（万智云集） */
export function Footer({ state, className }: FooterProps) {
  return (
    <footer className={cn(bar(), className)}>
      <div className={cn(inner())}>
        <span className={cn(item(), 'font-medium text-ink')}>
          <BrandMark size="sm" />
          {state.product} <span className="font-mono">v{state.version}</span>
        </span>
        <span className={cn(item())}>·</span>
        <span className={cn(item())}>{state.publisher}</span>
        <span className={cn(item())}>·</span>
        <span className={cn(item())}>
          <a className={cn(link())} href={state.homepage} target="_blank" rel="noreferrer">{state.homepage}</a>
        </span>
        <span className={cn(item())}>·</span>
        <span className={cn(item())}>
          <a className={cn(link())} href={`mailto:${state.contact}`}>{state.contact}</a>
        </span>
        <span className={cn(item(), 'ml-auto')}>{state.copyright}</span>
        <span className={cn(item())}>·</span>
        <span className={cn(item())}>{state.runtime}</span>
      </div>
    </footer>
  );
}