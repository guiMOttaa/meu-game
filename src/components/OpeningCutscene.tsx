import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { soundEngine } from '../game/audio';
import { GameSettings, SubtitleSize } from '../game/types';

const OPENING_AUDIO_URL = '/assets/aistudio/ini_do_game_4c50b511.m4a';
const CUTSCENE_TOTAL_DURATION = 49.4;

type SpeakerRole = 'writer' | 'entity';

interface CutsceneLine {
  id: string;
  start: number;
  end: number;
  speaker: SpeakerRole;
  text: string;
}

interface CutsceneSfxCue {
  id: string;
  at: number;
  run: () => void;
}

const CUTSCENE_LINES: CutsceneLine[] = [
  {
    id: 'w1',
    start: 1.75,
    end: 5.25,
    speaker: 'writer',
    text: 'Não vai dar tempo. A entrega é amanhã...',
  },
  {
    id: 'w2',
    start: 5.3,
    end: 8.55,
    speaker: 'writer',
    text: '...e esse final continua um abismo na minha cabeça.',
  },
  {
    id: 'w3',
    start: 8.6,
    end: 11.45,
    speaker: 'writer',
    text: 'Eu não consigo terminar o livro!',
  },
  {
    id: 'e1',
    start: 13.6,
    end: 16.05,
    speaker: 'entity',
    text: 'Desesperador, não é?',
  },
  {
    id: 'e2',
    start: 17.2,
    end: 20.6,
    speaker: 'entity',
    text: 'Eu posso ajudar você a finalizar essa história...',
  },
  {
    id: 'e3',
    start: 20.65,
    end: 24.3,
    speaker: 'entity',
    text: '...e se tornar um dos escritores mais incríveis do mundo.',
  },
  {
    id: 'e4',
    start: 24.4,
    end: 28.45,
    speaker: 'entity',
    text: 'O que você acha? É só assinar esse contrato.',
  },
  {
    id: 'w4',
    start: 29.85,
    end: 34.1,
    speaker: 'writer',
    text: 'Feito! Eu... eu preciso terminar isso o mais rápido possível.',
  },
  {
    id: 'w5',
    start: 34.15,
    end: 36.25,
    speaker: 'writer',
    text: 'Aonde eu assino?',
  },
  {
    id: 'e5',
    start: 36.55,
    end: 41.2,
    speaker: 'entity',
    text: 'Ótimo. Assine aqui... ali... e ali.',
  },
  {
    id: 'e6',
    start: 41.55,
    end: 44.35,
    speaker: 'entity',
    text: 'Nós temos um contrato fechado, garoto.',
  },
];

const CUTSCENE_SFX_CUES: CutsceneSfxCue[] = [
  // Initial panic heartbeats (muffled chest/head) accelerating with tension
  { id: 'hb_1', at: 0.9, run: () => soundEngine.playCutsceneHeartbeat(0.45, 0.9) },
  { id: 'hb_2', at: 1.75, run: () => soundEngine.playCutsceneHeartbeat(0.55, 0.95) },
  { id: 'hb_3', at: 2.55, run: () => soundEngine.playCutsceneHeartbeat(0.62, 1.0) },
  { id: 'hb_4', at: 3.35, run: () => soundEngine.playCutsceneHeartbeat(0.68, 1.05) },
  { id: 'hb_5', at: 4.15, run: () => soundEngine.playCutsceneHeartbeat(0.75, 1.08) },
  { id: 'hb_6', at: 4.95, run: () => soundEngine.playCutsceneHeartbeat(0.8, 1.12) },
  { id: 'hb_7', at: 5.7, run: () => soundEngine.playCutsceneHeartbeat(0.84, 1.15) },
  { id: 'hb_8', at: 6.4, run: () => soundEngine.playCutsceneHeartbeat(0.88, 1.18) },
  { id: 'hb_9', at: 7.1, run: () => soundEngine.playCutsceneHeartbeat(0.92, 1.22) },
  { id: 'hb_10', at: 7.75, run: () => soundEngine.playCutsceneHeartbeat(0.96, 1.25) },
  { id: 'hb_11', at: 8.4, run: () => soundEngine.playCutsceneHeartbeat(1.0, 1.28) },
  { id: 'hb_12', at: 9.05, run: () => soundEngine.playCutsceneHeartbeat(1.0, 1.3) },
  { id: 'hb_13', at: 9.7, run: () => soundEngine.playCutsceneHeartbeat(1.0, 1.32) },
  { id: 'hb_14', at: 10.35, run: () => soundEngine.playCutsceneHeartbeat(1.0, 1.35) },
  { id: 'hb_15', at: 11.0, run: () => soundEngine.playCutsceneHeartbeat(0.92, 1.35) },

  // Entity materializes in the darkness
  { id: 'entity_enter', at: 11.55, run: () => soundEngine.playCutsceneEntityEntrance() },

  // Entity dark sigh
  { id: 'entity_sigh', at: 16.05, run: () => soundEngine.playCutsceneEntitySigh() },

  // Subtle low ominous suspense drone while offering the contract
  { id: 'drone_start', at: 17.2, run: () => soundEngine.startCutsceneEntityDrone() },
  { id: 'drone_stop', at: 28.45, run: () => soundEngine.stopCutsceneEntityDrone() },

  // Writer's tense quick heartbeats upon hearing the offer
  { id: 'hb_offer_1', at: 28.45, run: () => soundEngine.playCutsceneHeartbeat(0.88, 1.22) },
  { id: 'hb_offer_2', at: 29.0, run: () => soundEngine.playCutsceneHeartbeat(0.95, 1.28) },
  { id: 'hb_offer_3', at: 29.55, run: () => soundEngine.playCutsceneHeartbeat(1.0, 1.32) },

  // Three crisp pen-on-paper strokes matching "aqui... ali... e ali."
  { id: 'pen_1', at: 38.55, run: () => soundEngine.playCutscenePenScratch(0) },
  { id: 'pen_2', at: 39.45, run: () => soundEngine.playCutscenePenScratch(1) },
  { id: 'pen_3', at: 40.35, run: () => soundEngine.playCutscenePenScratch(2) },

  // Entity vanishes into darkness with evanescent dissolve + weak fading heartbeat
  { id: 'entity_vanish', at: 44.6, run: () => soundEngine.playCutsceneEntityVanish() },
  { id: 'hb_end_1', at: 47.4, run: () => soundEngine.playCutsceneHeartbeat(0.3, 0.85) },
  { id: 'hb_end_2', at: 48.55, run: () => soundEngine.playCutsceneHeartbeat(0.16, 0.8) },
];

