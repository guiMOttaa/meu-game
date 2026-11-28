import { NPC_VOICE_CLIPS, soundEngine } from './audio';
import { createLevelOne, KEY_HIDING_SPOTS, LevelDefinition } from './levelData';
import { renderScene } from './renderer';
import { DEFAULT_KEY_BINDINGS } from './settings';
import {
  DialogueState,
  DustMote,
  GamePhase,
  GameSaveData,
  Interactable,
  INTRO_SLEEP_END,
  INTRO_STARTLE_END,
  INTRO_TOTAL_DURATION,
  INTRO_WAKE_VOICE_START,
  IntroCutsceneState,
  InventoryItem,
  InventorySlotRef,
  KeyBindings,
  KeySpotId,
  LevelProgress,
  PlayerState,
  Rect,
  SecondaryInteractTarget,
  Segment,
  SubtitleCue,
  Vec2,
} from './types';
import { computeVisibilityPolygon } from './visibility';

export const HAND_SLOT_COUNT = 3;
export const MAX_BAG_SLOTS = 6;

const DESK_SEAT_X = 140;
const DESK_SEAT_Y = 152;
const DESK_STAND_X = 176;
const DESK_STAND_Y = 164;

export interface HudSnapshot {
  zoneName: string;
  objectiveText: string;
  hands: (InventoryItem | null)[];
  bag: (InventoryItem | null)[];
  activeHandIndex: number;
  bagCapacity: number;
  equippedBackpack: InventoryItem | null;
  inventoryOpen: boolean;
  flashlightOn: boolean;
  nearestId: string | null;
  cutsceneActive: boolean;
  showPresentDayTitle: boolean;
}

export interface EngineCallbacks {
  onHudUpdate: (hud: HudSnapshot) => void;
  onSubtitle: (cue: SubtitleCue | null) => void;
  onDialogueChange: (dialogue: DialogueState | null) => void;
  onLevelComplete: () => void;
  onPauseRequest: () => void;
  onToggleMute: () => void;
}

const TV_NEWS_DURATION = 31.85;
const TV_NEWS_SCARE_START = 28.55;
const TV_BLACKOUT_DURATION = 1.75;
const TV_RECOVERY_DURATION = 3.25;
const TV_STATIC_DURATION = 2.45;

