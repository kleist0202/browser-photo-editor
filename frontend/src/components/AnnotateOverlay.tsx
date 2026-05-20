import { useRef, useState, useEffect } from "react";
import type { Annotation, Stroke, TextAnno } from "../hooks/useEditor";

type Props = {
  annos: Annotation[];
  onChange: (a: Annotation[]) => void;
  displaySize: { w: number; h: number };
  onApply: () => void;
  onCancel: () => void;
};

type Tool = "pen" | "text";
const COLORS = ["#ef4444", "#fbbf24", "#3b82f6", "#10b981", "#ffffff", "#000000"];

export default function AnnotateOverlay({ annos, onChange, displaySize, onApply, onCancel }: Props) {
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(4);
  const [editingText, setEditingText] = useState<{ x: number; y: number; text: string; color: string; size: number; idx?: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drawingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const dragOffsetRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const tapStartRef = useRef<{ x: number; y: number; idx: number } | null>(null);
  const tapMovedRef = useRef(false);

  useEffect(() => {
    if (editingText && inputRef.current) inputRef.current.focus();
  }, [editingText]);

  const getPos = (e: React.PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(displaySize.w, e.clientX - rect.left)),
      y: Math.max(0, Math.min(displaySize.h, e.clientY - rect.top)),
    };
  };

  const onTextPointerDown = (e: React.PointerEvent, i: number) => {
    e.stopPropagation();
    svgRef.current!.setPointerCapture(e.pointerId);
    const a = annos[i];
    if (a.kind !== "text") return;
    const pos = getPos(e);
    dragOffsetRef.current = { dx: pos.x - a.x, dy: pos.y - a.y };
    tapStartRef.current = { x: pos.x, y: pos.y, idx: i };
    tapMovedRef.current = false;
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (editingText) return;
    e.preventDefault();
    svgRef.current!.setPointerCapture(e.pointerId);
    const pos = getPos(e);
    if (tool === "pen") {
      drawingRef.current = true;
      const stroke: Stroke = { kind: "stroke", color, size, pts: [pos] };
      onChange([...annos, stroke]);
    } else {
      setEditingText({ x: pos.x, y: pos.y, text: "", color, size: Math.max(size * 4, 14) });
    }
  };

  const openTextEdit = (i: number) => {
    const a = annos[i];
    if (a.kind !== "text") return;
    setEditingText({ x: a.x, y: a.y, text: a.text, color: a.color, size: a.size, idx: i });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (tapStartRef.current) {
      const pos = getPos(e);
      const dx = pos.x - tapStartRef.current.x;
      const dy = pos.y - tapStartRef.current.y;
      if (!tapMovedRef.current && Math.hypot(dx, dy) > 5) {
        tapMovedRef.current = true;
        setDraggingIdx(tapStartRef.current.idx);
      }
      if (tapMovedRef.current) {
        const idx = tapStartRef.current.idx;
        const a = annos[idx];
        if (!a || a.kind !== "text") return;
        const nx = Math.max(0, Math.min(displaySize.w, pos.x - dragOffsetRef.current.dx));
        const ny = Math.max(0, Math.min(displaySize.h, pos.y - dragOffsetRef.current.dy));
        onChange(annos.map((x, i) => i === idx ? { ...a, x: nx, y: ny } : x));
      }
      return;
    }
    if (!drawingRef.current) return;
    const pos = getPos(e);
    const last = annos[annos.length - 1];
    if (!last || last.kind !== "stroke") return;
    const updated: Stroke = { ...last, pts: [...last.pts, pos] };
    onChange([...annos.slice(0, -1), updated]);
  };

  const onPointerUp = () => {
    if (tapStartRef.current) {
      const wasTap = !tapMovedRef.current;
      const idx = tapStartRef.current.idx;
      tapStartRef.current = null;
      tapMovedRef.current = false;
      setDraggingIdx(null);
      if (wasTap) openTextEdit(idx);
      return;
    }
    drawingRef.current = false;
  };

  const commitText = () => {
    if (!editingText) return;
    const t = editingText.text.trim();
    if (editingText.idx !== undefined) {
      if (t) {
        onChange(annos.map((a, i) =>
          i === editingText.idx ? { ...(a as TextAnno), text: t } : a
        ));
      } else {
        onChange(annos.filter((_, i) => i !== editingText.idx));
      }
    } else if (t) {
      onChange([...annos, {
        kind: "text", color: editingText.color, size: editingText.size,
        x: editingText.x, y: editingText.y, text: t,
      }]);
    }
    setEditingText(null);
  };

  const removeLast = () => onChange(annos.slice(0, -1));

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
        {annos.map((a, i) => {
          if (editingText?.idx === i) return null;
          if (a.kind === "stroke") {
            return (
              <path
                key={i}
                d={a.pts.map((p, j) => `${j === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke={a.color}
                strokeWidth={a.size}
                strokeLinecap="round"
                strokeLinejoin="round"
                pointerEvents="none"
              />
            );
          }
          return (
            <text
              key={i}
              x={a.x} y={a.y}
              fill={a.color}
              fontSize={a.size}
              fontFamily="sans-serif"
              dominantBaseline="text-before-edge"
              style={{ cursor: draggingIdx === i ? "grabbing" : "grab" }}
              onPointerDown={e => onTextPointerDown(e, i)}
            >
              {a.text}
            </text>
          );
        })}
      </svg>

      {editingText && (
        <input
          ref={inputRef}
          value={editingText.text}
          onChange={e => setEditingText({ ...editingText, text: e.target.value })}
          onKeyDown={e => {
            if (e.key === "Enter") commitText();
            else if (e.key === "Escape") setEditingText(null);
          }}
          onBlur={commitText}
          placeholder="Tekst…"
          className="absolute bg-transparent border border-indigo-400 px-1 outline-none"
          style={{
            left: editingText.x,
            top: editingText.y,
            color: editingText.color,
            fontSize: editingText.size,
            fontFamily: "sans-serif",
            zIndex: 30,
            minWidth: "100px",
          }}
        />
      )}

      <div
        className="absolute flex flex-wrap items-center gap-2"
        style={{ bottom: 12, left: "50%", transform: "translateX(-50%)", zIndex: 20 }}
      >
        <div className="flex gap-1 bg-gray-900/90 backdrop-blur rounded-xl border border-gray-700 p-1">
          <button
            onClick={() => setTool("pen")}
            className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors
              ${tool === "pen" ? "bg-indigo-600 text-white" : "text-gray-300 hover:bg-gray-700"}`}
          >
            🖊 Rysuj
          </button>
          <button
            onClick={() => setTool("text")}
            className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors
              ${tool === "text" ? "bg-indigo-600 text-white" : "text-gray-300 hover:bg-gray-700"}`}
          >
            T Tekst
          </button>
        </div>

        <div className="flex gap-1 bg-gray-900/90 backdrop-blur rounded-xl border border-gray-700 p-1">
          {COLORS.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-6 h-6 rounded-md border-2 transition-transform
                ${color === c ? "scale-110 border-white" : "border-gray-600"}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        <label className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-900/90 backdrop-blur border border-gray-700">
          <span className="text-gray-400 text-xs">Grubość</span>
          <input
            type="range" min={1} max={20} step={1}
            value={size}
            onChange={e => setSize(Number(e.target.value))}
            className="w-16 accent-indigo-500"
          />
          <span className="text-indigo-400 text-xs font-mono w-5 text-right">{size}</span>
        </label>

        <button
          onClick={removeLast}
          disabled={annos.length === 0}
          title="Cofnij ostatnią"
          className="px-3 py-2 rounded-xl text-sm font-medium bg-gray-900/90 backdrop-blur
            text-gray-300 hover:bg-gray-700 border border-gray-600 disabled:opacity-40 transition-colors"
        >
          ↶
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
          disabled={annos.length === 0 && !editingText}
          className="px-4 py-2 rounded-xl text-sm font-medium bg-indigo-600/90 backdrop-blur text-white
            hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Zastosuj ✓
        </button>
      </div>
    </>
  );
}