interface OpeningCutsceneProps {
  settings: GameSettings;
  onComplete: () => void;
}

function getWriterScaleClass(size: SubtitleSize): string {
  switch (size) {
    case 'small':
      return 'text-xl sm:text-3xl lg:text-[34px]';
    case 'large':
      return 'text-3xl sm:text-[42px] lg:text-[48px]';
    case 'medium':
    default:
      return 'text-2xl sm:text-4xl lg:text-[40px]';
  }
}

function getEntityScaleClass(size: SubtitleSize): string {
  switch (size) {
    case 'small':
      return 'text-2xl sm:text-4xl lg:text-[44px]';
    case 'large':
      return 'text-4xl sm:text-[54px] lg:text-[62px]';
    case 'medium':
    default:
      return 'text-3xl sm:text-5xl lg:text-[54px]';
  }
}

export function OpeningCutscene({ settings, onComplete }: OpeningCutsceneProps) {
  const [elapsed, setElapsed] = useState(0);
  const completedRef = useRef(false);
  const firedCuesRef = useRef<Set<string>>(new Set());
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    soundEngine.prefetchWakeAudioBytes();
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        if (!completedRef.current) {
          completedRef.current = true;
          soundEngine.stopCutsceneEntityDrone();
          onCompleteRef.current();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    let active = true;
    let rafId = 0;
    let audioPlaying = false;
    let clockTime = 0;
    let lastPerf = performance.now();

    const shouldPlaySpeech =
      settings.mode === 'dubbed' && !soundEngine.isMuted() && settings.speechVolume > 0.005;

    const audio = new Audio(OPENING_AUDIO_URL);
    audio.preload = 'auto';
    audio.volume = shouldPlaySpeech
      ? Math.max(0, Math.min(1, settings.speechVolume))
      : 0;

    if (shouldPlaySpeech) {
      void audio
        .play()
        .then(() => {
          if (active) audioPlaying = true;
        })
        .catch(() => {
          audioPlaying = false;
        });
    }

    const tick = (now: number) => {
      if (!active || completedRef.current) return;

      const dt = Math.min(0.08, Math.max(0, (now - lastPerf) / 1000));
      lastPerf = now;

      if (audioPlaying && !audio.paused && !audio.ended) {
        clockTime = audio.currentTime;
      } else {
        clockTime += dt;
      }

      for (const cue of CUTSCENE_SFX_CUES) {
        if (clockTime >= cue.at && !firedCuesRef.current.has(cue.id)) {
          firedCuesRef.current.add(cue.id);
          cue.run();
        }
      }

      setElapsed(clockTime);

      if (clockTime >= CUTSCENE_TOTAL_DURATION) {
        completedRef.current = true;
        soundEngine.stopCutsceneEntityDrone();
        onCompleteRef.current();
        return;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      active = false;
      cancelAnimationFrame(rafId);
      audio.pause();
      audio.currentTime = 0;
      soundEngine.stopCutsceneEntityDrone();
    };
  }, [settings.mode, settings.speechVolume]);

  const activeLine = useMemo(
    () => CUTSCENE_LINES.find((line) => elapsed >= line.start && elapsed <= line.end) ?? null,
    [elapsed]
  );

  const entityAuraVisible =
    activeLine?.speaker === 'entity' || (elapsed >= 11.55 && elapsed <= 13.6);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center overflow-hidden bg-black px-6 text-center select-none sm:px-12">
      {/* Subtle ominous darkness pulse strictly around entity presence */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 transition-opacity duration-700 ${
          entityAuraVisible ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(110, 14, 14, 0.16) 0%, rgba(0, 0, 0, 0.94) 55%, #000000 100%)',
        }}
      />

      <div className="relative z-10 flex w-full max-w-3xl items-center justify-center">
        <AnimatePresence mode="wait">
          {activeLine &&
            (activeLine.speaker === 'writer' ? (
              <motion.p
                key={activeLine.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.24, ease: 'easeOut' }}
                className={`font-writer leading-snug font-normal text-[#f4efe6] drop-shadow-[0_2px_14px_rgba(255,245,225,0.14)] text-balance ${getWriterScaleClass(
                  settings.subtitleSize
                )}`}
              >
                {activeLine.text}
              </motion.p>
            ) : (
              <motion.p
                key={activeLine.id}
                initial={{ opacity: 0, scale: 1.06 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className={`font-entity leading-tight font-bold tracking-[0.04em] text-[#e54b40] drop-shadow-[0_0_24px_rgba(190,26,22,0.65)] text-balance ${getEntityScaleClass(
                  settings.subtitleSize
                )}`}
              >
                {activeLine.text}
              </motion.p>
            ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
