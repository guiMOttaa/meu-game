import { useEffect, useState } from 'react';
import { Volume2, Captions, Mic, Keyboard, RotateCcw, Eye, AudioLines, X } from 'lucide-react';
import { motion } from 'motion/react';
import { COLORBLIND_OPTIONS } from '../game/accessibility';
import { soundEngine } from '../game/audio';
import {
  DEFAULT_KEY_BINDINGS,
  formatKeyCode,
  getWorldSubtitleTextClass,
} from '../game/settings';
import { useTouchViewport } from '../game/touch';
import {
  AudioLanguageMode,
  ColorblindMode,
  ControlAction,
  GameSettings,
  SubtitleSize,
} from '../game/types';

interface SettingsModalProps {
  settings: GameSettings;
  allowModeChange?: boolean;
  onChange: (next: GameSettings) => void;
  onClose: () => void;
}

type SettingsTab = 'audio' | 'colorblind' | 'controls';

interface ControlRowDef {
  action: ControlAction;
  label: string;
  hint?: string;
}

const MOVEMENT_ROWS: ControlRowDef[] = [
  { action: 'moveUp', label: 'Mover para Cima' },
  { action: 'moveDown', label: 'Mover para Baixo' },
  { action: 'moveLeft', label: 'Mover para Esquerda' },
  { action: 'moveRight', label: 'Mover para Direita' },
];

const ACTION_ROWS: ControlRowDef[] = [
  {
    action: 'interact',
    label: 'Interagir / Abrir e Fechar',
    hint: 'Vasculhar, portas, gavetas e diálogos',
  },
  {
    action: 'secondaryInteract',
    label: 'Interação Secundária',
    hint: 'Ligar ou desligar TV e luminária',
  },
  { action: 'inventory', label: 'Inventário e Mãos' },
  { action: 'mute', label: 'Silenciar Áudio' },
  {
    action: 'pause',
    label: 'Pausar',
    hint: 'Esc também pausa a partida',
  },
];

const ALL_CONTROL_ACTIONS: ControlAction[] = [
  ...MOVEMENT_ROWS.map((r) => r.action),
  ...ACTION_ROWS.map((r) => r.action),
];

