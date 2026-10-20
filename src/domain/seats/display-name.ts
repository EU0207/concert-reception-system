import { requireValue } from './validation.ts';

export function formatSeatDisplayName(raw: string): { raw: string; characterCount: number; lines: string[] } {
  requireValue(typeof raw === 'string' && !/[\u0000-\u001f\u007f]/u.test(raw), 'INVALID_DISPLAY_NAME');
  const compact = Array.from(raw.replace(/[ \u3000]/gu, ''));
  requireValue(compact.length <= 6, 'DISPLAY_NAME_TOO_LONG');
  const words = raw.split(/[ \u3000]+/u).filter(Boolean);
  const lines = words.length === 2 ? words : compact.length ? [compact.slice(0, 3).join(''), compact.slice(3).join('')].filter(Boolean) : [];
  return { raw, characterCount: compact.length, lines };
}
