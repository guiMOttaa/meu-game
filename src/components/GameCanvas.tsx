import { useEffect, useRef } from 'react';
import { GameEngine, HudSnapshot } from '../game/engine';
import { DialogueState, GamePhase, KeyBindings, SubtitleCue } from '../game/types';

interface GameCanvasProps {
  phase: GamePhase;
  resetToken: number;
  keyBindings: KeyBindings;
  onHudUpdate: (hud: HudSnapshot) => void;
  onSubtitle: (cue: SubtitleCue | null) => void;
  onDialogueChange: (dialogue: DialogueState | null) => void;
  onLevelComplete: () => void;
  onPauseRequest: () => void;
  onToggleMute: () => void;
  onEngineReady: (engine: GameEngine | null) => void;
}

export function GameCanvas({
  phase,
  resetToken,
  keyBindings,
  onHudUpdate,
  onSubtitle,
  onDialogueChange,
  onLevelComplete,
  onPauseRequest,
  onToggleMute,
  onEngineReady,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const keyBindingsRef = useRef<KeyBindings>(keyBindings);
  keyBindingsRef.current = keyBindings;

  const callbacksRef = useRef({
    onHudUpdate,
    onSubtitle,
    onDialogueChange,
    onLevelComplete,
    onPauseRequest,
    onToggleMute,
  });
  callbacksRef.current = {
    onHudUpdate,
    onSubtitle,
    onDialogueChange,
    onLevelComplete,
    onPauseRequest,
    onToggleMute,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new GameEngine(canvas, {
      onHudUpdate: (hud) => callbacksRef.current.onHudUpdate(hud),
      onSubtitle: (cue) => callbacksRef.current.onSubtitle(cue),
      onDialogueChange: (dialogue) => callbacksRef.current.onDialogueChange(dialogue),
      onLevelComplete: () => callbacksRef.current.onLevelComplete(),
      onPauseRequest: () => callbacksRef.current.onPauseRequest(),
      onToggleMute: () => callbacksRef.current.onToggleMute(),
    });
    engine.setKeyBindings(keyBindingsRef.current);

    engineRef.current = engine;
    onEngineReady(engine);
    engine.startLoop();

    const onKeyDown = (e: KeyboardEvent) => engine.handleKeyDown(e);
    const onKeyUp = (e: KeyboardEvent) => engine.handleKeyUp(e);
    const onBlur = () => engine.clearInputs();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      engine.destroy();
      engineRef.current = null;
      onEngineReady(null);
    };
  }, [onEngineReady]);

  useEffect(() => {
    engineRef.current?.setKeyBindings(keyBindings);
  }, [keyBindings]);

  useEffect(() => {
    engineRef.current?.setPhase(phase);
  }, [phase]);

  useEffect(() => {
    if (resetToken > 0) {
      engineRef.current?.resetLevel();
    }
  }, [resetToken]);

  return (
    <div className="fixed inset-0 bg-[#050609]">
      <canvas
        ref={canvasRef}
        onClick={(e) => engineRef.current?.handleCanvasClick(e.clientX, e.clientY)}
        onWheel={(e) => engineRef.current?.cycleHandSlot(e.deltaY)}
        className="block h-full w-full"
      />
    </div>
  );
}
