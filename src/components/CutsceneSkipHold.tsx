import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { soundEngine } from '../game/audio';

interface CutsceneSkipHoldProps {
  active: boolean;
  onSkip: () => void;
  holdDurationSec?: number;
  keyCode?: string;
  keyLabel?: string;
}

const DEFAULT_HOLD_DURATION_SEC = 3.8;
const RING_RADIUS = 19;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function CutsceneSkipHold({
  active,
  onSkip,
  holdDurationSec = DEFAULT_HOLD_DURATION_SEC,
  keyCode = 'KeyF',
  keyLabel = 'F',
}: CutsceneSkipHoldProps) {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);

  const holdingRef = useRef(false);
  const skippedRef = useRef(false);
  const startTimeRef = useRef(0);
  const onSkipRef = useRef(onSkip);
  onSkipRef.current = onSkip;

  useEffect(() => {
    if (!active) {
      holdingRef.current = false;
      skippedRef.current = false;
      setHolding(false);
      setProgress(0);
      return;
    }

    skippedRef.current = false;

    const resetHold = () => {
      if (!holdingRef.current) return;
      holdingRef.current = false;
      setHolding(false);
      setProgress(0);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== keyCode || skippedRef.current) return;
      e.preventDefault();
      if (!holdingRef.current) {
        holdingRef.current = true;
        startTimeRef.current = performance.now();
        setHolding(true);
        setProgress(0);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== keyCode) return;
      resetHold();
    };

    const onVisibilityChange = () => {
      if (document.hidden) resetHold();
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', resetHold);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', resetHold);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      holdingRef.current = false;
    };
  }, [active, keyCode]);

  useEffect(() => {
    if (!active || !holding) return;

    let rafId = 0;
    const durationMs = Math.max(400, holdDurationSec * 1000);

    const tick = (now: number) => {
      if (!holdingRef.current || skippedRef.current) return;
      const elapsed = Math.max(0, now - startTimeRef.current);
      const nextProgress = Math.min(1, elapsed / durationMs);
      setProgress(nextProgress);

      if (nextProgress >= 1) {
        skippedRef.current = true;
        holdingRef.current = false;
        setHolding(false);
        setProgress(0);
        soundEngine.playUiClick();
        onSkipRef.current();
        return;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [active, holding, holdDurationSec]);

  const angle = -Math.PI / 2 + progress * Math.PI * 2;
  const cx = 26;
  const cy = 26;
  const orbX = cx + RING_RADIUS * Math.cos(angle);
  const orbY = cy + RING_RADIUS * Math.sin(angle);
  const dashOffset = RING_CIRCUMFERENCE * (1 - progress);

  return (
    <AnimatePresence>
      {active && holding && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.14, ease: 'easeOut' }}
          aria-live="polite"
          aria-label="Segure F para pular a cutscene"
          className="pointer-events-none fixed right-4 bottom-4 z-50 flex flex-col items-center gap-1 select-none sm:right-6 sm:bottom-6"
        >
          <div className="relative flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#07090d]/85 shadow-[0_6px_22px_rgba(0,0,0,0.75)] backdrop-blur-[2px]">
            <svg width="52" height="52" viewBox="0 0 52 52" className="overflow-visible">
              <defs>
                <filter id="skip-orb-glow" x="-60%" y="-60%" width="220%" height="220%">
                  <feGaussianBlur stdDeviation="2.1" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Base circular track */}
              <circle
                cx={cx}
                cy={cy}
                r={RING_RADIUS}
                fill="none"
                stroke="rgba(255, 255, 255, 0.16)"
                strokeWidth="2.5"
              />

              {/* Circular charge arc */}
              <circle
                cx={cx}
                cy={cy}
                r={RING_RADIUS}
                fill="none"
                stroke="#d8a24a"
                strokeWidth="2.75"
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={dashOffset}
                transform={`rotate(-90 ${cx} ${cy})`}
              />

              {/* Glowing orb traveling around F as it charges */}
              <circle
                cx={orbX}
                cy={orbY}
                r="3.4"
                fill="#ffe7b3"
                filter="url(#skip-orb-glow)"
              />
            </svg>

            <span className="absolute font-mono text-sm font-bold tracking-tight text-[#f4e4c1]">
              {keyLabel}
            </span>
          </div>

          <span className="text-[10px] font-medium tracking-[0.16em] text-[#b89b6d] uppercase drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
            Pular
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
