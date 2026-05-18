export type ScanMode = "bw" | "gray" | "enhanced";

const MODES: { value: ScanMode; label: string; desc: string }[] = [
  { value: "gray",     label: "Szary",     desc: "Odcienie szarości, lekki kontrast" },
  { value: "enhanced", label: "Wzmocniony", desc: "Wysoki kontrast, tekst wyraźny" },
  { value: "bw",       label: "Czarno-biały", desc: "Próg binarny — czysty skan" },
];

type Props = {
  onApply: (mode: ScanMode) => void;
};

export default function ScanBar({ onApply }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-2.5 bg-gray-900 rounded-2xl border border-gray-800">
      <span className="text-gray-500 text-xs uppercase tracking-widest shrink-0">Skan:</span>

      <div className="flex flex-wrap gap-2">
        {MODES.map(m => (
          <button
            key={m.value}
            onClick={() => onApply(m.value)}
            title={m.desc}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
              bg-gray-800 text-gray-300 hover:bg-indigo-600 hover:text-white
              border border-gray-700 hover:border-indigo-500"
          >
            {m.label}
          </button>
        ))}
      </div>

      <span className="text-gray-600 text-xs hidden md:block">
        Zastosowanie efektu zapisuje się w historii — możesz cofnąć
      </span>
    </div>
  );
}
