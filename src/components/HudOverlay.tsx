import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause } from 'lucide-react';
import { HudSnapshot } from '../game/engine';
import { getItemIcons } from '../game/itemIcons';
import { formatKeyCode } from '../game/settings';
import { KeyBindings } from '../game/types';

interface HudOverlayProps {
  hud: HudSnapshot;
  keyBindings: KeyBindings;
  dialogueActive?: boolean;
  isTouch?: boolean;
  isShortLandscape?: boolean;
  onSelectHandSlot: (index: number) => void;
  onToggleInventory: () => void;
  onPauseRequest?: () => void;
}

function RoundBackpackIcon({ equipped }: { equipped: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="h-5 w-5"
    >
      {/* Top carry handle */}
      <path
        d="M9.5 6.5V5.2C9.5 4.26 10.26 3.5 11.2 3.5H12.8C13.74 3.5 14.5 4.26 14.5 5.2V6.5"
        stroke={equipped ? '#b78b56' : '#7b8494'}
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      {/* Rounded rucksack body */}
      <rect
        x="5.5"
        y="6.5"
        width="13"
        height="13.5"
        rx="4.2"
        fill={equipped ? '#5c4632' : '#1b2029'}
        stroke={equipped ? '#b9935a' : '#656e7d'}
        strokeWidth="1.4"
      />
      {/* Top flap */}
      <path
        d="M6.2 10.2C6.2 8.2 7.8 6.8 9.8 6.8H14.2C16.2 6.8 17.8 8.2 17.8 10.2V11.2C17.8 11.9 17.2 12.4 16.5 12.4H7.5C6.8 12.4 6.2 11.9 6.2 11.2V10.2Z"
        fill={equipped ? '#785b40' : '#262d39'}
        stroke={equipped ? '#caa368' : '#788294'}
        strokeWidth="1.2"
      />
      {/* Lower rounded front pocket */}
      <rect
        x="8"
        y="13.8"
        width="8"
        height="4.6"
        rx="1.8"
        fill={equipped ? '#4a3827' : '#151922'}
        stroke={equipped ? '#9f7c4c' : '#565f6e'}
        strokeWidth="1.1"
      />
      {/* Subtle brass clasp */}
      <rect
        x="11"
        y="11.2"
        width="2"
        height="2.1"
        rx="0.6"
        fill={equipped ? '#e0b05c' : '#858f9f'}
      />
    </svg>
  );
}

