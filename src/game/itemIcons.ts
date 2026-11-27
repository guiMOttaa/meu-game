import { InventoryItemId } from './types';

const ICON_SIZE = 24;

function makeIconCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = ICON_SIZE;
  c.height = ICON_SIZE;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  grid: string[],
  palette: Record<string, string>,
  offsetX = 0,
  offsetY = 0
): void {
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y];
    for (let x = 0; x < row.length; x++) {
      const color = palette[row[x]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x + offsetX, y + offsetY, 1, 1);
    }
  }
}

function createFlashlightIcon(): string {
  const [c, ctx] = makeIconCanvas();
  const palette: Record<string, string> = {
    '.': '',
    K: '#090b10',
    M: '#3b4250', // Dark gunmetal body
    m: '#232833',
    H: '#6b7588', // Metal specular
    B: '#8e6c36', // Tarnished brass ring / switch
    b: '#5c4420',
    L: '#f2d99b', // Warm lens glass
    l: '#c49d56',
  };

  const grid = [
    '........................',
    '................KKKK....',
    '...............KLLLLK...',
    '..............KLLLLLLK..',
    '.............KLlLLLLLLK.',
    '............KBBLLLLLLK..',
    '...........KMMBBLLlLK...',
    '..........KMHHMBBBBK....',
    '.........KMHHMMmmBK.....',
    '........KMHHMMmmK.......',
    '.......KMHHMMmmK........',
    '......KMBBMMmmK.........',
    '.....KMHHMMmmK..........',
    '....KMHHMMmmK...........',
    '...KMHHMMmmK............',
    '..KBBHMMmmK.............',
    '..KbbMmmKK..............',
    '...KKKKK................',
    '........................',
    '........................',
  ];

  drawGrid(ctx, grid, palette, 0, 2);
  return c.toDataURL();
}

function createBrassKeyIcon(): string {
  const [c, ctx] = makeIconCanvas();
  const palette: Record<string, string> = {
    '.': '',
    K: '#0c0907',
    G: '#d8ab54', // Bright aged brass
    g: '#a27a34', // Mid brass
    d: '#664a1c', // Dark shadow brass
    H: '#f5dc99', // Rim gleam
  };

  const grid = [
    '........................',
    '...............KKKKK....',
    '..............KHHHHGK...',
    '.............KHGKKKGGK..',
    '.............KGK...KGGK.',
    '.............KGK...KdgK.',
    '.............KdgKKKdGK..',
    '............KdGGGGdgK...',
    '...........KdGGgddKK....',
    '..........KdGGgdK.......',
    '.........KdGGgdK........',
    '........KdGGgdK.........',
    '.......KdGGgdK..........',
    '......KdGGgdK...........',
    '.....KdGGgdGGK..........',
    '....KdGGgdKGgK..........',
    '...KdGGgdKKdGK..........',
    '...KdGGdKKGGGgK.........',
    '....KKK..KddKK..........',
    '........................',
  ];

  drawGrid(ctx, grid, palette, 0, 2);
  return c.toDataURL();
}

function createBackpackIcon(): string {
  const [c, ctx] = makeIconCanvas();
  const palette: Record<string, string> = {
    '.': '',
    K: '#090b10',
    C: '#4d4133', // Weathered canvas body
    c: '#352c22', // Shadowed canvas
    H: '#6b5b47', // Canvas highlight
    L: '#2b1c14', // Dark leather straps
    B: '#b9934c', // Tarnished brass buckles
  };

  const grid = [
    '.........KKKKKK.........',
    '........KLLLLLLK........',
    '........KL....LK........',
    '......KKKCCCCCCKKK......',
    '.....KHHHHHHHHHHHHK.....',
    '....KCHHHHHHHHHHHHcK....',
    '....KCLLLLCCCCLLLLcK....',
    '....KCLBBLCCCCLBBLcK....',
    '....KCCLLCCCCCCLLCcK....',
    '....KCCCCCCCCCCCCCcK....',
    '....KCCKKKKKKKKCCccK....',
    '....KCKHHHHHHHHKCccK....',
    '....KCKCCCCCCCCKCccK....',
    '....KCKCCCCCCCCKCccK....',
    '....KCKcCCCCCCcKCccK....',
    '....KCCKKKKKKKKCCccK....',
    '.....KccccccccccccK.....',
    '......KKKKKKKKKKKK......',
    '........................',
    '........................',
  ];

  drawGrid(ctx, grid, palette, 0, 2);
  return c.toDataURL();
}

let cachedIcons: Record<InventoryItemId, string> | null = null;

export function getItemIcons(): Record<InventoryItemId, string> {
  if (cachedIcons) return cachedIcons;
  cachedIcons = {
    flashlight: createFlashlightIcon(),
    brass_key: createBrassKeyIcon(),
    backpack_3: createBackpackIcon(),
  };
  return cachedIcons;
}
