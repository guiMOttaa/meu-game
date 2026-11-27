const CURSOR_GRID = [
  'OO........',
  'OHO.......',
  'OHGO......',
  'OHBGO.....',
  'OHBDGO....',
  'OHBRBGO...',
  'OHBDBBGO..',
  'OHBBDBDGO.',
  'OHGBDBDBGO',
  'OHOBBOOOOO',
  'OO.OBGO...',
  '...ODGO...',
  '....OBGO..',
  '....ODGO..',
  '.....OO...',
];

function renderCursorDataUrl(interactive: boolean): string {
  const scale = 2;
  const cols = CURSOR_GRID[0].length;
  const rows = CURSOR_GRID.length;
  const canvas = document.createElement('canvas');
  canvas.width = cols * scale;
  canvas.height = rows * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const palette: Record<string, string> = interactive
    ? {
        O: '#090b10',
        H: '#fae2a6',
        G: '#dfa84e',
        B: '#6a523b',
        D: '#3b2e22',
        R: '#f2c874',
      }
    : {
        O: '#090b10',
        H: '#e6c580',
        G: '#b88b44',
        B: '#584431',
        D: '#2f251c',
        R: '#c99b4a',
      };

  for (let y = 0; y < rows; y++) {
    const row = CURSOR_GRID[y];
    for (let x = 0; x < cols; x++) {
      const ch = row[x];
      const color = palette[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }

  return canvas.toDataURL('image/png');
}

let initialized = false;

export function initRusticCursors(): void {
  if (initialized || typeof document === 'undefined') return;
  initialized = true;

  const defaultUrl = renderCursorDataUrl(false);
  const pointerUrl = renderCursorDataUrl(true);

  if (defaultUrl) {
    document.documentElement.style.setProperty(
      '--game-cursor-default',
      `url("${defaultUrl}") 2 2, auto`
    );
  }
  if (pointerUrl) {
    document.documentElement.style.setProperty(
      '--game-cursor-pointer',
      `url("${pointerUrl}") 2 2, pointer`
    );
  }
}