export function HudOverlay({
  hud,
  keyBindings,
  dialogueActive = false,
  isTouch = false,
  isShortLandscape = false,
  onSelectHandSlot,
  onToggleInventory,
  onPauseRequest,
}: HudOverlayProps) {
  const icons = useMemo(() => getItemIcons(), []);
  const hasBackpackEquipped = Boolean(hud.equippedBackpack || hud.bagCapacity > 0);
  const inventoryKey = formatKeyCode(keyBindings.inventory, true);
  const handsSig = useMemo(() => hud.hands.map((i) => i?.id ?? '-').join(','), [hud.hands]);

  const [hotbarVisible, setHotbarVisible] = useState(false);
  const [hotbarHovered, setHotbarHovered] = useState(false);
  const prevHandsSigRef = useRef(handsSig);
  const prevActiveHandRef = useRef(hud.activeHandIndex);
  const prevInvOpenRef = useRef(hud.inventoryOpen);
  const hideTimerRef = useRef<number | null>(null);

  const revealHotbarBriefly = () => {
    setHotbarVisible(true);
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = window.setTimeout(() => {
      setHotbarVisible(false);
      hideTimerRef.current = null;
    }, 3200);
  };

  useEffect(() => {
    if (handsSig !== prevHandsSigRef.current) {
      prevHandsSigRef.current = handsSig;
      if (hud.hands.some((i) => i !== null)) {
        revealHotbarBriefly();
      } else {
        setHotbarVisible(false);
      }
    }
  }, [handsSig, hud.hands]);

  useEffect(() => {
    if (hud.activeHandIndex !== prevActiveHandRef.current) {
      prevActiveHandRef.current = hud.activeHandIndex;
      revealHotbarBriefly();
    }
  }, [hud.activeHandIndex]);

  useEffect(() => {
    if (prevInvOpenRef.current && !hud.inventoryOpen && hud.hands.some((i) => i !== null)) {
      revealHotbarBriefly();
    }
    prevInvOpenRef.current = hud.inventoryOpen;
  }, [hud.inventoryOpen, hud.hands]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const nearBottomCenter =
        Math.abs(e.clientX - window.innerWidth / 2) <= 130 &&
        e.clientY >= window.innerHeight - 86;
      setHotbarHovered(nearBottomCenter);
    };
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  const showHotbar = isTouch || hotbarVisible || hotbarHovered;

  return (
    <div
      className={`pointer-events-none fixed inset-0 z-20 flex flex-col justify-between ${
        isShortLandscape ? 'p-3' : 'p-5 sm:p-7'
      }`}
    >
      {/* Top Bar: Zone & Objective on left, Round Backpack indicator (+ Pause on touch) on right */}
      <div className="flex items-start justify-between gap-4">
        <div className="max-w-xs">
          <h2
            className={`font-display font-semibold tracking-wide text-[#e8dfd0] ${
              isShortLandscape ? 'text-sm' : 'text-base sm:text-lg'
            }`}
          >
            {hud.zoneName}
          </h2>
          <p
            className={`mt-0.5 text-[#9aa3b2] ${
              isShortLandscape ? 'text-[11px]' : 'text-xs sm:text-sm'
            }`}
          >
            {hud.objectiveText}
          </p>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          {/* Small, rounded top-right Backpack indicator & Inventory trigger */}
          <button
            type="button"
            onClick={onToggleInventory}
            aria-label={
              hasBackpackEquipped
                ? `Mochila equipada — Abrir inventário (${inventoryKey})`
                : `Inventário (${inventoryKey})`
            }
            title={
              hasBackpackEquipped
                ? `Mochila equipada — Inventário (${inventoryKey})`
                : `Inventário (${inventoryKey})`
            }
            className={`flex cursor-pointer items-center justify-center rounded-full border transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e6b665] ${
              isShortLandscape ? 'h-9 w-9' : 'h-10 w-10'
            } ${
              hud.inventoryOpen
                ? 'border-[#d8a24a]/75 bg-[#241b12]'
                : hasBackpackEquipped
                  ? 'border-[#b9935a]/55 bg-[#171310]/92 hover:border-[#d8a24a]/80 hover:bg-[#221a13]'
                  : 'border-white/12 bg-[#0c0f14]/88 opacity-65 hover:border-white/25 hover:opacity-95'
            }`}
          >
            <RoundBackpackIcon equipped={hasBackpackEquipped} />
          </button>

          {isTouch && onPauseRequest && (
            <button
              type="button"
              onClick={onPauseRequest}
              aria-label="Pausar jogo"
              className={`flex cursor-pointer items-center justify-center rounded-full border border-white/15 bg-[#0c0f14]/88 text-[#c7d0de] transition-colors duration-150 active:border-[#d8a24a]/70 active:text-[#f5e3be] ${
                isShortLandscape ? 'h-9 w-9' : 'h-10 w-10'
              }`}
            >
              <Pause className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Bottom-Centered Compact 3-Slot Hand Hotbar (auto-hides smoothly when idle) */}
      {!dialogueActive && !hud.inventoryOpen && (
        <div className="flex justify-center pb-0.5">
          <div
            aria-label="Mãos do personagem"
            className={`flex items-center gap-1.5 border border-white/14 bg-[#0a0d13]/92 p-1 shadow-[0_10px_28px_rgba(0,0,0,0.75)] transition-all duration-300 ${
              showHotbar
                ? 'pointer-events-auto translate-y-0 opacity-100'
                : 'pointer-events-none translate-y-2 opacity-0'
            }`}
          >
              {hud.hands.map((item, idx) => {
                const isActive = idx === hud.activeHandIndex;
                const isLit = isActive && item?.id === 'flashlight' && hud.flashlightOn;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onSelectHandSlot(idx)}
                    title={
                      item
                        ? `${item.name} — Tecla [${idx + 1}] para segurar ou [${inventoryKey}] para inventário`
                        : `Mão ${idx + 1} vazia — Tecla [${idx + 1}] para selecionar ou [${inventoryKey}] para inventário`
                    }
                    className={`relative flex cursor-pointer items-center justify-center border transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e6b665] ${
                      isShortLandscape
                        ? 'h-9 w-9'
                        : 'h-11 w-11 sm:h-12 sm:w-12'
                    } ${
                      isLit
                        ? 'border-[#e6b665] bg-[#2a1f12] shadow-[inset_0_0_10px_rgba(230,182,101,0.28)]'
                        : isActive
                          ? 'border-[#d8a24a] bg-[#1e1711] shadow-[inset_0_0_8px_rgba(216,162,74,0.2)]'
                          : item
                            ? 'border-[#544638] bg-[#111014] hover:border-[#9e8158]'
                            : 'border-white/10 bg-[#07090d] hover:border-white/25'
                    }`}
                  >
                    <span
                      className={`pointer-events-none absolute left-1 top-0.5 font-mono text-[9px] leading-none tabular-nums ${
                        isActive ? 'font-bold text-[#f0cf90]' : 'text-[#727c8e]'
                      }`}
                    >
                      {idx + 1}
                    </span>

                    {item && (
                      <img
                        src={icons[item.id]}
                        alt={item.name}
                        draggable={false}
                        style={{ imageRendering: 'pixelated' }}
                        className={`object-contain ${
                          isShortLandscape ? 'h-6 w-6' : 'h-7 w-7 sm:h-8 sm:w-8'
                        }`}
                      />
                    )}
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
