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
};

export default function AspectRatioBar({ aspect, originalAspect, onChange }: Props) {
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
    </div>
  );
}
