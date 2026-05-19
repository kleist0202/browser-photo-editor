import { useRef, useState } from "react";

export type BlurRegion = { x: number; y: number; w: number; h: number };

type Props = {
  regions: BlurRegion[];
  onChange: (regions: BlurRegion[]) => void;
  blockSize: number;
  onBlockSizeChange: (n: number) => void;
  onApply: () => void;
  onCancel: () => void;
  displaySize: { w: number; h: number };
};

const MIN_REGION = 8;

export default function BlurOverlay({
  regions, onChange,
  blockSize, onBlockSizeChange,
  onApply, onCancel, displaySize,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<BlurRegion | null>(null);

  const getPos = (e: React.PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(displaySize.w, e.clientX - rect.left)),
      y: Math.max(0, Math.min(displaySize.h, e.clientY - rect.top)),
    };
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const target = e.target as Element;
    if (target.closest("[data-region]")) return;
    e.preventDefault();
    svgRef.current!.setPointerCapture(e.pointerId);
    const start = getPos(e);
    startRef.current = start;
    setDraft({ x: start.x, y: start.y, w: 0, h: 0 });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!startRef.current) return;
    const cur = getPos(e);
    const s = startRef.current;
    setDraft({
      x: Math.min(s.x, cur.x),
      y: Math.min(s.y, cur.y),
      w: Math.abs(cur.x - s.x),
      h: Math.abs(cur.y - s.y),
    });
  };

  const onPointerUp = () => {
    if (draft && draft.w >= MIN_REGION && draft.h >= MIN_REGION) {
      onChange([...regions, draft]);
    }
    startRef.current = null;
    setDraft(null);
  };

  const removeRegion = (idx: number) => onChange(regions.filter((_, i) => i !== idx));

  return (
    <>
      <svg
        ref={svgRef}
        width={displaySize.w}
        height={displaySize.h}
        className="absolute top-0 left-0 cursor-crosshair touch-none select-none"
        style={{ zIndex: 10 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <defs>
          <pattern id="blurHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" fill="rgba(99,102,241,0.35)" />
            <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(255,255,255,0.4)" strokeWidth="2" />
          </pattern>
        </defs>

        {regions.map((r, i) => (
          <g key={i} data-region onClick={() => removeRegion(i)} style={{ cursor: "pointer" }}>
            <rect
              x={r.x} y={r.y} width={r.w} height={r.h}
              fill="url(#blurHatch)"
              stroke="#6366f1"
              strokeWidth="2"
            />
            <circle
              cx={r.x + r.w - 10} cy={r.y + 10} r={9}
              fill="rgba(0,0,0,0.6)" stroke="white" strokeWidth="1"
            />
            <text
              x={r.x + r.w - 10} y={r.y + 13}
              textAnchor="middle" fontSize="11" fill="white" fontWeight="bold"
              pointerEvents="none"
            >
              ✕
            </text>
          </g>
        ))}

        {draft && (
          <rect
            x={draft.x} y={draft.y} width={draft.w} height={draft.h}
            fill="rgba(99,102,241,0.2)"
            stroke="#6366f1" strokeWidth="2" strokeDasharray="6 3"
            pointerEvents="none"
          />
        )}
      </svg>

      <div
        className="absolute flex flex-wrap items-center gap-2"
        style={{ bottom: 12, left: "50%", transform: "translateX(-50%)", zIndex: 20 }}
      >
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-xl text-sm font-medium bg-gray-900/90 backdrop-blur
            text-gray-300 hover:bg-gray-700 border border-gray-600 transition-colors"
        >
          Anuluj
        </button>
        <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-900/90 backdrop-blur border border-gray-700">
          <span className="text-gray-400 text-xs">Ziarno</span>
          <input
            type="range" min={5} max={50} step={1}
            value={blockSize}
            onChange={e => onBlockSizeChange(Number(e.target.value))}
            className="w-20 accent-indigo-500"
          />
          <span className="text-indigo-400 text-xs font-mono w-6 text-right">{blockSize}</span>
        </label>
        <button
          onClick={onApply}
          disabled={regions.length === 0}
          className="px-4 py-2 rounded-xl text-sm font-medium bg-indigo-600/90 backdrop-blur text-white
            hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Zamaż ✓
        </button>
      </div>
    </>
  );
}
