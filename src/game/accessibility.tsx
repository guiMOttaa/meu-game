import { ColorblindMode } from './types';

export interface ColorblindOptionDef {
  id: ColorblindMode;
  label: string;
  hint: string;
}

export const COLORBLIND_OPTIONS: ColorblindOptionDef[] = [
  { id: 'none', label: 'Desativado', hint: 'Padrão' },
  { id: 'protanopia', label: 'Protanopia', hint: 'Vermelho reduzido' },
  { id: 'deuteranopia', label: 'Deuteranopia', hint: 'Verde reduzido' },
  { id: 'tritanopia', label: 'Tritanopia', hint: 'Azul/amarelo' },
];

/**
 * Lightweight 2D GPU-composited Daltonization color matrices (sRGB).
 * Row sums equal 1.000 to preserve neutral grays and atmospheric shadows cleanly
 * while shifting confused hues into high-contrast orthogonal channels.
 */
const COLORBLIND_MATRICES: Record<Exclude<ColorblindMode, 'none'>, string> = {
  protanopia:
    '1.000 0.000 0.000 0 0  0.303 0.697 0.000 0 0  0.303 -0.303 1.000 0 0  0 0 0 1 0',
  deuteranopia:
    '0.510 0.490 0.000 0 0  0.000 1.000 0.000 0 0  -0.490 0.490 1.000 0 0  0 0 0 1 0',
  tritanopia:
    '1.000 -0.333 0.333 0 0  0.000 0.667 0.333 0 0  0.000 0.000 1.000 0 0  0 0 0 1 0',
};

export function getColorblindCssFilter(mode: ColorblindMode): string | undefined {
  if (mode === 'none') return undefined;
  return `url(#colorblind-${mode})`;
}

/**
 * Hidden SVG filter definitions mounted once at the application root.
 * Applied via CSS `filter: url(#colorblind-...)` with zero per-frame JS overhead.
 */
export function ColorblindFilterDefs() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className="pointer-events-none fixed h-0 w-0 overflow-hidden"
    >
      <defs>
        {(Object.keys(COLORBLIND_MATRICES) as Exclude<ColorblindMode, 'none'>[]).map((mode) => (
          <filter
            key={mode}
            id={`colorblind-${mode}`}
            colorInterpolationFilters="sRGB"
          >
            <feColorMatrix type="matrix" values={COLORBLIND_MATRICES[mode]} />
          </filter>
        ))}
      </defs>
    </svg>
  );
}
