import { useCallback, useEffect, useRef, useState } from 'react';
import { ChapterSelectScreen } from './components/ChapterSelectScreen';
import { DialogueOverlay } from './components/DialogueOverlay';
import { GameCanvas } from './components/GameCanvas';
import { HudOverlay } from './components/HudOverlay';
import { InventoryModal } from './components/InventoryModal';
import { ItemInspectOverlay } from './components/ItemInspectOverlay';
import { LevelCompleteModal, PauseModal } from './components/ModalScreens';
import { OpeningCutscene } from './components/OpeningCutscene';
import { SettingsModal } from './components/SettingsModal';
import { TitleScreen } from './components/TitleScreen';
import { soundEngine } from './game/audio';
import { initRusticCursors } from './game/cursor';
import { GameEngine, HAND_SLOT_COUNT, HudSnapshot, MAX_BAG_SLOTS } from './game/engine';
import {
  getWorldSubtitleTextClass,
  loadGameSettings,
  saveGameSettings,
} from './game/settings';
import {
  DialogueState,
  GamePhase,
  GameSettings,
  InventoryItem,
  InventorySlotRef,
  SubtitleCue,
} from './game/types';

const INITIAL_HUD: HudSnapshot = {
  zoneName: 'Estudo Fechado',
  objectiveText: 'Procure a chave escondida no estudo',
  hands: Array(HAND_SLOT_COUNT).fill(null),
  bag: Array(MAX_BAG_SLOTS).fill(null),
  activeHandIndex: 0,
  bagCapacity: 0,
  equippedBackpack: null,
  inventoryOpen: false,
  flashlightOn: false,
  nearestId: null,
  cutsceneActive: false,
};

