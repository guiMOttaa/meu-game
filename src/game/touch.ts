import { useEffect, useState } from 'react';

export interface TouchViewportState {
  isTouch: boolean;
  isShortLandscape: boolean;
  isTabletLandscape: boolean;
  isPortrait: boolean;
}

function detectTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const hoverNone = window.matchMedia?.('(hover: none)').matches ?? false;
  const mobileUa = /Android|iPhone|iPad|iPod|Tablet|Mobile/i.test(navigator.userAgent);
  const hasTouchPoints = (navigator.maxTouchPoints ?? 0) > 0;
  return coarse || (hoverNone && hasTouchPoints) || (mobileUa && hasTouchPoints);
}

function computeTouchViewportState(forcedTouch: boolean): TouchViewportState {
  if (typeof window === 'undefined') {
    return {
      isTouch: false,
      isShortLandscape: false,
      isTabletLandscape: false,
      isPortrait: false,
    };
  }
  const w = window.innerWidth;
  const h = window.innerHeight;
  const isTouch = forcedTouch || detectTouchDevice();
  const isPortrait = isTouch && h > w + 40;
  const isShortLandscape = isTouch && !isPortrait && h <= 540;
  const isTabletLandscape = isTouch && !isPortrait && h > 540;

  return {
    isTouch,
    isShortLandscape,
    isTabletLandscape,
    isPortrait,
  };
}

export function useTouchViewport(): TouchViewportState {
  const [touchDetected, setTouchDetected] = useState<boolean>(() => detectTouchDevice());
  const [state, setState] = useState<TouchViewportState>(() =>
    computeTouchViewportState(detectTouchDevice())
  );

  useEffect(() => {
    const sync = (forceTouch = touchDetected) => {
      const next = computeTouchViewportState(forceTouch);
      document.documentElement.classList.toggle('touch-device', next.isTouch);
      setState(next);
    };

    sync(touchDetected);

    const onTouchStart = () => {
      if (!touchDetected) {
        setTouchDetected(true);
        sync(true);
      }
    };

    const onResize = () => sync(touchDetected);
    const mqCoarse = window.matchMedia?.('(pointer: coarse)');
    const onMqChange = () => sync(touchDetected);

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    mqCoarse?.addEventListener?.('change', onMqChange);

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      mqCoarse?.removeEventListener?.('change', onMqChange);
      document.documentElement.classList.remove('touch-device');
    };
  }, [touchDetected]);

  return state;
}
