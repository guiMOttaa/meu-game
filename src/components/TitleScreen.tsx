import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Settings } from 'lucide-react';
import { motion } from 'motion/react';
import studyBackdropImg from '../assets/images/study_title_backdrop_clean_1795749762511.jpg';
import { soundEngine } from '../game/audio';
import { GameSettings } from '../game/types';
import { SettingsModal } from './SettingsModal';

const TITLE_THEME_URL =
  '/assets/aistudio/AudioTranscriberAI_ABERTURA_DE_O_SEGREDO_NA_ILHA_VERS_O_COMPLETA__cover__43769624.mp3';

interface TitleScreenProps {
  settings: GameSettings;
  onUpdateSettings: (next: GameSettings) => void;
  onStart: () => void;
  onBackToChapters?: () => void;
  animateFxEntry?: boolean;
}

interface RainDrop {
  u: number;
  v: number;
  speed: number;
  len: number;
  alpha: number;
}

interface DustParticle {
  u: number;
  v: number;
  vx: number;
  vy: number;
  size: number;
  phase: number;
}

/**
 * Computes the exact `object-cover` rectangle of a 16:9 image inside a viewport of (w, h).
 */
function getCoverRect(viewW: number, viewH: number, imgAspect = 16 / 9) {
  const viewAspect = viewW / viewH;
  let drawW = viewW;
  let drawH = viewH;
  let offsetX = 0;
  let offsetY = 0;

  if (viewAspect > imgAspect) {
    drawW = viewW;
    drawH = viewW / imgAspect;
    offsetY = (viewH - drawH) / 2;
  } else {
    drawH = viewH;
    drawW = viewH * imgAspect;
    offsetX = (viewW - drawW) / 2;
  }
  return { offsetX, offsetY, drawW, drawH };
}

/**
 * Horror-style irregular lamp power fluctuation:
 * holds steady warm glow most of the time, then dips/sputters eerily before recovering.
 */
function computeHorrorLampPower(t: number): number {
  const cycle = t % 7.4;
  // Normal subtle filament hum
  let power = 0.92 + Math.sin(t * 4.2) * 0.04 + Math.sin(t * 11.7) * 0.02;

  // First nervous sputter around 2.1s - 2.9s
  if (cycle > 2.1 && cycle < 2.9) {
    const local = cycle - 2.1;
    if (local < 0.14) power = 0.28;
    else if (local < 0.24) power = 0.85;
    else if (local < 0.48) power = 0.16;
    else if (local < 0.58) power = 0.72;
    else if (local < 0.7) power = 0.34;
  }

  // Deeper failing fade-and-surge around 5.3s - 6.5s
  if (cycle > 5.3 && cycle < 6.5) {
    const local = cycle - 5.3;
    if (local < 0.35) {
      power = 0.88 - (local / 0.35) * 0.72;
    } else if (local < 0.65) {
      power = 0.14 + Math.sin(local * 45) * 0.06;
    } else if (local < 0.82) {
      power = 0.68;
    } else if (local < 0.95) {
      power = 0.25;
    } else {
      power = 0.25 + ((local - 0.95) / 0.25) * 0.72;
    }
  }

  return Math.max(0.1, Math.min(1.05, power));
}