const TV_NEWS_SUBTITLES: Array<{ at: number; duration: number; speaker: string; text: string }> = [
  { at: 0.0, duration: 1.2, speaker: 'Jornal', text: 'E na cultura.' },
  {
    at: 1.15,
    duration: 3.85,
    speaker: 'Jornal',
    text: 'O fenômeno literário do ano segue batendo recordes históricos.',
  },
  {
    at: 4.95,
    duration: 7.2,
    speaker: 'Jornal',
    text: 'Sem qualquer divulgação prévia, a obra atingiu a marca impressionante de 100 milhões de cópias comercializadas em todo mundo.',
  },
  {
    at: 12.1,
    duration: 7.25,
    speaker: 'Jornal',
    text: 'Críticos afirmam ser quase impossível que um único escritor tenha concebido algo dessa magnitude em tão pouco tempo.',
  },
  {
    at: 19.35,
    duration: 5.7,
    speaker: 'Jornal',
    text: 'Enquanto o público aguarda por um segundo volume, a identidade do autor permanece um mistério.',
  },
  {
    at: 25.0,
    duration: 3.85,
    speaker: 'Jornal',
    text: 'O jornal termina aqui. Tenham uma boa noite. E lembrem-se...',
  },
  {
    at: 28.8,
    duration: 3.1,
    speaker: '???',
    text: 'Cabeça vazia é oficina do...',
  },
];

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private lightCanvas: HTMLCanvasElement;
  private lightCtx: CanvasRenderingContext2D;
  private shadowCanvas: HTMLCanvasElement;
  private shadowCtx: CanvasRenderingContext2D;

  private level: LevelDefinition;
  private player: PlayerState;
  private progress: LevelProgress;
  private hands: (InventoryItem | null)[] = Array(HAND_SLOT_COUNT).fill(null);
  private bag: (InventoryItem | null)[] = Array(MAX_BAG_SLOTS).fill(null);
  private activeHandIndex = 0;
  private inventoryOpen = false;
  private dustMotes: DustMote[] = [];
  private lastKeyLocationId: KeySpotId | null = null;

  private cameraX: number;
  private cameraY: number;
  private zoom = 1.32;
  private shakeTimer = 0;
  private shakeIntensity = 0;

  private heldKeys = new Set<string>();
  private phase: GamePhase = 'TITLE';
  private rafId: number | null = null;
  private lastTime = 0;
  private elapsedTime = 0;
  private messageCounter = 0;
  private gateWalkTimer = 0;

  private nearestInteractable: Interactable | null = null;
  private nearestSecondaryTarget: SecondaryInteractTarget | null = null;
  private lastHudSignature = '';
  private callbacks: EngineCallbacks;
  private keyBindings: KeyBindings = { ...DEFAULT_KEY_BINDINGS };
  private dialogue: DialogueState | null = null;
  private dialogueVoiceTimer = 0;
  private tvPlaybackTimer = 0;
  private tvSubtitleIndex = -1;
  private introCutscene: IntroCutsceneState = {
    active: false,
    phase: 'none',
    timer: 0,
    wakeAudioTriggered: false,
    wakeSubtitleTriggered: false,
  };

  constructor(canvas: HTMLCanvasElement, callbacks: EngineCallbacks) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not acquire 2D canvas context');
    }
    this.ctx = ctx;

    this.lightCanvas = document.createElement('canvas');
    const lCtx = this.lightCanvas.getContext('2d');
    if (!lCtx) {
      throw new Error('Could not acquire offscreen light canvas context');
    }
    this.lightCtx = lCtx;

    this.shadowCanvas = document.createElement('canvas');
    const sCtx = this.shadowCanvas.getContext('2d');
    if (!sCtx) {
      throw new Error('Could not acquire offscreen shadow canvas context');
    }
    this.shadowCtx = sCtx;

    this.callbacks = callbacks;
    this.level = createLevelOne();
    this.player = this.createInitialPlayer();
    this.progress = this.createInitialProgress();
    this.cameraX = this.player.x;
    this.cameraY = this.player.y;
    this.initDustMotes();
    soundEngine.prefetchWakeAudioBytes();
  }

  private pickDifferentKeySpot(): KeySpotId {
    const candidates = this.lastKeyLocationId
      ? KEY_HIDING_SPOTS.filter((id) => id !== this.lastKeyLocationId)
      : KEY_HIDING_SPOTS;
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    this.lastKeyLocationId = chosen;
    return chosen;
  }

  private createInitialPlayer(): PlayerState {
    return {
      x: this.level.playerStart.x,
      y: this.level.playerStart.y,
      vx: 0,
      vy: 0,
      radius: 13,
      facingX: 0,
      facingY: 1,
      walkCycle: 0,
      isMoving: false,
      interactAnim: 0,
      interactDuration: 0.6,
      interactKind: 'none',
      footstepTimer: 0,
    };
  }

  private pickFlashlightDrawer(keySpot: KeySpotId): 'desk_drawer_left' | 'desk_drawer' {
    if (keySpot === 'desk_drawer') {
      return 'desk_drawer_left';
    }
    return Math.random() < 0.5 ? 'desk_drawer_left' : 'desk_drawer';
  }

  private createInitialProgress(): LevelProgress {
    const keyLocationId = this.pickDifferentKeySpot();
    return {
      keyLocationId,
      flashlightLocationId: this.pickFlashlightDrawer(keyLocationId),
      leftDrawerSearched: false,
      drawerSearched: false,
      leftDrawerOpen: false,
      rightDrawerOpen: false,
      hasFlashlight: false,
      flashlightOn: false,
      activeHandItemId: null,
      hasBackpack: false,
      equippedBackpack: null,
      bagCapacity: 0,
      hasKey: false,
      doorUnlocked: false,
      doorOpen: false,
      doorOpenAmount: 0,
      doorShakeTimer: 0,
      tvOn: false,
      tvMode: 'off',
      tvNewsCompleted: false,
      tvLightSurgePhase: 'none',
      tvLightSurgeTimer: 0,
      deskLampOn: true,
      gateTriggered: false,
      gateTransitionTimer: 0,
      currentZone: 'study',
      inspectedIds: new Set<string>(),
      npcSpokenOnce: false,
      npcTalkCount: 0,
      npcSpeechBubble: null,
      npcSpeechTimer: 0,
    };
  }

  public setKeyBindings(bindings: KeyBindings): void {
    this.keyBindings = { ...bindings };
  }

  private isCodeAssigned(code: string): boolean {
    return Object.values(this.keyBindings).includes(code);
  }

  private initDustMotes(): void {
    this.dustMotes = [];
    for (let i = 0; i < 36; i++) {
      this.dustMotes.push({
        x: 75 + Math.random() * 565,
        y: 75 + Math.random() * 410,
        vx: (Math.random() - 0.5) * 6,
        vy: -2 - Math.random() * 5,
        size: Math.random() > 0.65 ? 2 : 1.4,
        alpha: 0.14 + Math.random() * 0.22,
        phase: Math.random() * Math.PI * 2,
      });
    }
    for (let i = 0; i < 24; i++) {
      this.dustMotes.push({
        x: 856 + Math.random() * 124,
        y: -290 + Math.random() * 580,
        vx: (Math.random() - 0.5) * 4,
        vy: -1.5 - Math.random() * 4,
        size: 1.5,
        alpha: 0.16 + Math.random() * 0.22,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  public setPhase(phase: GamePhase): void {
    const prevPhase = this.phase;
    this.phase = phase;
    if (phase === 'PLAYING' && prevPhase === 'PAUSED') {
      if (this.progress.tvOn && this.progress.tvMode === 'news') {
        soundEngine.resumeTvNews();
      } else if (this.progress.tvOn && this.progress.tvMode === 'static') {
        const remaining = Math.max(0.25, TV_STATIC_DURATION - this.tvPlaybackTimer);
        soundEngine.startTvStatic(remaining);
      }
      return;
    }
    if (phase !== 'PLAYING') {
      this.heldKeys.clear();
      this.inventoryOpen = false;
      soundEngine.stopWakeVoice();
      if (phase === 'PAUSED') {
        soundEngine.pauseTvAudio();
      } else {
        soundEngine.stopTvAudio();
        this.progress.tvOn = false;
        this.progress.tvMode = 'off';
        this.progress.tvLightSurgePhase = 'none';
        this.progress.tvLightSurgeTimer = 0;
        this.tvPlaybackTimer = 0;
        this.tvSubtitleIndex = -1;
      }
      this.callbacks.onSubtitle(null);
      if (this.dialogue?.active) {
        this.closeDialogue();
      }
      this.emitHudSnapshot();
    }
  }

  public resetLevel(): void {
    this.level = createLevelOne();
    this.player = this.createInitialPlayer();
    this.player.x = DESK_SEAT_X;
    this.player.y = DESK_SEAT_Y;
    this.player.facingX = 0;
    this.player.facingY = -1;
    this.progress = this.createInitialProgress();
    this.hands = Array(HAND_SLOT_COUNT).fill(null);
    this.bag = Array(MAX_BAG_SLOTS).fill(null);
    this.activeHandIndex = 0;
    this.inventoryOpen = false;
    this.introCutscene = {
      active: true,
      phase: 'sleeping',
      timer: 0,
      wakeAudioTriggered: false,
      wakeSubtitleTriggered: false,
    };
    this.cameraX = 136;
    this.cameraY = 128;
    this.shakeTimer = 0;
    this.gateWalkTimer = 0;
    this.nearestInteractable = null;
    this.nearestSecondaryTarget = null;
    this.lastHudSignature = '';
    this.heldKeys.clear();
    this.tvPlaybackTimer = 0;
    this.tvSubtitleIndex = -1;
    soundEngine.stopTvAudio();
    this.callbacks.onSubtitle(null);
    this.closeDialogue();
    this.emitHudSnapshot();
  }

  public exportSaveData(): GameSaveData {
    const safeX = this.introCutscene.active ? DESK_STAND_X : this.player.x;
    const safeY = this.introCutscene.active ? DESK_STAND_Y : this.player.y;
    const zoneName =
      this.progress.currentZone === 'study' ? 'Estudo Fechado' : 'Corredor Sombrio';

    return {
      version: 1,
      chapter: 1,
      savedAt: Date.now(),
      zoneName,
      objectiveText: this.getObjectiveText(),
      player: {
        x: safeX,
        y: safeY,
        facingX: this.player.facingX,
        facingY: this.player.facingY,
      },
      camera: {
        x: this.cameraX,
        y: this.cameraY,
      },
      progress: {
        keyLocationId: this.progress.keyLocationId,
        flashlightLocationId: this.progress.flashlightLocationId,
        leftDrawerSearched: this.progress.leftDrawerSearched,
        drawerSearched: this.progress.drawerSearched,
        leftDrawerOpen: this.progress.leftDrawerOpen,
        rightDrawerOpen: this.progress.rightDrawerOpen,
        hasFlashlight: this.progress.hasFlashlight,
        flashlightOn: this.progress.flashlightOn,
        activeHandItemId: this.progress.activeHandItemId,
        hasBackpack: this.progress.hasBackpack,
        equippedBackpack: this.progress.equippedBackpack
          ? { ...this.progress.equippedBackpack }
          : null,
        bagCapacity: this.progress.bagCapacity,
        hasKey: this.progress.hasKey,
        doorUnlocked: this.progress.doorUnlocked,
        doorOpen: this.progress.doorOpen,
        doorOpenAmount: this.progress.doorOpenAmount,
        tvOn: false,
        tvNewsCompleted: this.progress.tvNewsCompleted,
        deskLampOn: this.progress.deskLampOn,
        currentZone: this.progress.currentZone,
        inspectedIds: Array.from(this.progress.inspectedIds),
        npcSpokenOnce: this.progress.npcSpokenOnce,
        npcTalkCount: this.progress.npcTalkCount,
      },
      hands: this.hands.map((item) => (item ? { ...item } : null)),
      bag: this.bag.map((item) => (item ? { ...item } : null)),
      activeHandIndex: this.activeHandIndex,
    };
  }

  public loadSaveData(save: GameSaveData): void {
    this.level = createLevelOne();
    this.player = this.createInitialPlayer();
    this.player.x = save.player.x;
    this.player.y = save.player.y;
    this.player.facingX = save.player.facingX;
    this.player.facingY = save.player.facingY;

    this.hands = Array.from({ length: HAND_SLOT_COUNT }, (_, idx) => {
      const item = save.hands[idx];
      return item ? { ...item } : null;
    });
    this.bag = Array.from({ length: MAX_BAG_SLOTS }, (_, idx) => {
      const item = save.bag[idx];
      return item ? { ...item } : null;
    });
    this.activeHandIndex = Math.max(0, Math.min(HAND_SLOT_COUNT - 1, save.activeHandIndex || 0));

    const activeItem = this.hands[this.activeHandIndex] ?? null;

    this.progress = {
      keyLocationId: save.progress.keyLocationId,
      flashlightLocationId: save.progress.flashlightLocationId,
      leftDrawerSearched: Boolean(save.progress.leftDrawerSearched),
      drawerSearched: Boolean(save.progress.drawerSearched),
      leftDrawerOpen: Boolean(save.progress.leftDrawerOpen),
      rightDrawerOpen: Boolean(save.progress.rightDrawerOpen),
      hasFlashlight: Boolean(save.progress.hasFlashlight),
      flashlightOn: activeItem?.id === 'flashlight',
      activeHandItemId: activeItem?.id ?? null,
      hasBackpack: Boolean(save.progress.hasBackpack),
      equippedBackpack: save.progress.equippedBackpack
        ? { ...save.progress.equippedBackpack }
        : null,
      bagCapacity: save.progress.bagCapacity ?? 0,
      hasKey: Boolean(save.progress.hasKey),
      doorUnlocked: Boolean(save.progress.doorUnlocked),
      doorOpen: Boolean(save.progress.doorOpen),
      doorOpenAmount: save.progress.doorOpenAmount ?? (save.progress.doorOpen ? 1 : 0),
      doorShakeTimer: 0,
      tvOn: false,
      tvMode: 'off',
      tvNewsCompleted: Boolean(save.progress.tvNewsCompleted),
      tvLightSurgePhase: 'none',
      tvLightSurgeTimer: 0,
      deskLampOn: save.progress.deskLampOn ?? true,
      gateTriggered: false,
      gateTransitionTimer: 0,
      currentZone: save.progress.currentZone === 'corridor' ? 'corridor' : 'study',
      inspectedIds: new Set(save.progress.inspectedIds ?? []),
      npcSpokenOnce: Boolean(save.progress.npcSpokenOnce),
      npcTalkCount: save.progress.npcTalkCount ?? 0,
      npcSpeechBubble: null,
      npcSpeechTimer: 0,
    };

    this.introCutscene = {
      active: false,
      phase: 'none',
      timer: 0,
      wakeAudioTriggered: true,
      wakeSubtitleTriggered: true,
    };

    this.inventoryOpen = false;
    this.cameraX = save.camera?.x ?? this.player.x;
    this.cameraY = save.camera?.y ?? this.player.y;
    this.shakeTimer = 0;
    this.gateWalkTimer = 0;
    this.heldKeys.clear();
    this.tvPlaybackTimer = 0;
    this.tvSubtitleIndex = -1;
    soundEngine.stopTvAudio();
    this.callbacks.onSubtitle(null);
    this.closeDialogue();
    this.updateNearestInteractable();
    this.lastHudSignature = '';
    this.emitHudSnapshot();
  }

  public startLoop(): void {
    if (this.rafId !== null) return;
    this.lastTime = performance.now();
    const tick = (now: number) => {
      const rawDt = (now - this.lastTime) / 1000;
      this.lastTime = now;
      const dt = Math.min(rawDt, 0.05);

      this.update(dt);
      this.render();

      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  public destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    soundEngine.stopTvAudio();
    this.heldKeys.clear();
  }

  public handleKeyDown(e: KeyboardEvent): void {
    const code = e.code;
    const kb = this.keyBindings;
    const isMoveKey =
      code === kb.moveUp ||
      code === kb.moveDown ||
      code === kb.moveLeft ||
      code === kb.moveRight ||
      code === 'ArrowUp' ||
      code === 'ArrowDown' ||
      code === 'ArrowLeft' ||
      code === 'ArrowRight';
    const isInteractKey =
      code === kb.interact || (code === 'Space' && !this.isCodeAssigned('Space'));
    const isSecondaryKey = code === kb.secondaryInteract;
    const isInventoryKey = code === kb.inventory;
    const isMuteKey = code === kb.mute;
    const isPauseKey = code === 'Escape' || code === kb.pause;

    if (this.phase !== 'PLAYING') return;

    if (this.dialogue?.active) {
      if (isInteractKey || code === 'Enter' || code === 'Escape' || isMoveKey || code === 'Space') {
        e.preventDefault();
      }
      if (!e.repeat) {
        if (isInteractKey || code === 'Enter' || code === 'Space') {
          this.advanceDialogue();
        } else if (code === 'Escape') {
          this.closeDialogue();
        } else if (isMuteKey) {
          this.callbacks.onToggleMute();
        }
      }
      return;
    }

    if (this.inventoryOpen) {
      if (isInventoryKey || code === 'Escape' || isMoveKey || code === 'Space') {
        e.preventDefault();
      }
      if (!e.repeat) {
        if (isInventoryKey || code === 'Escape') {
          this.setInventoryOpen(false);
        } else if (isMuteKey) {
          this.callbacks.onToggleMute();
        }
      }
      return;
    }

    if (isMoveKey || code === 'Space') {
      e.preventDefault();
    }

    if (!e.repeat) {
      if (isPauseKey) {
        this.callbacks.onPauseRequest();
        return;
      }
      if (isMuteKey) {
        this.callbacks.onToggleMute();
        return;
      }
      if (this.introCutscene.active) {
        return;
      }
      if (isInventoryKey && !this.progress.gateTriggered) {
        this.toggleInventory();
        return;
      }
      if (
        (code === 'Digit1' || code === 'Numpad1') &&
        !this.isCodeAssigned(code)
      ) {
        this.selectHandSlot(0);
        return;
      }
      if (
        (code === 'Digit2' || code === 'Numpad2') &&
        !this.isCodeAssigned(code)
      ) {
        this.selectHandSlot(1);
        return;
      }
      if (
        (code === 'Digit3' || code === 'Numpad3') &&
        !this.isCodeAssigned(code)
      ) {
        this.selectHandSlot(2);
        return;
      }
      if (isInteractKey) {
        this.tryInteractNearest();
        return;
      }
      if (isSecondaryKey) {
        this.trySecondaryInteractNearest();
        return;
      }
    }

    if (this.introCutscene.active) {
      return;
    }

    this.heldKeys.add(code);
  }

  public handleKeyUp(e: KeyboardEvent): void {
    this.heldKeys.delete(e.code);
  }

  public clearInputs(): void {
    this.heldKeys.clear();
  }

  public handleCanvasClick(clientX: number, clientY: number): void {
    if (
      this.phase !== 'PLAYING' ||
      this.introCutscene.active ||
      this.progress.gateTriggered ||
      this.dialogue?.active ||
      this.inventoryOpen
    ) {
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;

    const worldX = (sx - rect.width / 2) / this.zoom + this.cameraX;
    const worldY = (sy - rect.height / 2) / this.zoom + this.cameraY;

    for (const item of this.level.interactables) {
      if ((item.id === 'large_gate' || item.id === 'npc_watcher') && !this.progress.doorUnlocked) {
        continue;
      }
      if (item.id === 'study_backpack' && this.progress.hasBackpack) {
        continue;
      }
      const box = item.hitBox;
      const inBox =
        worldX >= box.x - 10 &&
        worldX <= box.x + box.w + 10 &&
        worldY >= box.y - 10 &&
        worldY <= box.y + box.h + 10;

      if (inBox) {
        const dist = Math.hypot(this.player.x - item.x, this.player.y - item.y);
        if (dist <= item.radius + 22) {
          this.interactWith(item);
        }
        return;
      }
    }

    if (this.nearestInteractable) {
      const distToNearest = Math.hypot(
        worldX - this.nearestInteractable.x,
        worldY - this.nearestInteractable.y
      );
      if (distToNearest < 56) {
        this.interactWith(this.nearestInteractable);
      }
    }
  }

  private update(dt: number): void {
    this.elapsedTime += dt;

    for (const m of this.dustMotes) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.x < 70) m.x = 635;
      if (m.x > 985) m.x = 855;
      if (m.y < -300) m.y = 480;
    }

    if (this.phase !== 'PLAYING') return;

    const targetDoorAmount = this.progress.doorOpen ? 1 : 0;
    if (this.progress.doorOpenAmount < targetDoorAmount) {
      this.progress.doorOpenAmount = Math.min(1, this.progress.doorOpenAmount + dt * 2.5);
    } else if (this.progress.doorOpenAmount > targetDoorAmount) {
      this.progress.doorOpenAmount = Math.max(0, this.progress.doorOpenAmount - dt * 2.8);
    }
    if (this.progress.doorShakeTimer > 0) {
      this.progress.doorShakeTimer = Math.max(0, this.progress.doorShakeTimer - dt);
    }
    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
    }
    if (this.player.interactAnim > 0) {
      const step = dt / Math.max(0.1, this.player.interactDuration);
      this.player.interactAnim = Math.max(0, this.player.interactAnim - step);
      if (this.player.interactAnim === 0) {
        this.player.interactKind = 'none';
      }
    }
    if (this.progress.npcSpeechTimer > 0) {
      this.progress.npcSpeechTimer = Math.max(0, this.progress.npcSpeechTimer - dt);
      if (this.progress.npcSpeechTimer === 0) {
        this.progress.npcSpeechBubble = null;
      }
    }

    if (this.dialogue?.active && this.dialogue.isSpeaking) {
      this.dialogueVoiceTimer -= dt;
      if (this.dialogueVoiceTimer <= 0) {
        this.dialogue = { ...this.dialogue, isSpeaking: false };
        this.callbacks.onDialogueChange(this.dialogue);
      }
    }

    if (this.progress.gateTriggered) {
      if (this.progress.tvOn) {
        this.turnOffTv(false);
      }
      this.progress.gateTransitionTimer += dt;
      if (this.progress.gateTransitionTimer >= 0.95) {
        this.callbacks.onLevelComplete();
      }
      return;
    }

    if (this.introCutscene.active) {
      this.updateIntroCutscene(dt);
      return;
    }

    this.updateTvState(dt);

    if (this.dialogue?.active || this.inventoryOpen) {
      this.player.vx = 0;
      this.player.vy = 0;
      this.player.isMoving = false;
      this.heldKeys.clear();
      return;
    }

    const kb = this.keyBindings;
    let moveX = 0;
    let moveY = 0;
    if (
      this.heldKeys.has(kb.moveUp) ||
      (!this.isCodeAssigned('ArrowUp') && this.heldKeys.has('ArrowUp'))
    ) {
      moveY -= 1;
    }
    if (
      this.heldKeys.has(kb.moveDown) ||
      (!this.isCodeAssigned('ArrowDown') && this.heldKeys.has('ArrowDown'))
    ) {
      moveY += 1;
    }
    if (
      this.heldKeys.has(kb.moveLeft) ||
      (!this.isCodeAssigned('ArrowLeft') && this.heldKeys.has('ArrowLeft'))
    ) {
      moveX -= 1;
    }
    if (
      this.heldKeys.has(kb.moveRight) ||
      (!this.isCodeAssigned('ArrowRight') && this.heldKeys.has('ArrowRight'))
    ) {
      moveX += 1;
    }

    const len = Math.hypot(moveX, moveY);
    const speed = 152;

    if (len > 0) {
      const nx = moveX / len;
      const ny = moveY / len;
      this.player.vx = nx * speed;
      this.player.vy = ny * speed;
      this.player.facingX = nx;
      this.player.facingY = ny;
      this.player.isMoving = true;
      this.player.walkCycle += dt;
      if (this.player.interactAnim > 0) {
        this.player.interactAnim = 0;
        this.player.interactKind = 'none';
      }

      this.player.footstepTimer -= dt;
      if (this.player.footstepTimer <= 0) {
        const surface = this.progress.currentZone === 'study' ? 'wood' : 'stone';
        soundEngine.playFootstep(surface);
        this.player.footstepTimer = 0.34;
      }

      this.moveWithCollisions(this.player.vx * dt, this.player.vy * dt);
    } else {
      this.player.vx = 0;
      this.player.vy = 0;
      this.player.isMoving = false;
      this.player.footstepTimer = 0.05;
    }

    const nextZone = this.player.x > 690 ? 'corridor' : 'study';
    if (nextZone !== this.progress.currentZone) {
      this.progress.currentZone = nextZone;
    }

    if (this.player.y <= -266 && this.player.x >= 860 && this.player.x <= 976 && moveY < 0) {
      this.gateWalkTimer += dt;
      if (this.gateWalkTimer > 0.16) {
        const gate = this.level.interactables.find((i) => i.id === 'large_gate');
        if (gate) this.interactWith(gate);
      }
    } else {
      this.gateWalkTimer = 0;
    }

    const lookX = this.player.facingX * 26;
    const lookY = this.player.facingY * 20;
    const targetCamX = this.player.x + lookX;
    const targetCamY = this.player.y + lookY;
    const lerpFactor = 1 - Math.exp(-6.5 * dt);
    this.cameraX += (targetCamX - this.cameraX) * lerpFactor;
    this.cameraY += (targetCamY - this.cameraY) * lerpFactor;

    this.updateNearestInteractable();
    this.emitHudSnapshot();
  }

  private updateIntroCutscene(dt: number): void {
    const ic = this.introCutscene;
    ic.timer += dt;

    if (!ic.wakeAudioTriggered && ic.timer >= INTRO_WAKE_VOICE_START) {
      ic.wakeAudioTriggered = true;
      void soundEngine.playWakeUpVoice(() =>
        Math.max(0, this.introCutscene.timer - INTRO_WAKE_VOICE_START)
      );
    }

    if (!ic.wakeSubtitleTriggered && ic.timer >= INTRO_WAKE_VOICE_START + 1.16) {
      ic.wakeSubtitleTriggered = true;
      this.pushSubtitle('Acorda...', 2.35, 'Voz Desconhecida');
    }

    this.player.vx = 0;
    this.player.vy = 0;
    this.heldKeys.clear();

    if (ic.timer < INTRO_SLEEP_END) {
      ic.phase = 'sleeping';
      this.player.x = DESK_SEAT_X;
      this.player.y = DESK_SEAT_Y;
      this.player.facingX = 0;
      this.player.facingY = -1;
      this.player.isMoving = false;
      this.cameraX = 136;
      this.cameraY = 128;
    } else if (ic.timer < INTRO_STARTLE_END) {
      if (ic.phase !== 'startled') {
        ic.phase = 'startled';
        this.triggerCameraShake(0.24, 2.5);
      }
      this.player.x = DESK_SEAT_X;
      this.player.y = DESK_SEAT_Y;
      this.player.facingX = 0;
      this.player.facingY = 1;
      this.player.isMoving = false;
      this.cameraX = 138;
      this.cameraY = 132;
    } else if (ic.timer < INTRO_TOTAL_DURATION) {
      ic.phase = 'standing';
      const standSpan = INTRO_TOTAL_DURATION - INTRO_STARTLE_END;
      const p = Math.min(1, (ic.timer - INTRO_STARTLE_END) / standSpan);

      // Step out from chair (0 -> 0.65) then settle facing into the study (0.65 -> 1)
      const moveT = Math.min(1, p / 0.68);
      const smoothMove = moveT * moveT * (3 - 2 * moveT);

      this.player.x = DESK_SEAT_X + (DESK_STAND_X - DESK_SEAT_X) * smoothMove;
      this.player.y = DESK_SEAT_Y + (DESK_STAND_Y - DESK_SEAT_Y) * smoothMove;

      if (p < 0.68) {
        this.player.isMoving = true;
        this.player.walkCycle += dt;
        this.player.facingX = 0.94;
        this.player.facingY = 0.34;
      } else {
        this.player.isMoving = false;
        this.player.facingX = 0.32;
        this.player.facingY = 0.95;
      }

      const lookX = this.player.facingX * 26;
      const lookY = this.player.facingY * 20;
      const targetCamX = this.player.x + lookX;
      const targetCamY = this.player.y + lookY;
      const camLerp = 1 - Math.exp(-5.2 * dt);
      this.cameraX += (targetCamX - this.cameraX) * camLerp;
      this.cameraY += (targetCamY - this.cameraY) * camLerp;
    } else {
      ic.active = false;
      ic.phase = 'none';
      this.player.x = DESK_STAND_X;
      this.player.y = DESK_STAND_Y;
      this.player.facingX = 0.32;
      this.player.facingY = 0.95;
      this.player.isMoving = false;
      this.updateNearestInteractable();
      this.emitHudSnapshot();
      return;
    }

    this.emitHudSnapshot();
  }

  public skipActiveCutscene(): void {
    if (this.phase !== 'PLAYING') return;

    if (this.introCutscene.active) {
      this.introCutscene.active = false;
      this.introCutscene.phase = 'none';
      this.introCutscene.timer = INTRO_TOTAL_DURATION;
      this.introCutscene.wakeAudioTriggered = true;
      this.introCutscene.wakeSubtitleTriggered = true;

      soundEngine.stopWakeVoice();
      this.callbacks.onSubtitle(null);

      this.player.x = DESK_STAND_X;
      this.player.y = DESK_STAND_Y;
      this.player.facingX = 0.32;
      this.player.facingY = 0.95;
      this.player.vx = 0;
      this.player.vy = 0;
      this.player.isMoving = false;

      this.cameraX = this.player.x + this.player.facingX * 26;
      this.cameraY = this.player.y + this.player.facingY * 20;

      this.updateNearestInteractable();
      this.emitHudSnapshot();
      return;
    }

    if (this.progress.gateTriggered) {
      this.callbacks.onLevelComplete();
    }
  }

  private startDialogueClip(clipIndex: number): void {
    const reactions = [
      '[observa em silêncio]',
      '[ouve com atenção]',
      '[permanece calado]',
      '[assente em silêncio]',
    ];
    const idx = clipIndex % NPC_VOICE_CLIPS.length;
    const clip = NPC_VOICE_CLIPS[idx];
    this.progress.npcSpeechBubble = null;
    this.progress.npcSpeechTimer = 0;
    this.dialogueVoiceTimer = clip.duration / 0.94;
    this.dialogue = {
      active: true,
      speakerId: 'npc_watcher',
      speakerName: 'Figura Encapuzada',
      clipIndex: idx,
      totalClips: NPC_VOICE_CLIPS.length,
      text: clip.text,
      isSpeaking: true,
      protagonistReaction: reactions[idx % reactions.length],
    };
    this.heldKeys.clear();
    void soundEngine.playNpcVoiceClip(idx);
    this.callbacks.onDialogueChange(this.dialogue);
  }

  public advanceDialogue(): void {
    if (!this.dialogue?.active) return;
    soundEngine.playUiClick();
    const nextIdx = this.dialogue.clipIndex + 1;
    if (nextIdx < NPC_VOICE_CLIPS.length) {
      this.startDialogueClip(nextIdx);
    } else {
      this.closeDialogue();
    }
  }

  public closeDialogue(): void {
    if (!this.dialogue) return;
    this.dialogue = null;
    this.dialogueVoiceTimer = 0;
    soundEngine.stopActiveVoice();
    this.callbacks.onDialogueChange(null);
  }

  private getActiveColliders(): Rect[] {
    const rects: Rect[] = [];
    for (const w of this.level.walls) {
      rects.push({ x: w.x, y: w.y, w: w.w, h: w.h });
    }
    for (const p of this.level.props) {
      if (!p.solid) continue;
      if (p.id === 'study_door' && this.progress.doorOpen) continue;
      if (p.id === 'npc_watcher' && !this.progress.doorUnlocked) continue;
      rects.push(p.collider ?? { x: p.x, y: p.y, w: p.w, h: p.h });
    }
    return rects;
  }

  private moveWithCollisions(dx: number, dy: number): void {
    const colliders = this.getActiveColliders();
    const r = this.player.radius;

    this.player.x += dx;
    for (const box of colliders) {
      const resolved = resolveCircleRect(this.player.x, this.player.y, r, box);
      this.player.x = resolved.x;
      this.player.y = resolved.y;
    }

    this.player.y += dy;
    for (const box of colliders) {
      const resolved = resolveCircleRect(this.player.x, this.player.y, r, box);
      this.player.x = resolved.x;
      this.player.y = resolved.y;
    }
  }

  private updateNearestInteractable(): void {
    let best: Interactable | null = null;
    let bestDist = Infinity;

    for (const item of this.level.interactables) {
      if ((item.id === 'large_gate' || item.id === 'npc_watcher') && !this.progress.doorUnlocked) {
        continue;
      }
      if (item.id === 'study_backpack' && this.progress.hasBackpack) {
        continue;
      }
      const dist = Math.hypot(this.player.x - item.x, this.player.y - item.y);
      if (dist <= item.radius && dist < bestDist) {
        best = item;
        bestDist = dist;
      }
    }

    this.nearestInteractable = best;

    const secondaryTargets: SecondaryInteractTarget[] = [
      {
        id: 'desk_lamp',
        triggerX: 100,
        triggerY: 136,
        radius: 34,
        cueX: 98,
        cueY: 66,
      },
      {
        id: 'tv_power',
        triggerX: 248,
        triggerY: 404,
        radius: 44,
        cueX: 248,
        cueY: 376,
      },
    ];

    let bestSecondary: SecondaryInteractTarget | null = null;
    let bestSecondaryDist = Infinity;
    for (const target of secondaryTargets) {
      const dist = Math.hypot(this.player.x - target.triggerX, this.player.y - target.triggerY);
      if (dist <= target.radius && dist < bestSecondaryDist) {
        bestSecondary = target;
        bestSecondaryDist = dist;
      }
    }
    this.nearestSecondaryTarget = bestSecondary;
  }

  public tryInteractNearest(): void {
    if (this.phase !== 'PLAYING' || this.progress.gateTriggered) return;
    if (this.nearestInteractable) {
      this.interactWith(this.nearestInteractable);
    }
  }

  public trySecondaryInteractNearest(): void {
    if (this.phase !== 'PLAYING' || this.progress.gateTriggered) return;
    if (this.nearestSecondaryTarget) {
      this.secondaryInteractWith(this.nearestSecondaryTarget);
    }
  }

  private updateTvState(dt: number): void {
    if (this.progress.tvLightSurgePhase === 'blackout') {
      this.progress.tvLightSurgeTimer += dt;
      if (this.progress.tvLightSurgeTimer >= TV_BLACKOUT_DURATION) {
        this.progress.tvLightSurgePhase = 'recovering';
        this.progress.tvLightSurgeTimer = 0;
        soundEngine.playPowerRestore();
      }
    } else if (this.progress.tvLightSurgePhase === 'recovering') {
      this.progress.tvLightSurgeTimer += dt;
      if (this.progress.tvLightSurgeTimer >= TV_RECOVERY_DURATION) {
        this.progress.tvLightSurgePhase = 'none';
        this.progress.tvLightSurgeTimer = 0;
      }
    } else if (this.progress.tvLightSurgePhase === 'flickering') {
      this.progress.tvLightSurgeTimer += dt;
    }

    if (!this.progress.tvOn) return;

    if (this.progress.tvMode === 'news') {
      const mediaTime = soundEngine.getTvNewsCurrentTime();
      if (mediaTime !== null && mediaTime >= this.tvPlaybackTimer) {
        this.tvPlaybackTimer = mediaTime;
      } else {
        this.tvPlaybackTimer += dt;
      }

      if (
        this.tvPlaybackTimer >= TV_NEWS_SCARE_START &&
        this.progress.tvLightSurgePhase !== 'flickering'
      ) {
        this.progress.tvLightSurgePhase = 'flickering';
        this.progress.tvLightSurgeTimer = 0;
      }

      while (
        this.tvSubtitleIndex + 1 < TV_NEWS_SUBTITLES.length &&
        this.tvPlaybackTimer >= TV_NEWS_SUBTITLES[this.tvSubtitleIndex + 1].at
      ) {
        this.tvSubtitleIndex += 1;
        const cue = TV_NEWS_SUBTITLES[this.tvSubtitleIndex];
        if (!this.dialogue?.active) {
          this.pushSubtitle(cue.text, cue.duration, cue.speaker);
        }
      }

      if (soundEngine.isTvNewsEnded() || this.tvPlaybackTimer >= TV_NEWS_DURATION + 0.15) {
        this.finishTvNewsBroadcast();
      }
      return;
    }

    if (this.progress.tvMode === 'static') {
      this.tvPlaybackTimer += dt;
      if (this.tvPlaybackTimer >= TV_STATIC_DURATION) {
        this.turnOffTv(false);
      }
    }
  }

  private finishTvNewsBroadcast(): void {
    if (!this.progress.tvOn || this.progress.tvMode !== 'news') return;
    this.progress.tvOn = false;
    this.progress.tvMode = 'off';
    this.progress.tvNewsCompleted = true;
    this.progress.tvLightSurgePhase = 'blackout';
    this.progress.tvLightSurgeTimer = 0;
    this.tvPlaybackTimer = 0;
    this.tvSubtitleIndex = -1;
    soundEngine.stopTvAudio();
    soundEngine.playTvToggle(false);
    soundEngine.playPowerBlackout();
    this.emitHudSnapshot();
  }

  private turnOffTv(clearSubtitle = false): void {
    this.progress.tvOn = false;
    this.progress.tvMode = 'off';
    if (this.progress.tvLightSurgePhase === 'flickering') {
      this.progress.tvLightSurgePhase = 'none';
      this.progress.tvLightSurgeTimer = 0;
    }
    this.tvPlaybackTimer = 0;
    this.tvSubtitleIndex = -1;
    soundEngine.stopTvAudio();
    soundEngine.playTvToggle(false);
    if (clearSubtitle) {
      this.callbacks.onSubtitle(null);
    }
    this.emitHudSnapshot();
  }

  private secondaryInteractWith(target: SecondaryInteractTarget): void {
    if (target.id === 'tv_power') {
      this.orientToward(248, 404, 'talk');
      this.player.interactKind = 'talk';
      this.player.interactDuration = 0.45;
      this.player.interactAnim = 1;

      if (this.progress.tvOn) {
        this.turnOffTv(true);
        return;
      }

      this.progress.tvOn = true;
      this.tvPlaybackTimer = 0;
      this.tvSubtitleIndex = -1;
      soundEngine.playTvToggle(true);

      if (!this.progress.tvNewsCompleted) {
        this.progress.tvMode = 'news';
        soundEngine.startTvNews(() => this.finishTvNewsBroadcast());
      } else {
        this.progress.tvMode = 'static';
        soundEngine.startTvStatic(TV_STATIC_DURATION);
      }

      this.emitHudSnapshot();
      return;
    }

    if (target.id === 'desk_lamp') {
      this.orientToward(100, 100, 'talk');
      this.player.interactKind = 'talk';
      this.player.interactDuration = 0.42;
      this.player.interactAnim = 1;
      this.progress.deskLampOn = !this.progress.deskLampOn;
      soundEngine.playSwitchClick();
      this.emitHudSnapshot();
    }
  }

  private orientToward(targetX: number, targetY: number, kind: PlayerState['interactKind']): void {
    const dx = targetX - this.player.x;
    const dy = targetY - this.player.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1) {
      const wouldFaceUp = dy < 0 && Math.abs(dy) >= Math.abs(dx) * 0.75;
      if (wouldFaceUp && kind !== 'talk') {
        const sideSign = dx < -6 ? -1 : 1;
        this.player.facingX = sideSign * 0.94;
        this.player.facingY = -0.34;
      } else {
        this.player.facingX = dx / dist;
        this.player.facingY = dy / dist;
      }
    }
  }

  public selectHandSlot(index: number): void {
    if (this.phase !== 'PLAYING' || this.introCutscene.active || this.progress.gateTriggered) return;
    if (index < 0 || index >= HAND_SLOT_COUNT) return;
    if (this.activeHandIndex !== index) {
      this.activeHandIndex = index;
      soundEngine.playUiClick();
      this.syncFlashlightState();
      this.emitHudSnapshot();
    }
  }

  public cycleHandSlot(delta: number): void {
    if (
      this.phase !== 'PLAYING' ||
      this.introCutscene.active ||
      this.progress.gateTriggered ||
      this.dialogue?.active ||
      this.inventoryOpen
    ) {
      return;
    }
    const step = delta >= 0 ? 1 : -1;
    const next = (this.activeHandIndex + step + HAND_SLOT_COUNT) % HAND_SLOT_COUNT;
    this.selectHandSlot(next);
  }

  private syncFlashlightState(): void {
    const activeItem = this.hands[this.activeHandIndex] ?? null;
    this.progress.activeHandItemId = activeItem?.id ?? null;
    this.progress.flashlightOn = activeItem?.id === 'flashlight';
  }

  private addCollectedItem(item: InventoryItem): void {
    // Prefer the currently selected empty hand slot, otherwise fill the first open hand slot
    if (this.hands[this.activeHandIndex] === null) {
      this.hands[this.activeHandIndex] = item;
      this.syncFlashlightState();
      return;
    }

    const emptyHandIdx = this.hands.findIndex((slot) => slot === null);
    if (emptyHandIdx !== -1) {
      this.hands[emptyHandIdx] = item;
      this.syncFlashlightState();
      return;
    }

    // Overflow into unlocked backpack slots only if all 3 hand slots are full
    if (this.progress.bagCapacity > 0) {
      for (let i = 0; i < this.progress.bagCapacity; i++) {
        if (this.bag[i] === null) {
          this.bag[i] = item;
          break;
        }
      }
    }
    this.syncFlashlightState();
  }

  private consumeInventoryItem(itemId: InventoryItem['id']): boolean {
    if (this.hands[this.activeHandIndex]?.id === itemId) {
      this.hands[this.activeHandIndex] = null;
      this.syncFlashlightState();
      return true;
    }

    const handIdx = this.hands.findIndex((slot) => slot?.id === itemId);
    if (handIdx !== -1) {
      this.hands[handIdx] = null;
      this.syncFlashlightState();
      return true;
    }

    const bagIdx = this.bag.findIndex((slot) => slot?.id === itemId);
    if (bagIdx !== -1) {
      this.bag[bagIdx] = null;
      this.syncFlashlightState();
      return true;
    }

    return false;
  }

  public toggleInventory(): void {
    if (this.phase !== 'PLAYING' || this.dialogue?.active || this.progress.gateTriggered) return;
    this.setInventoryOpen(!this.inventoryOpen);
  }

  public setInventoryOpen(open: boolean): void {
    if (this.inventoryOpen === open) return;
    this.inventoryOpen = open;
    this.heldKeys.clear();
    soundEngine.playUiClick();
    this.emitHudSnapshot();
  }

  public moveInventorySlot(from: InventorySlotRef, to: InventorySlotRef): void {
    if (from.zone === to.zone && from.index === to.index) return;
    const fromArr = from.zone === 'hands' ? this.hands : this.bag;
    const toArr = to.zone === 'hands' ? this.hands : this.bag;
    if (
      from.index < 0 ||
      from.index >= fromArr.length ||
      to.index < 0 ||
      to.index >= toArr.length
    ) {
      return;
    }
    if (to.zone === 'bag' && to.index >= this.progress.bagCapacity) {
      return;
    }
    const sourceItem = fromArr[from.index];
    if (!sourceItem) return;

    const targetItem = toArr[to.index];
    toArr[to.index] = sourceItem;
    fromArr[from.index] = targetItem;

    soundEngine.playUiClick();
    this.syncFlashlightState();
    this.emitHudSnapshot();
  }

  public quickTransferSlot(from: InventorySlotRef): void {
    const fromArr = from.zone === 'hands' ? this.hands : this.bag;
    const item = fromArr[from.index];
    if (!item) return;

    if (from.zone === 'hands') {
      if (this.progress.bagCapacity <= 0) {
        return;
      }
      let emptyIdx = -1;
      for (let i = 0; i < this.progress.bagCapacity; i++) {
        if (this.bag[i] === null) {
          emptyIdx = i;
          break;
        }
      }
      if (emptyIdx === -1) {
        return;
      }
      this.bag[emptyIdx] = item;
      this.hands[from.index] = null;
    } else {
      const emptyHandIdx = this.hands.findIndex((slot) => slot === null);
      if (emptyHandIdx === -1) {
        return;
      }
      this.hands[emptyHandIdx] = item;
      this.bag[from.index] = null;
    }

    soundEngine.playUiClick();
    this.syncFlashlightState();
    this.emitHudSnapshot();
  }

  public equipBackpackSlot(ref: InventorySlotRef): void {
    const arr = ref.zone === 'hands' ? this.hands : this.bag;
    const item = arr[ref.index];
    if (!item || !item.backpackSlots) return;

    const prevBackpack = this.progress.equippedBackpack;
    this.progress.equippedBackpack = item;
    this.progress.bagCapacity = Math.min(
      MAX_BAG_SLOTS,
      Math.max(this.progress.bagCapacity, item.backpackSlots)
    );
    arr[ref.index] = prevBackpack ?? null;

    soundEngine.playFabricSearch();
    this.syncFlashlightState();
    this.emitHudSnapshot();
  }

  private awardBackpack(): void {
    this.progress.hasBackpack = true;
    const backpackItem: InventoryItem = {
      id: 'backpack_3',
      name: 'Mochila de Lona',
      description: 'Mochila resistente com fivelas de latão. Libera 3 espaços no inventário.',
      inspectDetail:
        'Tecido grosso encerado com costura reforçada e compartimento interno para até três objetos de campo.',
      backpackSlots: 3,
    };

    // Automatically equip the backpack on pickup without taking up a hand slot
    this.progress.equippedBackpack = backpackItem;
    this.progress.bagCapacity = Math.min(
      MAX_BAG_SLOTS,
      Math.max(this.progress.bagCapacity, backpackItem.backpackSlots ?? 3)
    );
    setTimeout(() => soundEngine.playKeyPickup(), 130);
  }

  private awardFlashlight(): void {
    this.progress.hasFlashlight = true;
    this.addCollectedItem({
      id: 'flashlight',
      name: 'Lanterna de Bolso',
      description:
        'Lanterna metálica com interruptor de latão. Segure em uma das mãos para iluminar.',
      inspectDetail:
        'Corpo de aço escovado riscado pelo tempo. O vidro espesso ainda preserva o filamento quente quando empunhada.',
    });
    setTimeout(() => soundEngine.playKeyPickup(), 140);
  }

  private awardKeyFromSpot(_spotId: KeySpotId): void {
    this.progress.hasKey = true;
    this.addCollectedItem({
      id: 'brass_key',
      name: 'Chave de Latão',
      description: 'Uma chave pesada de latão encontrada escondida no estudo.',
      inspectDetail:
        'Dentes duplos marcados por desgaste recente e o numeral romano "VII" gravado discretamente próximo ao aro.',
    });
    setTimeout(() => soundEngine.playKeyPickup(), 150);
  }

  private interactWith(item: Interactable): void {
    if (item.id === 'desk_drawer' || item.id === 'desk_drawer_left') {
      this.player.interactKind = 'drawer';
      this.player.interactDuration = 0.65;
    } else if (item.id === 'examine_corner_books' || item.id === 'study_backpack') {
      this.player.interactKind = 'floor_books';
      this.player.interactDuration = 0.7;
    } else if (
      item.id === 'examine_north_shelves' ||
      item.id === 'examine_west_shelf' ||
      item.id === 'examine_divider_shelf'
    ) {
      this.player.interactKind = 'shelf';
      this.player.interactDuration = 0.72;
    } else if (item.id === 'examine_tv') {
      this.player.interactKind = 'tv_crouch';
      this.player.interactDuration = 1.25;
    } else {
      this.player.interactKind = 'talk';
      this.player.interactDuration = 0.62;
    }

    this.orientToward(item.x, item.y, this.player.interactKind);
    this.player.interactAnim = 1;

    switch (item.kind) {
      case 'backpack_pickup': {
        if (!this.progress.hasBackpack) {
          soundEngine.playFabricSearch();
          this.awardBackpack();
        }
        break;
      }

      case 'desk_drawer_left': {
        this.progress.leftDrawerOpen = !this.progress.leftDrawerOpen;
        if (this.progress.leftDrawerOpen) {
          soundEngine.playDrawerOpen();
          if (!this.progress.leftDrawerSearched) {
            this.progress.leftDrawerSearched = true;
            if (!this.progress.hasFlashlight && this.progress.flashlightLocationId === 'desk_drawer_left') {
              this.awardFlashlight();
            }
          }
        } else {
          soundEngine.playDrawerClose();
        }
        break;
      }

      case 'desk_drawer': {
        this.progress.rightDrawerOpen = !this.progress.rightDrawerOpen;
        if (this.progress.rightDrawerOpen) {
          soundEngine.playDrawerOpen();
          if (!this.progress.drawerSearched) {
            this.progress.drawerSearched = true;
            if (!this.progress.hasFlashlight && this.progress.flashlightLocationId === 'desk_drawer') {
              this.awardFlashlight();
            } else if (
              !this.progress.hasKey &&
              !this.progress.doorUnlocked &&
              this.progress.keyLocationId === 'desk_drawer'
            ) {
              this.awardKeyFromSpot('desk_drawer');
            }
          }
        } else {
          soundEngine.playDrawerClose();
        }
        break;
      }

      case 'study_door': {
        if (this.progress.doorUnlocked) {
          this.progress.doorOpen = !this.progress.doorOpen;
          if (this.progress.doorOpen) {
            soundEngine.playDoorUnlock();
          } else {
            soundEngine.playDoorClose();
            if (Math.abs(this.player.x - 684) < 30 && this.player.y >= 210 && this.player.y <= 330) {
              this.player.x = this.player.x < 684 ? 654 : 714;
            }
          }
          break;
        }
        if (this.progress.hasKey) {
          this.consumeInventoryItem('brass_key');
          this.progress.hasKey = false;
          this.progress.doorUnlocked = true;
          this.progress.doorOpen = true;
          soundEngine.playDoorUnlock();
        } else {
          this.progress.doorShakeTimer = 0.24;
          this.triggerCameraShake(0.18, 2.5);
          soundEngine.playDoorLocked();
        }
        break;
      }

      case 'npc_watcher': {
        this.progress.npcSpokenOnce = true;
        this.progress.npcTalkCount += 1;
        this.startDialogueClip(0);
        break;
      }

      case 'large_gate': {
        if (this.progress.gateTriggered) return;
        this.progress.gateTriggered = true;
        this.progress.gateTransitionTimer = 0;
        this.triggerCameraShake(0.75, 4.2);
        soundEngine.playGateEncounter();
        this.emitHudSnapshot();
        break;
      }

      case 'examine': {
        if (item.id === 'examine_corner_books') {
          soundEngine.playBooksInspect();
        } else if (
          item.id === 'examine_north_shelves' ||
          item.id === 'examine_west_shelf' ||
          item.id === 'examine_divider_shelf'
        ) {
          soundEngine.playShelfSearch();
        } else if (item.id === 'examine_tv') {
          soundEngine.playFabricSearch();
        } else {
          soundEngine.playBooksInspect();
        }

        if (
          !this.progress.hasKey &&
          !this.progress.doorUnlocked &&
          item.id === this.progress.keyLocationId
        ) {
          this.awardKeyFromSpot(item.id as KeySpotId);
        }
        break;
      }
    }

    this.emitHudSnapshot();
  }

  private triggerCameraShake(duration: number, intensity: number): void {
    this.shakeTimer = duration;
    this.shakeIntensity = intensity;
  }

  private getObjectiveText(): string {
    if (this.progress.gateTriggered) return 'Limiar alcançado';
    if (!this.progress.doorUnlocked && !this.progress.hasKey) {
      return 'Procure a chave escondida no estudo';
    }
    if (!this.progress.doorUnlocked) return 'Destranque a porta do estudo';
    if (this.progress.currentZone === 'study') return 'Atravesse a porta para o corredor';
    return 'Siga pelo corredor até o grande portão';
  }

  private emitHudSnapshot(): void {
    const zoneName =
      this.progress.currentZone === 'study' ? 'Estudo Fechado' : 'Corredor Sombrio';
    const objectiveText = this.getObjectiveText();
    const nearestId = this.nearestInteractable?.id ?? null;

    const handsSig = this.hands.map((i) => i?.id ?? '-').join(',');
    const bagSig = this.bag.map((i) => i?.id ?? '-').join(',');
    const bpSig = this.progress.equippedBackpack?.id ?? 'none';
    const cutsceneActive = this.introCutscene.active || this.progress.gateTriggered;
    const showPresentDayTitle =
      this.introCutscene.active &&
      this.introCutscene.timer >= 0.45 &&
      this.introCutscene.timer < 3.15;
    const sig = `${zoneName}|${objectiveText}|${handsSig}|${this.activeHandIndex}|${bagSig}|${bpSig}|${this.progress.bagCapacity}|${this.inventoryOpen}|${this.progress.flashlightOn}|${nearestId}|${cutsceneActive}|${showPresentDayTitle}`;
    if (sig === this.lastHudSignature) return;
    this.lastHudSignature = sig;

    this.callbacks.onHudUpdate({
      zoneName,
      objectiveText,
      hands: [...this.hands],
      bag: [...this.bag],
      activeHandIndex: this.activeHandIndex,
      bagCapacity: this.progress.bagCapacity,
      equippedBackpack: this.progress.equippedBackpack,
      inventoryOpen: this.inventoryOpen,
      flashlightOn: this.progress.flashlightOn,
      nearestId,
      cutsceneActive,
      showPresentDayTitle,
    });
  }

  private pushSubtitle(text: string, duration: number, speaker?: string): void {
    this.messageCounter += 1;
    this.callbacks.onSubtitle({
      id: this.messageCounter,
      speaker,
      text,
      duration,
    });
  }

  private render(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.max(1, Math.floor(rect.width * dpr));
    const targetH = Math.max(1, Math.floor(rect.height * dpr));

    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }

    const minDim = Math.min(rect.width, rect.height);
    const baseZoom = Math.max(1.05, Math.min(1.55, minDim / 520));
    let zoomBoost = 1;
    if (this.introCutscene.active) {
      if (this.introCutscene.timer < INTRO_STARTLE_END) {
        zoomBoost = 1.18;
      } else {
        const t = Math.min(
          1,
          (this.introCutscene.timer - INTRO_STARTLE_END) /
            (INTRO_TOTAL_DURATION - INTRO_STARTLE_END)
        );
        const s = t * t * (3 - 2 * t);
        zoomBoost = 1.18 - 0.18 * s;
      }
    }
    this.zoom = baseZoom * zoomBoost;

    const wallSegments: Segment[] = [...this.level.wallSightSegments];
    if (!this.progress.doorOpen && this.progress.doorOpenAmount < 0.2) {
      wallSegments.push(this.level.doorSightSegment);
    }
    const allSegments: Segment[] = [...wallSegments, ...this.level.propSightSegments];

    const origin = { x: this.player.x, y: this.player.y - 6 };
    const wallVisibilityPoly = computeVisibilityPolygon(origin, wallSegments, 620);
    const interiorVisibilityPoly = computeVisibilityPolygon(origin, allSegments, 620);

    const shakeX =
      this.shakeTimer > 0 ? (Math.random() - 0.5) * 2 * this.shakeIntensity : 0;
    const shakeY =
      this.shakeTimer > 0 ? (Math.random() - 0.5) * 2 * this.shakeIntensity : 0;

    this.ctx.save();
    this.ctx.scale(dpr, dpr);

    renderScene({
      ctx: this.ctx,
      lightCanvas: this.lightCanvas,
      lightCtx: this.lightCtx,
      shadowCanvas: this.shadowCanvas,
      shadowCtx: this.shadowCtx,
      width: rect.width,
      height: rect.height,
      cameraX: this.cameraX + shakeX,
      cameraY: this.cameraY + shakeY,
      zoom: this.zoom,
      time: this.elapsedTime,
      level: this.level,
      player: this.player,
      progress: this.progress,
      wallVisibilityPoly,
      interiorVisibilityPoly,
      nearestInteractable: this.introCutscene.active ? null : this.nearestInteractable,
      nearestSecondaryTarget: this.introCutscene.active ? null : this.nearestSecondaryTarget,
      dustMotes: this.dustMotes,
      introCutscene: this.introCutscene,
      keyBindings: this.keyBindings,
    });

    this.ctx.restore();
  }
}

function resolveCircleRect(cx: number, cy: number, r: number, rect: Rect): Vec2 {
  const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));

  const dx = cx - closestX;
  const dy = cy - closestY;
  const distSq = dx * dx + dy * dy;

  if (distSq >= r * r) {
    return { x: cx, y: cy };
  }

  if (distSq > 1e-6) {
    const dist = Math.sqrt(distSq);
    const overlap = r - dist;
    return {
      x: cx + (dx / dist) * overlap,
      y: cy + (dy / dist) * overlap,
    };
  }

  const leftPen = cx - rect.x;
  const rightPen = rect.x + rect.w - cx;
  const topPen = cy - rect.y;
  const botPen = rect.y + rect.h - cy;
  const minPen = Math.min(leftPen, rightPen, topPen, botPen);

  if (minPen === leftPen) return { x: rect.x - r, y: cy };
  if (minPen === rightPen) return { x: rect.x + rect.w + r, y: cy };
  if (minPen === topPen) return { x: cx, y: rect.y - r };
  return { x: cx, y: rect.y + rect.h + r };
}
