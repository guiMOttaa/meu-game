export type FacingDir = 'down' | 'up' | 'left' | 'right';
export type PlayerPoseCategory =
  | 'walk'
  | 'talk'
  | 'drawer'
  | 'shelf'
  | 'floor_books'
  | 'tv_crouch';

export interface PlayerSpriteSheet {
  walk: Record<FacingDir, HTMLCanvasElement[]>;
  talk: Record<FacingDir, HTMLCanvasElement[]>;
  drawer: Record<FacingDir, HTMLCanvasElement[]>;
  shelf: Record<FacingDir, HTMLCanvasElement[]>;
  floor_books: Record<FacingDir, HTMLCanvasElement[]>;
  tv_crouch: Record<FacingDir, HTMLCanvasElement[]>;
}

const PALETTE: Record<string, string> = {
  '.': '',
  // Hair & crisp dark pixel outline
  'K': '#0b0d12',
  'H': '#171a22',
  'h': '#2a303d',
  // Skin (sober desaturated tones)
  'S': '#ccb69f',
  's': '#9c8570',
  // Eyes
  'E': '#12151c',
  'W': '#e2d7be', // Pale eerie NPC eye
  // Tailored dark charcoal writer blazer
  'C': '#22262f',
  'c': '#161920',
  'L': '#353c4a', // Blazer lapel highlight
  // Open-collar muted ash-gray writer shirt
  'F': '#b7b1a4',
  'f': '#868176',
  // Dark slate trousers & worn brown leather boots
  'P': '#1c232e',
  'B': '#4c3221',
  // NPC Cloak (darker, weathered & tattered)
  'N': '#151820',
  'n': '#0e1016',
  'M': '#282e3b',
  'G': '#615544',
};

// Canvas is 20x25 with the exact 16x22 classic investigator centered at (+2, +3),
// leaving margin for extended hands and raised arms without clipping.
const CANVAS_W = 20;
const CANVAS_H = 25;
const EMBED_X = 2;
const EMBED_Y = 3;