export function SettingsModal({
  settings,
  allowModeChange = true,
  onChange,
  onClose,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('audio');
  const [listeningAction, setListeningAction] = useState<ControlAction | null>(null);
  const touch = useTouchViewport();
  const isTouchLandscape = touch.isTouch && !touch.isPortrait;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (listeningAction) {
        e.preventDefault();
        e.stopPropagation();
        if (e.code === 'Escape') {
          soundEngine.playUiClick();
          setListeningAction(null);
          return;
        }
        if (
          e.code === 'MetaLeft' ||
          e.code === 'MetaRight' ||
          e.code === 'ContextMenu'
        ) {
          return;
        }

        const prevCode = settings.controls[listeningAction];
        const nextControls = { ...settings.controls };

        // Swap cleanly if the pressed key is already mapped to another action
        for (const action of ALL_CONTROL_ACTIONS) {
          if (action !== listeningAction && nextControls[action] === e.code) {
            nextControls[action] = prevCode;
          }
        }
        nextControls[listeningAction] = e.code;

        soundEngine.playUiClick();
        onChange({ ...settings, controls: nextControls });
        setListeningAction(null);
        return;
      }

      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        soundEngine.playUiClick();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, listeningAction, settings, onChange]);

  const setMusicVolume = (musicVolume: number) => {
    onChange({ ...settings, musicVolume });
  };

  const setSpeechVolume = (speechVolume: number) => {
    onChange({ ...settings, speechVolume });
  };

  const setMode = (mode: AudioLanguageMode) => {
    if (!allowModeChange) return;
    soundEngine.playUiClick();
    onChange({ ...settings, mode });
  };

  const setSubtitleSize = (subtitleSize: SubtitleSize) => {
    soundEngine.playUiClick();
    onChange({ ...settings, subtitleSize });
  };

  const setSubtitleBgOpacity = (subtitleBgOpacity: number) => {
    onChange({ ...settings, subtitleBgOpacity: Math.max(0, Math.min(1, subtitleBgOpacity)) });
  };

  const toggleMonoAudio = () => {
    soundEngine.playUiClick();
    onChange({ ...settings, monoAudio: !settings.monoAudio });
  };

  const setColorblindMode = (colorblindMode: ColorblindMode) => {
    soundEngine.playUiClick();
    onChange({ ...settings, colorblindMode });
  };

  const handleResetControls = () => {
    soundEngine.playUiClick();
    setListeningAction(null);
    onChange({
      ...settings,
      controls: { ...DEFAULT_KEY_BINDINGS },
    });
  };

  const musicPct = Math.round(settings.musicVolume * 100);
  const speechPct = Math.round(settings.speechVolume * 100);
  const subtitleBgPct = Math.round(settings.subtitleBgOpacity * 100);

  const renderControlRow = (row: ControlRowDef) => {
    const isListening = listeningAction === row.action;
    const keyLabel = formatKeyCode(settings.controls[row.action]);

    return (
      <div
        key={row.action}
        className="flex items-center justify-between gap-3 border border-white/8 bg-[#0e121a] px-3 py-2"
      >
        <div className="min-w-0">
          <div className="text-xs font-medium text-[#e4dccd]">{row.label}</div>
          {row.hint && <div className="mt-0.5 text-[11px] text-[#7f8899]">{row.hint}</div>}
        </div>
        <button
          type="button"
          onClick={() => {
            soundEngine.playUiClick();
            setListeningAction((prev) => (prev === row.action ? null : row.action));
          }}
          className={`min-w-[84px] shrink-0 cursor-pointer border px-2.5 py-1.5 text-center font-mono text-xs font-semibold transition-colors ${
            isListening
              ? 'border-[#e6b665] bg-[#2c2113] text-[#fae3b6]'
              : 'border-white/15 bg-[#151a25] text-[#dfd7c8] hover:border-[#d8a24a]/65 hover:text-[#f5e3be]'
          }`}
        >
          {isListening ? 'Tecla...' : keyLabel}
        </button>
      </div>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Configurações"
      className={`fixed inset-0 z-50 flex items-center justify-center bg-[#040508]/85 ${
        touch.isShortLandscape ? 'p-2' : 'p-4 sm:p-6'
      }`}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        className={`flex w-full flex-col border border-white/14 bg-[#0b0e15] text-[#e6dfd3] shadow-2xl ${
          touch.isShortLandscape
            ? 'max-h-[94dvh] max-w-xl p-3.5'
            : isTouchLandscape
              ? 'max-h-[88dvh] max-w-xl p-5'
              : 'max-h-[90vh] max-w-lg p-6 sm:p-7'
        }`}
      >
        <div
          className={`flex items-start justify-between gap-4 border-b border-white/10 ${
            touch.isShortLandscape ? 'pb-2' : 'pb-4'
          }`}
        >
          <div>
            <p className="text-[11px] font-medium tracking-[0.2em] text-[#b89b6d] uppercase">
              Ajustes Gerais
            </p>
            <h2
              className={`mt-0.5 font-display font-semibold tracking-wide text-[#f2ebde] ${
                touch.isShortLandscape ? 'text-lg' : 'text-2xl'
              }`}
            >
              Configurações
            </h2>
          </div>

          <button
            type="button"
            onClick={() => {
              soundEngine.playUiClick();
              onClose();
            }}
            aria-label="Fechar configurações"
            className="flex h-8 w-8 cursor-pointer items-center justify-center border border-white/12 bg-[#121620] text-[#b5becb] transition-colors hover:border-white/30 hover:text-[#f2ebde]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Category Tabs */}
        <div
          className={`${touch.isShortLandscape ? 'mt-2.5' : 'mt-4'} grid grid-cols-3 gap-2`}
          role="tablist"
          aria-label="Categorias"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'audio'}
            onClick={() => {
              soundEngine.playUiClick();
              setListeningAction(null);
              setActiveTab('audio');
            }}
            className={`flex cursor-pointer items-center justify-center gap-1.5 border px-2.5 py-2 text-xs font-medium transition-colors ${
              activeTab === 'audio'
                ? 'border-[#d8a24a]/75 bg-[#201911] text-[#f4e2be]'
                : 'border-white/10 bg-[#10141c] text-[#9ea7b5] hover:border-white/25 hover:text-[#e4ded2]'
            }`}
          >
            <Volume2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Áudio e Legendas</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'colorblind'}
            onClick={() => {
              soundEngine.playUiClick();
              setListeningAction(null);
              setActiveTab('colorblind');
            }}
            className={`flex cursor-pointer items-center justify-center gap-1.5 border px-2.5 py-2 text-xs font-medium transition-colors ${
              activeTab === 'colorblind'
                ? 'border-[#d8a24a]/75 bg-[#201911] text-[#f4e2be]'
                : 'border-white/10 bg-[#10141c] text-[#9ea7b5] hover:border-white/25 hover:text-[#e4ded2]'
            }`}
          >
            <Eye className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Daltonismo</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'controls'}
            onClick={() => {
              soundEngine.playUiClick();
              setActiveTab('controls');
            }}
            className={`flex cursor-pointer items-center justify-center gap-1.5 border px-2.5 py-2 text-xs font-medium transition-colors ${
              activeTab === 'controls'
                ? 'border-[#d8a24a]/75 bg-[#201911] text-[#f4e2be]'
                : 'border-white/10 bg-[#10141c] text-[#9ea7b5] hover:border-white/25 hover:text-[#e4ded2]'
            }`}
          >
            <Keyboard className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Controles</span>
          </button>
        </div>

        <div
          className={`game-scrollbar flex-1 overflow-y-auto pr-2.5 ${
            touch.isShortLandscape ? 'mt-3 touch-pan-y' : 'mt-5'
          }`}
        >
          {activeTab === 'audio' ? (
            <div className="flex flex-col gap-5">
              {/* Volume da Música */}
              <div>
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 font-medium text-[#dfd7c8]">
                    <Volume2 className="h-3.5 w-3.5 text-[#d8a24a]" />
                    Volume da Música
                  </span>
                  <span className="font-mono text-[#b89b6d]">{musicPct}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={musicPct}
                  aria-label="Volume da Música"
                  onChange={(e) => setMusicVolume(Number(e.target.value) / 100)}
                  className="h-1.5 w-full cursor-pointer accent-[#d8a24a]"
                />
              </div>

              {/* Volume das Falas */}
              <div>
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 font-medium text-[#dfd7c8]">
                    <Mic className="h-3.5 w-3.5 text-[#d8a24a]" />
                    Volume das Falas
                  </span>
                  <span className="font-mono text-[#b89b6d]">
                    {settings.mode === 'subtitled' ? 'Desativado' : `${speechPct}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={speechPct}
                  disabled={settings.mode === 'subtitled'}
                  aria-label="Volume das Falas"
                  onChange={(e) => setSpeechVolume(Number(e.target.value) / 100)}
                  className="h-1.5 w-full cursor-pointer accent-[#d8a24a] disabled:cursor-not-allowed disabled:opacity-40"
                />
              </div>

              {/* Áudio Mono */}
              <div className="flex items-center justify-between gap-3 border border-white/10 bg-[#10141c] px-3.5 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs font-medium text-[#dfd7c8]">
                    <AudioLines className="h-3.5 w-3.5 text-[#d8a24a]" />
                    <span>Áudio Mono</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-[#8d96a6]">
                    {settings.monoAudio
                      ? 'Mono ativo (canais esquerdo e direito unidos)'
                      : 'Estéreo (padrão)'}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.monoAudio}
                  aria-label="Áudio Mono"
                  onClick={toggleMonoAudio}
                  className={`flex shrink-0 cursor-pointer items-center gap-2 border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    settings.monoAudio
                      ? 'border-[#d8a24a]/75 bg-[#201911] text-[#f4e2be]'
                      : 'border-white/15 bg-[#151a25] text-[#9ea7b5] hover:border-white/30 hover:text-[#e4ded2]'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`inline-block h-2 w-2 rounded-full transition-colors ${
                      settings.monoAudio ? 'bg-[#e6b665]' : 'bg-[#5c6575]'
                    }`}
                  />
                  <span>{settings.monoAudio ? 'Mono' : 'Estéreo'}</span>
                </button>
              </div>

              {/* Modo de Jogo (Dublagem vs Legendado) */}
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-[#dfd7c8]">Modo de Áudio</p>
                  {!allowModeChange && (
                    <span className="text-[11px] text-[#8d96a6]">Apenas na tela inicial</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={!allowModeChange}
                    onClick={() => setMode('dubbed')}
                    className={`flex flex-col items-start border px-3.5 py-2.5 text-left transition-colors ${
                      allowModeChange ? 'cursor-pointer' : 'cursor-not-allowed opacity-55'
                    } ${
                      settings.mode === 'dubbed'
                        ? 'border-[#d8a24a]/75 bg-[#201911] text-[#f4e2be]'
                        : 'border-white/10 bg-[#10141c] text-[#9ea7b5] enabled:hover:border-white/25 enabled:hover:text-[#e4ded2]'
                    }`}
                  >
                    <span className="text-xs font-semibold">Dublado</span>
                    <span className="mt-0.5 text-[11px] opacity-75">Vozes + Legendas</span>
                  </button>

                  <button
                    type="button"
                    disabled={!allowModeChange}
                    onClick={() => setMode('subtitled')}
                    className={`flex flex-col items-start border px-3.5 py-2.5 text-left transition-colors ${
                      allowModeChange ? 'cursor-pointer' : 'cursor-not-allowed opacity-55'
                    } ${
                      settings.mode === 'subtitled'
                        ? 'border-[#d8a24a]/75 bg-[#201911] text-[#f4e2be]'
                        : 'border-white/10 bg-[#10141c] text-[#9ea7b5] enabled:hover:border-white/25 enabled:hover:text-[#e4ded2]'
                    }`}
                  >
                    <span className="text-xs font-semibold">Legendado</span>
                    <span className="mt-0.5 text-[11px] opacity-75">Sem vozes, só texto</span>
                  </button>
                </div>
              </div>

              {/* Tamanho da Legenda */}
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-[#dfd7c8]">
                  <Captions className="h-3.5 w-3.5 text-[#d8a24a]" />
                  <span>Tamanho da Legenda</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'small', label: 'Pequena' },
                      { id: 'medium', label: 'Média' },
                      { id: 'large', label: 'Grande' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSubtitleSize(opt.id)}
                      className={`cursor-pointer border px-3 py-2 text-xs font-medium transition-colors ${
                        settings.subtitleSize === opt.id
                          ? 'border-[#d8a24a]/75 bg-[#201911] text-[#f4e2be]'
                          : 'border-white/10 bg-[#10141c] text-[#9ea7b5] hover:border-white/25 hover:text-[#e4ded2]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Opacidade do Fundo da Legenda */}
                <div className="mt-3.5">
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="font-medium text-[#dfd7c8]">
                      Opacidade do Fundo da Legenda
                    </span>
                    <span className="font-mono text-[#b89b6d]">{subtitleBgPct}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={subtitleBgPct}
                    aria-label="Opacidade do Fundo da Legenda"
                    onChange={(e) => setSubtitleBgOpacity(Number(e.target.value) / 100)}
                    className="h-1.5 w-full cursor-pointer accent-[#d8a24a]"
                  />
                </div>

                {/* Live Subtitle Preview (borda preservada, apenas transparência do fundo alterada) */}
                <div className="mt-2.5 flex justify-center border border-white/8 bg-[linear-gradient(135deg,#181f2c_0%,#111622_52%,#1d1712_100%)] px-3 py-3">
                  <div
                    style={{ backgroundColor: `rgba(8, 10, 15, ${settings.subtitleBgOpacity})` }}
                    className="border border-[#d8a24a]/35 px-4 py-1.5 text-center shadow-[0_6px_18px_rgba(0,0,0,0.45)]"
                  >
                    <p
                      className={`text-[#efe7d8] ${getWorldSubtitleTextClass(settings.subtitleSize)}`}
                    >
                      <span className="font-semibold text-[#d8a24a]">Voz: </span>
                      Acorda...
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'colorblind' ? (
            <div className="flex flex-col gap-4">
              <p className="text-xs leading-relaxed text-[#949eaf]">
                Ajusta o filtro de cores em tempo real para facilitar a distinção de sinais visuais, luzes e objetos na cena.
              </p>

              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-[#dfd7c8]">
                  <Eye className="h-3.5 w-3.5 text-[#d8a24a]" />
                  <span>Modo Daltonismo</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {COLORBLIND_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setColorblindMode(opt.id)}
                      className={`flex cursor-pointer flex-col items-start border px-3.5 py-2.5 text-left transition-colors ${
                        settings.colorblindMode === opt.id
                          ? 'border-[#d8a24a]/75 bg-[#201911] text-[#f4e2be]'
                          : 'border-white/10 bg-[#10141c] text-[#9ea7b5] hover:border-white/25 hover:text-[#e4ded2]'
                      }`}
                    >
                      <span className="text-xs font-semibold">{opt.label}</span>
                      <span className="mt-0.5 text-[11px] opacity-75">{opt.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="border border-white/8 bg-[#0e121a] px-3.5 py-3">
                <p className="mb-2 text-[11px] font-medium tracking-[0.14em] text-[#b89b6d] uppercase">
                  Referência de Contraste
                </p>
                <div className="grid grid-cols-4 gap-2">
                  <div className="flex flex-col items-center gap-1">
                    <span className="h-5 w-full border border-white/15 bg-[#d9483b]" />
                    <span className="text-[10px] text-[#949eaf]">Alerta</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="h-5 w-full border border-white/15 bg-[#3ea66b]" />
                    <span className="text-[10px] text-[#949eaf]">Seguro</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="h-5 w-full border border-white/15 bg-[#d8a24a]" />
                    <span className="text-[10px] text-[#949eaf]">Chave</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="h-5 w-full border border-white/15 bg-[#4a8fe7]" />
                    <span className="text-[10px] text-[#949eaf]">Luz</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-xs leading-relaxed text-[#949eaf]">
                Clique em qualquer tecla para alterá-la. Pressione <span className="font-mono text-[#dfd7c8]">Esc</span> para cancelar a edição.
              </p>

              <div>
                <p className="mb-2 text-[11px] font-semibold tracking-[0.16em] text-[#b89b6d] uppercase">
                  Movimento
                </p>
                <div className="flex flex-col gap-1.5">
                  {MOVEMENT_ROWS.map(renderControlRow)}
                </div>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-semibold tracking-[0.16em] text-[#b89b6d] uppercase">
                  Ações e Atalhos
                </p>
                <div className="flex flex-col gap-1.5">
                  {ACTION_ROWS.map(renderControlRow)}
                  <div className="flex items-center justify-between gap-3 border border-white/8 bg-[#0e121a]/70 px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-[#e4dccd]">
                        Trocar Item na Mão
                      </div>
                      <div className="mt-0.5 text-[11px] text-[#7f8899]">
                        Alterna entre os 3 espaços da barra inferior
                      </div>
                    </div>
                    <span className="min-w-[84px] shrink-0 border border-white/10 bg-[#121620] px-2.5 py-1.5 text-center font-mono text-[11px] font-medium text-[#b89b6d]">
                      1-3 / Scroll
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div
          className={`flex items-center justify-between gap-3 border-t border-white/10 ${
            touch.isShortLandscape ? 'mt-3 pt-2.5' : 'mt-6 pt-4'
          }`}
        >
          {activeTab === 'controls' ? (
            <button
              type="button"
              onClick={handleResetControls}
              className="flex cursor-pointer items-center gap-1.5 border border-white/12 bg-[#121620] px-3.5 py-2 text-xs font-medium text-[#b5becb] transition-colors hover:border-white/30 hover:text-[#f2ebde]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Restaurar padrão</span>
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={() => {
              soundEngine.playUiClick();
              onClose();
            }}
            className="cursor-pointer border border-[#d8a24a]/55 bg-[#1a1611] px-5 py-2 text-xs font-medium tracking-wide text-[#f3dfb8] transition-colors hover:border-[#e6b665] hover:bg-[#261f16]"
          >
            Fechar
          </button>
        </div>
      </motion.div>
    </div>
  );
}
