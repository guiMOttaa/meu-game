import { useEffect } from 'react';
import { motion } from 'motion/react';
import { formatKeyCode } from '../game/settings';
import { KeyBindings } from '../game/types';

interface PauseModalProps {
  muted: boolean;
  keyBindings: KeyBindings;
  disableEscClose?: boolean;
  onResume: () => void;
  onRestart: () => void;
  onOpenSettings: () => void;
  onToggleMute: () => void;
  onTitle: () => void;
}

export function PauseModal({
  muted,
  keyBindings,
  disableEscClose = false,
  onResume,
  onRestart,
  onOpenSettings,
  onToggleMute,
  onTitle,
}: PauseModalProps) {
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

  const moveKeys = `${formatKeyCode(keyBindings.moveUp, true)}${formatKeyCode(
    keyBindings.moveLeft,
    true
  )}${formatKeyCode(keyBindings.moveDown, true)}${formatKeyCode(keyBindings.moveRight, true)}`;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#040508]/82 p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm rounded-sm border border-white/12 bg-[#0d1017] p-7 text-[#e6dfd3] shadow-2xl"
      >
        <h2 className="font-display text-2xl font-semibold tracking-wide text-[#f2ebde]">
          Investigação Pausada
        </h2>
        <p className="mt-1.5 text-xs text-[#8f99a8]">
          {moveKeys} Mover · {formatKeyCode(keyBindings.interact, true)} Interagir ·{' '}
          {formatKeyCode(keyBindings.secondaryInteract, true)} Aparelhos ·{' '}
          {formatKeyCode(keyBindings.inventory, true)} Inventário
        </p>

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onResume}
            className="w-full cursor-pointer rounded-sm border border-[#d8a24a]/55 bg-[#1a1611] px-4 py-2.5 text-sm font-medium text-[#f3dfb8] transition-colors duration-150 hover:bg-[#261f16]"
          >
            Continuar
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="w-full cursor-pointer rounded-sm border border-white/12 bg-[#141923] px-4 py-2.5 text-sm font-medium text-[#d4dce7] transition-colors duration-150 hover:border-white/25 hover:bg-[#1a202c]"
          >
            Reiniciar Nível
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="w-full cursor-pointer rounded-sm border border-white/12 bg-[#141923] px-4 py-2.5 text-sm font-medium text-[#d4dce7] transition-colors duration-150 hover:border-white/25 hover:bg-[#1a202c]"
          >
            Configurações
          </button>
          <button
            type="button"
            onClick={onToggleMute}
            className="w-full cursor-pointer rounded-sm border border-white/12 bg-[#141923] px-4 py-2.5 text-sm font-medium text-[#d4dce7] transition-colors duration-150 hover:border-white/25 hover:bg-[#1a202c]"
          >
            {muted ? 'Ativar Áudio' : 'Silenciar Áudio'}
          </button>
          <button
            type="button"
            onClick={onTitle}
            className="w-full cursor-pointer rounded-sm border border-white/8 bg-transparent px-4 py-2.5 text-sm text-[#98a2b2] transition-colors duration-150 hover:border-white/20 hover:text-[#e4ded2]"
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
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#040508]/90 p-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-2xl overflow-hidden rounded-sm border border-white/12 bg-[#0b0e14] shadow-2xl"
      >
        <div className="relative aspect-16/9 w-full overflow-hidden bg-[#07090d]">
          <img
            src="/src/assets/images/corridor_gate_ending_1795747089146.jpg"
            alt="Um portão monumental de ferro e pedra ao fim de um corredor estreito e sombrio"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover object-center"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-[#0b0e14] via-[#0b0e14]/25 to-transparent"
          />
        </div>

        <div className="px-7 pb-7 pt-4 sm:px-9 sm:pb-8">
          <p className="text-xs font-medium tracking-[0.2em] text-[#c49f62] uppercase">
            Fim da Sequência
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-wide text-[#f2ebde] sm:text-4xl">
            Primeiro Nível Concluído
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[#aab3c2]">
            Ao final do corredor estreito, o imponente portão de ferro permanece selado diante do que
            espera lá dentro. O estudo fechado era apenas o limiar.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onPlayAgain}
              className="cursor-pointer rounded-sm border border-[#d8a24a]/60 bg-[#1a1611] px-6 py-2.5 text-sm font-medium text-[#f3dfb8] transition-colors duration-150 hover:bg-[#261f16] whitespace-nowrap shrink-0"
            >
              Jogar Novamente
            </button>
            <button
              type="button"
              onClick={onTitle}
              className="cursor-pointer rounded-sm border border-white/12 bg-[#141923] px-5 py-2.5 text-sm font-medium text-[#cfd7e3] transition-colors duration-150 hover:border-white/25 hover:text-white whitespace-nowrap shrink-0"
            >
              Voltar ao Título
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