export function TitleScreen({
  settings,
  onUpdateSettings,
  onStart,
  onBackToChapters,
  animateFxEntry = false,
}: TitleScreenProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fxCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Title Screen looping theme music
  useEffect(() => {
    let active = true;
    const audio = new Audio(TITLE_THEME_URL);
    audio.loop = true;
    audio.volume = Math.max(0, Math.min(1, 0.34 * settings.musicVolume));
    audioRef.current = audio;

    const handleEnded = () => {
      if (!active) return;
      audio.currentTime = 0;
      void audio.play().catch(() => {});
    };
    audio.addEventListener('ended', handleEnded);

    const tryPlay = () => {
      if (!active) return;
      void audio.play().catch(() => {});
    };

    void audio.play().catch(() => {
      const unlock = (ev: Event) => {
        if (!active) return;
        if (ev instanceof KeyboardEvent && (ev.code === 'Enter' || ev.code === 'Space')) {
          return;
        }
        tryPlay();
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
      };
      window.addEventListener('pointerdown', unlock, { passive: true });
      window.addEventListener('keydown', unlock);
    });

    return () => {
      active = false;
      audio.removeEventListener('ended', handleEnded);
      audio.pause();
      audio.currentTime = 0;
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = Math.max(0, Math.min(1, 0.34 * settings.musicVolume));
      if (settings.musicVolume > 0 && audioRef.current.paused) {
        void audioRef.current.play().catch(() => {});
      }
    }
  }, [settings.musicVolume]);

  // Keyboard shortcuts (Enter / Space to start)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (settingsOpen) return;
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        onStart();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onStart, settingsOpen]);

  // Live atmospheric overlay: Rain in the Gothic window, periodic Thunder/Lightning flash into the room,
  // and horror-style flickering brass desk lamp + floating dust motes.
  useEffect(() => {
    const canvas = fxCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const raindrops: RainDrop[] = Array.from({ length: 72 }, () => ({
      u: 0.178 + Math.random() * 0.108,
      v: 0.075 + Math.random() * 0.33,
      speed: 0.42 + Math.random() * 0.32,
      len: 0.014 + Math.random() * 0.018,
      alpha: 0.08 + Math.random() * 0.12,
    }));

    const dust: DustParticle[] = Array.from({ length: 28 }, () => ({
      u: 0.54 + Math.random() * 0.22,
      v: 0.36 + Math.random() * 0.28,
      vx: (Math.random() - 0.5) * 0.004,
      vy: -0.004 - Math.random() * 0.006,
      size: 1 + Math.random() * 1.4,
      phase: Math.random() * Math.PI * 2,
    }));

    let nextThunderIn = 3.2;
    let thunderTimer = -1;
    let boltSeed = 0;
    let lastTime = performance.now();
    let elapsed = 0;
    let rafId = 0;

    const tick = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      elapsed += dt;

      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const targetW = Math.max(1, Math.floor(rect.width * dpr));
      const targetH = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      if (thunderTimer < 0) {
        nextThunderIn -= dt;
        if (nextThunderIn <= 0) {
          thunderTimer = 0;
          boltSeed = Math.floor(Math.random() * 1000);
          nextThunderIn = 7.5 + Math.random() * 5.0;
        }
      } else {
        thunderTimer += dt;
        if (thunderTimer > 0.72) {
          thunderTimer = -1;
        }
      }

      let flashStrength = 0;
      if (thunderTimer >= 0) {
        if (thunderTimer < 0.09) {
          flashStrength = 0.92;
        } else if (thunderTimer < 0.18) {
          flashStrength = 0.16;
        } else if (thunderTimer < 0.32) {
          flashStrength = 0.74;
        } else {
          flashStrength = Math.max(0, 0.74 * (1 - (thunderTimer - 0.32) / 0.4));
        }
      }

      for (const drop of raindrops) {
        drop.u -= drop.speed * 0.12 * dt;
        drop.v += drop.speed * dt;
        if (drop.v > 0.415 || drop.u < 0.175) {
          drop.u = 0.18 + Math.random() * 0.106;
          drop.v = 0.07 + Math.random() * 0.04;
        }
      }
      for (const p of dust) {
        p.u += p.vx * dt;
        p.v += p.vy * dt;
        if (p.v < 0.34) {
          p.v = 0.64;
          p.u = 0.56 + Math.random() * 0.18;
        }
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, rect.width, rect.height);

      const { offsetX, offsetY, drawW, drawH } = getCoverRect(rect.width, rect.height);
      const toX = (u: number) => offsetX + u * drawW;
      const toY = (v: number) => offsetY + v * drawH;

      // 1. Clip Rain & Lightning strictly inside the two recessed window glass panes + top arch eye
      ctx.save();
      ctx.beginPath();
      // Left recessed glass pane (inset inside stone frame & above angled sill)
      ctx.moveTo(toX(0.181), toY(0.402));
      ctx.lineTo(toX(0.181), toY(0.228));
      ctx.quadraticCurveTo(toX(0.191), toY(0.145), toX(0.205), toY(0.132));
      ctx.quadraticCurveTo(toX(0.219), toY(0.145), toX(0.225), toY(0.175));
      ctx.lineTo(toX(0.225), toY(0.376));
      ctx.closePath();

      // Right recessed glass pane
      ctx.moveTo(toX(0.237), toY(0.37));
      ctx.lineTo(toX(0.237), toY(0.165));
      ctx.quadraticCurveTo(toX(0.244), toY(0.118), toX(0.258), toY(0.098));
      ctx.quadraticCurveTo(toX(0.273), toY(0.115), toX(0.281), toY(0.165));
      ctx.lineTo(toX(0.281), toY(0.344));
      ctx.closePath();

      // Top arch lancet eye
      ctx.moveTo(toX(0.216), toY(0.128));
      ctx.quadraticCurveTo(toX(0.232), toY(0.068), toX(0.249), toY(0.105));
      ctx.quadraticCurveTo(toX(0.232), toY(0.132), toX(0.216), toY(0.128));
      ctx.closePath();
      ctx.clip();

      // Stormy sky glow & distant lightning bolt sprite behind glass
      if (flashStrength > 0.02) {
        ctx.fillStyle = `rgba(170, 208, 255, ${0.38 * flashStrength})`;
        ctx.fillRect(toX(0.175), toY(0.065), drawW * 0.115, drawH * 0.36);

        if (flashStrength > 0.25) {
          const bx0 = 0.238 + (boltSeed % 5) * 0.006;
          const segments = [
            [bx0, 0.09],
            [bx0 + 0.015, 0.17],
            [bx0 - 0.008, 0.22],
            [bx0 + 0.018, 0.3],
            [bx0 + 0.002, 0.37],
          ];
          ctx.strokeStyle = `rgba(225, 242, 255, ${Math.min(0.95, flashStrength)})`;
          ctx.lineWidth = Math.max(1.8, drawW * 0.002);
          ctx.beginPath();
          ctx.moveTo(toX(segments[0][0]), toY(segments[0][1]));
          for (let i = 1; i < segments.length; i++) {
            ctx.lineTo(toX(segments[i][0]), toY(segments[i][1]));
          }
          ctx.stroke();

          ctx.lineWidth = Math.max(1, drawW * 0.0012);
          ctx.beginPath();
          ctx.moveTo(toX(segments[2][0]), toY(segments[2][1]));
          ctx.lineTo(toX(segments[2][0] - 0.018), toY(0.29));
          ctx.stroke();
        }
      }

      // Subtle distant rain streaks behind the glass
      ctx.lineWidth = 0.9;
      for (const drop of raindrops) {
        const x1 = toX(drop.u);
        const y1 = toY(drop.v);
        const x2 = toX(drop.u - drop.len * 0.12);
        const y2 = toY(drop.v + drop.len);
        const rainBoost = flashStrength * 0.26;
        ctx.strokeStyle = `rgba(148, 180, 218, ${drop.alpha + rainBoost})`;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // Faint dark diamond leaded-glass lattice drawn OVER the rain so the glass clearly sits in front
      ctx.strokeStyle = 'rgba(10, 14, 20, 0.48)';
      ctx.lineWidth = 1;
      for (let g = -6; g <= 10; g++) {
        const gx = 0.175 + g * 0.016;
        ctx.beginPath();
        ctx.moveTo(toX(gx), toY(0.06));
        ctx.lineTo(toX(gx + 0.09), toY(0.42));
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(toX(gx + 0.09), toY(0.06));
        ctx.lineTo(toX(gx), toY(0.42));
        ctx.stroke();
      }
      ctx.restore();

      // 2. Lightning light wedge entering the dark room from the true window sill
      if (flashStrength > 0.01) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';

        const beamGrad = ctx.createLinearGradient(
          toX(0.23),
          toY(0.36),
          toX(0.6),
          toY(0.84)
        );
        beamGrad.addColorStop(0, `rgba(165, 205, 255, ${0.28 * flashStrength})`);
        beamGrad.addColorStop(0.55, `rgba(130, 175, 235, ${0.12 * flashStrength})`);
        beamGrad.addColorStop(1, 'rgba(120, 165, 225, 0)');

        ctx.fillStyle = beamGrad;
        ctx.beginPath();
        ctx.moveTo(toX(0.181), toY(0.402));
        ctx.lineTo(toX(0.281), toY(0.344));
        ctx.lineTo(toX(0.65), toY(0.92));
        ctx.lineTo(toX(0.32), toY(0.96));
        ctx.closePath();
        ctx.fill();

        // Brief room-wide cold illumination flash
        ctx.fillStyle = `rgba(155, 192, 240, ${0.16 * flashStrength})`;
        ctx.fillRect(0, 0, rect.width, rect.height);
        ctx.restore();
      }

      // 3. Horror-style sputtering & dimming Brass Desk Lamp
      const lampPower = computeHorrorLampPower(elapsed);
      const lampX = toX(0.651);
      const lampY = toY(0.495);

      // When the lamp loses power, darken the area around the desk ominously
      if (lampPower < 0.72) {
        const dipAlpha = (0.72 - lampPower) * 0.78;
        const dimGrad = ctx.createRadialGradient(
          lampX,
          lampY + drawH * 0.05,
          drawW * 0.01,
          lampX,
          lampY + drawH * 0.05,
          drawW * 0.25
        );
        dimGrad.addColorStop(0, `rgba(4, 5, 9, ${dipAlpha})`);
        dimGrad.addColorStop(0.55, `rgba(4, 5, 9, ${dipAlpha * 0.65})`);
        dimGrad.addColorStop(1, 'rgba(4, 5, 9, 0)');
        ctx.fillStyle = dimGrad;
        ctx.fillRect(0, 0, rect.width, rect.height);
      }

      // Warm fluctuating amber bloom over the desk & floor
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const glowRadius = drawW * (0.14 + lampPower * 0.055);
      const lampGrad = ctx.createRadialGradient(
        lampX,
        lampY,
        drawW * 0.004,
        lampX,
        lampY + drawH * 0.03,
        glowRadius
      );
      lampGrad.addColorStop(0, `rgba(255, 204, 118, ${0.42 * lampPower})`);
      lampGrad.addColorStop(0.32, `rgba(235, 158, 66, ${0.22 * lampPower})`);
      lampGrad.addColorStop(1, 'rgba(220, 130, 45, 0)');
      ctx.fillStyle = lampGrad;
      ctx.beginPath();
      ctx.arc(lampX, lampY + drawH * 0.02, glowRadius, 0, Math.PI * 2);
      ctx.fill();

      // Floating dust motes shimmering in the desk lamp light
      for (const p of dust) {
        const twinkle = 0.4 + 0.6 * Math.sin(elapsed * 2.2 + p.phase);
        ctx.fillStyle = `rgba(255, 218, 150, ${0.32 * lampPower * twinkle})`;
        ctx.fillRect(toX(p.u), toY(p.v), p.size, p.size);
      }
      ctx.restore();

      ctx.restore();
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div className="fixed inset-0 z-30 flex flex-col justify-between bg-[#07090d] text-[#e4ded2]">
      {/* Base key-art backdrop */}
      <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-[#0e131b] via-[#090b10] to-[#050608]">
        <img
          src={studyBackdropImg}
          alt="Um estudo fechado e sombrio repleto de estantes e pilhas de livros antigos iluminado por uma luminária de latão"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover object-center opacity-78"
        />

        {/* Animated Rain, Lightning/Thunder & Flickering Lamp Canvas */}
        <motion.canvas
          ref={fxCanvasRef}
          aria-hidden="true"
          initial={{ opacity: animateFxEntry ? 0 : 1 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.48, ease: 'easeOut' }}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />

        {/* Measured Scrims for Title Contrast */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-r from-[#06080c]/92 via-[#06080c]/58 to-transparent"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-[#06080c]/85 via-transparent to-[#06080c]/50"
        />
      </div>

      {/* Top bar: Back to chapters on left, Settings gear on right */}
      <div className="relative z-10 flex items-center justify-between p-5 sm:p-7">
        {onBackToChapters ? (
          <button
            type="button"
            onClick={() => {
              soundEngine.playUiClick();
              onBackToChapters();
            }}
            aria-label="Voltar aos capítulos"
            className="flex h-10 cursor-pointer items-center gap-1.5 rounded-sm border border-white/15 bg-[#0c0f14]/85 px-3.5 text-xs font-medium tracking-wide text-[#c2cad6] transition-colors duration-150 hover:border-[#d8a24a]/55 hover:text-[#f2ece1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e6b665]"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Capítulos</span>
          </button>
        ) : (
          <div />
        )}

        <button
          type="button"
          onClick={() => {
            soundEngine.playUiClick();
            setSettingsOpen(true);
          }}
          aria-label="Configurações"
          title="Configurações"
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-sm border border-white/15 bg-[#0c0f14]/85 text-[#c2cad6] transition-colors duration-150 hover:border-[#d8a24a]/55 hover:text-[#f2ece1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e6b665]"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>

      {/* Main Title Lockup */}
      <div className="relative z-10 flex flex-1 items-center px-8 pb-14 sm:px-16 lg:px-24">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-xl"
        >
          <svg
            width="44"
            height="44"
            viewBox="0 0 44 44"
            fill="none"
            aria-hidden="true"
            className="mb-6 text-[#d8a24a]"
          >
            <rect
              x="22"
              y="3"
              width="26.87"
              height="26.87"
              transform="rotate(45 22 3)"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeOpacity="0.65"
            />
            <rect
              x="22"
              y="9.5"
              width="17.68"
              height="17.68"
              transform="rotate(45 22 9.5)"
              stroke="currentColor"
              strokeWidth="1"
              strokeOpacity="0.4"
            />
            <circle cx="22" cy="22" r="2.5" fill="currentColor" fillOpacity="0.85" />
          </svg>

          <p className="mb-3 text-xs font-medium tracking-[0.22em] text-[#b89b6d] uppercase">
            Primeira Investigação
          </p>

          <h1 className="font-display text-4xl font-semibold tracking-wide text-[#f0e9dc] sm:text-5xl lg:text-6xl text-balance">
            Limiar das Cinzas
          </h1>

          <p className="mt-5 max-w-md text-sm leading-relaxed text-[#b2bac6] sm:text-base">
            Preso em um estudo silencioso cercado de livros e sombras, vasculhe cada canto
            em busca da chave oculta e descubra o que o aguarda além da porta trancada.
          </p>

          <div className="mt-9">
            <button
              type="button"
              onClick={onStart}
              className="cursor-pointer rounded-sm border border-[#d8a24a]/60 bg-[#1a1611] px-7 py-3 text-sm font-medium tracking-wide text-[#f3dfb8] transition-colors duration-150 hover:border-[#e6b665] hover:bg-[#261f16] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e6b665] whitespace-nowrap shrink-0"
            >
              Iniciar Investigação
            </button>
          </div>
        </motion.div>
      </div>

      {settingsOpen && (
        <SettingsModal
          settings={settings}
          onChange={onUpdateSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
