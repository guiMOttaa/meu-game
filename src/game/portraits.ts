export interface NpcPortraitFrames {
  closed: string;
  halfOpen: string;
  open: string;
}

export interface ProtagonistPortraitFrames {
  idle: string;
  blink: string;
}

const W = 48;
const H = 56;

function makeCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
}

function rect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string
): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function hSpan(ctx: CanvasRenderingContext2D, y: number, x1: number, x2: number, color: string): void {
  if (x2 < x1) return;
  rect(ctx, x1, y, x2 - x1 + 1, 1, color);
}

function applyDarkOutline(ctx: CanvasRenderingContext2D, outlineColor = '#0a0c11'): void {
  const img = ctx.getImageData(0, 0, W, H);
  const src = new Uint8ClampedArray(img.data);
  const isOpaque = (x: number, y: number) => {
    if (x < 0 || x >= W || y < 0 || y >= H) return false;
    return src[(y * W + x) * 4 + 3] > 20;
  };

  ctx.fillStyle = outlineColor;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (isOpaque(x, y)) continue;
      if (
        isOpaque(x - 1, y) ||
        isOpaque(x + 1, y) ||
        isOpaque(x, y - 1) ||
        isOpaque(x, y + 1)
      ) {
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
}

function drawNpcWatcherFrame(mouthState: 'closed' | 'halfOpen' | 'open'): string {
  const [c, ctx] = makeCanvas();

  // Palette for Cloaked Watcher (3/4 facing RIGHT)
  const hoodDark = '#12161e';
  const hoodMid = '#1d2330';
  const hoodLight = '#2b3446';
  const hoodRim = '#3d4961';
  const voidShadow = '#07090d';
  const skinDark = '#6a6056';
  const skinMid = '#8a7c6e';
  const eyeGlow = '#e9dec6';
  const eyeMid = '#b7ab94';
  const brass = '#9c8254';
  const brassHi = '#cbb079';
  const strap = '#2c221b';

  // --- Shoulders & Cloak Bust (rows 33..55) ---
  for (let y = 34; y < H; y++) {
    const t = (y - 34) / (H - 34);
    const leftX = Math.max(5, Math.round(13 - t * 8));
    const rightX = Math.min(41, Math.round(33 + t * 8));
    hSpan(ctx, y, leftX, rightX, hoodDark);
    hSpan(ctx, y, leftX + 2, rightX - 3, hoodMid);
  }

  // Cloak folds & worn shoulder highlights
  rect(ctx, 9, 38, 7, 15, hoodLight);
  rect(ctx, 11, 41, 4, 13, hoodDark);
  rect(ctx, 29, 37, 8, 16, hoodLight);
  rect(ctx, 33, 39, 4, 12, hoodRim);
  rect(ctx, 20, 42, 6, 14, voidShadow);

  // Leather chest strap & tarnished brass clasp
  for (let i = 0; i < 16; i++) {
    rect(ctx, 14 + i, 37 + Math.floor(i * 0.7), 3, 2, strap);
  }
  rect(ctx, 22, 41, 5, 4, brass);
  rect(ctx, 23, 42, 2, 2, brassHi);
  px(ctx, 24, 43, voidShadow);

  // --- Hooded Cowl (rows 5..36) ---
  const hoodRows: Array<[number, number, number]> = [
    [6, 19, 28],
    [7, 17, 30],
    [8, 15, 32],
    [9, 14, 33],
    [10, 13, 34],
    [11, 12, 35],
    [12, 11, 35],
    [13, 11, 36],
    [14, 10, 36],
    [15, 10, 36],
    [16, 10, 36],
    [17, 10, 36],
    [18, 10, 35],
    [19, 10, 35],
    [20, 10, 35],
    [21, 10, 35],
    [22, 11, 35],
    [23, 11, 35],
    [24, 11, 34],
    [25, 12, 34],
    [26, 12, 34],
    [27, 12, 34],
    [28, 13, 33],
    [29, 13, 33],
    [30, 13, 33],
    [31, 14, 32],
    [32, 14, 32],
    [33, 15, 31],
    [34, 16, 30],
  ];

  for (const [y, x1, x2] of hoodRows) {
    hSpan(ctx, y, x1, x2, hoodMid);
    // Rim highlight on top & front edge
    if (y <= 13) hSpan(ctx, y, x1 + 2, x2 - 2, hoodLight);
    if (y <= 9) hSpan(ctx, y, x1 + 4, x2 - 4, hoodRim);
    // Deep fold shading on back
    hSpan(ctx, y, x1, Math.min(x2, x1 + 4), hoodDark);
  }

  // Hood overhang peak & draped folds
  rect(ctx, 18, 10, 12, 3, hoodRim);
  rect(ctx, 12, 19, 4, 11, hoodDark);
  rect(ctx, 16, 27, 4, 8, hoodLight);
  rect(ctx, 28, 11, 5, 4, hoodRim);

  // Deep dark interior recess of the hood
  for (let y = 14; y <= 32; y++) {
    const rx1 = y < 18 ? 19 - (y - 14) : 16;
    const rx2 = y < 20 ? 34 : 33 - Math.floor((y - 20) * 0.2);
    hSpan(ctx, y, rx1, rx2, voidShadow);
  }

  // Subtle lower face / weathered jaw emerging from shadow
  hSpan(ctx, 25, 22, 30, skinDark);
  hSpan(ctx, 26, 21, 31, skinDark);
  hSpan(ctx, 27, 21, 31, skinMid);
  hSpan(ctx, 28, 22, 31, skinMid);
  hSpan(ctx, 29, 22, 30, skinMid);
  hSpan(ctx, 30, 23, 29, skinDark);
  hSpan(ctx, 31, 24, 28, skinDark);

  // Subtle nose bridge in shadow
  rect(ctx, 27, 21, 2, 5, skinDark);
  px(ctx, 28, 24, skinMid);

  // Piercing pale eerie eyes inside hood shadow
  // Left eye (further)
  px(ctx, 21, 20, eyeMid);
  px(ctx, 22, 20, eyeGlow);
  px(ctx, 22, 21, eyeMid);
  // Right eye (closer)
  px(ctx, 29, 20, eyeGlow);
  px(ctx, 30, 20, eyeGlow);
  px(ctx, 29, 21, eyeMid);
  px(ctx, 30, 21, eyeMid);

  // Hood cloth rim framing the face edge on the right
  rect(ctx, 32, 14, 3, 14, hoodLight);
  rect(ctx, 33, 15, 2, 11, hoodRim);

  // Mouth animation frames
  if (mouthState === 'closed') {
    hSpan(ctx, 28, 25, 28, voidShadow);
  } else if (mouthState === 'halfOpen') {
    hSpan(ctx, 28, 25, 28, voidShadow);
    hSpan(ctx, 29, 25, 28, '#2b1918');
  } else {
    hSpan(ctx, 28, 24, 29, voidShadow);
    hSpan(ctx, 29, 24, 29, '#2a1616');
    hSpan(ctx, 30, 25, 28, voidShadow);
    hSpan(ctx, 31, 25, 28, skinDark);
  }

  applyDarkOutline(ctx, '#090b10');
  return c.toDataURL();
}

function drawProtagonistFrame(blink: boolean): string {
  const [c, ctx] = makeCanvas();

  // Palette for Casual-Elegant Writer Protagonist (3/4 facing LEFT toward NPC)
  const hairDeep = '#0f1219';
  const hairBase = '#191d27';
  const hairMid = '#282f3e';
  const hairHi = '#3d475c';
  const skinLight = '#dec6ad';
  const skinMid = '#c9ad91';
  const skinShadow = '#9e8269';
  const eyeDark = '#12161f';
  const eyeWhite = '#ebeef3';
  const shirtHi = '#cfc8ba';
  const shirtMid = '#aba496';
  const shirtDark = '#7d776b';
  const coatHi = '#343b4a';
  const coatMid = '#20252f';
  const coatDark = '#14171e';

  // --- Tailored Blazer & Shoulders Bust (rows 33..55) ---
  for (let y = 34; y < H; y++) {
    const t = (y - 34) / (H - 34);
    const leftX = Math.max(6, Math.round(14 - t * 8));
    const rightX = Math.min(42, Math.round(34 + t * 8));
    hSpan(ctx, y, leftX, rightX, coatMid);
    hSpan(ctx, y, rightX - 5, rightX, coatDark);
  }

  // Open-collar muted ash-gray writer shirt V-placket (rows 31..55)
  for (let y = 32; y < H; y++) {
    const halfW = Math.max(2, Math.round(6 - (y - 32) * 0.2));
    hSpan(ctx, y, 22 - halfW, 22 + halfW, shirtMid);
  }
  rect(ctx, 21, 37, 2, 18, shirtDark);
  px(ctx, 22, 41, shirtHi);
  px(ctx, 22, 46, shirtHi);
  px(ctx, 22, 51, shirtHi);

  // Crisp folded shirt collar points
  rect(ctx, 17, 31, 4, 6, shirtHi);
  rect(ctx, 18, 35, 3, 2, shirtMid);
  rect(ctx, 25, 31, 5, 6, shirtHi);
  rect(ctx, 25, 35, 3, 2, shirtDark);

  // Tailored blazer notched lapels & shoulder tailoring
  rect(ctx, 14, 34, 4, 20, coatHi);
  rect(ctx, 12, 37, 3, 17, coatDark);
  rect(ctx, 26, 34, 5, 20, coatHi);
  rect(ctx, 24, 39, 3, 16, coatDark);
  rect(ctx, 17, 38, 3, 17, coatDark);

  // Neck
  rect(ctx, 20, 29, 7, 4, skinShadow);
  rect(ctx, 21, 29, 4, 3, skinMid);

  // --- Head & Face (rows 11..30) ---
  const faceRows: Array<[number, number, number]> = [
    [13, 16, 30],
    [14, 15, 31],
    [15, 14, 32],
    [16, 14, 32],
    [17, 14, 32],
    [18, 14, 32],
    [19, 14, 32],
    [20, 14, 32],
    [21, 14, 32],
    [22, 15, 31],
    [23, 15, 31],
    [24, 15, 30],
    [25, 16, 30],
    [26, 17, 29],
    [27, 18, 28],
    [28, 19, 27],
  ];
  for (const [y, x1, x2] of faceRows) {
    hSpan(ctx, y, x1, x2, skinMid);
    if (x2 - x1 > 4) {
      hSpan(ctx, y, x1 + 1, x2 - 4, skinLight);
    }
    if (y >= 26) hSpan(ctx, y, x1, x2, skinShadow);
  }
  // Cheek & jaw shadow on right side
  rect(ctx, 27, 19, 4, 7, skinShadow);

  // Ear on right side of head
  rect(ctx, 30, 20, 3, 5, skinMid);
  rect(ctx, 31, 21, 1, 3, skinShadow);

  // Expressive eyes facing left (rows 19..22)
  if (!blink) {
    // Left eye (closer to front edge)
    rect(ctx, 16, 19, 3, 3, eyeWhite);
    rect(ctx, 16, 19, 2, 3, eyeDark);
    px(ctx, 16, 20, '#3a4a66');
    // Right eye
    rect(ctx, 22, 19, 3, 3, eyeWhite);
    rect(ctx, 22, 19, 2, 3, eyeDark);
    px(ctx, 22, 20, '#3a4a66');
  } else {
    hSpan(ctx, 21, 16, 18, eyeDark);
    hSpan(ctx, 21, 22, 24, eyeDark);
  }

  // Serious brow & nose + calm closed mouth
  hSpan(ctx, 18, 15, 18, hairDeep);
  hSpan(ctx, 18, 22, 25, hairDeep);
  px(ctx, 18, 22, skinShadow);
  px(ctx, 18, 23, skinShadow);
  hSpan(ctx, 26, 19, 22, skinShadow);

  // --- Tousled Dark Hair Crown & Bangs (rows 4..24) ---
  const hairMass: Array<[number, number, number]> = [
    [6, 19, 29],
    [7, 16, 31],
    [8, 15, 32],
    [9, 14, 33],
    [10, 13, 34],
    [11, 12, 34],
    [12, 12, 35],
    [13, 12, 35],
    [14, 12, 35],
    [15, 12, 35],
    [16, 28, 35],
    [17, 29, 35],
    [18, 30, 35],
    [19, 31, 34],
    [20, 32, 34],
    [21, 32, 34],
    [22, 31, 33],
  ];
  for (const [y, x1, x2] of hairMass) {
    hSpan(ctx, y, x1, x2, hairBase);
  }

  // Hair spikes on top
  rect(ctx, 22, 4, 3, 3, hairMid);
  rect(ctx, 25, 5, 3, 2, hairHi);
  rect(ctx, 16, 5, 3, 3, hairMid);
  px(ctx, 23, 3, hairHi);
  px(ctx, 17, 4, hairHi);

  // Hair bangs overlapping forehead cleanly
  rect(ctx, 14, 14, 4, 3, hairBase);
  rect(ctx, 18, 14, 4, 4, hairMid);
  rect(ctx, 23, 14, 4, 3, hairBase);
  rect(ctx, 27, 14, 4, 5, hairDeep);

  // Hair highlights & shading bands
  hSpan(ctx, 8, 18, 28, hairMid);
  hSpan(ctx, 9, 19, 27, hairHi);
  hSpan(ctx, 10, 17, 25, hairMid);
  rect(ctx, 31, 12, 3, 9, hairDeep);

  applyDarkOutline(ctx, '#090b10');
  return c.toDataURL();
}

let cachedNpcPortraits: NpcPortraitFrames | null = null;
let cachedProtagonistPortraits: ProtagonistPortraitFrames | null = null;

export function getNpcWatcherPortraits(): NpcPortraitFrames {
  if (cachedNpcPortraits) return cachedNpcPortraits;
  cachedNpcPortraits = {
    closed: drawNpcWatcherFrame('closed'),
    halfOpen: drawNpcWatcherFrame('halfOpen'),
    open: drawNpcWatcherFrame('open'),
  };
  return cachedNpcPortraits;
}

export function getProtagonistPortraits(): ProtagonistPortraitFrames {
  if (cachedProtagonistPortraits) return cachedProtagonistPortraits;
  cachedProtagonistPortraits = {
    idle: drawProtagonistFrame(false),
    blink: drawProtagonistFrame(true),
  };
  return cachedProtagonistPortraits;
}
