import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { getNpcWatcherPortraits, getProtagonistPortraits } from '../game/portraits';
import { formatKeyCode, getDialogueTextClass } from '../game/settings';
import { DialogueState, SubtitleSize } from '../game/types';

interface DialogueOverlayProps {
  dialogue: DialogueState;
  subtitleSize?: SubtitleSize;
  interactKey?: string;
  onAdvance: () => void;
  onClose: () => void;
}

export function DialogueOverlay({
  dialogue,
  subtitleSize = 'medium',
  interactKey = 'KeyE',
  onAdvance,
  onClose,
}: DialogueOverlayProps) {
  const npcFrames = useMemo(() => getNpcWatcherPortraits(), []);
  const protagFrames = useMemo(() => getProtagonistPortraits(), []);

  const [mouthStep, setMouthStep] = useState(0);
  const [blinking, setBlinking] = useState(false);
  const [revealedChars, setRevealedChars] = useState(0);

  // Animate NPC mouth frames while real voice audio is playing
  useEffect(() => {
    if (!dialogue.isSpeaking) {
      setMouthStep(0);
      return;
    }
    const id = window.setInterval(() => {
      setMouthStep((prev) => (prev + 1) % 4);
    }, 135);
    return () => window.clearInterval(id);
  }, [dialogue.isSpeaking]);

  // Subtle idle eye blink on the silent protagonist portrait
  useEffect(() => {
    let blinkTimeout: number | null = null;
    const interval = window.setInterval(() => {
      setBlinking(true);
      blinkTimeout = window.setTimeout(() => setBlinking(false), 140);
    }, 3800);
    return () => {
      window.clearInterval(interval);
      if (blinkTimeout !== null) window.clearTimeout(blinkTimeout);
    };
  }, []);

  // Typewriter text reveal synced cleanly with each spoken line
  useEffect(() => {
    setRevealedChars(0);
    const len = dialogue.text.length;
    if (len === 0) return;
    const stepMs = Math.max(22, Math.min(48, Math.floor(2100 / len)));
    const id = window.setInterval(() => {
      setRevealedChars((prev) => {
        if (prev >= len) {
          window.clearInterval(id);
          return len;
        }
        return prev + 1;
      });
    }, stepMs);
    return () => window.clearInterval(id);
  }, [dialogue.clipIndex, dialogue.text]);

  const npcPortraitSrc = !dialogue.isSpeaking
    ? npcFrames.closed
    : mouthStep === 0
      ? npcFrames.halfOpen
      : mouthStep === 1
        ? npcFrames.open
        : mouthStep === 2
          ? npcFrames.halfOpen
          : npcFrames.closed;

  const isLastLine = dialogue.clipIndex + 1 >= dialogue.totalClips;
  const visibleText = dialogue.text.slice(0, revealedChars);

  return (
    <div className="fixed inset-0 z-30 flex flex-col justify-end pointer-events-auto">
      {/* Clicking open backdrop advances or closes cleanly */}
      <div
        onClick={onAdvance}
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-[#05070b]/92 via-[#05070b]/35 to-transparent"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-6xl items-end justify-between px-3 pb-3 sm:px-8 sm:pb-6">
        {/* LEFT SIDE: Speaking NPC Bust Portrait + Angled Speech Box */}
        <div className="flex items-end gap-2 sm:gap-3 min-w-0 flex-1">
          <motion.div
            initial={{ x: -36, opacity: 0 }}
            animate={{
              x: 0,
              opacity: 1,
              y: dialogue.isSpeaking && mouthStep % 2 === 1 ? -2 : 0,
            }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="relative shrink-0 select-none"
          >
            <img
              src={npcPortraitSrc}
              alt={dialogue.speakerName}
              draggable={false}
              style={{ imageRendering: 'pixelated' }}
              className="h-40 w-36 object-contain drop-shadow-[0_12px_20px_rgba(0,0,0,0.85)] sm:h-56 sm:w-48"
            />
          </motion.div>

          {/* Vertical Accent Bar + Nameplate + Speech Box (CrossCode-inspired) */}
          <motion.div
            initial={{ y: 14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="mb-3 flex max-w-md flex-1 items-stretch gap-2.5 sm:mb-6"
          >
            {/* Left vertical speaker bar */}
            <div
              className={`w-1 shrink-0 rounded-xs transition-colors duration-200 ${
                dialogue.isSpeaking
                  ? 'bg-[#d8a24a] shadow-[0_0_12px_rgba(216,162,74,0.45)]'
                  : 'bg-[#5c687c]'
              }`}
            />

            <div className="flex flex-1 flex-col gap-1.5">
              {/* Speaker Nameplate */}
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center border border-[#d8a24a]/45 bg-[#0a0d14]/94 px-3 py-1 text-xs font-semibold tracking-wider text-[#f0dab0] uppercase">
                  <span>{dialogue.speakerName}</span>
                </div>
              </div>

              {/* Main Dialogue Box */}
              <div
                onClick={onAdvance}
                className="relative cursor-pointer border border-white/18 bg-[#090c12]/92 px-4 py-3 text-[#ece4d6] shadow-[0_14px_32px_rgba(0,0,0,0.65)] sm:px-5 sm:py-3.5"
              >
                <p className={`min-h-[2.8em] ${getDialogueTextClass(subtitleSize)}`}>
                  {visibleText}
                </p>

                <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-white/8 pt-2">
                  <button
                    type="button"
                    aria-label="Fechar diálogo"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClose();
                    }}
                    className="cursor-pointer font-mono text-[11px] text-[#8e98a8] transition-colors hover:text-[#dfd8cb]"
                  >
                    [Esc]
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAdvance();
                    }}
                    className="inline-flex cursor-pointer items-center gap-1.5 font-mono text-xs font-medium text-[#e6b665] transition-colors hover:text-[#f7d899]"
                  >
                    <span>
                      [{formatKeyCode(interactKey, true)}]{' '}
                      {isLastLine ? 'Encerrar' : 'Continuar'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* RIGHT SIDE: Silent Protagonist Portrait */}
        <motion.div
          initial={{ x: 36, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="relative hidden shrink-0 select-none sm:block"
        >
          <img
            src={blinking ? protagFrames.blink : protagFrames.idle}
            alt="Investigador"
            draggable={false}
            style={{ imageRendering: 'pixelated' }}
            className="h-56 w-48 object-contain brightness-90 drop-shadow-[0_12px_20px_rgba(0,0,0,0.85)]"
          />
        </motion.div>
      </div>
    </div>
  );
}