function buildCanvasFromGrid(
  grid: string[],
  w: number = CANVAS_W,
  h: number = CANVAS_H
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = false;

  const rows = Math.min(h, grid.length);
  for (let y = 0; y < rows; y++) {
    const row = grid[y];
    const cols = Math.min(w, row.length);
    for (let x = 0; x < cols; x++) {
      const color = PALETTE[row[x]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas;
}

function embed16x22(grid16: string[]): string[] {
  const out: string[] = [];
  const blank = '.'.repeat(CANVAS_W);
  for (let i = 0; i < EMBED_Y; i++) out.push(blank);
  for (let y = 0; y < 22; y++) {
    const row = grid16[y] ?? '................';
    out.push('..'.slice(0, EMBED_X) + row.padEnd(16, '.').slice(0, 16) + '..');
  }
  while (out.length < CANVAS_H) out.push(blank);
  return out;
}

function paintGrid(
  base20: string[],
  edits: Array<{ x: number; y: number; ch: string }>
): string[] {
  const chars = base20.map((r) => r.split(''));
  for (const { x, y, ch } of edits) {
    if (y >= 0 && y < chars.length && x >= 0 && x < chars[y].length) {
      chars[y][x] = ch;
    }
  }
  return chars.map((r) => r.join(''));
}

function shiftDown(grid20: string[], offset: number): string[] {
  const blank = '.'.repeat(CANVAS_W);
  const out: string[] = [];
  for (let i = 0; i < offset; i++) out.push(blank);
  for (let i = 0; i < CANVAS_H - offset; i++) {
    out.push(grid20[i] ?? blank);
  }
  return out;
}

function mirrorGrid(grid: string[]): string[] {
  return grid.map((row) => row.split('').reverse().join(''));
}

// ---------------------------------------------------------------------------
// Classic 16x22 Investigator Sprites (Restored v4 design)
// ---------------------------------------------------------------------------
const PLAYER_DOWN_IDLE_16 = [
  '......KKKK......',
  '.....KHHHHK.....',
  '....KHHHHhhK....',
  '....KHHSSHHK....',
  '....KHSSSSHK....',
  '....KSEsSESK....',
  '.....KSSSSK.....',
  '.....KFFfFK.....',
  '....KCLFFLCK....',
  '...KCCLFFLCCK...',
  '...KCCCLfLCCK...',
  '...KCLCCCCLCK...',
  '..KCKCCCCCCKCK..',
  '..KSKCCCCCCKSK..',
  '..KKKccCCccKKK..',
  '....KCCCCCCK....',
  '....KPPccPPK....',
  '....KPP..PPK....',
  '....KPP..PPK....',
  '....KPP..PPK....',
  '....KBB..BBK....',
  '....KKK..KKK....',
];

const PLAYER_DOWN_WALK1_16 = [
  '......KKKK......',
  '.....KHHHHK.....',
  '....KHHHHhhK....',
  '....KHHSSHHK....',
  '....KHSSSSHK....',
  '....KSEsSESK....',
  '.....KSSSSK.....',
  '.....KFFfFK.....',
  '....KCLFFLCK....',
  '..KKCCLFFLCCK...',
  '..KSKCCLfLCCK...',
  '..KKKCLCCCCLCK..',
  '....KCCCCCCKSK..',
  '....KccCCccKKK..',
  '....KCCCCCCK....',
  '....KCCCCCCK....',
  '....KPPccPPK....',
  '....KPP..PPK....',
  '...KPPK..KPPK...',
  '...KBBK...KBBK..',
  '...KKK.....KKK..',
  '................',
];

const PLAYER_DOWN_WALK2_16 = [
  '......KKKK......',
  '.....KHHHHK.....',
  '....KHHHHhhK....',
  '....KHHSSHHK....',
  '....KHSSSSHK....',
  '....KSEsSESK....',
  '.....KSSSSK.....',
  '.....KFFfFK.....',
  '....KCLFFLCK....',
  '...KCCLFFLCCKK..',
  '...KCCCLfLCCKSK.',
  '..KCLCCCCLCKKK..',
  '..KSKCCCCCCK....',
  '..KKKccCCccK....',
  '....KCCCCCCK....',
  '....KCCCCCCK....',
  '....KPPccPPK....',
  '....KPP..PPK....',
  '...KPPK..KPPK...',
  '..KBBK...KBBK...',
  '..KKK.....KKK...',
  '................',
];

const PLAYER_UP_IDLE_16 = [
  '......KKKK......',
  '.....KHHHHK.....',
  '....KHHHHHHK....',
  '....KHHHHhhK....',
  '....KHHHHHHK....',
  '....KHHHHHHK....',
  '.....KHHHHK.....',
  '.....KCCCCK.....',
  '....KCLCCLCK....',
  '...KCCCCCCCCK...',
  '...KCCcCCcCCK...',
  '...KCCCCCCCCK...',
  '..KCKCCCCCCKCK..',
  '..KCKCCCCCCKCK..',
  '..KKKccCCccKKK..',
  '....KCCCCCCK....',
  '....KPPccPPK....',
  '....KPP..PPK....',
  '....KPP..PPK....',
  '....KPP..PPK....',
  '....KBB..BBK....',
  '....KKK..KKK....',
];

const PLAYER_UP_WALK1_16 = [
  '......KKKK......',
  '.....KHHHHK.....',
  '....KHHHHHHK....',
  '....KHHHHhhK....',
  '....KHHHHHHK....',
  '....KHHHHHHK....',
  '.....KHHHHK.....',
  '.....KCCCCK.....',
  '....KCLCCLCK....',
  '..KKCCCCCCCCK...',
  '..KCKCCCCCCCcK..',
  '..KKKCCCCCCCCK..',
  '....KCCCCCCKCK..',
  '....KccCCccKKK..',
  '....KCCCCCCK....',
  '....KCCCCCCK....',
  '....KPPccPPK....',
  '....KPP..PPK....',
  '...KPPK..KPPK...',
  '...KBBK...KBBK..',
  '...KKK.....KKK..',
  '................',
];

const PLAYER_UP_WALK2_16 = [
  '......KKKK......',
  '.....KHHHHK.....',
  '....KHHHHHHK....',
  '....KHHHHhhK....',
  '....KHHHHHHK....',
  '....KHHHHHHK....',
  '.....KHHHHK.....',
  '.....KCCCCK.....',
  '....KCLCCLCK....',
  '...KCCCCCCCCKK..',
  '..KcCCCCCCCCKCK.',
  '..KCCCCCCCCKKK..',
  '..KCKCCCCCCK....',
  '..KKKccCCccK....',
  '....KCCCCCCK....',
  '....KCCCCCCK....',
  '....KPPccPPK....',
  '....KPP..PPK....',
  '...KPPK..KPPK...',
  '..KBBK...KBBK...',
  '..KKK.....KKK...',
  '................',
];

const PLAYER_RIGHT_IDLE_16 = [
  '......KKKK......',
  '.....KHHHHK.....',
  '....KHHHHhhK....',
  '....KHHSSSHK....',
  '....KHHSSESK....',
  '....KHHSSSSK....',
  '.....KSSSSK.....',
  '.....KCFFFK.....',
  '....KCCLFFCK....',
  '....KCCCLFCK....',
  '....KCCCLCCK....',
  '....KCCcLCCK....',
  '....KCCCcCCK....',
  '....KCCCSKK.....',
  '....KccCKK......',
  '....KCCCCCCK....',
  '....KPPccPPK....',
  '.....KPPPK......',
  '.....KPPPK......',
  '.....KPPPK......',
  '.....KBBBK......',
  '.....KKKKK......',
];

const PLAYER_RIGHT_WALK1_16 = [
  '......KKKK......',
  '.....KHHHHK.....',
  '....KHHHHhhK....',
  '....KHHSSSHK....',
  '....KHHSSESK....',
  '....KHHSSSSK....',
  '.....KSSSSK.....',
  '.....KCFFFK.....',
  '....KCCLFFCK....',
  '....KCCCLFCK....',
  '...KCCCCLCCCK...',
  '...KCCcCLCCCK...',
  '..KCKCCCcCCSK...',
  '..KKKccCCccKK...',
  '....KCCCCCCK....',
  '....KCCCCCCK....',
  '....KPPccPPK....',
  '....KPP..PPK....',
  '...KPPK..KPPK...',
  '...KBBK...KBBK..',
  '...KKK.....KKK..',
  '................',
];

const PLAYER_RIGHT_WALK2_16 = [
  '......KKKK......',
  '.....KHHHHK.....',
  '....KHHHHhhK....',
  '....KHHSSSHK....',
  '....KHHSSESK....',
  '....KHHSSSSK....',
  '.....KSSSSK.....',
  '.....KCFFFK.....',
  '....KCCLFFCK....',
  '....KCCCLFCK....',
  '....KCCCLCCKK...',
  '....KCCcLCCSK...',
  '....KCCCcCCKK...',
  '....KccCCccK....',
  '....KCCCCCCK....',
  '....KCCCCCCK....',
  '....KPPccPPK....',
  '....KPP..PPK....',
  '....KPPKKPPK....',
  '....KBBKKBBK....',
  '....KKK..KKK....',
  '................',
];

// Embedded 20x25 base idle grids
const DOWN_IDLE = embed16x22(PLAYER_DOWN_IDLE_16);
const UP_IDLE = embed16x22(PLAYER_UP_IDLE_16);
const RIGHT_IDLE = embed16x22(PLAYER_RIGHT_IDLE_16);

// ---------------------------------------------------------------------------
// Clean Interaction Poses built directly on the classic 16x22 investigator
// ---------------------------------------------------------------------------

// RIGHT profile interactions (LEFT is mirrored)
function buildRightTalk(): [string[], string[]] {
  const mid = paintGrid(RIGHT_IDLE, [
    { x: 12, y: 13, ch: 'C' }, { x: 13, y: 13, ch: 'K' }, { x: 14, y: 13, ch: 'K' },
    { x: 12, y: 14, ch: 'C' }, { x: 13, y: 14, ch: 'S' }, { x: 14, y: 14, ch: 'K' },
    { x: 12, y: 15, ch: 'K' }, { x: 13, y: 15, ch: 'K' },
  ]);
  const full = paintGrid(RIGHT_IDLE, [
    { x: 12, y: 12, ch: 'K' }, { x: 13, y: 12, ch: 'K' }, { x: 14, y: 12, ch: 'K' },
    { x: 12, y: 13, ch: 'C' }, { x: 13, y: 13, ch: 'C' }, { x: 14, y: 13, ch: 'S' }, { x: 15, y: 13, ch: 'S' }, { x: 16, y: 13, ch: 'K' },
    { x: 12, y: 14, ch: 'K' }, { x: 13, y: 14, ch: 'K' }, { x: 14, y: 14, ch: 'K' }, { x: 15, y: 14, ch: 'K' },
  ]);
  return [mid, full];
}

function buildRightDrawer(): [string[], string[]] {
  const reachOut = paintGrid(RIGHT_IDLE, [
    { x: 12, y: 14, ch: 'K' }, { x: 13, y: 14, ch: 'K' }, { x: 14, y: 14, ch: 'K' }, { x: 15, y: 14, ch: 'K' },
    { x: 12, y: 15, ch: 'C' }, { x: 13, y: 15, ch: 'C' }, { x: 14, y: 15, ch: 'S' }, { x: 15, y: 15, ch: 'S' }, { x: 16, y: 15, ch: 'K' },
    { x: 12, y: 16, ch: 'K' }, { x: 13, y: 16, ch: 'K' }, { x: 14, y: 16, ch: 'K' }, { x: 15, y: 16, ch: 'K' },
  ]);
  const pullBack = paintGrid(RIGHT_IDLE, [
    { x: 11, y: 14, ch: 'K' }, { x: 12, y: 14, ch: 'K' }, { x: 13, y: 14, ch: 'K' },
    { x: 11, y: 15, ch: 'C' }, { x: 12, y: 15, ch: 'S' }, { x: 13, y: 15, ch: 'S' }, { x: 14, y: 15, ch: 'K' },
    { x: 11, y: 16, ch: 'K' }, { x: 12, y: 16, ch: 'K' }, { x: 13, y: 16, ch: 'K' },
  ]);
  return [reachOut, pullBack];
}

function buildRightShelf(): [string[], string[]] {
  const lift = paintGrid(RIGHT_IDLE, [
    { x: 13, y: 10, ch: 'K' }, { x: 14, y: 10, ch: 'S' }, { x: 15, y: 10, ch: 'K' },
    { x: 12, y: 11, ch: 'K' }, { x: 13, y: 11, ch: 'C' }, { x: 14, y: 11, ch: 'K' },
    { x: 12, y: 12, ch: 'C' }, { x: 13, y: 12, ch: 'C' }, { x: 14, y: 12, ch: 'K' },
  ]);
  const high = paintGrid(RIGHT_IDLE, [
    { x: 14, y: 4, ch: 'K' }, { x: 15, y: 4, ch: 'S' }, { x: 16, y: 4, ch: 'K' },
    { x: 14, y: 5, ch: 'K' }, { x: 15, y: 5, ch: 'S' }, { x: 16, y: 5, ch: 'K' },
    { x: 14, y: 6, ch: 'K' }, { x: 15, y: 6, ch: 'C' }, { x: 16, y: 6, ch: 'K' },
    { x: 13, y: 7, ch: 'K' }, { x: 14, y: 7, ch: 'C' }, { x: 15, y: 7, ch: 'K' },
    { x: 13, y: 8, ch: 'K' }, { x: 14, y: 8, ch: 'C' }, { x: 15, y: 8, ch: 'K' },
    { x: 12, y: 9, ch: 'K' }, { x: 13, y: 9, ch: 'C' }, { x: 14, y: 9, ch: 'K' },
    { x: 12, y: 10, ch: 'C' }, { x: 13, y: 10, ch: 'C' }, { x: 14, y: 10, ch: 'K' },
    { x: 12, y: 11, ch: 'C' }, { x: 13, y: 11, ch: 'K' },
  ]);
  return [lift, high];
}

function buildRightFloorBooks(): [string[], string[]] {
  const half = shiftDown(RIGHT_IDLE, 1);
  const f1 = paintGrid(half, [
    { x: 12, y: 16, ch: 'K' }, { x: 13, y: 16, ch: 'C' }, { x: 14, y: 16, ch: 'K' },
    { x: 13, y: 17, ch: 'K' }, { x: 14, y: 17, ch: 'S' }, { x: 15, y: 17, ch: 'K' },
  ]);
  const low = shiftDown(RIGHT_IDLE, 2);
  const f2 = paintGrid(low, [
    { x: 12, y: 17, ch: 'K' }, { x: 13, y: 17, ch: 'C' }, { x: 14, y: 17, ch: 'K' },
    { x: 13, y: 18, ch: 'K' }, { x: 14, y: 18, ch: 'C' }, { x: 15, y: 18, ch: 'K' },
    { x: 14, y: 19, ch: 'K' }, { x: 15, y: 19, ch: 'S' }, { x: 16, y: 19, ch: 'K' },
  ]);
  return [f1, f2];
}

// DOWN interactions
function buildDownTalk(): [string[], string[]] {
  const mid = paintGrid(DOWN_IDLE, [
    { x: 14, y: 15, ch: '.' }, { x: 15, y: 15, ch: '.' },
    { x: 14, y: 16, ch: '.' }, { x: 15, y: 16, ch: '.' },
    { x: 14, y: 17, ch: '.' }, { x: 15, y: 17, ch: '.' },
    { x: 14, y: 13, ch: 'C' }, { x: 15, y: 13, ch: 'K' },
    { x: 14, y: 14, ch: 'S' }, { x: 15, y: 14, ch: 'S' }, { x: 16, y: 14, ch: 'K' },
    { x: 14, y: 15, ch: 'K' }, { x: 15, y: 15, ch: 'K' },
  ]);
  const full = paintGrid(DOWN_IDLE, [
    { x: 14, y: 15, ch: '.' }, { x: 15, y: 15, ch: '.' },
    { x: 14, y: 16, ch: '.' }, { x: 15, y: 16, ch: '.' },
    { x: 14, y: 17, ch: '.' }, { x: 15, y: 17, ch: '.' },
    { x: 14, y: 13, ch: 'C' }, { x: 15, y: 13, ch: 'C' }, { x: 16, y: 13, ch: 'K' },
    { x: 14, y: 14, ch: 'C' }, { x: 15, y: 14, ch: 'S' }, { x: 16, y: 14, ch: 'S' }, { x: 17, y: 14, ch: 'K' },
    { x: 14, y: 15, ch: 'K' }, { x: 15, y: 15, ch: 'K' }, { x: 16, y: 15, ch: 'K' },
  ]);
  return [mid, full];
}

function buildDownDrawer(): [string[], string[]] {
  const reachOut = paintGrid(DOWN_IDLE, [
    { x: 14, y: 16, ch: '.' }, { x: 15, y: 16, ch: '.' },
    { x: 14, y: 17, ch: '.' }, { x: 15, y: 17, ch: '.' },
    { x: 14, y: 14, ch: 'C' }, { x: 15, y: 14, ch: 'K' },
    { x: 14, y: 15, ch: 'S' }, { x: 15, y: 15, ch: 'S' }, { x: 16, y: 15, ch: 'K' },
    { x: 14, y: 16, ch: 'K' }, { x: 15, y: 16, ch: 'K' },
  ]);
  const pullBack = paintGrid(DOWN_IDLE, [
    { x: 14, y: 14, ch: 'C' }, { x: 15, y: 14, ch: 'K' },
    { x: 14, y: 15, ch: 'S' }, { x: 15, y: 15, ch: 'K' },
  ]);
  return [reachOut, pullBack];
}

function buildDownShelf(): [string[], string[]] {
  const lift = paintGrid(DOWN_IDLE, [
    { x: 14, y: 15, ch: '.' }, { x: 15, y: 15, ch: '.' },
    { x: 14, y: 16, ch: '.' }, { x: 15, y: 16, ch: '.' },
    { x: 14, y: 17, ch: '.' }, { x: 15, y: 17, ch: '.' },
    { x: 15, y: 7, ch: 'K' }, { x: 16, y: 7, ch: 'S' }, { x: 17, y: 7, ch: 'K' },
    { x: 15, y: 8, ch: 'K' }, { x: 16, y: 8, ch: 'C' }, { x: 17, y: 8, ch: 'K' },
    { x: 14, y: 9, ch: 'K' }, { x: 15, y: 9, ch: 'C' }, { x: 16, y: 9, ch: 'K' },
    { x: 14, y: 10, ch: 'C' }, { x: 15, y: 10, ch: 'C' }, { x: 16, y: 10, ch: 'K' },
  ]);
  const high = paintGrid(DOWN_IDLE, [
    { x: 14, y: 15, ch: '.' }, { x: 15, y: 15, ch: '.' },
    { x: 14, y: 16, ch: '.' }, { x: 15, y: 16, ch: '.' },
    { x: 14, y: 17, ch: '.' }, { x: 15, y: 17, ch: '.' },
    { x: 15, y: 2, ch: 'K' }, { x: 16, y: 2, ch: 'S' }, { x: 17, y: 2, ch: 'K' },
    { x: 15, y: 3, ch: 'K' }, { x: 16, y: 3, ch: 'S' }, { x: 17, y: 3, ch: 'K' },
    { x: 15, y: 4, ch: 'K' }, { x: 16, y: 4, ch: 'C' }, { x: 17, y: 4, ch: 'K' },
    { x: 15, y: 5, ch: 'K' }, { x: 16, y: 5, ch: 'C' }, { x: 17, y: 5, ch: 'K' },
    { x: 15, y: 6, ch: 'K' }, { x: 16, y: 6, ch: 'C' }, { x: 17, y: 6, ch: 'K' },
    { x: 15, y: 7, ch: 'K' }, { x: 16, y: 7, ch: 'C' }, { x: 17, y: 7, ch: 'K' },
    { x: 14, y: 8, ch: 'K' }, { x: 15, y: 8, ch: 'C' }, { x: 16, y: 8, ch: 'K' },
    { x: 14, y: 9, ch: 'C' }, { x: 15, y: 9, ch: 'C' }, { x: 16, y: 9, ch: 'K' },
  ]);
  return [lift, high];
}

function buildDownFloorBooks(): [string[], string[]] {
  const f1 = shiftDown(DOWN_IDLE, 1);
  const f2 = paintGrid(shiftDown(DOWN_IDLE, 2), [
    { x: 14, y: 18, ch: 'C' }, { x: 15, y: 18, ch: 'S' }, { x: 16, y: 18, ch: 'K' },
  ]);
  return [f1, f2];
}

// UP interactions
function buildUpTalk(): [string[], string[]] {
  const mid = paintGrid(UP_IDLE, [
    { x: 14, y: 15, ch: '.' }, { x: 15, y: 15, ch: '.' },
    { x: 14, y: 16, ch: '.' }, { x: 15, y: 16, ch: '.' },
    { x: 14, y: 17, ch: '.' }, { x: 15, y: 17, ch: '.' },
    { x: 15, y: 6, ch: 'K' }, { x: 16, y: 6, ch: 'S' }, { x: 17, y: 6, ch: 'K' },
    { x: 15, y: 7, ch: 'K' }, { x: 16, y: 7, ch: 'C' }, { x: 17, y: 7, ch: 'K' },
    { x: 14, y: 8, ch: 'K' }, { x: 15, y: 8, ch: 'C' }, { x: 16, y: 8, ch: 'K' },
    { x: 14, y: 9, ch: 'C' }, { x: 15, y: 9, ch: 'C' }, { x: 16, y: 9, ch: 'K' },
  ]);
  const full = paintGrid(UP_IDLE, [
    { x: 14, y: 15, ch: '.' }, { x: 15, y: 15, ch: '.' },
    { x: 14, y: 16, ch: '.' }, { x: 15, y: 16, ch: '.' },
    { x: 14, y: 17, ch: '.' }, { x: 15, y: 17, ch: '.' },
    { x: 15, y: 3, ch: 'K' }, { x: 16, y: 3, ch: 'S' }, { x: 17, y: 3, ch: 'K' },
    { x: 15, y: 4, ch: 'K' }, { x: 16, y: 4, ch: 'S' }, { x: 17, y: 4, ch: 'K' },
    { x: 15, y: 5, ch: 'K' }, { x: 16, y: 5, ch: 'C' }, { x: 17, y: 5, ch: 'K' },
    { x: 15, y: 6, ch: 'K' }, { x: 16, y: 6, ch: 'C' }, { x: 17, y: 6, ch: 'K' },
    { x: 15, y: 7, ch: 'K' }, { x: 16, y: 7, ch: 'C' }, { x: 17, y: 7, ch: 'K' },
    { x: 14, y: 8, ch: 'K' }, { x: 15, y: 8, ch: 'C' }, { x: 16, y: 8, ch: 'K' },
    { x: 14, y: 9, ch: 'C' }, { x: 15, y: 9, ch: 'C' }, { x: 16, y: 9, ch: 'K' },
  ]);
  return [mid, full];
}

function buildUpShelf(): [string[], string[]] {
  const [mid] = buildUpTalk();
  const high = paintGrid(UP_IDLE, [
    { x: 14, y: 15, ch: '.' }, { x: 15, y: 15, ch: '.' },
    { x: 14, y: 16, ch: '.' }, { x: 15, y: 16, ch: '.' },
    { x: 14, y: 17, ch: '.' }, { x: 15, y: 17, ch: '.' },
    { x: 15, y: 0, ch: 'K' }, { x: 16, y: 0, ch: 'S' }, { x: 17, y: 0, ch: 'K' },
    { x: 15, y: 1, ch: 'K' }, { x: 16, y: 1, ch: 'S' }, { x: 17, y: 1, ch: 'K' },
    { x: 15, y: 2, ch: 'K' }, { x: 16, y: 2, ch: 'C' }, { x: 17, y: 2, ch: 'K' },
    { x: 15, y: 3, ch: 'K' }, { x: 16, y: 3, ch: 'C' }, { x: 17, y: 3, ch: 'K' },
    { x: 15, y: 4, ch: 'K' }, { x: 16, y: 4, ch: 'C' }, { x: 17, y: 4, ch: 'K' },
    { x: 15, y: 5, ch: 'K' }, { x: 16, y: 5, ch: 'C' }, { x: 17, y: 5, ch: 'K' },
    { x: 15, y: 6, ch: 'K' }, { x: 16, y: 6, ch: 'C' }, { x: 17, y: 6, ch: 'K' },
    { x: 14, y: 7, ch: 'K' }, { x: 15, y: 7, ch: 'C' }, { x: 16, y: 7, ch: 'K' },
    { x: 14, y: 8, ch: 'C' }, { x: 15, y: 8, ch: 'C' }, { x: 16, y: 8, ch: 'K' },
  ]);
  return [mid, high];
}

function buildUpFloorBooks(): [string[], string[]] {
  const f1 = shiftDown(UP_IDLE, 1);
  const f2 = shiftDown(UP_IDLE, 2);
  return [f1, f2];
}

// ---------------------------------------------------------------------------
// CROUCHING / PEEKING UNDER TELEVISION (keeping classic 16x22 boots anchored)
// ---------------------------------------------------------------------------
function buildCrouchSequence(base16: string[]): [string[], string[], string[]] {
  // Compress legs/coat rows so head drops down while boots stay near row 23..24
  const c1 = [
    ...Array(6).fill('....................'),
    ...base16.slice(0, 14).map((r) => '..' + r + '..'),
    '..    KPP..PPK    ..'.replace(/ /g, '.'),
    '..    KBB..BBK    ..'.replace(/ /g, '.'),
    '..    KKK..KKK    ..'.replace(/ /g, '.'),
    '....................',
    '....................',
  ];
  const c2 = [
    ...Array(8).fill('....................'),
    ...base16.slice(0, 12).map((r) => '..' + r + '..'),
    '..   KPPK..KPPK   ..'.replace(/ /g, '.'),
    '..   KBBK..KBBK   ..'.replace(/ /g, '.'),
    '..   KKKK..KKKK   ..'.replace(/ /g, '.'),
    '....................',
    '....................',
  ];
  const cPeek = [
    ...Array(9).fill('....................'),
    ...base16.slice(0, 11).map((r) => '..' + r + '..'),
    '..   KPPK..KPPK   ..'.replace(/ /g, '.'),
    '..   KBBK..KBBK   ..'.replace(/ /g, '.'),
    '..   KKKK..KKKK   ..'.replace(/ /g, '.'),
    '....................',
    '....................',
  ];
  return [c1, c2, cPeek];
}

// ---------------------------------------------------------------------------
// Classic 16x22 Mysterious Cloaked Watcher NPC (Restored v4 design)
// ---------------------------------------------------------------------------
const NPC_IDLE_1_16 = [
  '......KKKK......',
  '.....KNNNNK.....',
  '....KNMMMMNK....',
  '....KNKKKKNK....',
  '....KNKWWKNK....',
  '....KNKKKKNK....',
  '.....KNNNNK.....',
  '....KNGGGGNK....',
  '...KNNMMMMNNK...',
  '...KNNNNNNNNK...',
  '..KNNnNNNNnNNK..',
  '..KNNnNNNNnNNK..',
  '..KNNNNNNNNNNK..',
  '..KnNNNNNNNNnK..',
  '..KnN.NNNN.NnK..',
  '....K.NNNN.K....',
  '....KNN..NNK....',
  '....KNN..NNK....',
  '....Knn..nnK....',
  '....Knn..nnK....',
  '....KBB..BBK....',
  '....KKK..KKK....',
];

const NPC_IDLE_2_16 = [
  '................',
  '......KKKK......',
  '.....KNNNNK.....',
  '....KNMMMMNK....',
  '....KNKKKKNK....',
  '....KNKWWKNK....',
  '....KNKKKKNK....',
  '.....KNNNNK.....',
  '....KNGGGGNK....',
  '...KNNMMMMNNK...',
  '...KNNNNNNNNK...',
  '..KNNnNNNNnNNK..',
  '..KNNnNNNNnNNK..',
  '..KNNNNNNNNNNK..',
  '..KnNNNNNNNNnK..',
  '..KnN.NNNN.NnK..',
  '....K.NNNN.K....',
  '....KNN..NNK....',
  '....KNN..NNK....',
  '....Knn..nnK....',
  '....KBB..BBK....',
  '....KKK..KKK....',
];

let cachedPlayerSheet: PlayerSpriteSheet | null = null;
let cachedNpcFrames: HTMLCanvasElement[] | null = null;

export function getPlayerSpriteSheet(): PlayerSpriteSheet {
  if (cachedPlayerSheet) return cachedPlayerSheet;

  const downIdle = buildCanvasFromGrid(DOWN_IDLE);
  const downW1 = buildCanvasFromGrid(embed16x22(PLAYER_DOWN_WALK1_16));
  const downW2 = buildCanvasFromGrid(embed16x22(PLAYER_DOWN_WALK2_16));

  const upIdle = buildCanvasFromGrid(UP_IDLE);
  const upW1 = buildCanvasFromGrid(embed16x22(PLAYER_UP_WALK1_16));
  const upW2 = buildCanvasFromGrid(embed16x22(PLAYER_UP_WALK2_16));

  const rightIdle = buildCanvasFromGrid(RIGHT_IDLE);
  const rightW1 = buildCanvasFromGrid(embed16x22(PLAYER_RIGHT_WALK1_16));
  const rightW2 = buildCanvasFromGrid(embed16x22(PLAYER_RIGHT_WALK2_16));

  const leftIdle = buildCanvasFromGrid(mirrorGrid(RIGHT_IDLE));
  const leftW1 = buildCanvasFromGrid(mirrorGrid(embed16x22(PLAYER_RIGHT_WALK1_16)));
  const leftW2 = buildCanvasFromGrid(mirrorGrid(embed16x22(PLAYER_RIGHT_WALK2_16)));

  const [rTalk1, rTalk2] = buildRightTalk();
  const [dTalk1, dTalk2] = buildDownTalk();
  const [uTalk1, uTalk2] = buildUpTalk();

  const [rDraw1, rDraw2] = buildRightDrawer();
  const [dDraw1, dDraw2] = buildDownDrawer();
  const [uDraw1, uDraw2] = buildUpTalk();

  const [rShelf1, rShelf2] = buildRightShelf();
  const [dShelf1, dShelf2] = buildDownShelf();
  const [uShelf1, uShelf2] = buildUpShelf();

  const [rFloor1, rFloor2] = buildRightFloorBooks();
  const [dFloor1, dFloor2] = buildDownFloorBooks();
  const [uFloor1, uFloor2] = buildUpFloorBooks();

  const [dC1, dC2, dCP] = buildCrouchSequence(PLAYER_DOWN_IDLE_16);
  const [uC1, uC2, uCP] = buildCrouchSequence(PLAYER_UP_IDLE_16);
  const [rC1, rC2, rCP] = buildCrouchSequence(PLAYER_RIGHT_IDLE_16);

  cachedPlayerSheet = {
    walk: {
      down: [downIdle, downW1, downIdle, downW2],
      up: [upIdle, upW1, upIdle, upW2],
      right: [rightIdle, rightW1, rightIdle, rightW2],
      left: [leftIdle, leftW1, leftIdle, leftW2],
    },
    talk: {
      down: [buildCanvasFromGrid(dTalk1), buildCanvasFromGrid(dTalk2)],
      up: [buildCanvasFromGrid(uTalk1), buildCanvasFromGrid(uTalk2)],
      right: [buildCanvasFromGrid(rTalk1), buildCanvasFromGrid(rTalk2)],
      left: [buildCanvasFromGrid(mirrorGrid(rTalk1)), buildCanvasFromGrid(mirrorGrid(rTalk2))],
    },
    drawer: {
      down: [buildCanvasFromGrid(dDraw1), buildCanvasFromGrid(dDraw2)],
      up: [buildCanvasFromGrid(uDraw1), buildCanvasFromGrid(uDraw2)],
      right: [buildCanvasFromGrid(rDraw1), buildCanvasFromGrid(rDraw2)],
      left: [buildCanvasFromGrid(mirrorGrid(rDraw1)), buildCanvasFromGrid(mirrorGrid(rDraw2))],
    },
    shelf: {
      down: [buildCanvasFromGrid(dShelf1), buildCanvasFromGrid(dShelf2)],
      up: [buildCanvasFromGrid(uShelf1), buildCanvasFromGrid(uShelf2)],
      right: [buildCanvasFromGrid(rShelf1), buildCanvasFromGrid(rShelf2)],
      left: [buildCanvasFromGrid(mirrorGrid(rShelf1)), buildCanvasFromGrid(mirrorGrid(rShelf2))],
    },
    floor_books: {
      down: [buildCanvasFromGrid(dFloor1), buildCanvasFromGrid(dFloor2)],
      up: [buildCanvasFromGrid(uFloor1), buildCanvasFromGrid(uFloor2)],
      right: [buildCanvasFromGrid(rFloor1), buildCanvasFromGrid(rFloor2)],
      left: [buildCanvasFromGrid(mirrorGrid(rFloor1)), buildCanvasFromGrid(mirrorGrid(rFloor2))],
    },
    tv_crouch: {
      down: [buildCanvasFromGrid(dC1), buildCanvasFromGrid(dC2), buildCanvasFromGrid(dCP)],
      up: [buildCanvasFromGrid(uC1), buildCanvasFromGrid(uC2), buildCanvasFromGrid(uCP)],
      right: [buildCanvasFromGrid(rC1), buildCanvasFromGrid(rC2), buildCanvasFromGrid(rCP)],
      left: [
        buildCanvasFromGrid(mirrorGrid(rC1)),
        buildCanvasFromGrid(mirrorGrid(rC2)),
        buildCanvasFromGrid(mirrorGrid(rCP)),
      ],
    },
  };

  return cachedPlayerSheet;
}

export function getNpcSpriteFrames(): HTMLCanvasElement[] {
  if (cachedNpcFrames) return cachedNpcFrames;
  cachedNpcFrames = [
    buildCanvasFromGrid(embed16x22(NPC_IDLE_1_16)),
    buildCanvasFromGrid(embed16x22(NPC_IDLE_2_16)),
  ];
  return cachedNpcFrames;
}

// ---------------------------------------------------------------------------
// Opening Cutscene 20x30 Desk Sleeping & Startled Wake-up Sprites
// ---------------------------------------------------------------------------
const DESK_SLEEP_1_20x30 = [
  '....................',
  '......KKKKKKKK......',
  '.....KHHHHHHHHK.....',
  '....KHHHHhhHHHHK....',
  '...KCCKHHHHHHKCCK...',
  '..KCCCKSHHHHSKCCCK..',
  '..KCCKKSSSSSSKKCCK..',
  '..KCCKCCCCCCCCKCCK..',
  '...KKKCCCLCCCCKKK...',
  '....KCCCCCCCCCCK....',
  '....KCCcCCCCcCCK....',
  '....KCCCCCCCCCCK....',
  '....KCCCCCCCCCCK....',
  '....KCCCCCCCCCCK....',
  '....KCCcCCCCcCCK....',
  '.....KCCCCCCCCK.....',
  '.....KccccccccK.....',
  '.....KCCCCCCCCK.....',
  '.....KPPPPPPPPK.....',
  '.....KPPcPPcPPK.....',
  '.....KPPPKKPPPK.....',
  '.....KPPP..PPPK.....',
  '.....KPPP..PPPK.....',
  '.....KPPP..PPPK.....',
  '.....KBBK..KBBK.....',
  '.....KKKK..KKKK.....',
  '....................',
  '....................',
  '....................',
  '....................',
];

const DESK_SLEEP_2_20x30 = [
  '....................',
  '......KKKKKKKK......',
  '.....KHHHHHHHHK.....',
  '....KHHHHhhHHHHK....',
  '...KCCKHHHHHHKCCK...',
  '..KCCCKSHHHHSKCCCK..',
  '..KCCKKSSSSSSKKCCK..',
  '..KCCKCCCCCCCCKCCK..',
  '...KKKCCCLCCCCKKK...',
  '...KCCCCCCCCCCCCK...',
  '...KCCCcCCCCcCCCK...',
  '...KCCCCCCCCCCCCK...',
  '....KCCCCCCCCCCK....',
  '....KCCCCCCCCCCK....',
  '....KCCcCCCCcCCK....',
  '.....KCCCCCCCCK.....',
  '.....KccccccccK.....',
  '.....KCCCCCCCCK.....',
  '.....KPPPPPPPPK.....',
  '.....KPPcPPcPPK.....',
  '.....KPPPKKPPPK.....',
  '.....KPPP..PPPK.....',
  '.....KPPP..PPPK.....',
  '.....KPPP..PPPK.....',
  '.....KBBK..KBBK.....',
  '.....KKKK..KKKK.....',
  '....................',
  '....................',
  '....................',
  '....................',
];

const DESK_STARTLE_JOLT_20x30 = [
  '....................',
  '........KKKK........',
  '.......KHHHHK.......',
  '......KHHHHhhK......',
  '......KHHSSHHK......',
  '......KWEssEWK......',
  '......KSSEESSK......',
  '.......KSSSSK.......',
  '.......KFFfFK.......',
  '..KK..KCLFFLCK..KK..',
  '.KSK.KCCLFFLCCK.KSK.',
  '.KCCKKCCCLfLCCKKCCK.',
  '..KKKCCCCCCCCCCKKK..',
  '....KCCCCCCCCCCK....',
  '....KccCCCCCCccK....',
  '.....KCCCCCCCCK.....',
  '.....KCCCCCCCCK.....',
  '.....KPPPPPPPPK.....',
  '.....KPPcPPcPPK.....',
  '.....KPPPKKPPPK.....',
  '.....KPPP..PPPK.....',
  '.....KPPP..PPPK.....',
  '.....KPPP..PPPK.....',
  '.....KBBK..KBBK.....',
  '.....KKKK..KKKK.....',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
];

const DESK_STARTLE_LEFT_20x30 = [
  '....................',
  '....................',
  '........KKKK........',
  '.......KHHHHK.......',
  '......KHHHHhhK......',
  '......KHHSSHHK......',
  '......KEWssEWK......',
  '......KSSssSSK......',
  '.......KSSSSK.......',
  '.......KFFfFK.......',
  '......KCLFFLCK......',
  '.....KCCLFFLCCK.....',
  '....KCCCLfLCCCCK....',
  '....KCKCCCCCCKCK....',
  '....KSKCCCCCCKSK....',
  '....KKKccCCccKKK....',
  '.....KCCCCCCCCK.....',
  '.....KPPPPPPPPK.....',
  '.....KPPcPPcPPK.....',
  '.....KPPPKKPPPK.....',
  '.....KPPP..PPPK.....',
  '.....KPPP..PPPK.....',
  '.....KPPP..PPPK.....',
  '.....KBBK..KBBK.....',
  '.....KKKK..KKKK.....',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
];

const DESK_STARTLE_RIGHT_20x30 = [
  '....................',
  '....................',
  '........KKKK........',
  '.......KHHHHK.......',
  '......KHHHHhhK......',
  '......KHHSSHHK......',
  '......KWEssWEK......',
  '......KSSssSSK......',
  '.......KSSSSK.......',
  '.......KFFfFK.......',
  '......KCLFFLCK......',
  '.....KCCLFFLCCK.....',
  '....KCCCCLfLCCCK....',
  '....KCKCCCCCCKCK....',
  '....KSKCCCCCCKSK....',
  '....KKKccCCccKKK....',
  '.....KCCCCCCCCK.....',
  '.....KPPPPPPPPK.....',
  '.....KPPcPPcPPK.....',
  '.....KPPPKKPPPK.....',
  '.....KPPP..PPPK.....',
  '.....KPPP..PPPK.....',
  '.....KPPP..PPPK.....',
  '.....KBBK..KBBK.....',
  '.....KKKK..KKKK.....',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
];

export interface DeskCutsceneFrames {
  sleep: [HTMLCanvasElement, HTMLCanvasElement];
  startleJolt: HTMLCanvasElement;
  startleLeft: HTMLCanvasElement;
  startleRight: HTMLCanvasElement;
}

let cachedDeskCutsceneFrames: DeskCutsceneFrames | null = null;

export function getDeskCutsceneFrames(): DeskCutsceneFrames {
  if (cachedDeskCutsceneFrames) return cachedDeskCutsceneFrames;
  cachedDeskCutsceneFrames = {
    sleep: [
      buildCanvasFromGrid(DESK_SLEEP_1_20x30, 20, 30),
      buildCanvasFromGrid(DESK_SLEEP_2_20x30, 20, 30),
    ],
    startleJolt: buildCanvasFromGrid(DESK_STARTLE_JOLT_20x30, 20, 30),
    startleLeft: buildCanvasFromGrid(DESK_STARTLE_LEFT_20x30, 20, 30),
    startleRight: buildCanvasFromGrid(DESK_STARTLE_RIGHT_20x30, 20, 30),
  };
  return cachedDeskCutsceneFrames;
}

