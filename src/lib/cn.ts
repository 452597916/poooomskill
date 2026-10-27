import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** 合并 class：先人写、后覆盖，避免长串 className 互相打架 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
