import { useEffect, useState } from "react";

const RATIOS = [
  { label: "Swobodny",   value: undefined },
  { label: "1:1",        value: 1 },
  { label: "4:3",        value: 4 / 3 },
  { label: "3:2",        value: 3 / 2 },
  { label: "16:9",       value: 16 / 9 },
] as const;

type Props = {
  aspect: number | undefined;
  originalAspect: number | undefined;
  onChange: (v: number | undefined) => void;
  cropW: number;
  cropH: number;
  maxW: number;
  maxH: number;
  onCropWChange: (w: number) => void;
  onCropHChange: (h: number) => void;
};

function PxInput({ value, max, onCommit }: {
  value: number;
  max: number;
  onCommit: (n: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  return (
    <input
      type="number"
      min={1}
      max={max}
      value={text}
      onChange={e => {
        setText(e.target.value);
        const n = parseInt(e.target.value, 10);
        if (!isNaN(n) && n > 0) onCommit(n);
      }}
      onBlur={() => setText(String(value))}
      className="w-16 bg-gray-800 text-white text-xs px-2 py-1 rounded border border-gray-700
        focus:outline-none focus:border-indigo-500 [appearance:textfield]
        [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
    />
  );
}

export default function AspectRatioBar({
  aspect, originalAspect, onChange,
  cropW, cropH, maxW, maxH, onCropWChange, onCropHChange,
}: Props) {
  const hasImage = maxW > 0 && maxH > 0;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-gray-500 text-xs mr-1">Proporcje:</span>

      {RATIOS.map(r => (
        <button
          key={r.label}
          onClick={() => onChange(r.value)}
          className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors
            ${aspect === r.value
              ? "bg-indigo-600 text-white"
              : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white border border-gray-700"
            }`}
        >
          {r.label}
        </button>
      ))}

      {originalAspect !== undefined && (
        <button
          onClick={() => onChange(originalAspect)}
          className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors
            ${aspect === originalAspect
              ? "bg-indigo-600 text-white"
              : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white border border-gray-700"
            }`}
        >
          Oryginał
        </button>
      )}

      {hasImage && (
        <div className="flex items-center gap-1 ml-2 pl-2 border-l border-gray-800">
          <PxInput value={cropW} max={maxW} onCommit={onCropWChange} />
          <span className="text-gray-500 text-xs">×</span>
          <PxInput value={cropH} max={maxH} onCommit={onCropHChange} />
          <span className="text-gray-500 text-xs ml-0.5">px</span>
        </div>
      )}
    </div>
  );
}
