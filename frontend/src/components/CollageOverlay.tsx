import { useRef, useState } from "react";

export type CollageItem = {
  src: string;
  natW: number;
  natH: number;
  cx: number;     // center x in canvas coords
  cy: number;     // center y in canvas coords
  w: number;      // width in canvas coords; height derived from natural aspect
  rotation: number; // degrees
};

export type CollageOrientation = "portrait" | "landscape" | "square";

type Props = {
  items: CollageItem[];
  onChange: (items: CollageItem[]) => void;
  canvasSize: { w: number; h: number };
  onOrientationChange: (o: CollageOrientation) => void;
  onApply: () => void;
  onCancel: () => void;
};

type Interaction =
  | { kind: "move"; idx: number; offsetX: number; offsetY: number }
  | { kind: "resize"; idx: number; startW: number; startDist: number }
  | { kind: "rotate"; idx: number; startAngle: number; startRotation: number };

export default function CollageOverlay({ items, onChange, canvasSize, onOrientationChange, onApply, onCancel }: Props) {
  const ratio = canvasSize.w / canvasSize.h;
  const currentOrient: CollageOrientation = ratio > 1.1 ? "landscape" : ratio < 0.9 ? "portrait" : "square";
  const [selectedIdx, setSelectedIdx] = useState<number | null>(items.length > 0 ? 0 : null);
  const svgRef = useRef<SVGSVGElement>(null);
  const interactionRef = useRef<Interaction | null>(null);

  const getPos = (e: React.PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onBgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if ((e.target as Element).closest("[data-collage-item], [data-handle]")) return;
    setSelectedIdx(null);
  };

  const onItemPointerDown = (e: React.PointerEvent, idx: number) => {
    e.stopPropagation();
    svgRef.current!.setPointerCapture(e.pointerId);
    setSelectedIdx(idx);
    const pos = getPos(e);
    const it = items[idx];
    interactionRef.current = { kind: "move", idx, offsetX: pos.x - it.cx, offsetY: pos.y - it.cy };

    // Bring to front by reordering
    if (idx !== items.length - 1) {
      const next = items.slice();
      const [moved] = next.splice(idx, 1);
      next.push(moved);
      onChange(next);
      setSelectedIdx(next.length - 1);
      interactionRef.current.idx = next.length - 1;
    }
  };

  const onResizePointerDown = (e: React.PointerEvent, idx: number) => {
    e.stopPropagation();
    svgRef.current!.setPointerCapture(e.pointerId);
    const pos = getPos(e);
    const it = items[idx];
    const dist = Math.hypot(pos.x - it.cx, pos.y - it.cy);
    interactionRef.current = { kind: "resize", idx, startW: it.w, startDist: Math.max(1, dist) };
  };

  const onRotatePointerDown = (e: React.PointerEvent, idx: number) => {
    e.stopPropagation();
    svgRef.current!.setPointerCapture(e.pointerId);
    const pos = getPos(e);
    const it = items[idx];
    const angle = (Math.atan2(pos.y - it.cy, pos.x - it.cx) * 180) / Math.PI;
    interactionRef.current = { kind: "rotate", idx, startAngle: angle, startRotation: it.rotation };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const act = interactionRef.current;
    if (!act) return;
    const pos = getPos(e);
    const it = items[act.idx];
    if (!it) return;

    if (act.kind === "move") {
      const cx = pos.x - act.offsetX;
      const cy = pos.y - act.offsetY;
      onChange(items.map((x, i) => i === act.idx ? { ...x, cx, cy } : x));
    } else if (act.kind === "resize") {
      const dist = Math.hypot(pos.x - it.cx, pos.y - it.cy);
      const ratio = dist / act.startDist;
      const newW = Math.max(40, Math.min(canvasSize.w * 1.5, act.startW * ratio));
      onChange(items.map((x, i) => i === act.idx ? { ...x, w: newW } : x));
    } else if (act.kind === "rotate") {
      const angle = (Math.atan2(pos.y - it.cy, pos.x - it.cx) * 180) / Math.PI;
      let newRotation = act.startRotation + (angle - act.startAngle);
      // Snap to 0/90/180/270 within 5 degrees
      const norm = ((newRotation % 360) + 360) % 360;
      for (const snap of [0, 90, 180, 270, 360]) {
        if (Math.abs(norm - snap) < 5) {
          newRotation += (snap - norm);
          break;
        }
      }
      onChange(items.map((x, i) => i === act.idx ? { ...x, rotation: newRotation } : x));
    }
  };

  const onPointerUp = () => {
    interactionRef.current = null;
  };

  const removeSelected = () => {
    if (selectedIdx === null) return;
    onChange(items.filter((_, i) => i !== selectedIdx));
    setSelectedIdx(null);
  };

  return (
    <>
      <svg
        ref={svgRef}
        width={canvasSize.w}
        height={canvasSize.h}
        className="absolute top-0 left-0 touch-none select-none"
        style={{ zIndex: 10 }}
        onPointerDown={onBgPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {items.map((item, i) => {
          const h = item.w * item.natH / item.natW;
          const isSelected = selectedIdx === i;
          return (
            <g key={i} transform={`translate(${item.cx}, ${item.cy}) rotate(${item.rotation})`}>
              <image
                href={item.src}
                x={-item.w / 2}
                y={-h / 2}
                width={item.w}
                height={h}
                data-collage-item
                onPointerDown={e => onItemPointerDown(e, i)}
                style={{ cursor: "move" }}
              />
              {isSelected && (
                <>
                  <rect
                    x={-item.w / 2 - 1}
                    y={-h / 2 - 1}
                    width={item.w + 2}
                    height={h + 2}
                    fill="none"
                    stroke="#6366f1"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    pointerEvents="none"
                  />
                  {/* resize handle bottom-right */}
                  <circle
                    cx={item.w / 2}
                    cy={h / 2}
                    r={12}
                    fill="#6366f1"
                    stroke="white"
                    strokeWidth={2}
                    data-handle
                    onPointerDown={e => onResizePointerDown(e, i)}
                    style={{ cursor: "nwse-resize" }}
                  />
                  {/* rotate handle above */}
                  <line
                    x1={0} y1={-h / 2}
                    x2={0} y2={-h / 2 - 30}
                    stroke="#6366f1"
                    strokeWidth={2}
                    pointerEvents="none"
                  />
                  <circle
                    cx={0}
                    cy={-h / 2 - 30}
                    r={12}
                    fill="#f59e0b"
                    stroke="white"
                    strokeWidth={2}
                    data-handle
                    onPointerDown={e => onRotatePointerDown(e, i)}
                    style={{ cursor: "grab" }}
                  />
                </>
              )}
            </g>
          );
        })}
      </svg>

      <div
        className="absolute flex flex-wrap items-center gap-2"
        style={{ bottom: 12, left: "50%", transform: "translateX(-50%)", zIndex: 20 }}
      >
        <div className="flex gap-1 bg-gray-900/90 backdrop-blur rounded-xl border border-gray-700 p-1">
          {(["portrait", "landscape", "square"] as const).map(o => (
            <button
              key={o}
              onClick={() => onOrientationChange(o)}
              title={o === "portrait" ? "Pionowy" : o === "landscape" ? "Poziomy" : "Kwadratowy"}
              className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors
                ${currentOrient === o ? "bg-indigo-600 text-white" : "text-gray-300 hover:bg-gray-700"}`}
            >
              {o === "portrait" ? "📱" : o === "landscape" ? "📺" : "⬜"}
            </button>
          ))}
        </div>
        <button
          onClick={removeSelected}
          disabled={selectedIdx === null}
          title="Usuń zaznaczone"
          className="px-3 py-2 rounded-xl text-sm font-medium bg-gray-900/90 backdrop-blur
            text-red-300 hover:bg-red-900/40 border border-gray-600 disabled:opacity-40 transition-colors"
        >
          🗑
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-xl text-sm font-medium bg-gray-900/90 backdrop-blur
            text-gray-300 hover:bg-gray-700 border border-gray-600 transition-colors"
        >
          Anuluj
        </button>
        <button
          onClick={onApply}
          disabled={items.length === 0}
          className="px-4 py-2 rounded-xl text-sm font-medium bg-indigo-600/90 backdrop-blur text-white
            hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Złóż kolaż ✓
        </button>
      </div>
    </>
  );
}
