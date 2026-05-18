import { useEffect, useRef, useState } from "react";

type Props = {
  pages: string[];
  editingIndex: number | null;
  margin: number;
  onMarginChange: (mm: number) => void;
  onRemove: (index: number) => void;
  onReorder: (from: number, to: number) => void;
  onSelect: (index: number) => void;
  onClear: () => void;
  onDownload: () => void;
};

type DragState = {
  sourceIndex: number;
  startX: number;
  startY: number;
  active: boolean;
};

const LONG_PRESS_MS = 220;
const MOVE_THRESHOLD_PX = 8;

export default function PdfBar({
  pages, editingIndex, margin, onMarginChange,
  onRemove, onReorder, onSelect, onClear, onDownload,
}: Props) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);
  const overIndexRef = useRef<number | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const movedRef = useRef(false);
  const longPressFiredRef = useRef(false);
  const onReorderRef = useRef(onReorder);
  useEffect(() => { onReorderRef.current = onReorder; }, [onReorder]);

  const updateOver = (i: number | null) => {
    overIndexRef.current = i;
    setOverIndex(i);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  // Global pointer listeners while a press is in progress
  useEffect(() => {
    if (!drag) return;

    const onMove = (e: PointerEvent) => {
      if (!drag.active) {
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        if (Math.hypot(dx, dy) > MOVE_THRESHOLD_PX) {
          movedRef.current = true;
          cancelLongPress();
          setDrag(null);
        }
        return;
      }
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (Math.hypot(dx, dy) > MOVE_THRESHOLD_PX) movedRef.current = true;
      setPointerPos({ x: e.clientX, y: e.clientY });
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const thumb = el?.closest("[data-page-index]") as HTMLElement | null;
      updateOver(thumb ? Number(thumb.dataset.pageIndex) : null);
    };

    const onUp = () => {
      cancelLongPress();
      const target = overIndexRef.current;
      if (drag.active && target !== null && target !== drag.sourceIndex) {
        onReorderRef.current(drag.sourceIndex, target);
      }
      setDrag(null);
      updateOver(null);
      setPointerPos(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag]);

  // Block page scroll once drag is active
  useEffect(() => {
    if (!drag?.active) return;
    const prev = document.body.style.touchAction;
    document.body.style.touchAction = "none";
    return () => { document.body.style.touchAction = prev; };
  }, [drag?.active]);

  if (pages.length === 0) return null;

  const startPress = (e: React.PointerEvent, i: number) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const isTouch = e.pointerType === "touch";
    movedRef.current = false;
    longPressFiredRef.current = false;
    setDrag({ sourceIndex: i, startX: e.clientX, startY: e.clientY, active: !isTouch });
    setPointerPos({ x: e.clientX, y: e.clientY });
    if (isTouch) {
      longPressTimer.current = window.setTimeout(() => {
        setDrag(d => d ? { ...d, active: true } : null);
        longPressFiredRef.current = true;
        longPressTimer.current = null;
      }, LONG_PRESS_MS);
    }
  };

  const handleClick = (i: number) => {
    if (movedRef.current || longPressFiredRef.current) {
      movedRef.current = false;
      longPressFiredRef.current = false;
      return;
    }
    onSelect(i);
  };

  return (
    <>
    {drag?.active && pointerPos && (
      <img
        src={pages[drag.sourceIndex]}
        alt=""
        className="fixed pointer-events-none rounded border-2 border-indigo-400 shadow-2xl"
        style={{
          left: pointerPos.x,
          top: pointerPos.y,
          width: 56,
          height: 56,
          transform: "translate(-50%, -50%) rotate(-2deg)",
          zIndex: 1000,
          opacity: 0.9,
        }}
      />
    )}
    <div className="flex flex-wrap items-center gap-3 px-3 py-2.5 bg-gray-900 rounded-2xl border border-gray-800">
      <span className="text-gray-500 text-xs uppercase tracking-widest shrink-0">
        PDF · {pages.length}
      </span>

      <div className="flex gap-2 overflow-x-auto flex-1 min-w-0 py-1">
        {pages.map((src, i) => {
          const isDragging = drag?.active && drag.sourceIndex === i;
          const isOver = drag?.active && overIndex === i && drag.sourceIndex !== i;
          const isEditing = editingIndex === i;
          return (
            <div
              key={i}
              data-page-index={i}
              onPointerDown={e => startPress(e, i)}
              onClick={() => handleClick(i)}
              title={isEditing
                ? "Edytujesz tę stronę · zmiany zapisuje '+ Strona'"
                : "Kliknij, aby edytować · przytrzymaj i przeciągnij, aby zmienić kolejność"}
              className={`relative shrink-0 select-none cursor-grab active:cursor-grabbing
                transition-transform
                hover:ring-2 hover:ring-gray-600 rounded
                ${isDragging ? "opacity-40 scale-95" : ""}
                ${isOver ? "ring-2 ring-indigo-400" : ""}
                ${isEditing && !isOver ? "ring-2 ring-amber-400" : ""}`}
              style={{ touchAction: "none" }}
            >
              <img
                src={src}
                alt={`strona ${i + 1}`}
                draggable={false}
                className="h-12 w-12 object-cover rounded border border-gray-700 pointer-events-none"
              />
              <button
                onClick={() => onRemove(i)}
                onPointerDown={e => e.stopPropagation()}
                title="Usuń stronę"
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 hover:bg-red-500
                  text-white text-xs leading-none flex items-center justify-center shadow"
              >
                ×
              </button>
              <span className="absolute bottom-0 left-0 px-1 bg-black/60 text-white text-[9px] rounded-tr rounded-bl">
                {i + 1}
              </span>
              {isEditing && (
                <span className="absolute top-0 left-0 px-1 bg-amber-500 text-white text-[9px] rounded-tl rounded-br leading-none py-0.5">
                  ✏
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="basis-full h-0 sm:hidden" aria-hidden />

      <label className="flex items-center gap-2 shrink-0 flex-1 sm:flex-none">
        <span className="text-gray-500 text-xs uppercase tracking-widest">Margines</span>
        <input
          type="range"
          min={0}
          max={40}
          step={1}
          value={margin}
          onChange={e => onMarginChange(Number(e.target.value))}
          className="flex-1 sm:flex-none sm:w-24 accent-indigo-500"
        />
        <span className="text-indigo-400 text-xs font-mono w-10 text-right">{margin} mm</span>
      </label>

      <button
        onClick={onDownload}
        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500
          text-white shrink-0"
      >
        📄 Pobierz PDF
      </button>
      <button
        onClick={onClear}
        title="Wyczyść strony"
        className="px-2 py-1.5 rounded-lg text-xs font-medium bg-gray-800 hover:bg-gray-700
          text-gray-400 shrink-0"
      >
        ✕
      </button>
    </div>
    </>
  );
}
