import { useState } from "react";

type Props = {
  onRotateCW: () => void;
  onRotateCCW: () => void;
  onFlipH: () => void;
  onFlipV: () => void;
  onApplyCrop: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  onDownload: (format: "jpeg" | "png", quality: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  hasCrop: boolean;
  onPerspective: () => void;
  onAddPage: () => void;
  pagesCount: number;
};

export default function Toolbar({
  onRotateCW, onRotateCCW, onFlipH, onFlipV,
  onApplyCrop, onUndo, onRedo, onReset, onDownload,
  canUndo, canRedo, hasCrop, onPerspective,
  onAddPage, pagesCount,
}: Props) {
  const [format, setFormat] = useState<"jpeg" | "png">("jpeg");
  const [quality, setQuality] = useState(90);
  const [showDownload, setShowDownload] = useState(false);

  const iconBtn = (icon: string, label: string, onClick: () => void, opts?: {
    disabled?: boolean;
    active?: boolean;
    variant?: "primary" | "danger";
  }) => {
    const { disabled, active, variant } = opts ?? {};
    const color = variant === "primary" ? "bg-indigo-600 hover:bg-indigo-500 text-white"
      : variant === "danger" ? "bg-red-900/40 hover:bg-red-800/60 text-red-300 border border-red-800"
      : active ? "bg-indigo-600 text-white"
      : "bg-gray-800 hover:bg-gray-700 text-white border border-gray-700";

    return (
      <button
        key={label}
        onClick={onClick}
        disabled={disabled}
        title={label}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium
          transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${color}`}
      >
        <span>{icon}</span>
        <span className="hidden md:inline">{label}</span>
      </button>
    );
  };

  return (
    <>
      {/* ── Desktop toolbar ─────────────────────────────────────── */}
      <div className="hidden sm:flex flex-wrap items-center gap-2 p-3 bg-gray-900 rounded-2xl border border-gray-800">

        <div className="flex items-center gap-1.5">
          {iconBtn("↺", "Lewo",   onRotateCCW)}
          {iconBtn("↻", "Prawo",  onRotateCW)}
          {iconBtn("↔", "Flip H", onFlipH)}
          {iconBtn("↕", "Flip V", onFlipV)}
        </div>

        <div className="w-px h-6 bg-gray-700" />

        {iconBtn("⬡", "Perspektywa", onPerspective)}

        <div className="w-px h-6 bg-gray-700" />

        {iconBtn("✂", "Przytnij", onApplyCrop, { disabled: !hasCrop, variant: "primary" })}

        <div className="w-px h-6 bg-gray-700" />

        {iconBtn("↩", "Cofnij", onUndo, { disabled: !canUndo })}
        {iconBtn("↪", "Ponów",  onRedo, { disabled: !canRedo })}
        {iconBtn("✕", "Reset",  onReset, { variant: "danger" })}

        <div className="w-px h-6 bg-gray-700" />

        <button
          onClick={onAddPage}
          title="Dodaj jako stronę PDF"
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium
            transition-colors bg-gray-800 hover:bg-gray-700 text-white border border-gray-700"
        >
          <span>➕</span>
          <span className="hidden md:inline">Strona</span>
          {pagesCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-md bg-indigo-600 text-white text-[10px] leading-none">
              {pagesCount}
            </span>
          )}
        </button>

        {/* Pobierz z opcjami */}
        <div className="relative ml-auto">
          <button
            onClick={() => setShowDownload(v => !v)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium
              bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
          >
            <span>⬇</span>
            <span>Pobierz</span>
            <span className="text-xs opacity-70 ml-1">{format.toUpperCase()} {format === "jpeg" ? `${quality}%` : ""}</span>
          </button>

          {showDownload && (
            <div className="absolute right-0 top-full mt-2 z-50 bg-gray-800 border border-gray-700
              rounded-2xl p-4 shadow-xl min-w-56 space-y-4">

              <div className="space-y-1.5">
                <p className="text-gray-400 text-xs uppercase tracking-widest">Format</p>
                <div className="flex gap-2">
                  {(["jpeg", "png"] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setFormat(f)}
                      className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors
                        ${format === f ? "bg-indigo-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
                    >
                      {f.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {format === "jpeg" && (
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <p className="text-gray-400 text-xs uppercase tracking-widest">Jakość</p>
                    <p className="text-indigo-400 text-xs font-mono">{quality}%</p>
                  </div>
                  <input
                    type="range" min={10} max={100} step={5}
                    value={quality}
                    onChange={e => setQuality(Number(e.target.value))}
                    className="w-full accent-indigo-500"
                  />
                  <div className="flex justify-between text-gray-600 text-xs">
                    <span>mały plik</span>
                    <span>wysoka jakość</span>
                  </div>
                </div>
              )}

              <button
                onClick={() => { onDownload(format, quality); setShowDownload(false); }}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-colors"
              >
                Pobierz {format.toUpperCase()}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Mobile: pasek na dole ────────────────────────────────── */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-50
        bg-gray-900/95 backdrop-blur border-t border-gray-800
        pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-4">
          {[
            { icon: "↺",  label: "Lewo",    onClick: onRotateCCW },
            { icon: "↻",  label: "Prawo",   onClick: onRotateCW },
            { icon: "↔",  label: "Flip H",  onClick: onFlipH },
            { icon: "↕",  label: "Flip V",  onClick: onFlipV },
            { icon: "⬡",  label: "Perspekt.", onClick: onPerspective },
            { icon: "✂",  label: "Przytnij", onClick: onApplyCrop, disabled: !hasCrop, primary: true },
            { icon: "↩",  label: "Cofnij",  onClick: onUndo, disabled: !canUndo },
            { icon: "↪",  label: "Ponów",   onClick: onRedo, disabled: !canRedo },
            { icon: "✕",  label: "Reset",   onClick: onReset, danger: true },
            { icon: "➕", label: "Strona",  onClick: onAddPage, badge: pagesCount },
            { icon: "⬇",  label: "Pobierz", onClick: () => onDownload(format, quality), primary: true },
          ].map(a => (
            <button
              key={a.label}
              onClick={a.onClick}
              disabled={a.disabled}
              className={`relative flex flex-col items-center justify-center gap-0.5 py-2.5 text-xs
                font-medium transition-colors disabled:opacity-40 active:scale-95
                ${a.primary ? "text-indigo-400" : a.danger ? "text-red-400" : "text-gray-300"}`}
            >
              <span className="text-xl leading-none">{a.icon}</span>
              <span className="text-[10px] text-gray-500">{a.label}</span>
              {a.badge ? (
                <span className="absolute top-1 right-1/4 px-1 rounded bg-indigo-600 text-white text-[9px] leading-none py-0.5">
                  {a.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
