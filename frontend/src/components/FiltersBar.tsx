type Props = {
  brightness: number;
  contrast: number;
  saturation: number;
  onChange: (brightness: number, contrast: number, saturation: number) => void;
  onReset: () => void;
  onAutoEnhance: () => void;
  onSharpen: () => void;
  isAutoActive: boolean;
  isSharpenActive: boolean;
};

type SliderProps = {
  label: string;
  value: number;
  onChange: (v: number) => void;
};

function Slider({ label, value, onChange }: SliderProps) {
  return (
    <div className="grid grid-cols-[80px_1fr_36px] items-center gap-2">
      <span className="text-gray-400 text-xs">{label}</span>
      <input
        type="range"
        min={0}
        max={200}
        step={5}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-indigo-500"
      />
      <span className={`text-xs font-mono text-right ${value === 100 ? "text-gray-600" : "text-indigo-400"}`}>
        {value}%
      </span>
    </div>
  );
}

export default function FiltersBar({
  brightness, contrast, saturation,
  onChange, onReset, onAutoEnhance, onSharpen,
  isAutoActive, isSharpenActive,
}: Props) {
  const isDirty = brightness !== 100 || contrast !== 100 || saturation !== 100;

  return (
    <div className="px-3 py-3 bg-gray-900 rounded-2xl border border-gray-800 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-gray-500 text-xs uppercase tracking-widest">Korekta</span>
        <div className="flex gap-2">
          <button
            onClick={onAutoEnhance}
            title="Auto-poprawa (rozciągnięcie histogramu)"
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors border
              ${isAutoActive
                ? "bg-amber-600 hover:bg-amber-500 text-white border-amber-500 ring-2 ring-amber-400/40"
                : "bg-indigo-600 hover:bg-indigo-500 text-white border-transparent"}`}
          >
            {isAutoActive ? "✓ Auto" : "🪄 Auto"}
          </button>
          <button
            onClick={onSharpen}
            title="Wyostrz"
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors border
              ${isSharpenActive
                ? "bg-amber-600 hover:bg-amber-500 text-white border-amber-500 ring-2 ring-amber-400/40"
                : "bg-gray-800 hover:bg-gray-700 text-gray-200 border-gray-700"}`}
          >
            {isSharpenActive ? "✓ Wyostrzone" : "🔪 Wyostrz"}
          </button>
          <button
            onClick={onReset}
            disabled={!isDirty}
            className="px-3 py-1 rounded-lg text-xs font-medium transition-colors
              bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white
              border border-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Reset
          </button>
        </div>
      </div>

      <Slider label="Jasność"   value={brightness} onChange={v => onChange(v, contrast, saturation)} />
      <Slider label="Kontrast"  value={contrast}   onChange={v => onChange(brightness, v, saturation)} />
      <Slider label="Nasycenie" value={saturation} onChange={v => onChange(brightness, contrast, v)} />
    </div>
  );
}