export default function App() {
  const [phase, setPhase] = useState<GamePhase>('CHAPTERS');
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [subtitle, setSubtitle] = useState<SubtitleCue | null>(null);
  const [dialogue, setDialogue] = useState<DialogueState | null>(null);
  const [inspectedItem, setInspectedItem] = useState<InventoryItem | null>(null);
  const [muted, setMuted] = useState(false);
  const [settings, setSettings] = useState<GameSettings>(() => loadGameSettings());
  const [pauseSettingsOpen, setPauseSettingsOpen] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [enteredFromChapters, setEnteredFromChapters] = useState(false);

  const engineRef = useRef<GameEngine | null>(null);
  const subtitleTimerRef = useRef<number | null>(null);
  const cursorTimerRef = useRef<number | null>(null);
  const lastPointerPosRef = useRef<{ x: number; y: number } | null>(null);
  const [cursorIdle, setCursorIdle] = useState(false);

  const handleEngineReady = useCallback((engine: GameEngine | null) => {
    engineRef.current = engine;
  }, []);

  useEffect(() => {
    initRusticCursors();
  }, []);

  const canAutoHideCursor =
    phase === 'PLAYING' &&
    !hud.inventoryOpen &&
    !dialogue?.active &&
    !inspectedItem;

  useEffect(() => {
    const clearCursorTimer = () => {
      if (cursorTimerRef.current !== null) {
        window.clearTimeout(cursorTimerRef.current);
        cursorTimerRef.current = null;
      }
    };

    if (!canAutoHideCursor) {
      clearCursorTimer();
      setCursorIdle(false);
      return;
    }

    const scheduleIdleHide = () => {
      clearCursorTimer();
      cursorTimerRef.current = window.setTimeout(() => {
        setCursorIdle(true);
        cursorTimerRef.current = null;
      }, 2200);
    };

    const wakeCursor = () => {
      setCursorIdle(false);
      scheduleIdleHide();
    };

    const onMouseMove = (e: MouseEvent) => {
      const prev = lastPointerPosRef.current;
      if (prev && prev.x === e.clientX && prev.y === e.clientY) {
        return;
      }
      lastPointerPosRef.current = { x: e.clientX, y: e.clientY };
      wakeCursor();
    };

    const onMouseDown = () => wakeCursor();
    const onWheel = () => wakeCursor();

    scheduleIdleHide();
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('mousedown', onMouseDown, { passive: true });
    window.addEventListener('wheel', onWheel, { passive: true });

    return () => {
      clearCursorTimer();
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('wheel', onWheel);
    };
  }, [canAutoHideCursor]);

  useEffect(() => {
    const shouldHide = canAutoHideCursor && cursorIdle;
    document.documentElement.classList.toggle('cursor-hidden', shouldHide);
    return () => {
      document.documentElement.classList.remove('cursor-hidden');
    };
  }, [canAutoHideCursor, cursorIdle]);

  useEffect(() => {
    saveGameSettings(settings);
    soundEngine.applySettings(settings);
  }, [settings]);

  const handleSubtitle = useCallback((cue: SubtitleCue | null) => {
    if (subtitleTimerRef.current !== null) {
      window.clearTimeout(subtitleTimerRef.current);
      subtitleTimerRef.current = null;
    }
    setSubtitle(cue);
    if (cue) {
      subtitleTimerRef.current = window.setTimeout(() => {
        setSubtitle((prev) => (prev?.id === cue.id ? null : prev));
      }, Math.max(800, Math.round(cue.duration * 1000)));
    }
  }, []);

  useEffect(() => {
    return () => {
      if (subtitleTimerRef.current !== null) {
        window.clearTimeout(subtitleTimerRef.current);
      }
      soundEngine.stopAmbience();
    };
  }, []);

  useEffect(() => {
    if (phase !== 'PLAYING' || !hud.inventoryOpen) {
      setInspectedItem(null);
    }
    if (phase !== 'PAUSED') {
      setPauseSettingsOpen(false);
    }
  }, [phase, hud.inventoryOpen]);

  const startOpeningCutscene = useCallback(() => {
    soundEngine.playUiClick();
    soundEngine.applySettings(settings);
    handleSubtitle(null);
    setInspectedItem(null);
    setPauseSettingsOpen(false);
    setEnteredFromChapters(false);
    setResetToken((t) => t + 1);
    setPhase('OPENING_CUTSCENE');
  }, [settings, handleSubtitle]);

  const completeOpeningCutscene = useCallback(() => {
    soundEngine.applySettings(settings);
    soundEngine.startAmbience();
    setPhase('PLAYING');
  }, [settings]);

  const startOrRestart = useCallback(() => {
    soundEngine.playUiClick();
    soundEngine.applySettings(settings);
    soundEngine.startAmbience();
    handleSubtitle(null);
    setInspectedItem(null);
    setPauseSettingsOpen(false);
    setEnteredFromChapters(false);
    setResetToken((t) => t + 1);
    setPhase('PLAYING');
  }, [settings, handleSubtitle]);

  const handleToggleMute = useCallback(() => {
    const nextMuted = soundEngine.toggleMute();
    setMuted(nextMuted);
  }, []);

  const handlePauseRequest = useCallback(() => {
    soundEngine.playUiClick();
    setPauseSettingsOpen(false);
    setPhase('PAUSED');
  }, []);

  const handleResume = useCallback(() => {
    soundEngine.playUiClick();
    setPauseSettingsOpen(false);
    setPhase('PLAYING');
  }, []);

  const handleReturnToTitle = useCallback(() => {
    soundEngine.playUiClick();
    soundEngine.stopAmbience();
    handleSubtitle(null);
    setInspectedItem(null);
    setPauseSettingsOpen(false);
    setEnteredFromChapters(false);
    setPhase('TITLE');
  }, [handleSubtitle]);

  const handleLevelComplete = useCallback(() => {
    handleSubtitle(null);
    setPhase('LEVEL_COMPLETE');
  }, [handleSubtitle]);

  const handleAdvanceDialogue = useCallback(() => {
    engineRef.current?.advanceDialogue();
  }, []);

  const handleCloseDialogue = useCallback(() => {
    engineRef.current?.closeDialogue();
  }, []);

  const handleToggleInventory = useCallback(() => {
    engineRef.current?.toggleInventory();
  }, []);

  const handleSelectHandSlot = useCallback((index: number) => {
    engineRef.current?.selectHandSlot(index);
  }, []);

  const handleCloseInventory = useCallback(() => {
    setInspectedItem(null);
    engineRef.current?.setInventoryOpen(false);
  }, []);

  const handleMoveSlot = useCallback((from: InventorySlotRef, to: InventorySlotRef) => {
    engineRef.current?.moveInventorySlot(from, to);
  }, []);

  const handleQuickTransfer = useCallback((from: InventorySlotRef) => {
    engineRef.current?.quickTransferSlot(from);
  }, []);

  const handleEquipSlot = useCallback((ref: InventorySlotRef) => {
    engineRef.current?.equipBackpackSlot(ref);
  }, []);

  const handleInspectItem = useCallback((item: InventoryItem) => {
    soundEngine.playUiClick();
    setInspectedItem(item);
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#07090d]">
      <GameCanvas
        phase={phase}
        resetToken={resetToken}
        keyBindings={settings.controls}
        onHudUpdate={setHud}
        onSubtitle={handleSubtitle}
        onDialogueChange={setDialogue}
        onLevelComplete={handleLevelComplete}
        onPauseRequest={handlePauseRequest}
        onToggleMute={handleToggleMute}
        onEngineReady={handleEngineReady}
      />

      {phase === 'CHAPTERS' && (
        <ChapterSelectScreen
          onSelectChapter={(chapterNumber) => {
            if (chapterNumber === 1) {
              setEnteredFromChapters(true);
              setPhase('TITLE');
            }
          }}
        />
      )}

      {phase === 'TITLE' && (
        <TitleScreen
          settings={settings}
          onUpdateSettings={setSettings}
          onStart={startOpeningCutscene}
          animateFxEntry={enteredFromChapters}
          onBackToChapters={() => {
            setEnteredFromChapters(false);
            setPhase('CHAPTERS');
          }}
        />
      )}

      {phase === 'OPENING_CUTSCENE' && (
        <OpeningCutscene settings={settings} onComplete={completeOpeningCutscene} />
      )}

      {phase === 'PLAYING' && (
        <>
          {!hud.cutsceneActive && (
            <HudOverlay
              hud={hud}
              keyBindings={settings.controls}
              dialogueActive={Boolean(dialogue?.active)}
              onSelectHandSlot={handleSelectHandSlot}
              onToggleInventory={handleToggleInventory}
            />
          )}

          {subtitle && !dialogue?.active && !hud.inventoryOpen && (
            <div
              key={subtitle.id}
              aria-live="polite"
              className={`pointer-events-none fixed inset-x-0 z-30 flex justify-center px-4 ${
                hud.cutsceneActive ? 'bottom-8 sm:bottom-11' : 'bottom-24 sm:bottom-28'
              }`}
            >
              <div className="max-w-2xl border border-[#d8a24a]/35 bg-[#080a0f]/88 px-5 py-2.5 text-center shadow-[0_10px_28px_rgba(0,0,0,0.75)]">
                <p className={`text-[#efe7d8] ${getWorldSubtitleTextClass(settings.subtitleSize)}`}>
                  {subtitle.speaker && (
                    <span className="mr-2 font-semibold text-[#d8a24a]">
                      {subtitle.speaker}:
                    </span>
                  )}
                  <span>{subtitle.text}</span>
                </p>
              </div>
            </div>
          )}

          {hud.inventoryOpen && !dialogue?.active && (
            <InventoryModal
              hands={hud.hands}
              bag={hud.bag}
              activeHandIndex={hud.activeHandIndex}
              bagCapacity={hud.bagCapacity}
              equippedBackpack={hud.equippedBackpack}
              flashlightOn={hud.flashlightOn}
              onMoveSlot={handleMoveSlot}
              onQuickTransfer={handleQuickTransfer}
              onEquipSlot={handleEquipSlot}
              onInspectItem={handleInspectItem}
              onClose={handleCloseInventory}
            />
          )}
          {inspectedItem && !dialogue?.active && (
            <ItemInspectOverlay item={inspectedItem} onClose={() => setInspectedItem(null)} />
          )}
          {dialogue?.active && (
            <DialogueOverlay
              dialogue={dialogue}
              subtitleSize={settings.subtitleSize}
              interactKey={settings.controls.interact}
              onAdvance={handleAdvanceDialogue}
              onClose={handleCloseDialogue}
            />
          )}
        </>
      )}

      {phase === 'PAUSED' && (
        <>
          <PauseModal
            muted={muted}
            keyBindings={settings.controls}
            disableEscClose={pauseSettingsOpen}
            onResume={handleResume}
            onRestart={startOrRestart}
            onOpenSettings={() => {
              soundEngine.playUiClick();
              setPauseSettingsOpen(true);
            }}
            onToggleMute={handleToggleMute}
            onTitle={handleReturnToTitle}
          />
          {pauseSettingsOpen && (
            <SettingsModal
              settings={settings}
              allowModeChange={false}
              onChange={setSettings}
              onClose={() => setPauseSettingsOpen(false)}
            />
          )}
        </>
      )}

      {phase === 'LEVEL_COMPLETE' && (
        <LevelCompleteModal
          onPlayAgain={startOrRestart}
          onTitle={handleReturnToTitle}
        />
      )}
    </main>
  );
}
