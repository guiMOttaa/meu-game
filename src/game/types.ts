export type GamePhase =
  | 'CHAPTERS'
  | 'TITLE'
  | 'OPENING_CUTSCENE'
  | 'PLAYING'
  | 'PAUSED'
  | 'LEVEL_COMPLETE';

export type ZoneId = 'study' | 'corridor';

export type KeySpotId =
  | 'desk_drawer'
  | 'examine_corner_books'
  | 'examine_north_shelves'
  | 'examine_west_shelf'
  | 'examine_divider_shelf'
  | 'examine_tv';

export type InteractAnimKind =
  | 'none'
  | 'talk'
  | 'drawer'
  | 'shelf'
  | 'floor_books'
  | 'tv_crouch';

export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  id?: string;
}

export interface FloorRegion {
  id: string;
  zone: ZoneId;
  x: number;
  y: number;
  w: number;
  h: number;
  material: 'wood' | 'stone';
}

export interface WallBlock {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Whether the southern face is visible in 2.5D projection */
  showSouthFace?: boolean;
  /** Material tone */
  style: 'study_slate' | 'corridor_stone';
}

export type PropKind =
  | 'rug'
  | 'bookshelf_h'
  | 'bookshelf_v'
  | 'corner_desk'
  | 'desk_chair'
  | 'tv_stand'
  | 'side_table'
  | 'book_pile'
  | 'loose_papers'
  | 'crate'
  | 'wall_sconce'
  | 'study_door'
  | 'large_gate'
  | 'npc_watcher'
  | 'backpack_pickup';

export interface PropEntity {
  id: string;
  kind: PropKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Y coordinate used for 2.5D depth sorting (typically base bottom y) */
  sortY: number;
  /** Whether the prop blocks player movement */
  solid: boolean;
  /** Optional collision inset so 2.5D tops don't block awkwardly */
  collider?: Rect;
  /** Optional visual metadata */
  variant?: number;
  /** Optional interactable ID linked to this prop */
  interactableId?: string;
  /** Whether this prop blocks light/sightlines when closed */
  blocksSight?: boolean;
}

export interface Interactable {
  id: string;
  label: string;
  /** World center for proximity and click detection */
  x: number;
  y: number;
  /** Interaction radius in world pixels */
  radius: number;
  /** Click hit box */
  hitBox: Rect;
  kind:
    | 'desk_drawer'
    | 'desk_drawer_left'
    | 'study_door'
    | 'large_gate'
    | 'examine'
    | 'npc_watcher'
    | 'backpack_pickup';
  /** Default examine message if kind === 'examine' */
  examineText?: string;
}

export interface SecondaryInteractTarget {
  id: 'tv_power' | 'desk_lamp';
  triggerX: number;
  triggerY: number;
  radius: number;
  cueX: number;
  cueY: number;
}

export interface LightSource {
  id: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  intensity: number;
  flicker?: boolean;
  zone: ZoneId;
}

export type InventoryItemId = 'flashlight' | 'brass_key' | 'backpack_3';
export type InventoryZone = 'hands' | 'bag';

export interface InventoryItem {
  id: InventoryItemId;
  name: string;
  description: string;
  inspectDetail?: string;
  backpackSlots?: number;
}

export interface InventorySlotRef {
  zone: InventoryZone;
  index: number;
}

export interface DustMote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  phase: number;
}

export interface NarrativeMessage {
  id: number;
  text: string;
  tone: 'neutral' | 'discovery' | 'locked' | 'ominous';
  timestamp: number;
}

export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  facingX: number;
  facingY: number;
  walkCycle: number;
  isMoving: boolean;
  interactAnim: number;
  interactDuration: number;
  interactKind: InteractAnimKind;
  footstepTimer: number;
}

export interface LevelProgress {
  keyLocationId: KeySpotId;
  flashlightLocationId: 'desk_drawer_left' | 'desk_drawer';
  leftDrawerSearched: boolean;
  drawerSearched: boolean;
  leftDrawerOpen: boolean;
  rightDrawerOpen: boolean;
  hasFlashlight: boolean;
  flashlightOn: boolean;
  activeHandItemId: InventoryItemId | null;
  hasBackpack: boolean;
  equippedBackpack: InventoryItem | null;
  bagCapacity: number;
  hasKey: boolean;
  doorUnlocked: boolean;
  doorOpen: boolean;
  doorOpenAmount: number; // 0 (closed) -> 1 (fully open)
  doorShakeTimer: number;
  tvOn: boolean;
  deskLampOn: boolean;
  gateTriggered: boolean;
  gateTransitionTimer: number;
  currentZone: ZoneId;
  inspectedIds: Set<string>;
  npcSpokenOnce: boolean;
  npcTalkCount: number;
  npcSpeechBubble: string | null;
  npcSpeechTimer: number;
}

export interface DialogueState {
  active: boolean;
  speakerId: 'npc_watcher';
  speakerName: string;
  clipIndex: number;
  totalClips: number;
  text: string;
  isSpeaking: boolean;
  protagonistReaction: string;
}

export type IntroCutscenePhase = 'none' | 'sleeping' | 'startled' | 'standing';

export const INTRO_SLEEP_END = 1.72;
export const INTRO_STARTLE_END = 3.35;
export const INTRO_TOTAL_DURATION = 4.3;

export interface IntroCutsceneState {
  active: boolean;
  phase: IntroCutscenePhase;
  timer: number;
  wakeAudioTriggered: boolean;
  wakeSubtitleTriggered: boolean;
}

export type AudioLanguageMode = 'dubbed' | 'subtitled';
export type SubtitleSize = 'small' | 'medium' | 'large';

export type ControlAction =
  | 'moveUp'
  | 'moveDown'
  | 'moveLeft'
  | 'moveRight'
  | 'interact'
  | 'secondaryInteract'
  | 'inventory'
  | 'mute'
  | 'pause';

export type KeyBindings = Record<ControlAction, string>;

export interface GameSettings {
  musicVolume: number;
  speechVolume: number;
  mode: AudioLanguageMode;
  subtitleSize: SubtitleSize;
  controls: KeyBindings;
}

export interface SubtitleCue {
  id: number;
  speaker?: string;
  text: string;
  duration: number;
}



