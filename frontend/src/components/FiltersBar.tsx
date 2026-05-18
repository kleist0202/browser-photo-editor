type Props = {
  brightness: number;
  contrast: number;
  saturation: number;
  onChange: (brightness: number, contrast: number, saturation: number) => void;
  onApply: () => void;
  onReset: () => void;
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

export default function FiltersBar({ brightness, contrast, saturation, onChange, onApply, onReset }: Props) {
  const isDirty = brightness !== 100 || contrast !== 100 || saturation !== 100;

  return (
    <div className="px-3 py-3 bg-gray-900 rounded-2xl border border-gray-800 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-gray-500 text-xs uppercase tracking-widest">Korekta</span>
        <div className="flex gap-2">
          <button
            onClick={onReset}
            disabled={!isDirty}
            className="px-3 py-1 rounded-lg text-xs font-medium transition-colors
              bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white
              border border-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Reset
          </button>
          <button
            onClick={onApply}
            disabled={!isDirty}
            className="px-3 py-1 rounded-lg text-xs font-medium transition-colors
              bg-indigo-600 hover:bg-indigo-500 text-white
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Zastosuj
          </button>
        </div>
      </div>

      <Slider label="Jasność"   value={brightness} onChange={v => onChange(v, contrast, saturation)} />
      <Slider label="Kontrast"  value={contrast}   onChange={v => onChange(brightness, v, saturation)} />
      <Slider label="Nasycenie" value={saturation} onChange={v => onChange(brightness, contrast, v)} />
    </div>
  );
}
