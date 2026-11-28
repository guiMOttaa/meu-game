import { useEffect, useMemo, useState } from 'react';
import { Backpack, Eye, Lock } from 'lucide-react';
import { getItemIcons } from '../game/itemIcons';
import { getProtagonistPortraits } from '../game/portraits';
import { useTouchViewport } from '../game/touch';
import { InventoryItem, InventorySlotRef, InventoryZone } from '../game/types';

interface InventoryModalProps {
  hands: (InventoryItem | null)[];
  bag: (InventoryItem | null)[];
  activeHandIndex?: number;
  bagCapacity: number;
  equippedBackpack: InventoryItem | null;
  flashlightOn: boolean;
  onMoveSlot: (from: InventorySlotRef, to: InventorySlotRef) => void;
  onQuickTransfer: (from: InventorySlotRef) => void;
  onEquipSlot: (ref: InventorySlotRef) => void;
  onInspectItem: (item: InventoryItem) => void;
  onClose: () => void;
}

export function InventoryModal({
  hands,
  bag,
  activeHandIndex = 0,
  bagCapacity,
  equippedBackpack,
  flashlightOn,
  onMoveSlot,
  onQuickTransfer,
  onEquipSlot,
  onInspectItem,
  onClose,
}: InventoryModalProps) {
  const icons = useMemo(() => getItemIcons(), []);
  const protagPortrait = useMemo(() => getProtagonistPortraits().idle, []);
  const touch = useTouchViewport();
  const compact = touch.isShortLandscape;

  const [selected, setSelected] = useState<InventorySlotRef | null>(() => {
    const firstHand = hands.findIndex((item) => item !== null);
    if (firstHand !== -1) return { zone: 'hands', index: firstHand };
    const firstBag = bag.findIndex((item) => item !== null);
    if (firstBag !== -1) return { zone: 'bag', index: firstBag };
    return null;
  });
  const [movingMode, setMovingMode] = useState(false);

  const getItemAt = (ref: InventorySlotRef | null): InventoryItem | null => {
    if (!ref) return null;
    const arr = ref.zone === 'hands' ? hands : bag;
    return arr[ref.index] ?? null;
  };

  // Keep selection valid if items were moved/transferred/equipped
  useEffect(() => {
    if (selected && !getItemAt(selected)) {
      const nextHand = hands.findIndex((i) => i !== null);
      if (nextHand !== -1) {
        setSelected({ zone: 'hands', index: nextHand });
      } else {
        const nextBag = bag.findIndex((i) => i !== null);
        setSelected(nextBag !== -1 ? { zone: 'bag', index: nextBag } : null);
      }
      setMovingMode(false);
    }
  }, [hands, bag, selected]);

  const selectedItem = getItemAt(selected);
  const bagUsedCount = bag.filter((i) => i !== null).length;
  const totalCollected = hands.filter((i) => i !== null).length + bagUsedCount;
  const canEquipSelected = Boolean(selectedItem?.backpackSlots);

  const handleSlotClick = (zone: InventoryZone, index: number) => {
    if (zone === 'bag' && index >= bagCapacity) {
      return;
    }

    const clickedRef: InventorySlotRef = { zone, index };
    const clickedItem = getItemAt(clickedRef);

    // Move or swap directly when movingMode is active or clicking an unlocked empty slot
    if (
      selected &&
      selectedItem &&
      (movingMode || !clickedItem) &&
      !(selected.zone === zone && selected.index === index)
    ) {
      onMoveSlot(selected, clickedRef);
      setSelected(clickedRef);
      setMovingMode(false);
      return;
    }

    if (clickedItem) {
      setSelected(clickedRef);
      setMovingMode(false);
    }
  };

  const handleSlotDoubleClick = (zone: InventoryZone, index: number) => {
    if (zone === 'bag' && index >= bagCapacity) return;
    const ref: InventorySlotRef = { zone, index };
    if (!getItemAt(ref)) return;
    onQuickTransfer(ref);
    setMovingMode(false);
  };

  const renderSlot = (zone: InventoryZone, index: number, item: InventoryItem | null) => {
    const isLocked = zone === 'bag' && index >= bagCapacity;
    const isSelected =
      !isLocked && selected?.zone === zone && selected?.index === index && Boolean(item);
    const isMoveTarget = Boolean(
      !isLocked &&
        selected &&
        selectedItem &&
        movingMode &&
        !(selected.zone === zone && selected.index === index)
    );
    const isActiveHandSlot = zone === 'hands' && index === activeHandIndex;
    const isActiveLight = isActiveHandSlot && item?.id === 'flashlight' && flashlightOn;

    if (isLocked) {
      return (
        <div
          key={`${zone}-${index}`}
          title="Espaço bloqueado — Encontre ou equipe uma mochila maior"
          className={`relative flex w-full select-none flex-col items-center justify-center gap-0.5 border border-[#222630]/80 bg-[#07090d]/95 text-[#3b4250] ${
            compact ? 'h-14' : 'h-20 gap-1'
          }`}
        >
          <Lock className={compact ? 'h-3 w-3 opacity-65' : 'h-3.5 w-3.5 opacity-65'} />
          <span
            className={`font-mono tracking-wide uppercase ${
              compact ? 'text-[8px]' : 'text-[9px]'
            }`}
          >
            Bloqueado
          </span>
        </div>
      );
    }

    return (
      <button
        key={`${zone}-${index}`}
        type="button"
        onClick={() => handleSlotClick(zone, index)}
        onDoubleClick={() => handleSlotDoubleClick(zone, index)}
        title={
          item
            ? `${item.name} — Clique para selecionar ou clique duplo para mover`
            : 'Espaço vazio'
        }
        className={`group relative flex w-full cursor-pointer select-none flex-col items-center justify-center border transition-all duration-150 ${
          compact ? 'h-14' : 'h-20'
        } ${
          isSelected
            ? 'border-[#d8a24a] bg-[#2a1618] shadow-[inset_0_0_14px_rgba(216,162,74,0.22)]'
            : isMoveTarget
              ? 'border-[#8fa2bf]/70 bg-[#181d27] hover:border-[#d8a24a]'
              : item
                ? 'border-[#5a4a3a]/80 bg-[#190f12] hover:border-[#8e7453]'
                : 'border-[#2f3644]/80 bg-[#0b0d13]/90 hover:border-[#4b566b]'
        }`}
      >
        {isActiveHandSlot && (
          <span className="absolute top-1 left-1.5 font-mono text-[9px] font-semibold text-[#d8a24a]">
            {index + 1}
          </span>
        )}
        {isActiveLight && (
          <span className="absolute top-1 right-1.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-[#e8ba68]">
            ON
          </span>
        )}

        {item ? (
          <>
            <img
              src={icons[item.id]}
              alt={item.name}
              draggable={false}
              style={{ imageRendering: 'pixelated' }}
              className={`object-contain drop-shadow-[0_4px_6px_rgba(0,0,0,0.85)] ${
                compact ? 'h-7 w-7' : 'h-10 w-10 sm:h-11 sm:w-11'
              }`}
            />
            <span
              className={`mt-0.5 max-w-[90%] truncate px-1 font-medium text-[#ddd2bf] ${
                compact ? 'text-[9px]' : 'text-[10px]'
              }`}
            >
              {item.name}
            </span>
          </>
        ) : (
          <span className="font-mono text-[10px] text-[#454d5c]">Vazio</span>
        )}
      </button>
    );
  };

  return (
    <div
      onClick={onClose}
      className={`fixed inset-0 z-40 flex items-center justify-center bg-[#040508]/84 backdrop-blur-[2px] ${
        compact ? 'p-2' : 'p-4'
      }`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full border-2 border-[#4d4237] bg-[#0c0e14] shadow-[0_24px_64px_rgba(0,0,0,0.92)] ${
          compact
            ? 'max-h-[94dvh] max-w-4xl overflow-y-auto p-3.5'
            : touch.isTabletLandscape
              ? 'max-h-[90dvh] max-w-4xl overflow-y-auto p-5'
              : 'max-w-4xl p-5 sm:p-7'
        }`}
      >
        {/* Inner gothic frame trim */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-1.5 border border-[#2a2f3a]/80"
        />

        {/* Header */}
        <div
          className={`relative z-10 flex items-center justify-between border-b border-white/10 ${
            compact ? 'mb-2.5 pb-2' : 'mb-5 pb-3'
          }`}
        >
          <div>
            <h2
              className={`font-display font-semibold tracking-wider text-[#e6dac4] uppercase ${
                compact ? 'text-base' : 'text-lg sm:text-xl'
              }`}
            >
              Inventário
            </h2>
            <p className={`mt-0.5 font-mono text-[#8d96a6] ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
              {totalCollected === 0 && !equippedBackpack
                ? 'Nenhum item coletado ainda'
                : 'Selecione um item para examinar ou organizar entre Mãos e Mochila'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer border border-white/15 bg-[#121620] px-3.5 py-1 font-mono text-xs text-[#b9c2d0] transition-colors hover:border-[#d8a24a]/60 hover:text-[#f2e4c9]"
          >
            Fechar
          </button>
        </div>

        {/* Main 3-Column Gothic Grid (Mãos + Ações + Mochila) */}
        <div
          className={`relative z-10 grid items-start ${
            compact
              ? 'grid-cols-[204px_132px_1fr] gap-3'
              : 'grid-cols-1 gap-6 md:grid-cols-[264px_168px_1fr]'
          }`}
        >
          {/* LEFT: Portrait + 3 Hands Slots */}
          <div
            className={`flex w-full flex-col ${
              compact ? 'items-start gap-2' : 'items-center gap-3 md:items-start'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div className="border-2 border-[#4d4237] bg-[#080a0f] p-1 shadow-inner">
                <img
                  src={protagPortrait}
                  alt="Protagonista"
                  draggable={false}
                  style={{ imageRendering: 'pixelated' }}
                  className={compact ? 'h-12 w-11 object-contain' : 'h-20 w-18 object-contain'}
                />
              </div>
              <div>
                <div className="font-mono text-[11px] font-semibold uppercase tracking-widest text-[#d8a24a]">
                  Mãos
                </div>
                <div className={`mt-0.5 text-[#9aa3b2] ${compact ? 'text-[11px]' : 'text-xs'}`}>
                  3 abas equipáveis
                </div>
              </div>
            </div>

            <div className={`grid w-full grid-cols-3 ${compact ? 'gap-1.5' : 'max-w-[264px] gap-2'}`}>
              {hands.map((item, idx) => renderSlot('hands', idx, item))}
            </div>
          </div>

          {/* CENTER: Gothic Action Buttons */}
          <div
            className={`flex ${
              compact
                ? 'flex-col gap-1.5 pt-2'
                : 'flex-row flex-wrap justify-center gap-2 md:flex-col md:pt-8'
            }`}
          >
            <button
              type="button"
              disabled={!selectedItem}
              onClick={() => {
                if (selectedItem) {
                  onInspectItem(selectedItem);
                }
              }}
              className={`flex-1 cursor-pointer border-2 border-[#3c4352] bg-[#141822] font-semibold tracking-wider text-[#dde3ee] uppercase transition-colors hover:border-[#d8a24a] hover:bg-[#1c2230] disabled:cursor-not-allowed disabled:opacity-40 ${
                compact ? 'px-2 py-1.5 text-[11px]' : 'px-3 py-2.5 text-xs'
              }`}
            >
              Examinar
            </button>

            {canEquipSelected && (
              <button
                type="button"
                onClick={() => {
                  if (selected) onEquipSlot(selected);
                }}
                className={`flex-1 cursor-pointer border-2 border-[#8c6731] bg-[#241b10] font-semibold tracking-wider text-[#f3dfb6] uppercase transition-colors hover:border-[#e6b665] hover:bg-[#312414] ${
                  compact ? 'px-2 py-1.5 text-[11px]' : 'px-3 py-2.5 text-xs'
                }`}
              >
                Equipar
              </button>
            )}

            <button
              type="button"
              disabled={!selectedItem}
              onClick={() => {
                if (selected) onQuickTransfer(selected);
              }}
              className={`flex-1 cursor-pointer border-2 border-[#4d4237] bg-[#1a1714] font-semibold tracking-wider text-[#e8d5b2] uppercase transition-colors hover:border-[#d8a24a] hover:bg-[#27211b] disabled:cursor-not-allowed disabled:opacity-40 ${
                compact ? 'px-2 py-1.5 text-[11px]' : 'px-3 py-2.5 text-xs'
              }`}
            >
              {selected?.zone === 'hands' ? 'Guardar' : 'Para Mão'}
            </button>

            <button
              type="button"
              disabled={!selectedItem}
              onClick={() => setMovingMode((prev) => !prev)}
              className={`flex-1 cursor-pointer border-2 font-mono tracking-wide uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                compact ? 'px-2 py-1.5 text-[10px]' : 'px-3 py-2 text-[11px]'
              } ${
                movingMode
                  ? 'border-[#d8a24a] bg-[#2e2316] text-[#f4dfb7]'
                  : 'border-[#333a47] bg-[#10131b] text-[#9aa4b5] hover:border-[#606b80]'
              }`}
            >
              {movingMode ? 'Escolha o espaço' : 'Trocar Espaço'}
            </button>
          </div>

          {/* RIGHT: 6-Slot Expandable Backpack Grid */}
          <div className="flex w-full min-w-0 flex-col">
            <div className={`${compact ? 'mb-1' : 'mb-2'} flex w-full flex-wrap items-center justify-between gap-2`}>
              <div className="flex items-center gap-2">
                <Backpack className="h-3.5 w-3.5 text-[#d8a24a]" />
                <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-[#b8c0cf]">
                  Mochila
                </span>
              </div>
              <span className="font-mono text-[11px] text-[#8d96a6]">
                {bagCapacity > 0
                  ? `${bagUsedCount} / ${bagCapacity} espaços ativos`
                  : '0 / 6 espaços liberados'}
              </span>
            </div>

            {/* Equipped backpack badge */}
            <div
              className={`flex w-full items-center justify-between gap-2 border border-white/10 bg-[#090b10] px-3 ${
                compact ? 'mb-1.5 py-1' : 'mb-2.5 py-1.5'
              }`}
            >
              <span className={`font-mono text-[#9aa3b2] ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
                {equippedBackpack
                  ? `Equipada: ${equippedBackpack.name} (+${equippedBackpack.backpackSlots} espaços)`
                  : 'Nenhuma mochila equipada — procure uma pela sala'}
              </span>
              {equippedBackpack && (
                <button
                  type="button"
                  onClick={() => onInspectItem(equippedBackpack)}
                  className="flex cursor-pointer items-center gap-1 border border-white/15 bg-[#121620] px-2 py-0.5 font-mono text-[10px] text-[#d6dde8] transition-colors hover:border-[#d8a24a]/70 hover:text-[#f5e3be]"
                >
                  <Eye className="h-3 w-3 text-[#d8a24a]" />
                  <span>Examinar</span>
                </button>
              )}
            </div>

            <div
              className={`grid w-full grid-cols-3 border-2 border-[#4d4237] bg-[#080a0f] ${
                compact ? 'gap-1.5 p-2' : 'gap-2.5 p-3'
              }`}
            >
              {bag.map((item, idx) => renderSlot('bag', idx, item))}
            </div>

            {/* Selected Item Details / Empty State */}
            <div
              className={`w-full border border-white/10 bg-[#080a0f]/95 ${
                compact ? 'mt-2 min-h-[44px] px-2.5 py-1.5' : 'mt-3 min-h-[64px] px-3.5 py-2.5'
              }`}
            >
              {selectedItem ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#ecd9b4]">
                      {selectedItem.name}
                    </span>
                    <span className="font-mono text-[10px] text-[#8d96a6]">
                      {selected?.zone === 'hands' ? 'Nas Mãos' : 'Na Mochila'}
                    </span>
                  </div>
                  <p className={`mt-0.5 leading-relaxed text-[#adb5c4] ${compact ? 'text-[11px]' : 'mt-1 text-xs'}`}>
                    {selectedItem.description}
                  </p>
                </>
              ) : (
                <p className={compact ? 'text-[11px] text-[#737b8a]' : 'text-xs text-[#737b8a]'}>
                  {totalCollected === 0 && !equippedBackpack
                    ? 'Seu inventário está vazio. Vasculhe móveis, gavetas e cantos da sala para encontrar objetos.'
                    : 'Selecione um espaço com item para examinar ou organizar entre as mãos e a mochila.'}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
