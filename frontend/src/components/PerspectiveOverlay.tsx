import { useRef, useCallback } from "react";
import type { Point } from "../utils/homography";

type Props = {
  points: Point[];
  displaySize: { w: number; h: number };
  onChange: (pts: Point[]) => void;
  onApply: () => void;
  onCancel: () => void;
};

const COLORS = ["#6366f1", "#22d3ee", "#f59e0b", "#10b981"];
const LABELS = ["LG", "PG", "PD", "LD"];
const R = 14;

// Komponent zwraca Fragment — SVG i przyciski są absolute
// względem rodzica div.relative w App.tsx, nie własnego wrappera
export default function PerspectiveOverlay({ points, displaySize, onChange, onApply, onCancel }: Props) {
  const dragging = useRef<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent): Point => {
    const rect = svgRef.current!.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return {
      x: Math.max(0, Math.min(displaySize.w, clientX - rect.left)),
      y: Math.max(0, Math.min(displaySize.h, clientY - rect.top)),
    };
  }, [displaySize]);

  const onStart = (idx: number) => (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    dragging.current = idx;
  };

  const onMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (dragging.current === null) return;
    e.preventDefault();
    const pos = getPos(e);
    const next = [...points];
    next[dragging.current] = pos;
    onChange(next);
  }, [points, onChange, getPos]);

  const onEnd = useCallback(() => { dragging.current = null; }, []);

  const poly = points.map(p => `${p.x},${p.y}`).join(" ");

  return (
    <>
      {/* SVG nakładka — absolute over image, pozycjonuje się względem div.relative w App */}
      <svg
        ref={svgRef}
        width={displaySize.w}
        height={displaySize.h}
        className="absolute top-0 left-0 cursor-crosshair touch-none select-none"
        style={{ zIndex: 10 }}
        onMouseMove={onMove}
        onMouseUp={onEnd}
        onMouseLeave={onEnd}
        onTouchMove={onMove}
        onTouchEnd={onEnd}
      >
        <defs>
          <mask id="docMask">
            <rect width="100%" height="100%" fill="white" />
            <polygon points={poly} fill="black" />
          </mask>
        </defs>

        {/* Zaciemnienie poza dokumentem */}
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.5)" mask="url(#docMask)" />

        {/* Obramowanie */}
        <polygon points={poly} fill="none" stroke="#6366f1" strokeWidth="2" strokeDasharray="6 3" />

        {/* Linie krawędzi */}
        {points.map((p, i) => {
          const next = points[(i + 1) % 4];
          return <line key={i} x1={p.x} y1={p.y} x2={next.x} y2={next.y} stroke={COLORS[i]} strokeWidth="1.5" opacity="0.8" />;
        })}

        {/* Uchwyty */}
        {points.map((p, i) => (
          <g key={i} onMouseDown={onStart(i)} onTouchStart={onStart(i)} style={{ cursor: "grab" }}>
            <circle cx={p.x} cy={p.y} r={R + 8} fill="transparent" />
            <circle cx={p.x} cy={p.y} r={R} fill={COLORS[i]} stroke="white" strokeWidth="2.5" />
            <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="9" fill="white" fontWeight="bold" style={{ pointerEvents: "none" }}>
              {LABELS[i]}
            </text>
          </g>
        ))}
      </svg>

      {/* Przyciski — absolute, nad SVG */}
      <div
        className="absolute flex gap-2"
        style={{ bottom: 12, left: "50%", transform: "translateX(-50%)", zIndex: 20 }}
      >
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-xl text-sm font-medium bg-gray-900/90 backdrop-blur text-gray-300 hover:bg-gray-700 border border-gray-600 transition-colors"
        >
          Anuluj
        </button>
        <button
          onClick={onApply}
          className="px-4 py-2 rounded-xl text-sm font-medium bg-indigo-600/90 backdrop-blur text-white hover:bg-indigo-500 transition-colors"
        >
          Wyprostuj ✓
        </button>
      </div>
    </>
  );
}
