import { useEffect, useState } from "react";

type Props = {
  printW: number | undefined;
  printH: number | undefined;
  natW: number;
  natH: number;
  onChange: (printW: number | undefined, printH: number | undefined) => void;
};

function MmInput({ value, onCommit, max }: {
  value: number | undefined;
  onCommit: (mm: number | undefined) => void;
  max: number;
}) {
  const display = value !== undefined ? value.toFixed(1) : "";
  const [text, setText] = useState(display);
  useEffect(() => { setText(display); }, [display]);
  return (
    <input
      type="number"
      min={1}
      max={max}
      step={0.5}
      value={text}
      placeholder="auto"
      onChange={e => {
        setText(e.target.value);
        if (e.target.value === "") {
          onCommit(undefined);
          return;
        }
        const n = parseFloat(e.target.value);
        if (!isNaN(n) && n > 0) onCommit(n);
      }}
      onBlur={() => setText(display)}
      className="w-16 bg-gray-800 text-white text-xs px-2 py-1 rounded border border-gray-700
        focus:outline-none focus:border-indigo-500 [appearance:textfield]
        [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
    />
  );
}

export default function PrintSizeBar({ printW, printH, natW, natH, onChange }: Props) {
  const [locked, setLocked] = useState(true);
  const [unit, setUnit] = useState<"mm" | "cm">("mm");
  const factor = unit === "cm" ? 10 : 1; // multiply display value by this to get mm

  const setW = (display: number | undefined) => {
    if (display === undefined) { onChange(undefined, printH); return; }
    const mm = display * factor;
    if (locked && natW > 0 && natH > 0) onChange(mm, +(mm * natH / natW).toFixed(2));
    else onChange(mm, printH);
  };
  const setH = (display: number | undefined) => {
    if (display === undefined) { onChange(printW, undefined); return; }
    const mm = display * factor;
    if (locked && natW > 0 && natH > 0) onChange(+(mm * natW / natH).toFixed(2), mm);
    else onChange(printW, mm);
  };

  const reset = () => onChange(undefined, undefined);
  const isCustom = printW !== undefined || printH !== undefined;

  const toDisplay = (mm: number | undefined) =>
    mm === undefined ? undefined : mm / factor;

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 rounded-2xl border border-gray-800 flex-wrap">
      <span className="text-gray-500 text-xs uppercase tracking-widest">Wydruk:</span>
      <MmInput value={toDisplay(printW)} onCommit={setW} max={500 / factor} />
      <button
        onClick={() => setLocked(v => !v)}
        title={locked ? "Proporcje zablokowane" : "Proporcje swobodne"}
        className="px-1 text-gray-400 hover:text-white"
      >
        {locked ? "🔒" : "🔓"}
      </button>
      <MmInput value={toDisplay(printH)} onCommit={setH} max={500 / factor} />
      <div className="flex gap-1 ml-1">
        {(["mm", "cm"] as const).map(u => (
          <button
            key={u}
            onClick={() => setUnit(u)}
            className={`px-2 py-0.5 rounded-md text-xs font-medium transition-colors
              ${unit === u
                ? "bg-indigo-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white border border-gray-700"}`}
          >
            {u}
          </button>
        ))}
      </div>
      <button
        onClick={reset}
        disabled={!isCustom}
        title="Wyzeruj — fit do strony"
        className="ml-1 px-2 py-0.5 rounded-lg text-xs font-medium
          bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700
          disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Auto
      </button>
    </div>
  );
}
