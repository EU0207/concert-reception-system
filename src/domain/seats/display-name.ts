import { requireValue } from './validation.ts';

// # 本文：席の表示名の検証と行分け

/** 表示名の文字数を検証し、空白区切りまたは3文字区切りで表示行を作る。 */
export function formatSeatDisplayName(raw: string): {
  raw: string;
  characterCount: number;
  lines: string[];
} {
  requireValue(
    typeof raw === 'string' && !/[\u0000-\u001f\u007f]/u.test(raw),
    'INVALID_DISPLAY_NAME',
  );

  const compact = Array.from(raw.replace(/[ \u3000]/gu, ''));

  requireValue(compact.length <= 6, 'DISPLAY_NAME_TOO_LONG');

  const words = raw.split(/[ \u3000]+/u).filter(Boolean);
  const lines =
    words.length === 2
      ? words
      : compact.length
        ? [compact.slice(0, 3).join(''), compact.slice(3).join('')].filter(Boolean)
        : [];

  return { raw, characterCount: compact.length, lines };
}
