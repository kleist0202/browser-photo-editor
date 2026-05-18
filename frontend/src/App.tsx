import { useState, useRef } from "react";
import ReactCrop, {
  type Crop, type PixelCrop,
  centerCrop, makeAspectCrop,
} from "react-image-crop";
import DropZone from "./components/DropZone";
import Toolbar from "./components/Toolbar";
import AspectRatioBar from "./components/AspectRatioBar";
import FiltersBar from "./components/FiltersBar";
import ScanBar from "./components/ScanBar";
import PerspectiveOverlay from "./components/PerspectiveOverlay";
import PdfBar from "./components/PdfBar";
import { useEditor } from "./hooks/useEditor";
import type { Point } from "./utils/homography";

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
  const { state, dispatch, loadFile, applyRotation, applyFlip, applyCrop, applyFilters, applyScan, applyPerspective, download, downloadPdf } = useEditor();
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [aspect, setAspect] = useState<number | undefined>(undefined);
  const [originalAspect, setOriginalAspect] = useState<number | undefined>(undefined);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [perspMode, setPerspMode] = useState(false);
  const [perspPoints, setPerspPoints] = useState<Point[]>([]);
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });
  const imgRef = useRef<HTMLImageElement>(null);
  const [busy, setBusy] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const originalSrc = state.history[0] ?? state.src;
  const canPreviewOriginal = state.history.length > 0;
  const [pdfMargin, setPdfMargin] = useState(8);
  const [lupaActive, setLupaActive] = useState(false);
  const [lupaPos, setLupaPos] = useState<{ x: number; y: number; touch: boolean } | null>(null);
  const LUPA_SIZE = 140;
  const LUPA_ZOOM = 2.5;
  const LUPA_TOUCH_GAP = 30;

  const handleLupaMove = (e: React.PointerEvent) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    setLupaPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      touch: e.pointerType === "touch",
    });
  };

  const readAsDataURL = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        const result = e.target?.result;
        if (typeof result === "string") resolve(result);
        else reject(new Error("read failed"));
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;
    if (files.length === 1) {
      loadFile(files[0]);
      return;
    }
    const dataUrls = await Promise.all(files.map(readAsDataURL));
    dataUrls.forEach(src => dispatch({ type: "ADD_PAGE", src }));
  };

  const enterPerspMode = () => {
    const img = imgRef.current;
    if (!img) return;
    const w = img.clientWidth;
    const h = img.clientHeight;
    const pad = 0.12;
    setDisplaySize({ w, h });
    setPerspPoints([
      { x: w * pad,       y: h * pad },
      { x: w * (1 - pad), y: h * pad },
      { x: w * (1 - pad), y: h * (1 - pad) },
      { x: w * pad,       y: h * (1 - pad) },
    ]);
    setPerspMode(true);
  };

  const commit = async (fn: () => Promise<string>) => {
    setBusy(true);
    const result = await fn();
    dispatch({ type: "COMMIT", result });
    setCrop(undefined);
    setCompletedCrop(undefined);
    setBusy(false);
  };

  const setCropAndCompleted = (pctCrop: Crop, img: HTMLImageElement) => {
    setCrop(pctCrop);
    if (pctCrop.unit === "%") {
      setCompletedCrop({
        unit: "px",
        x: (pctCrop.x / 100) * img.width,
        y: (pctCrop.y / 100) * img.height,
        width: (pctCrop.width / 100) * img.width,
        height: (pctCrop.height / 100) * img.height,
      });
    }
  };

  const handleAspectChange = (v: number | undefined) => {
    setAspect(v);
    if (imgRef.current) {
      const img = imgRef.current;
      setCropAndCompleted(initCrop(img.naturalWidth, img.naturalHeight, v), img);
    } else {
      setCrop(undefined);
      setCompletedCrop(undefined);
    }
  };

  const cropNaturalSize = (() => {
    const img = imgRef.current;
    if (!crop || !img || !img.naturalWidth) return { w: 0, h: 0 };
    if (crop.unit === "%") {
      return {
        w: Math.round((crop.width / 100) * img.naturalWidth),
        h: Math.round((crop.height / 100) * img.naturalHeight),
      };
    }
    const sx = img.naturalWidth / img.width;
    const sy = img.naturalHeight / img.height;
    return { w: Math.round(crop.width * sx), h: Math.round(crop.height * sy) };
  })();

  const applyCropSize = (newW: number, newH: number) => {
    const img = imgRef.current;
    if (!img) return;
    const clampedW = Math.max(1, Math.min(newW, img.naturalWidth));
    const clampedH = Math.max(1, Math.min(newH, img.naturalHeight));

    let xPct = 0, yPct = 0;
    if (crop) {
      if (crop.unit === "%") { xPct = crop.x; yPct = crop.y; }
      else {
        xPct = (crop.x / img.width) * 100;
        yPct = (crop.y / img.height) * 100;
      }
    }
    const wPct = (clampedW / img.naturalWidth) * 100;
    const hPct = (clampedH / img.naturalHeight) * 100;
    xPct = Math.max(0, Math.min(xPct, 100 - wPct));
    yPct = Math.max(0, Math.min(yPct, 100 - hPct));

    const newCrop: Crop = { unit: "%", x: xPct, y: yPct, width: wPct, height: hPct };
    setCrop(newCrop);
    setCompletedCrop({
      unit: "px",
      x: (xPct / 100) * img.width,
      y: (yPct / 100) * img.height,
      width: (wPct / 100) * img.width,
      height: (hPct / 100) * img.height,
    });
  };

  const handleCropWChange = (w: number) => {
    const h = aspect ? Math.round(w / aspect) : cropNaturalSize.h;
    applyCropSize(w, h);
  };
  const handleCropHChange = (h: number) => {
    const w = aspect ? Math.round(h * aspect) : cropNaturalSize.w;
    applyCropSize(w, h);
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
      <main className={`flex-1 flex flex-col gap-3 p-3 sm:p-6 ${state.src ? "pb-56 sm:pb-6" : ""}`}>
        {!state.hydrated ? (
          <div className="flex-1" />
        ) : !state.src ? (
          <>
            <PdfBar
              pages={state.pages}
              editingIndex={state.editingPageIndex}
              margin={pdfMargin}
              onMarginChange={setPdfMargin}
              onRemove={i => dispatch({ type: "REMOVE_PAGE", index: i })}
              onReorder={(from, to) => dispatch({ type: "REORDER_PAGES", from, to })}
              onSelect={i => {
                const src = state.pages[i];
                if (!src) return;
                dispatch({ type: "LOAD", src, editingPageIndex: i });
              }}
              onClear={() => dispatch({ type: "CLEAR_PAGES" })}
              onDownload={() => downloadPdf(state.pages, pdfMargin)}
            />
            <div className="flex-1 flex items-center justify-center">
              <div className="w-full max-w-lg">
                <DropZone onFiles={handleFiles} />
              </div>
            </div>
          </>
        ) : (
          <>
            <Toolbar
              onRotateCW={() => commit(() => applyRotation(state.src!, 90))}
              onRotateCCW={() => commit(() => applyRotation(state.src!, 270))}
              onFlipH={() => commit(() => applyFlip(state.src!, "h"))}
              onFlipV={() => commit(() => applyFlip(state.src!, "v"))}
              onApplyCrop={handleApplyCrop}
              onUndo={() => dispatch({ type: "UNDO" })}
              onRedo={() => dispatch({ type: "REDO" })}
              onReset={() => dispatch({ type: "RESET" })}
              onDownload={opts => state.src && download(state.src, opts)}
              canUndo={state.history.length > 0}
              canRedo={state.future.length > 0}
              hasCrop={!!completedCrop?.width && completedCrop.width > 0}
              onPerspective={enterPerspMode}
              onAddPage={() => state.src && dispatch({ type: "ADD_PAGE", src: state.src })}
              pagesCount={state.pages.length}
              isEditingPage={state.editingPageIndex !== null}
            />

            <PdfBar
              pages={state.pages}
              editingIndex={state.editingPageIndex}
              margin={pdfMargin}
              onMarginChange={setPdfMargin}
              onRemove={i => dispatch({ type: "REMOVE_PAGE", index: i })}
              onReorder={(from, to) => dispatch({ type: "REORDER_PAGES", from, to })}
              onSelect={i => {
                const src = state.pages[i];
                if (!src) return;
                dispatch({ type: "LOAD", src, editingPageIndex: i });
              }}
              onClear={() => dispatch({ type: "CLEAR_PAGES" })}
              onDownload={() => downloadPdf(state.pages, pdfMargin)}
            />

            {/* Proporcje, filtry, skan */}
            <div className="hidden sm:block space-y-2">
              <AspectRatioBar
                aspect={aspect}
                originalAspect={originalAspect}
                onChange={handleAspectChange}
                cropW={cropNaturalSize.w}
                cropH={cropNaturalSize.h}
                maxW={imgRef.current?.naturalWidth ?? 0}
                maxH={imgRef.current?.naturalHeight ?? 0}
                onCropWChange={handleCropWChange}
                onCropHChange={handleCropHChange}
              />
              <ScanBar onApply={mode => commit(() => applyScan(state.src!, mode))} />
              <FiltersBar
                brightness={brightness}
                contrast={contrast}
                saturation={saturation}
                onChange={(b, c, s) => { setBrightness(b); setContrast(c); setSaturation(s); }}
                onApply={() => commit(() => applyFilters(state.src!, brightness, contrast, saturation))
                  .then(() => { setBrightness(100); setContrast(100); setSaturation(100); })}
                onReset={() => { setBrightness(100); setContrast(100); setSaturation(100); }}
              />
            </div>

            {busy && (
              <p className="text-center text-indigo-400 animate-pulse text-sm py-1">
                Przetwarzanie...
              </p>
            )}

            {/* Zdjęcie */}
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-2 sm:p-4 text-center">
              {perspMode ? (
                <div className="relative inline-block">
                  <img
                    src={state.src!}
                    alt="korekcja perspektywy"
                    style={{ maxHeight: "min(65vh, calc(100svh - 280px))", maxWidth: "100%", display: "block" }}
                    className="rounded-lg"
                  />
                  <PerspectiveOverlay
                    points={perspPoints}
                    displaySize={displaySize}
                    onChange={setPerspPoints}
                    onCancel={() => setPerspMode(false)}
                    onApply={async () => {
                      setPerspMode(false);
                      await commit(() => applyPerspective(state.src!, perspPoints, displaySize));
                    }}
                  />
                </div>
              ) : (
                <div className="relative inline-block">
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
                      style={{
                        maxHeight: "min(65vh, calc(100svh - 280px))",
                        maxWidth: "100%",
                        display: "block",
                        filter: `brightness(${brightness / 100}) contrast(${contrast / 100}) saturate(${saturation / 100})`,
                      }}
                      className="rounded-lg mx-auto"
                      onLoad={e => {
                        const img = e.currentTarget;
                        setOriginalAspect(img.naturalWidth / img.naturalHeight);
                        setCropAndCompleted(initCrop(img.naturalWidth, img.naturalHeight, aspect), img);
                      }}
                    />
                  </ReactCrop>
                  {showOriginal && originalSrc && (
                    <img
                      src={originalSrc}
                      alt="oryginał"
                      className="absolute inset-0 w-full h-full object-contain rounded-lg pointer-events-none"
                    />
                  )}

                  {lupaActive && (
                    <>
                      <div
                        className="absolute inset-0 z-10 cursor-crosshair rounded-lg"
                        onPointerDown={handleLupaMove}
                        onPointerMove={handleLupaMove}
                        onPointerUp={() => setLupaPos(null)}
                        onPointerLeave={() => setLupaPos(null)}
                        onPointerCancel={() => setLupaPos(null)}
                        style={{ touchAction: "none" }}
                      />
                      {lupaPos && state.src && imgRef.current && (() => {
                        const offsetY = lupaPos.touch
                          ? (lupaPos.y > LUPA_SIZE / 2 + LUPA_TOUCH_GAP
                              ? -(LUPA_SIZE / 2 + LUPA_TOUCH_GAP)
                              : LUPA_SIZE / 2 + LUPA_TOUCH_GAP)
                          : 0;
                        return (
                          <div
                            style={{
                              position: "absolute",
                              left: lupaPos.x - LUPA_SIZE / 2,
                              top: lupaPos.y - LUPA_SIZE / 2 + offsetY,
                              width: LUPA_SIZE,
                              height: LUPA_SIZE,
                              borderRadius: "50%",
                              border: "3px solid white",
                              boxShadow: "0 0 12px rgba(0,0,0,0.6)",
                              backgroundImage: `url("${state.src}")`,
                              backgroundRepeat: "no-repeat",
                              backgroundSize: `${imgRef.current.clientWidth * LUPA_ZOOM}px ${imgRef.current.clientHeight * LUPA_ZOOM}px`,
                              backgroundPosition: `${LUPA_SIZE / 2 - lupaPos.x * LUPA_ZOOM}px ${LUPA_SIZE / 2 - lupaPos.y * LUPA_ZOOM}px`,
                              pointerEvents: "none",
                              zIndex: 30,
                            }}
                          />
                        );
                      })()}
                    </>
                  )}

                  <button
                    onClick={() => { setLupaActive(v => !v); setLupaPos(null); }}
                    title={lupaActive ? "Wyłącz lupę" : "Włącz lupę"}
                    className={`absolute top-2 left-2 z-20 px-2.5 py-1.5 rounded-lg text-xs font-medium
                      backdrop-blur border select-none transition-colors
                      ${lupaActive
                        ? "bg-indigo-600 text-white border-indigo-500"
                        : "bg-gray-900/80 text-gray-200 border-gray-700 hover:bg-gray-800/90"}`}
                  >
                    🔍
                  </button>

                  {canPreviewOriginal && (
                    <button
                      onMouseDown={() => setShowOriginal(true)}
                      onMouseUp={() => setShowOriginal(false)}
                      onMouseLeave={() => setShowOriginal(false)}
                      onTouchStart={e => { e.preventDefault(); setShowOriginal(true); }}
                      onTouchEnd={() => setShowOriginal(false)}
                      onTouchCancel={() => setShowOriginal(false)}
                      onContextMenu={e => e.preventDefault()}
                      title="Przytrzymaj, aby zobaczyć oryginał"
                      className="absolute top-2 right-2 z-20 px-3 py-1.5 rounded-lg text-xs font-medium
                        bg-gray-900/80 backdrop-blur text-gray-200 border border-gray-700 select-none
                        hover:bg-gray-800/90 active:bg-indigo-600 active:text-white touch-none"
                    >
                      {showOriginal ? "Oryginał" : "👁 Oryginał"}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Proporcje i skan na mobile — nad paskiem dolnym */}
            <div className="sm:hidden space-y-2">
              <AspectRatioBar
                aspect={aspect}
                originalAspect={originalAspect}
                onChange={handleAspectChange}
                cropW={cropNaturalSize.w}
                cropH={cropNaturalSize.h}
                maxW={imgRef.current?.naturalWidth ?? 0}
                maxH={imgRef.current?.naturalHeight ?? 0}
                onCropWChange={handleCropWChange}
                onCropHChange={handleCropHChange}
              />
              <ScanBar onApply={mode => commit(() => applyScan(state.src!, mode))} />
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
