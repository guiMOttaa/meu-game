import { useEffect, useRef, useState } from 'react';
import { Hand, Power } from 'lucide-react';

interface TouchControlsProps {
  compact: boolean;
  hasPrimaryTarget: boolean;
  hasSecondaryTarget: boolean;
  onMove: (vx: number, vy: number) => void;
  onPrimaryInteract: () => void;
  onSecondaryInteract: () => void;
}

export function TouchControls({
  compact,
  hasPrimaryTarget,
  hasSecondaryTarget,
  onMove,
  onPrimaryInteract,
  onSecondaryInteract,
}: TouchControlsProps) {
  const baseRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  const [knobOffset, setKnobOffset] = useState({ x: 0, y: 0 });
  const [joyActive, setJoyActive] = useState(false);

  const baseSize = compact ? 108 : 132;
  const knobSize = compact ? 42 : 52;
  const maxRadius = (baseSize - knobSize) * 0.56;

  useEffect(() => {
    return () => {
      onMoveRef.current(0, 0);
    };
  }, []);

  const updateJoystickFromPoint = (clientX: number, clientY: number) => {
    const el = baseRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(dist, maxRadius);
    const angle = Math.atan2(dy, dx);

    const ox = dist > 0.001 ? Math.cos(angle) * clampedDist : 0;
    const oy = dist > 0.001 ? Math.sin(angle) * clampedDist : 0;
    setKnobOffset({ x: ox, y: oy });

    const norm = maxRadius > 0 ? clampedDist / maxRadius : 0;
    if (norm < 0.12) {
      onMoveRef.current(0, 0);
    } else {
      const scaled = (norm - 0.12) / 0.88;
      onMoveRef.current(Math.cos(angle) * scaled, Math.sin(angle) * scaled);
    }
  };

  const resetJoystick = () => {
    pointerIdRef.current = null;
    setJoyActive(false);
    setKnobOffset({ x: 0, y: 0 });
    onMoveRef.current(0, 0);
  };

  return (
    <div
      aria-label="Controles de toque"
      className="pointer-events-none fixed inset-0 z-25 select-none"
    >
      {/* Left Hand: Analog Virtual Joystick */}
      <div
        className={`pointer-events-auto fixed touch-none select-none ${
          compact ? 'bottom-3 left-4' : 'bottom-6 left-7'
        }`}
      >
        <div
          ref={baseRef}
          role="application"
          aria-label="Joystick de movimento"
          onPointerDown={(e) => {
            if (pointerIdRef.current !== null) return;
            e.preventDefault();
            e.stopPropagation();
            pointerIdRef.current = e.pointerId;
            e.currentTarget.setPointerCapture(e.pointerId);
            setJoyActive(true);
            updateJoystickFromPoint(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (pointerIdRef.current !== e.pointerId) return;
            e.preventDefault();
            updateJoystickFromPoint(e.clientX, e.clientY);
          }}
          onPointerUp={(e) => {
            if (pointerIdRef.current !== e.pointerId) return;
            e.preventDefault();
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
            resetJoystick();
          }}
          onPointerCancel={(e) => {
            if (pointerIdRef.current !== e.pointerId) return;
            resetJoystick();
          }}
          onLostPointerCapture={() => {
            resetJoystick();
          }}
          style={{ width: baseSize, height: baseSize }}
          className={`relative flex items-center justify-center rounded-full border backdrop-blur-[2px] transition-colors duration-150 ${
            joyActive
              ? 'border-[#d8a24a]/65 bg-[#0b0e14]/78 shadow-[0_0_24px_rgba(216,162,74,0.22)]'
              : 'border-white/18 bg-[#080a0f]/64 shadow-[0_8px_24px_rgba(0,0,0,0.6)]'
          }`}
        >
          {/* Subtle cardinal axis guides */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-3 rounded-full border border-white/8"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-2 h-1.5 w-0.5 rounded-full bg-white/25"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-2 h-1.5 w-0.5 rounded-full bg-white/25"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-2 h-0.5 w-1.5 rounded-full bg-white/25"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-2 h-0.5 w-1.5 rounded-full bg-white/25"
          />

          {/* Thumb Knob */}
          <div
            aria-hidden="true"
            style={{
              width: knobSize,
              height: knobSize,
              transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)`,
            }}
            className={`pointer-events-none flex items-center justify-center rounded-full border shadow-[0_4px_14px_rgba(0,0,0,0.75)] transition-colors duration-100 ${
              joyActive
                ? 'border-[#f0c878] bg-[#2a2013]/95'
                : 'border-[#b89b6d]/65 bg-[#161922]/90'
            }`}
          >
            <div
              className={`h-2.5 w-2.5 rounded-full ${
                joyActive ? 'bg-[#ffe4a8]' : 'bg-[#c9ab78]/75'
              }`}
            />
          </div>
        </div>
      </div>

      {/* Right Hand: Yellow Primary & Blue Secondary Action Buttons */}
      <div
        className={`pointer-events-auto fixed flex items-end touch-none select-none ${
          compact ? 'bottom-3.5 right-4 gap-3' : 'bottom-6 right-7 gap-4'
        }`}
      >
        {/* Blue Button: Secondary Interaction (TV, Desk Lamp, etc.) */}
        <button
          type="button"
          aria-label="Interação secundária (TV e luminária)"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSecondaryInteract();
          }}
          className={`flex touch-none flex-col items-center justify-center rounded-full border-2 backdrop-blur-[2px] transition-all duration-150 active:scale-92 ${
            compact ? 'mb-4 h-13 w-13' : 'mb-5 h-16 w-16'
          } ${
            hasSecondaryTarget
              ? 'border-[#6db4ff] bg-[#102948]/92 text-[#bfe0ff] shadow-[0_0_22px_rgba(74,158,255,0.48)]'
              : 'border-[#4a8fe7]/45 bg-[#0c1626]/76 text-[#7eb3ee]/85 shadow-[0_6px_18px_rgba(0,0,0,0.55)]'
          }`}
        >
          <Power className={compact ? 'h-4.5 w-4.5' : 'h-5 w-5'} strokeWidth={2.2} />
          <span
            className={`mt-0.5 font-mono font-bold tracking-wider uppercase ${
              compact ? 'text-[8px]' : 'text-[9px]'
            }`}
          >
            Luz/TV
          </span>
        </button>

        {/* Yellow Button: Primary Interaction */}
        <button
          type="button"
          aria-label="Interagir"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onPrimaryInteract();
          }}
          className={`flex touch-none flex-col items-center justify-center rounded-full border-2 backdrop-blur-[2px] transition-all duration-150 active:scale-92 ${
            compact ? 'h-16 w-16' : 'h-20 w-20'
          } ${
            hasPrimaryTarget
              ? 'border-[#ffe066] bg-[#3d2e0b]/94 text-[#ffea8f] shadow-[0_0_24px_rgba(242,201,76,0.5)]'
              : 'border-[#e0b84c]/55 bg-[#201909]/78 text-[#dec068]/90 shadow-[0_6px_20px_rgba(0,0,0,0.6)]'
          }`}
        >
          <Hand className={compact ? 'h-5 w-5' : 'h-6 w-6'} strokeWidth={2.1} />
          <span
            className={`mt-0.5 font-mono font-bold tracking-wider uppercase ${
              compact ? 'text-[8.5px]' : 'text-[10px]'
            }`}
          >
            Usar
          </span>
        </button>
      </div>
    </div>
  );
}
