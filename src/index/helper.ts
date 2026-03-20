export function innerBrackets(e: string): string | null {
  const begin = e.indexOf('(');
  const end = e.lastIndexOf(')');

  if (begin === -1 || end === -1 || begin >= end) return null;
  return e.slice(begin + 1, end);
}

export function multipleColumns(e: string | null | undefined): string[] | null {
  if (!e) return null;
  return e.split(',').map((o) => {
    let col = o;
    if (col.slice(0, 1) === '`') {
      col = col.slice(1);

      if (col.indexOf('`') !== -1) {
        col = col.slice(0, col.indexOf('`'));
      }
    }
    return col.trim();
  });
}

export function firstQuoteValue(e: string): string | null {
  if (e.indexOf('`') === -1) return null;
  const s = e.slice(e.indexOf('`') + 1);
  const closing = s.indexOf('`');
  return closing === -1 ? s : s.slice(0, closing);
}

export function isArrayEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((val, i) => val === b[i]);
}
