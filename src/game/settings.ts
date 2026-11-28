import {
  ColorblindMode,
  ControlAction,
  GameSettings,
  KeyBindings,
  SubtitleSize,
} from './types';

const SETTINGS_STORAGE_KEY = 'limiar_das_cinzas_settings_v1';

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  moveUp: 'KeyW',
  moveDown: 'KeyS',
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  interact: 'KeyE',
  secondaryInteract: 'KeyT',
  inventory: 'KeyR',
  mute: 'KeyM',
  pause: 'KeyP',
};

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  musicVolume: 0.75,
  speechVolume: 0.9,
  mode: 'dubbed',
  subtitleSize: 'medium',
  subtitleBgOpacity: 0.88,
  monoAudio: false,
  colorblindMode: 'none',
  controls: { ...DEFAULT_KEY_BINDINGS },
};

const CONTROL_ACTION_KEYS = Object.keys(DEFAULT_KEY_BINDINGS) as ControlAction[];

function isValidColorblindMode(value: unknown): value is ColorblindMode {
  return (
    value === 'none' ||
    value === 'protanopia' ||
    value === 'deuteranopia' ||
    value === 'tritanopia'
  );
}

export function loadGameSettings(): GameSettings {
  if (typeof window === 'undefined') return DEFAULT_GAME_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_GAME_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    const controls: KeyBindings = { ...DEFAULT_KEY_BINDINGS };
    if (parsed.controls && typeof parsed.controls === 'object') {
      for (const action of CONTROL_ACTION_KEYS) {
        const val = parsed.controls[action];
        if (typeof val === 'string' && val.length > 0 && val !== 'Escape') {
          controls[action] = val;
        }
      }
    }
    return {
      musicVolume:
        typeof parsed.musicVolume === 'number'
          ? Math.max(0, Math.min(1, parsed.musicVolume))
          : DEFAULT_GAME_SETTINGS.musicVolume,
      speechVolume:
        typeof parsed.speechVolume === 'number'
          ? Math.max(0, Math.min(1, parsed.speechVolume))
          : DEFAULT_GAME_SETTINGS.speechVolume,
      mode: parsed.mode === 'subtitled' || parsed.mode === 'dubbed' ? parsed.mode : 'dubbed',
      subtitleSize:
        parsed.subtitleSize === 'small' ||
        parsed.subtitleSize === 'medium' ||
        parsed.subtitleSize === 'large'
          ? parsed.subtitleSize
          : 'medium',
      subtitleBgOpacity:
        typeof parsed.subtitleBgOpacity === 'number' && !Number.isNaN(parsed.subtitleBgOpacity)
          ? Math.max(0, Math.min(1, parsed.subtitleBgOpacity))
          : DEFAULT_GAME_SETTINGS.subtitleBgOpacity,
      monoAudio:
        typeof parsed.monoAudio === 'boolean'
          ? parsed.monoAudio
          : DEFAULT_GAME_SETTINGS.monoAudio,
      colorblindMode: isValidColorblindMode(parsed.colorblindMode)
        ? parsed.colorblindMode
        : DEFAULT_GAME_SETTINGS.colorblindMode,
      controls,
    };
  } catch {
    return DEFAULT_GAME_SETTINGS;
  }
}

export function saveGameSettings(settings: GameSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

export function formatKeyCode(code: string, compact = false): string {
  if (code.startsWith('Key') && code.length === 4) {
    return code.slice(3);
  }
  if (code.startsWith('Digit') && code.length === 6) {
    return code.slice(5);
  }
  if (code.startsWith('Numpad')) {
    return compact ? `N${code.slice(6)}` : `Num ${code.slice(6)}`;
  }
  switch (code) {
    case 'Space':
      return compact ? '␣' : 'Espaço';
    case 'ArrowUp':
      return '↑';
    case 'ArrowDown':
      return '↓';
    case 'ArrowLeft':
      return '←';
    case 'ArrowRight':
      return '→';
    case 'ShiftLeft':
    case 'ShiftRight':
      return compact ? 'Sh' : 'Shift';
    case 'ControlLeft':
    case 'ControlRight':
      return compact ? 'Ct' : 'Ctrl';
    case 'AltLeft':
    case 'AltRight':
      return 'Alt';
    case 'Tab':
      return 'Tab';
    case 'Enter':
      return compact ? '↵' : 'Enter';
    case 'Backspace':
      return compact ? '⌫' : 'Backspace';
    default:
      return compact ? code.slice(0, 2).toUpperCase() : code;
  }
}

export function getDialogueTextClass(size: SubtitleSize): string {
  switch (size) {
    case 'small':
      return 'text-xs sm:text-sm leading-relaxed';
    case 'large':
      return 'text-base sm:text-xl leading-relaxed';
    case 'medium':
    default:
      return 'text-sm sm:text-base leading-relaxed';
  }
}

export function getWorldSubtitleTextClass(size: SubtitleSize): string {
  switch (size) {
    case 'small':
      return 'text-xs sm:text-sm';
    case 'large':
      return 'text-lg sm:text-2xl';
    case 'medium':
    default:
      return 'text-sm sm:text-base';
  }
}
