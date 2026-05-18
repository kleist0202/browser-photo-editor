import { useState, useRef } from "react";
import ReactCrop, {
  type Crop, type PixelCrop,
  centerCrop, makeAspectCrop,
} from "react-image-crop";
import DropZone from "./components/DropZone";
import Toolbar from "./components/Toolbar";
import AspectRatioBar from "./components/AspectRatioBar";
import { useEditor } from "./hooks/useEditor";

function initCrop(width: number, height: number, aspect?: number): Crop {
  const ratio = aspect ?? width / height;

  // Maksymalny kadr pasujący do obrazu przy danych proporcjach
  const imageAspect = width / height;
  const cropWidthPct = ratio > imageAspect
    ? 100                          // szerszy niż zdjęcie → ogranicz szerokością
    : (height * ratio / width) * 100; // wyższy niż zdjęcie → ogranicz wysokością

  return centerCrop(
    makeAspectCrop({ unit: "%", width: cropWidthPct }, ratio, width, height),
    width,
    height,
  );
}

export default function App() {
  const { state, dispatch, loadFile, applyRotation, applyFlip, applyCrop, download } = useEditor();
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [aspect, setAspect] = useState<number | undefined>(undefined);
  const [originalAspect, setOriginalAspect] = useState<number | undefined>(undefined);
  const imgRef = useRef<HTMLImageElement>(null);
  const [busy, setBusy] = useState(false);

  const commit = async (fn: () => Promise<string>) => {
    setBusy(true);
    const result = await fn();
    dispatch({ type: "COMMIT", result });
    setCrop(undefined);
    setCompletedCrop(undefined);
    setBusy(false);
  };

  const handleAspectChange = (v: number | undefined) => {
    setAspect(v);
    setCrop(undefined);
    setCompletedCrop(undefined);
    if (imgRef.current) {
      const { naturalWidth: w, naturalHeight: h } = imgRef.current;
      setCrop(initCrop(w, h, v));
    }
  };

  const handleApplyCrop = async () => {
    if (!state.src || !completedCrop || !imgRef.current) return;
    const img = imgRef.current;
    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;
    const scaled: PixelCrop = {
      ...completedCrop,
      x:      Math.round(completedCrop.x      * scaleX),
      y:      Math.round(completedCrop.y      * scaleY),
      width:  Math.round(completedCrop.width  * scaleX),
      height: Math.round(completedCrop.height * scaleY),
    };
    await commit(() => applyCrop(state.src!, scaled));
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">

      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-800 bg-gray-900">
        <div>
          <h1 className="text-base sm:text-xl font-bold">Photo Editor</h1>
          <p className="text-gray-500 text-xs hidden sm:block">Lokalnie w przeglądarce — żadne zdjęcie nie opuszcza Twojego urządzenia</p>
        </div>
        {state.src && state.history.length > 0 && (
          <span className="text-gray-600 text-xs">{state.history.length} zmian</span>
        )}
      </header>

      {/* ── Główna treść ────────────────────────────────────────── */}
      <main className={`flex-1 flex flex-col gap-3 p-3 sm:p-6 ${state.src ? "pb-28 sm:pb-6" : ""}`}>
        {!state.src ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-full max-w-lg">
              <DropZone onFile={loadFile} />
            </div>
          </div>
        ) : (
          <>
            <Toolbar
              onRotateCW={() => commit(() => applyRotation(state.src!, 90))}
              onRotateCCW={() => commit(() => applyRotation(state.src!, 270))}
              onFlipH={() => commit(() => applyFlip(state.src!, "h"))}
              onFlipV={() => commit(() => applyFlip(state.src!, "v"))}
              onApplyCrop={handleApplyCrop}
              onUndo={() => dispatch({ type: "UNDO" })}
              onReset={() => dispatch({ type: "RESET" })}
              onDownload={(fmt, q) => state.src && download(state.src, fmt, q)}
              canUndo={state.history.length > 0}
              hasCrop={!!completedCrop?.width && completedCrop.width > 0}
            />

            {/* Proporcje kadru */}
            <div className="hidden sm:block">
              <AspectRatioBar aspect={aspect} originalAspect={originalAspect} onChange={handleAspectChange} />
            </div>

            {busy && (
              <p className="text-center text-indigo-400 animate-pulse text-sm py-1">
                Przetwarzanie...
              </p>
            )}

            {/* Zdjęcie */}
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-2 sm:p-4 text-center">
              <ReactCrop
                crop={crop}
                onChange={c => setCrop(c)}
                onComplete={c => setCompletedCrop(c)}
                aspect={aspect}
                minWidth={10}
                minHeight={10}
              >
                <img
                  ref={imgRef}
                  src={state.src}
                  alt="edytowane zdjęcie"
                  style={{ maxHeight: "65vh", maxWidth: "100%", display: "block" }}
                  className="rounded-lg mx-auto"
                  onLoad={e => {
                    const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                    const orig = w / h;
                    setOriginalAspect(orig);
                    setCrop(initCrop(w, h, aspect));
                  }}
                />
              </ReactCrop>
            </div>

            {/* Proporcje na mobile — nad paskiem dolnym */}
            <div className="sm:hidden">
              <AspectRatioBar aspect={aspect} originalAspect={originalAspect} onChange={handleAspectChange} />
            </div>

            <p className="text-center text-gray-700 text-xs hidden sm:block">
              Zaznacz obszar myszką żeby przyciąć
            </p>
          </>
        )}
      </main>
    </div>
  );
}
