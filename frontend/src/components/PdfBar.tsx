type Props = {
  pages: string[];
  margin: number;
  onMarginChange: (mm: number) => void;
  onRemove: (index: number) => void;
  onClear: () => void;
  onDownload: () => void;
};

export default function PdfBar({ pages, margin, onMarginChange, onRemove, onClear, onDownload }: Props) {
  if (pages.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-2.5 bg-gray-900 rounded-2xl border border-gray-800">
      <span className="text-gray-500 text-xs uppercase tracking-widest shrink-0">
        PDF · {pages.length}
      </span>

      <div className="flex gap-2 overflow-x-auto flex-1 min-w-0 py-1">
        {pages.map((src, i) => (
          <div key={i} className="relative shrink-0">
            <img
              src={src}
              alt={`strona ${i + 1}`}
              className="h-12 w-12 object-cover rounded border border-gray-700"
            />
            <button
              onClick={() => onRemove(i)}
              title="Usuń stronę"
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 hover:bg-red-500
                text-white text-xs leading-none flex items-center justify-center shadow"
            >
              ×
            </button>
            <span className="absolute bottom-0 left-0 px-1 bg-black/60 text-white text-[9px] rounded-tr rounded-bl">
              {i + 1}
            </span>
          </div>
        ))}
      </div>

      <label className="flex items-center gap-2 shrink-0">
        <span className="text-gray-500 text-xs uppercase tracking-widest">Margines</span>
        <input
          type="range"
          min={0}
          max={40}
          step={1}
          value={margin}
          onChange={e => onMarginChange(Number(e.target.value))}
          className="w-24 accent-indigo-500"
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
  );
}
