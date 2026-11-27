/**
 * Modular pre-baked pixel-art texture & pattern generators for the 2.5D dark study
 * and stone corridor rework. Keeps 60fps performance crisp with zero per-frame allocations.
 */

export interface EnvironmentPatterns {
  woodPattern: CanvasPattern | null;
  stonePattern: CanvasPattern | null;
  plasterPattern: CanvasPattern | null;
  brickPattern: CanvasPattern | null;
}

function hash2d(x: number, y: number, seed = 1337): number {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function createWoodPlankTile(): HTMLCanvasElement {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.imageSmoothingEnabled = false;

  const plankH = 16;
  const rows = size / plankH;
  const boardTones = ['#221812', '#261b14', '#1f1510', '#291e16', '#241913'];

  for (let r = 0; r < rows; r++) {
    const py = r * plankH;
    const stagger = ((r * 37) % 64) + 16;

    // Two planks per row horizontally
    const splits = [0, stagger, size];
    for (let s = 0; s < splits.length - 1; s++) {
      const x0 = splits[s];
      const w = splits[s + 1] - x0;
      const base = boardTones[(r * 3 + s * 2) % boardTones.length];

      ctx.fillStyle = base;
      ctx.fillRect(x0, py, w, plankH);

      // Subtle top bevel & bottom shadow per plank
      ctx.fillStyle = 'rgba(255, 224, 185, 0.035)';
      ctx.fillRect(x0, py + 1, w, 1);

      // Aged wood grain pixels & streaks
      for (let gx = x0 + 2; gx < x0 + w - 2; gx += 2) {
        const h = hash2d(gx, py, r * 19 + s);
        if (h > 0.62) {
          const gy = py + 2 + Math.floor(hash2d(gx, py + 3, 7) * (plankH - 5));
          const len = 4 + Math.floor(h * 10);
          ctx.fillStyle = h > 0.84 ? 'rgba(12, 8, 5, 0.45)' : 'rgba(62, 44, 31, 0.24)';
          ctx.fillRect(gx, gy, Math.min(len, x0 + w - gx - 1), 1);
        }
      }

      // Occasional knot mark
      if (hash2d(r, s, 91) > 0.55 && w > 24) {
        const kx = x0 + 12 + Math.floor(hash2d(r, s, 43) * (w - 24));
        const ky = py + 5 + Math.floor(hash2d(r, s, 55) * 6);
        ctx.fillStyle = '#140d09';
        ctx.fillRect(kx, ky, 3, 2);
        ctx.fillStyle = 'rgba(72, 52, 36, 0.32)';
        ctx.fillRect(kx - 1, ky, 1, 2);
      }

      // Iron nail heads at board ends
      if (w > 12) {
        ctx.fillStyle = '#110c09';
        ctx.fillRect(x0 + 3, py + 3, 2, 2);
        ctx.fillRect(x0 + 3, py + plankH - 5, 2, 2);
      }

      // Vertical plank joint seam
      if (s > 0) {
        ctx.fillStyle = '#100b08';
        ctx.fillRect(x0, py, 1, plankH);
      }
    }

    // Horizontal plank seam
    ctx.fillStyle = '#0f0a07';
    ctx.fillRect(0, py + plankH - 1, size, 1);
  }

  return c;
}

function createStoneFlagstoneTile(): HTMLCanvasElement {
  const size = 108;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.imageSmoothingEnabled = false;

  // Deep mortar base
  ctx.fillStyle = '#0d1016';
  ctx.fillRect(0, 0, size, size);

  const tile = 36;
  const cols = size / tile;
  const rows = size / tile;
  const slateShades = ['#181e27', '#151a22', '#1b212b', '#141920', '#1a2029'];

  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const tx = col * tile;
      const ty = r * tile;
      const shade = slateShades[(r * 7 + col * 11) % slateShades.length];

      ctx.fillStyle = shade;
      ctx.fillRect(tx + 1, ty + 1, tile - 2, tile - 2);

      // Top-left worn highlight edge
      ctx.fillStyle = 'rgba(130, 152, 182, 0.06)';
      ctx.fillRect(tx + 2, ty + 2, tile - 4, 1);
      ctx.fillRect(tx + 2, ty + 2, 1, tile - 4);

      // Bottom-right shadow bevel
      ctx.fillStyle = 'rgba(6, 8, 12, 0.42)';
      ctx.fillRect(tx + 2, ty + tile - 3, tile - 4, 1);

      // Pixel pitting & damp weathering
      for (let i = 0; i < 9; i++) {
        const rx = tx + 3 + Math.floor(hash2d(col * 13 + i, r * 17, 11) * (tile - 7));
        const ry = ty + 3 + Math.floor(hash2d(col * 13, r * 17 + i, 29) * (tile - 7));
        ctx.fillStyle = i % 2 === 0 ? 'rgba(9, 12, 17, 0.42)' : 'rgba(90, 108, 132, 0.07)';
        ctx.fillRect(rx, ry, i % 3 === 0 ? 2 : 1, 1);
      }

      // Hairline fracture on some flagstones
      if (hash2d(col, r, 73) > 0.58) {
        const cx = tx + 10;
        const cy = ty + 11;
        ctx.fillStyle = '#0e1218';
        ctx.fillRect(cx, cy, 5, 1);
        ctx.fillRect(cx + 4, cy + 1, 4, 1);
        ctx.fillRect(cx + 7, cy + 2, 3, 1);
      }
    }
  }

  return c;
}

function createPlasterWallTile(): HTMLCanvasElement {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = '#1e2530';
  ctx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const n = hash2d(x, y, 404);
      if (n > 0.72) {
        ctx.fillStyle = 'rgba(11, 15, 21, 0.35)';
        ctx.fillRect(x, y, 2, 2);
      } else if (n < 0.16) {
        ctx.fillStyle = 'rgba(72, 88, 110, 0.14)';
        ctx.fillRect(x, y, 2, 1);
      }
    }
  }
  return c;
}

function createBrickWallTile(): HTMLCanvasElement {
  const w = 48;
  const h = 32;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = '#0f1218';
  ctx.fillRect(0, 0, w, h);

  const brickH = 8;
  const brickW = 16;
  const tones = ['#23262e', '#1e222a', '#282528', '#1b1f27'];

  for (let r = 0; r < h / brickH; r++) {
    const offset = (r % 2) * (brickW / 2);
    for (let bx = -brickW; bx < w + brickW; bx += brickW) {
      const tone = tones[(r * 5 + Math.abs(bx)) % tones.length];
      ctx.fillStyle = tone;
      ctx.fillRect(bx + offset + 1, r * brickH + 1, brickW - 2, brickH - 2);
      ctx.fillStyle = 'rgba(130, 145, 165, 0.07)';
      ctx.fillRect(bx + offset + 1, r * brickH + 1, brickW - 2, 1);
    }
  }

  return c;
}

let cachedPatterns: EnvironmentPatterns | null = null;

export function getEnvironmentPatterns(ctx: CanvasRenderingContext2D): EnvironmentPatterns {
  if (cachedPatterns) return cachedPatterns;
  cachedPatterns = {
    woodPattern: ctx.createPattern(createWoodPlankTile(), 'repeat'),
    stonePattern: ctx.createPattern(createStoneFlagstoneTile(), 'repeat'),
    plasterPattern: ctx.createPattern(createPlasterWallTile(), 'repeat'),
    brickPattern: ctx.createPattern(createBrickWallTile(), 'repeat'),
  };
  return cachedPatterns;
}
