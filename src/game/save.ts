import { GameSaveData } from './types';

const SAVE_STORAGE_KEY = 'limiar_das_cinzas_save_v1';

export function loadSavedGame(): GameSaveData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SAVE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GameSaveData>;
    if (
      !parsed ||
      parsed.version !== 1 ||
      !parsed.player ||
      !parsed.progress ||
      !Array.isArray(parsed.hands) ||
      !Array.isArray(parsed.bag) ||
      typeof parsed.player.x !== 'number' ||
      typeof parsed.player.y !== 'number'
    ) {
      return null;
    }
    return parsed as GameSaveData;
  } catch {
    return null;
  }
}

export function writeSavedGame(data: GameSaveData): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSavedGame(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SAVE_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}
