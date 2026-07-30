// ============================================
// Daya IA — cn() helper
// Une clases condicionalmente y resuelve conflictos de Tailwind.
// Usa clsx + tailwind-merge (ya están en tu package.json).
// ============================================
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
