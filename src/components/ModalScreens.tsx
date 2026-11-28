import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useTouchViewport } from '../game/touch';
import { KeyBindings } from '../game/types';

interface PauseModalProps {
  keyBindings: KeyBindings;
  disableEscClose?: boolean;
  onResume: () => void;
  onSaveGame: () => boolean;
  onRestart: () => void;
  onOpenSettings: () => void;
  onTitle: () => void;
}

export function PauseModal({
  keyBindings,
  disableEscClose = false,
  onResume,
  onSaveGame,
  onRestart,
  onOpenSettings,
  onTitle,
}: PauseModalProps) {
  const [savedNotice, setSavedNotice] = useState(false);
  const touch = useTouchViewport();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (disableEscClose) return;
      if (e.code === 'Escape' || e.code === keyBindings.pause) {
        e.preventDefault();
        onResume();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onResume, disableEscClose, keyBindings.pause]);

  useEffect(() => {
    if (!savedNotice) return;
    const timer = window.setTimeout(() => setSavedNotice(false), 2000);
    return () => window.clearTimeout(timer);
  }, [savedNotice]);

  return (
    <div
      className={`fixed inset-0 z-40 flex items-center justify-center bg-[#040508]/82 ${
        touch.isShortLandscape ? 'p-3' : 'p-6'
      }`}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        className={`w-full rounded-sm border border-white/12 bg-[#0d1017] text-[#e6dfd3] shadow-2xl ${
          touch.isShortLandscape
            ? 'max-h-[92dvh] max-w-md overflow-y-auto p-4'
            : 'max-w-sm p-7'
        }`}
      >
        <h2
          className={`font-display font-semibold tracking-wide text-[#f2ebde] ${
            touch.isShortLandscape ? 'text-xl' : 'text-2xl'
          }`}
        >
          Investigação Pausada
        </h2>

        <div
          className={
            touch.isShortLandscape
              ? 'mt-3.5 grid grid-cols-2 gap-2'
              : 'mt-6 flex flex-col gap-2.5'
          }
        >
          <button
            type="button"
            onClick={onResume}
            className={`w-full cursor-pointer rounded-sm border border-[#d8a24a]/55 bg-[#1a1611] px-4 text-sm font-medium text-[#f3dfb8] transition-colors duration-150 hover:bg-[#261f16] ${
              touch.isShortLandscape ? 'col-span-2 py-2' : 'py-2.5'
            }`}
          >
            Continuar
          </button>
          <button
            type="button"
            onClick={() => {
              const ok = onSaveGame();
              if (ok) setSavedNotice(true);
            }}
            className={`w-full cursor-pointer rounded-sm border px-4 text-sm font-medium transition-colors duration-150 ${
              touch.isShortLandscape ? 'py-2' : 'py-2.5'
            } ${
              savedNotice
                ? 'border-[#d8a24a]/70 bg-[#221c13] text-[#f5dfb4]'
                : 'border-white/12 bg-[#141923] text-[#d4dce7] hover:border-[#d8a24a]/45 hover:bg-[#1a202c]'
            }`}
          >
            {savedNotice ? 'Progresso Salvo' : 'Salvar Jogo'}
          </button>
          <button
            type="button"
            onClick={onRestart}
            className={`w-full cursor-pointer rounded-sm border border-white/12 bg-[#141923] px-4 text-sm font-medium text-[#d4dce7] transition-colors duration-150 hover:border-white/25 hover:bg-[#1a202c] ${
              touch.isShortLandscape ? 'py-2' : 'py-2.5'
            }`}
          >
            Reiniciar Nível
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className={`w-full cursor-pointer rounded-sm border border-white/12 bg-[#141923] px-4 text-sm font-medium text-[#d4dce7] transition-colors duration-150 hover:border-white/25 hover:bg-[#1a202c] ${
              touch.isShortLandscape ? 'py-2' : 'py-2.5'
            }`}
          >
            Configurações
          </button>
          <button
            type="button"
            onClick={onTitle}
            className={`w-full cursor-pointer rounded-sm border border-white/8 bg-transparent px-4 text-sm text-[#98a2b2] transition-colors duration-150 hover:border-white/20 hover:text-[#e4ded2] ${
              touch.isShortLandscape ? 'py-2' : 'py-2.5'
            }`}
          >
            Voltar ao Título
          </button>
        </div>
      </motion.div>
    </div>
  );
}

