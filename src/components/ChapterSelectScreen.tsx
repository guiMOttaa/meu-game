import { useEffect, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { motion } from 'motion/react';
import chapterOneArtwork from '../assets/images/study_title_backdrop_clean_1795749762511.jpg';

interface ChapterSelectScreenProps {
  onSelectChapter: (chapterNumber: number) => void;
}

interface ChapterDef {
  number: number;
  title: string | null;
  artwork: string | null;
  unlocked: boolean;
}

interface ExpandingPortalState {
  chapterNumber: number;
  artwork: string;
  left: number;
  top: number;
  width: number;
  height: number;
  viewportW: number;
  viewportH: number;
}

const CHAPTERS: ChapterDef[] = [
  {
    number: 1,
    title: 'Limiar das Cinzas',
    artwork: chapterOneArtwork,
    unlocked: true,
  },
  {
    number: 2,
    title: null,
    artwork: null,
    unlocked: false,
  },
  {
    number: 3,
    title: null,
    artwork: null,
    unlocked: false,
  },
  {
    number: 4,
    title: null,
    artwork: null,
    unlocked: false,
  },
];

const REST_CLIP_PATH =
  'polygon(50% 6.5%, 50% 6.5%, 93% 50%, 93% 50%, 50% 93.5%, 50% 93.5%, 7% 50%, 7% 50%)';
const EXPANDED_CLIP_PATH =
  'polygon(50% 0.5%, 50% 0.5%, 95.6% 46.4%, 95.6% 53.6%, 50% 99.5%, 50% 99.5%, 4.4% 53.6%, 4.4% 46.4%)';
const FULLSCREEN_CLIP_PATH =
  'polygon(0% 0%, 100% 0%, 100% 0%, 100% 100%, 100% 100%, 0% 100%, 0% 100%, 0% 0%)';

export function ChapterSelectScreen({ onSelectChapter }: ChapterSelectScreenProps) {
  const [hoveredChapter, setHoveredChapter] = useState<number | null>(null);
  const [portal, setPortal] = useState<ExpandingPortalState | null>(null);
  const cardRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const completedRef = useRef(false);
  const fallbackTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (fallbackTimerRef.current !== null) {
        window.clearTimeout(fallbackTimerRef.current);
      }
    };
  }, []);

  const finishTransition = (chapterNumber: number) => {
    if (completedRef.current) return;
    completedRef.current = true;
    if (fallbackTimerRef.current !== null) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    onSelectChapter(chapterNumber);
  };

  const handleSelect = (chapter: ChapterDef) => {
    if (portal !== null) return;
    const el = cardRefs.current[chapter.number];

    if (!el || !chapter.artwork) {
      onSelectChapter(chapter.number);
      return;
    }

    const rect = el.getBoundingClientRect();
    completedRef.current = false;
    setPortal({
      chapterNumber: chapter.number,
      artwork: chapter.artwork,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
    });

    // Safety fallback in case animation completion callback is interrupted
    fallbackTimerRef.current = window.setTimeout(() => {
      finishTransition(chapter.number);
    }, 760);
  };

  const isTransitioning = portal !== null;

  return (
    <div className="fixed inset-0 z-30 flex flex-col items-center justify-center overflow-x-hidden overflow-y-auto bg-[#05070b] px-4 py-6 text-[#e4ded2]">
      {/* Atmospheric subtle radial depth backdrop (silent screen) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(34,27,20,0.42)_0%,rgba(9,12,18,0.88)_48%,#040508_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_45%,rgba(2,3,6,0.75)_100%)]"
      />

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: isTransitioning ? 0 : 1, y: isTransitioning ? -14 : 0 }}
        transition={{ duration: isTransitioning ? 0.24 : 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 mb-5 text-center sm:mb-8"
      >
        <p className="text-[11px] font-medium tracking-[0.28em] text-[#b89b6d] uppercase">
          Seleção de Capítulos
        </p>
        <h1 className="mt-1.5 font-display text-3xl font-semibold tracking-wider text-[#f0e9dc] sm:text-4xl">
          Capítulos
        </h1>
      </motion.div>

      {/* 4 Enlarged Pointed Twin-Triangle Diamond Chapter Cards */}
      <div className="relative z-10 grid w-full max-w-7xl grid-cols-2 place-items-center gap-4 sm:gap-6 lg:grid-cols-4 lg:gap-6 xl:gap-8">
        {CHAPTERS.map((chapter, idx) => {
          const isUnlocked = chapter.unlocked;
          const isExpanded = isUnlocked && hoveredChapter === chapter.number;
          const isOriginCard = portal?.chapterNumber === chapter.number;

          return (
            <motion.button
              key={chapter.number}
              ref={(node) => {
                cardRefs.current[chapter.number] = node;
              }}
              type="button"
              disabled={!isUnlocked || isTransitioning}
              onMouseEnter={() => {
                if (isUnlocked && !isTransitioning) setHoveredChapter(chapter.number);
              }}
              onMouseLeave={() => {
                setHoveredChapter((prev) => (prev === chapter.number ? null : prev));
              }}
              onFocus={() => {
                if (isUnlocked && !isTransitioning) setHoveredChapter(chapter.number);
              }}
              onBlur={() => {
                setHoveredChapter((prev) => (prev === chapter.number ? null : prev));
              }}
              onClick={() => {
                if (isUnlocked) {
                  handleSelect(chapter);
                }
              }}
              aria-label={
                isUnlocked && chapter.title
                  ? `Capítulo ${chapter.number}: ${chapter.title}`
                  : `Capítulo ${chapter.number} bloqueado`
              }
              initial={{ opacity: 0, y: 16 }}
              animate={{
                opacity: isOriginCard ? 0 : isTransitioning ? 0 : 1,
                y: 0,
                scale: isTransitioning && !isOriginCard ? 0.96 : 1,
              }}
              transition={{
                duration: isOriginCard ? 0.05 : isTransitioning ? 0.25 : 0.4,
                delay: isTransitioning ? 0 : idx * 0.08,
                ease: [0.16, 1, 0.3, 1],
              }}
              className={`group relative flex h-[252px] w-44 items-center justify-center bg-transparent focus-visible:outline-none sm:h-[322px] sm:w-56 lg:h-[360px] lg:w-[256px] xl:h-[416px] xl:w-[296px] ${
                isUnlocked ? 'cursor-pointer' : 'cursor-not-allowed opacity-80'
              }`}
              style={{
                clipPath: isExpanded ? EXPANDED_CLIP_PATH : REST_CLIP_PATH,
                transition: 'clip-path 320ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              {/* Chapter Key Art inside Unlocked Twin-Triangle Frame */}
              {isUnlocked && chapter.artwork && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 overflow-hidden"
                  style={{
                    clipPath: isExpanded ? EXPANDED_CLIP_PATH : REST_CLIP_PATH,
                    transition: 'clip-path 320ms cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                >
                  <img
                    src={chapter.artwork}
                    alt=""
                    referrerPolicy="no-referrer"
                    className={`h-full w-full object-cover object-[55%_48%] transition-all duration-500 ease-out ${
                      isExpanded
                        ? 'scale-100 opacity-100 brightness-110'
                        : 'scale-112 opacity-85 brightness-90'
                    }`}
                  />
                  {/* Subtle contrast vignette that opens up on expand to reveal more of the design */}
                  <div
                    className={`absolute inset-0 bg-[radial-gradient(ellipse_at_50%_52%,rgba(6,8,13,0.72)_0%,rgba(6,8,13,0.34)_56%,rgba(5,7,11,0.75)_100%)] transition-opacity duration-300 ${
                      isExpanded ? 'opacity-45' : 'opacity-100'
                    }`}
                  />
                </div>
              )}

              {/* Twin-Triangle Pointed SVG Frame (Top & Bottom Triangles Expand Outward) */}
              <svg
                viewBox="0 0 100 140"
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-[2] h-full w-full overflow-visible"
              >
                <defs>
                  <linearGradient
                    id={`chap-bg-${chapter.number}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor="#0f1218" />
                    <stop offset="50%" stopColor="#0b0d13" />
                    <stop offset="100%" stopColor="#07090d" />
                  </linearGradient>
                </defs>

                {/* Top Triangle */}
                <g
                  style={{
                    transformOrigin: '50px 70px',
                    transform: isExpanded
                      ? 'translateY(-5px) scale(1.06)'
                      : 'translateY(0px) scale(1)',
                    transition: 'transform 320ms cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                >
                  <polygon
                    points="50,9 93,70 7,70"
                    fill={
                      isUnlocked && chapter.artwork ? 'none' : `url(#chap-bg-${chapter.number})`
                    }
                    stroke={
                      isUnlocked
                        ? isExpanded
                          ? '#f0c878'
                          : 'rgba(216, 162, 74, 0.78)'
                        : 'rgba(130, 142, 160, 0.24)'
                    }
                    strokeWidth="1.25"
                    className="transition-colors duration-300"
                  />
                  {/* Top inner filigree triangle */}
                  <polygon
                    points="50,15 88,68 12,68"
                    fill="none"
                    stroke={
                      isUnlocked
                        ? isExpanded
                          ? 'rgba(240, 200, 120, 0.55)'
                          : 'rgba(216, 162, 74, 0.32)'
                        : 'rgba(130, 142, 160, 0.1)'
                    }
                    strokeWidth="0.6"
                    className="transition-colors duration-300"
                  />
                </g>

                {/* Bottom Triangle */}
                <g
                  style={{
                    transformOrigin: '50px 70px',
                    transform: isExpanded
                      ? 'translateY(5px) scale(1.06)'
                      : 'translateY(0px) scale(1)',
                    transition: 'transform 320ms cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                >
                  <polygon
                    points="7,70 93,70 50,131"
                    fill={
                      isUnlocked && chapter.artwork ? 'none' : `url(#chap-bg-${chapter.number})`
                    }
                    stroke={
                      isUnlocked
                        ? isExpanded
                          ? '#f0c878'
                          : 'rgba(216, 162, 74, 0.78)'
                        : 'rgba(130, 142, 160, 0.24)'
                    }
                    strokeWidth="1.25"
                    className="transition-colors duration-300"
                  />
                  {/* Bottom inner filigree triangle */}
                  <polygon
                    points="12,72 88,72 50,125"
                    fill="none"
                    stroke={
                      isUnlocked
                        ? isExpanded
                          ? 'rgba(240, 200, 120, 0.55)'
                          : 'rgba(216, 162, 74, 0.32)'
                        : 'rgba(130, 142, 160, 0.1)'
                    }
                    strokeWidth="0.6"
                    className="transition-colors duration-300"
                  />
                </g>
              </svg>

              {/* Soft warm rim glow on expanded unlocked chapter */}
              {isUnlocked && (
                <div
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-4 z-[3] transition-opacity duration-300 ${
                    isExpanded ? 'opacity-100' : 'opacity-0'
                  }`}
                  style={{
                    background:
                      'radial-gradient(circle at 50% 50%, rgba(216, 162, 74, 0.16), transparent 72%)',
                  }}
                />
              )}

              {/* Chapter Content */}
              <div className="relative z-10 flex w-full flex-col items-center justify-center px-6 text-center">
                <span
                  className={`font-mono text-xs font-semibold tracking-[0.22em] uppercase transition-colors duration-200 sm:text-sm ${
                    isUnlocked
                      ? isExpanded
                        ? 'text-[#f3d08a] drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)]'
                        : 'text-[#e2bc78] drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)]'
                      : 'text-[#5b6473]'
                  }`}
                >
                  Capítulo {chapter.number}
                </span>

                {isUnlocked && chapter.title ? (
                  <h2
                    className={`mt-2 font-display text-lg leading-snug font-semibold tracking-wide drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)] transition-colors duration-200 sm:text-xl lg:text-2xl ${
                      isExpanded ? 'text-[#fff0d0]' : 'text-[#f6efe2]'
                    }`}
                  >
                    {chapter.title}
                  </h2>
                ) : (
                  <div className="mt-3 flex flex-col items-center justify-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#4a5260]/45 bg-[#12161f]/90 text-[#727b8a] sm:h-14 sm:w-14">
                      <Lock className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.8} />
                    </div>
                  </div>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Expanding Artwork Portal: morphs the small diamond card artwork into the full-screen Title backdrop */}
      {portal && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none fixed z-40 overflow-hidden bg-[#07090d]"
          initial={{
            left: portal.left,
            top: portal.top,
            width: portal.width,
            height: portal.height,
            clipPath: EXPANDED_CLIP_PATH,
          }}
          animate={{
            left: 0,
            top: 0,
            width: portal.viewportW,
            height: portal.viewportH,
            clipPath: FULLSCREEN_CLIP_PATH,
          }}
          transition={{
            duration: 0.62,
            ease: [0.22, 1, 0.36, 1],
          }}
          onAnimationComplete={() => finishTransition(portal.chapterNumber)}
        >
          <motion.img
            src={portal.artwork}
            alt=""
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
            initial={{
              opacity: 1,
              objectPosition: '55% 48%',
              filter: 'brightness(1.08)',
            }}
            animate={{
              opacity: 0.78,
              objectPosition: '50% 50%',
              filter: 'brightness(1)',
            }}
            transition={{
              duration: 0.62,
              ease: [0.22, 1, 0.36, 1],
            }}
          />

          {/* Match TitleScreen scrims fading in as the artwork expands to full screen */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-[#06080c]/92 via-[#06080c]/58 to-transparent"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.45, delay: 0.17, ease: 'easeOut' }}
          />
          <motion.div
            className="absolute inset-0 bg-gradient-to-t from-[#06080c]/85 via-transparent to-[#06080c]/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.45, delay: 0.17, ease: 'easeOut' }}
          />
        </motion.div>
      )}
    </div>
  );
}