interface LevelCompleteModalProps {
  onPlayAgain: () => void;
  onTitle: () => void;
}

export function LevelCompleteModal({ onPlayAgain, onTitle }: LevelCompleteModalProps) {
  const touch = useTouchViewport();

  return (
    <div
      className={`fixed inset-0 z-40 flex items-center justify-center bg-[#040508]/90 ${
        touch.isShortLandscape ? 'p-3' : 'p-6'
      }`}
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className={`w-full overflow-hidden rounded-sm border border-white/12 bg-[#0b0e14] shadow-2xl ${
          touch.isShortLandscape
            ? 'grid max-h-[92dvh] max-w-3xl grid-cols-[1.05fr_1fr]'
            : 'max-w-2xl'
        }`}
      >
        <div
          className={`relative overflow-hidden bg-[#07090d] ${
            touch.isShortLandscape ? 'h-full min-h-[220px]' : 'aspect-16/9 w-full'
          }`}
        >
          <img
            src="/src/assets/images/corridor_gate_ending_1795747089146.jpg"
            alt="Um portão monumental de ferro e pedra ao fim de um corredor estreito e sombrio"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover object-center"
          />
          <div
            aria-hidden="true"
            className={`absolute inset-0 ${
              touch.isShortLandscape
                ? 'bg-gradient-to-r from-transparent via-[#0b0e14]/25 to-[#0b0e14]'
                : 'bg-gradient-to-t from-[#0b0e14] via-[#0b0e14]/25 to-transparent'
            }`}
          />
        </div>

        <div
          className={
            touch.isShortLandscape
              ? 'flex flex-col justify-center p-5'
              : 'px-7 pb-7 pt-4 sm:px-9 sm:pb-8'
          }
        >
          <p className="text-xs font-medium tracking-[0.2em] text-[#c49f62] uppercase">
            Fim da Sequência
          </p>
          <h2
            className={`mt-1.5 font-display font-semibold tracking-wide text-[#f2ebde] ${
              touch.isShortLandscape ? 'text-2xl' : 'mt-2 text-3xl sm:text-4xl'
            }`}
          >
            Primeiro Nível Concluído
          </h2>
          <p
            className={`leading-relaxed text-[#aab3c2] ${
              touch.isShortLandscape ? 'mt-2 text-xs' : 'mt-3 text-sm'
            }`}
          >
            Ao final do corredor estreito, o imponente portão de ferro permanece selado diante do que
            espera lá dentro. O estudo fechado era apenas o limiar.
          </p>

          <div
            className={`flex flex-wrap items-center gap-2.5 ${
              touch.isShortLandscape ? 'mt-4' : 'mt-7 gap-3'
            }`}
          >
            <button
              type="button"
              onClick={onPlayAgain}
              className="cursor-pointer rounded-sm border border-[#d8a24a]/60 bg-[#1a1611] px-5 py-2 text-xs font-medium text-[#f3dfb8] transition-colors duration-150 hover:bg-[#261f16] whitespace-nowrap shrink-0 sm:px-6 sm:py-2.5 sm:text-sm"
            >
              Jogar Novamente
            </button>
            <button
              type="button"
              onClick={onTitle}
              className="cursor-pointer rounded-sm border border-white/12 bg-[#141923] px-4 py-2 text-xs font-medium text-[#cfd7e3] transition-colors duration-150 hover:border-white/25 hover:text-white whitespace-nowrap shrink-0 sm:px-5 sm:py-2.5 sm:text-sm"
            >
              Voltar ao Título
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
