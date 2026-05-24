import { useState, useRef, useEffect } from "react";
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
import BlurOverlay, { type BlurRegion } from "./components/BlurOverlay";
import AnnotateOverlay from "./components/AnnotateOverlay";
import CollageOverlay, { type CollageItem, type CollageOrientation } from "./components/CollageOverlay";
import PdfBar from "./components/PdfBar";
import PrintSizeBar from "./components/PrintSizeBar";
import Slideshow from "./components/Slideshow";
import { useEditor, buildFilterString } from "./hooks/useEditor";
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
  const { state, dispatch, loadFile, applyRotation, applyFlip, applyCrop, applyFilters, applyScan, applyPerspective, applyBlur, applyAutoEnhance, applySharpen, applyAnnotations, applyCollage, download, downloadPdf, downloadPrintable, downloadZip } = useEditor();
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [aspect, setAspect] = useState<number | undefined>(undefined);
  const [originalAspect, setOriginalAspect] = useState<number | undefined>(undefined);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [hue, setHue] = useState(0);
  const [temperature, setTemperature] = useState(0);
  const [perspMode, setPerspMode] = useState(false);
  const [perspPoints, setPerspPoints] = useState<Point[]>([]);
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });
  const [blurMode, setBlurMode] = useState(false);
  const [blurRegions, setBlurRegions] = useState<BlurRegion[]>([]);
  const [blurBlockSize, setBlurBlockSize] = useState(15);
  const [annotateMode, setAnnotateMode] = useState(false);
  const [annotations, setAnnotations] = useState<import("./hooks/useEditor").Annotation[]>([]);
  const [collageMode, setCollageMode] = useState(false);
  const [collageItems, setCollageItems] = useState<CollageItem[]>([]);
  const [collageCanvas, setCollageCanvas] = useState({ w: 600, h: 800 });
  const [printMode, setPrintMode] = useState(false);
  const [printCopies, setPrintCopies] = useState(1);
  const [slideshowMode, setSlideshowMode] = useState(false);
  const [printCopiesText, setPrintCopiesText] = useState("1");
  useEffect(() => { setPrintCopiesText(String(printCopies)); }, [printCopies]);
  const [sharpenedSrcs, setSharpenedSrcs] = useState<Set<string>>(new Set());
  const [autoEnhancedSrcs, setAutoEnhancedSrcs] = useState<Set<string>>(new Set());
  const imgRef = useRef<HTMLImageElement>(null);
  const addPhotoInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const originalSrc = state.history[0] ?? state.src;
  const canPreviewOriginal = state.history.length > 0;
  const [pdfMargin, setPdfMargin] = useState(8);
  const [pdfFormat, setPdfFormat] = useState<"a4" | "letter">("a4");
  const [pdfOrientation, setPdfOrientation] = useState<"portrait" | "landscape" | "auto">("auto");

  const portraitPage = pdfFormat === "letter" ? { w: 215.9, h: 279.4 } : { w: 210, h: 297 };
  const pageDims = pdfOrientation === "landscape"
    ? { w: portraitPage.h, h: portraitPage.w }
    : portraitPage;

  const editingPage = state.editingPageIndex !== null ? state.pages[state.editingPageIndex] : null;
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

  const resetFilters = () => {
    setBrightness(100);
    setContrast(100);
    setSaturation(100);
    setHue(0);
    setTemperature(0);
  };

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;
    if (files.length === 1) {
      resetFilters();
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

  const enterAnnotateMode = () => {
    const img = imgRef.current;
    if (!img) return;
    setDisplaySize({ w: img.clientWidth, h: img.clientHeight });
    setAnnotations([]);
    setAnnotateMode(true);
  };

  const applyAnnotateAction = async () => {
    if (!state.src || annotations.length === 0) {
      setAnnotateMode(false);
      setAnnotations([]);
      return;
    }
    const annos = annotations;
    const size = displaySize;
    setAnnotateMode(false);
    setAnnotations([]);
    await commit(src => applyAnnotations(src, annos, size));
  };

  const enterBlurMode = () => {
    const img = imgRef.current;
    if (!img) return;
    setDisplaySize({ w: img.clientWidth, h: img.clientHeight });
    setBlurRegions([]);
    setBlurMode(true);
  };

  const applyBlurAction = async () => {
    if (!state.src || blurRegions.length === 0) {
      setBlurMode(false);
      setBlurRegions([]);
      return;
    }
    const regions = blurRegions;
    const size = displaySize;
    const block = blurBlockSize;
    setBlurMode(false);
    setBlurRegions([]);
    await commit(src => applyBlur(src, regions, size, block));
  };

  const isFilterDirty = () =>
    brightness !== 100 || contrast !== 100 || saturation !== 100 || hue !== 0 || temperature !== 0;

  const commit = async (fn: (src: string) => Promise<string>) => {
    if (!state.src) return;
    setBusy(true);
    const dirty = isFilterDirty();
    const baseSrc = dirty
      ? await applyFilters(state.src, brightness, contrast, saturation, hue, temperature)
      : state.src;
    const result = await fn(baseSrc);
    dispatch({ type: "COMMIT", result });
    setCrop(undefined);
    setCompletedCrop(undefined);
    if (dirty) resetFilters();
    setBusy(false);
  };

  const enterPrintMode = () => {
    if (!state.src || state.editingPageIndex === null) return;
    const page = state.pages[state.editingPageIndex];
    if (page.printW === undefined && page.printH === undefined) {
      const img = imgRef.current;
      if (img && img.naturalWidth > 0) {
        const natRatio = img.naturalWidth / img.naturalHeight;
        const margin = 10;
        const availW = pageDims.w - 2 * margin;
        const availH = pageDims.h - 2 * margin;
        let pw: number, ph: number;
        if (natRatio > availW / availH) {
          pw = availW;
          ph = pw / natRatio;
        } else {
          ph = availH;
          pw = ph * natRatio;
        }
        dispatch({
          type: "UPDATE_PAGE",
          index: state.editingPageIndex,
          patch: { printW: Math.round(pw * 10) / 10, printH: Math.round(ph * 10) / 10 },
        });
      }
    }
    setPrintCopies(1);
    setPrintMode(true);
  };

  const handlePrintDownload = async () => {
    if (!state.src || !editingPage) return;
    const w = editingPage.printW;
    const h = editingPage.printH;
    if (!w || !h) return;
    setBusy(true);
    try {
      await downloadPrintable(state.src, w, h, { format: pdfFormat, orientation: pdfOrientation }, printCopies);
    } finally {
      setBusy(false);
    }
  };

  const handleCollage = async () => {
    if (state.pages.length < 2) return;
    setBusy(true);
    try {
      const maxW = Math.min(700, window.innerWidth - 40);
      const maxH = Math.max(300, window.innerHeight - 220);
      let W = maxW, H = Math.round(maxW * 4 / 3);
      if (H > maxH) { H = maxH; W = Math.round(H * 3 / 4); }
      const canvasSize = { w: W, h: H };

      const loadDim = (src: string) => new Promise<{ w: number; h: number }>(resolve => {
        const im = new Image();
        im.onload = () => resolve({ w: im.naturalWidth, h: im.naturalHeight });
        im.src = src;
      });
      const srcs = state.pages.map(p => p.src);
      const dims = await Promise.all(srcs.map(loadDim));

      const cols = Math.ceil(Math.sqrt(srcs.length));
      const rows = Math.ceil(srcs.length / cols);
      const cellW = W / cols;
      const cellH = H / rows;
      const items: CollageItem[] = srcs.map((src, i) => {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const dim = dims[i];
        const scale = Math.min(cellW * 0.85 / dim.w, cellH * 0.85 / dim.h);
        return {
          src,
          natW: dim.w,
          natH: dim.h,
          cx: c * cellW + cellW / 2,
          cy: r * cellH + cellH / 2,
          w: dim.w * scale,
          rotation: 0,
        };
      });

      setCollageCanvas(canvasSize);
      setCollageItems(items);
      setCollageMode(true);
    } finally {
      setBusy(false);
    }
  };

  const computeCollageCanvas = (orient: CollageOrientation) => {
    const maxW = Math.min(700, window.innerWidth - 40);
    const maxH = Math.max(300, window.innerHeight - 220);
    const longEdge = Math.min(maxW, maxH);
    const shortEdge = (longEdge * 3) / 4;
    if (orient === "portrait")  return { w: Math.round(shortEdge), h: Math.round(longEdge) };
    if (orient === "landscape") return { w: Math.round(longEdge),  h: Math.round(shortEdge) };
    return { w: Math.round(longEdge), h: Math.round(longEdge) };
  };

  const handleCollageOrient = (orient: CollageOrientation) => {
    const newSize = computeCollageCanvas(orient);
    const sx = newSize.w / collageCanvas.w;
    const sy = newSize.h / collageCanvas.h;
    setCollageItems(items => items.map(it => ({
      ...it,
      cx: it.cx * sx,
      cy: it.cy * sy,
    })));
    setCollageCanvas(newSize);
  };

  const applyCollageAction = async () => {
    if (collageItems.length === 0) {
      setCollageMode(false);
      return;
    }
    const items = collageItems;
    const size = collageCanvas;
    setCollageMode(false);
    setCollageItems([]);
    setBusy(true);
    try {
      const result = await applyCollage(items, size);
      resetFilters();
      dispatch({ type: "LOAD", src: result });
    } finally {
      setBusy(false);
    }
  };

  const handleAutoEnhance = () => {
    commit(async src => {
      const result = await applyAutoEnhance(src);
      setAutoEnhancedSrcs(prev => new Set(prev).add(result));
      return result;
    });
  };

  const handleSharpen = () => {
    commit(async src => {
      const result = await applySharpen(src);
      setSharpenedSrcs(prev => new Set(prev).add(result));
      return result;
    });
  };

  const isAutoActive = !!state.src && autoEnhancedSrcs.has(state.src);
  const isSharpenActive = !!state.src && sharpenedSrcs.has(state.src);

  const ensureFilterBaked = async (): Promise<string | null> => {
    if (!state.src) return null;
    if (!isFilterDirty()) return state.src;
    setBusy(true);
    const baked = await applyFilters(state.src, brightness, contrast, saturation, hue, temperature);
    dispatch({ type: "COMMIT", result: baked });
    resetFilters();
    setBusy(false);
    return baked;
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
    await commit(src => applyCrop(src, scaled));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;

      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();

      if (mod && k === "z" && !e.shiftKey) {
        e.preventDefault();
        if (state.history.length > 0) dispatch({ type: "UNDO" });
        return;
      }
      if (mod && ((k === "z" && e.shiftKey) || k === "y")) {
        e.preventDefault();
        if (state.future.length > 0) dispatch({ type: "REDO" });
        return;
      }
      if (mod) return;
      if (slideshowMode) return;

      if (k === "escape") {
        if (perspMode) setPerspMode(false);
        else if (blurMode) { setBlurMode(false); setBlurRegions([]); }
        else if (annotateMode) { setAnnotateMode(false); setAnnotations([]); }
        else if (collageMode) { setCollageMode(false); setCollageItems([]); }
        else if (printMode) setPrintMode(false);
        else if (lupaActive) { setLupaActive(false); setLupaPos(null); }
        e.preventDefault();
        return;
      }
      if (k === "enter") {
        if (perspMode) {
          setPerspMode(false);
          commit(src => applyPerspective(src, perspPoints, displaySize));
        } else if (blurMode) {
          applyBlurAction();
        } else if (annotateMode) {
          applyAnnotateAction();
        } else if (collageMode) {
          applyCollageAction();
        } else if (completedCrop && completedCrop.width > 0) {
          handleApplyCrop();
        }
        e.preventDefault();
        return;
      }
      if (!state.src) return;
      if (perspMode || blurMode || annotateMode || collageMode || printMode) return;

      if (k === "r") {
        commit(src => applyRotation(src, e.shiftKey ? 270 : 90));
        e.preventDefault();
        return;
      }
      if (k === "h") {
        commit(src => applyFlip(src, "h"));
        e.preventDefault();
        return;
      }
      if (k === "v") {
        commit(src => applyFlip(src, "v"));
        e.preventDefault();
        return;
      }
      if (k === "l") {
        setLupaActive(v => !v);
        setLupaPos(null);
        e.preventDefault();
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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
      <main className={`flex-1 flex flex-col gap-3 p-3 sm:p-6 ${state.src && !collageMode && !printMode ? "pb-72 sm:pb-6" : ""}`}>
        {!state.hydrated ? (
          <div className="flex-1" />
        ) : collageMode ? (
          <div className="flex-1 flex items-center justify-center">
            <div
              className="relative inline-block bg-white rounded-lg shadow-xl"
              style={{ width: collageCanvas.w, height: collageCanvas.h }}
            >
              <CollageOverlay
                items={collageItems}
                onChange={setCollageItems}
                canvasSize={collageCanvas}
                onOrientationChange={handleCollageOrient}
                onApply={applyCollageAction}
                onCancel={() => { setCollageMode(false); setCollageItems([]); }}
              />
            </div>
          </div>
        ) : printMode && state.src && editingPage ? (() => {
          const pW = editingPage.printW;
          const pH = editingPage.printH;
          const cols = pW ? Math.max(1, Math.floor(pageDims.w / pW)) : 1;
          const rowsPerPage = pH ? Math.max(1, Math.floor(pageDims.h / pH)) : 1;
          const perPage = cols * rowsPerPage;
          const previewCount = pW && pH ? Math.min(printCopies, perPage) : 1;

          return (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-3">
            <div
              className="relative bg-white shadow-xl inline-block overflow-hidden"
              style={{
                height: "min(60vh, calc(100svh - 240px))",
                aspectRatio: `${pageDims.w} / ${pageDims.h}`,
                maxWidth: "100%",
              }}
            >
              {pW && pH ? (
                Array.from({ length: previewCount }).map((_, i) => {
                  const c = i % cols;
                  const r = Math.floor(i / cols);
                  return (
                    <img
                      key={i}
                      ref={i === 0 ? imgRef : undefined}
                      src={state.src!}
                      alt={i === 0 ? "podgląd wydruku" : ""}
                      onLoad={i === 0 ? (e => {
                        const img = e.currentTarget;
                        setOriginalAspect(img.naturalWidth / img.naturalHeight);
                      }) : undefined}
                      style={{
                        position: "absolute",
                        left: `${(c * pW / pageDims.w) * 100}%`,
                        top: `${(r * pH / pageDims.h) * 100}%`,
                        width: `${(pW / pageDims.w) * 100}%`,
                        height: `${(pH / pageDims.h) * 100}%`,
                        objectFit: "fill",
                      }}
                    />
                  );
                })
              ) : (
                <img
                  ref={imgRef}
                  src={state.src}
                  alt="podgląd wydruku"
                  onLoad={e => {
                    const img = e.currentTarget;
                    setOriginalAspect(img.naturalWidth / img.naturalHeight);
                  }}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }}
                />
              )}
            </div>
            <PrintSizeBar
              printW={editingPage.printW}
              printH={editingPage.printH}
              natW={imgRef.current?.naturalWidth ?? 0}
              natH={imgRef.current?.naturalHeight ?? 0}
              onChange={(w, h) => dispatch({
                type: "UPDATE_PAGE",
                index: state.editingPageIndex!,
                patch: { printW: w, printH: h },
              })}
            />
            <label className="flex items-center gap-2 px-3 py-2 bg-gray-900 rounded-2xl border border-gray-800">
              <span className="text-gray-500 text-xs uppercase tracking-widest">Kopii</span>
              <input
                type="number"
                min={1}
                max={9999}
                value={printCopiesText}
                onChange={e => {
                  setPrintCopiesText(e.target.value);
                  const n = parseInt(e.target.value, 10);
                  if (!isNaN(n) && n >= 1) setPrintCopies(n);
                }}
                onBlur={() => setPrintCopiesText(String(printCopies))}
                className="w-16 bg-gray-800 text-white text-sm px-2 py-1 rounded border border-gray-700 focus:outline-none focus:border-indigo-500
                  [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              {pW && pH && (
                <span className="text-gray-500 text-xs">
                  {printCopies > perPage
                    ? `· ${Math.ceil(printCopies / perPage)} stron(y) · ${perPage} / arkusz`
                    : `· max ${perPage} / arkusz`}
                </span>
              )}
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setPrintMode(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700"
              >
                Anuluj
              </button>
              <button
                onClick={handlePrintDownload}
                disabled={!editingPage.printW || !editingPage.printH}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                📄 Pobierz PDF
              </button>
            </div>
          </div>
          );
        })() : !state.src ? (
          <>
            <PdfBar
              pages={state.pages.map(p => p.src)}
              editingIndex={state.editingPageIndex}
              currentSrc={state.src}
              margin={pdfMargin}
              onMarginChange={setPdfMargin}
              format={pdfFormat}
              onFormatChange={setPdfFormat}
              orientation={pdfOrientation}
              onOrientationChange={setPdfOrientation}
              onRemove={i => dispatch({ type: "REMOVE_PAGE", index: i })}
              onReorder={(from, to) => dispatch({ type: "REORDER_PAGES", from, to })}
              onSelect={i => { resetFilters(); dispatch({ type: "LOAD_PAGE", index: i }); }}
              onClear={() => dispatch({ type: "CLEAR_PAGES" })}
              onDownload={() => downloadPdf(state.pages, pdfMargin, { format: pdfFormat, orientation: pdfOrientation })}
              onCollage={handleCollage}
              onDownloadZip={() => downloadZip(state.pages)}
              onSlideshow={() => setSlideshowMode(true)}
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
              onRotateCW={() => commit(src => applyRotation(src, 90))}
              onRotateCCW={() => commit(src => applyRotation(src, 270))}
              onFlipH={() => commit(src => applyFlip(src, "h"))}
              onFlipV={() => commit(src => applyFlip(src, "v"))}
              onApplyCrop={handleApplyCrop}
              onUndo={() => dispatch({ type: "UNDO" })}
              onRedo={() => dispatch({ type: "REDO" })}
              onReset={() => { resetFilters(); dispatch({ type: "RESET" }); }}
              onDownload={async opts => {
                const src = await ensureFilterBaked();
                if (src) await download(src, opts);
              }}
              canUndo={state.history.length > 0}
              canRedo={state.future.length > 0}
              hasCrop={!!completedCrop?.width && completedCrop.width > 0}
              onPerspective={enterPerspMode}
              onBlur={enterBlurMode}
              onAnnotate={enterAnnotateMode}
              onPrint={enterPrintMode}
              onAddPage={() => addPhotoInputRef.current?.click()}
            />

            <PdfBar
              pages={state.pages.map(p => p.src)}
              editingIndex={state.editingPageIndex}
              currentSrc={state.src}
              margin={pdfMargin}
              onMarginChange={setPdfMargin}
              format={pdfFormat}
              onFormatChange={setPdfFormat}
              orientation={pdfOrientation}
              onOrientationChange={setPdfOrientation}
              onRemove={i => dispatch({ type: "REMOVE_PAGE", index: i })}
              onReorder={(from, to) => dispatch({ type: "REORDER_PAGES", from, to })}
              onSelect={i => { resetFilters(); dispatch({ type: "LOAD_PAGE", index: i }); }}
              onClear={() => dispatch({ type: "CLEAR_PAGES" })}
              onDownload={() => downloadPdf(state.pages, pdfMargin, { format: pdfFormat, orientation: pdfOrientation })}
              onCollage={handleCollage}
              onDownloadZip={() => downloadZip(state.pages)}
              onSlideshow={() => setSlideshowMode(true)}
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
              <ScanBar onApply={mode => commit(src => applyScan(src, mode))} />
              <FiltersBar
                brightness={brightness}
                contrast={contrast}
                saturation={saturation}
                hue={hue}
                temperature={temperature}
                onChange={(b, c, s, h, t) => { setBrightness(b); setContrast(c); setSaturation(s); setHue(h); setTemperature(t); }}
                onReset={resetFilters}
                onAutoEnhance={handleAutoEnhance}
                onSharpen={handleSharpen}
                isAutoActive={isAutoActive}
                isSharpenActive={isSharpenActive}
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
                      await commit(src => applyPerspective(src, perspPoints, displaySize));
                    }}
                  />
                </div>
              ) : blurMode ? (
                <div className="relative inline-block">
                  <img
                    src={state.src!}
                    alt="zamazywanie"
                    style={{
                      maxHeight: "min(65vh, calc(100svh - 280px))",
                      maxWidth: "100%",
                      display: "block",
                      filter: buildFilterString(brightness, contrast, saturation, hue, temperature),
                    }}
                    className="rounded-lg"
                  />
                  <BlurOverlay
                    regions={blurRegions}
                    onChange={setBlurRegions}
                    blockSize={blurBlockSize}
                    onBlockSizeChange={setBlurBlockSize}
                    displaySize={displaySize}
                    onCancel={() => { setBlurMode(false); setBlurRegions([]); }}
                    onApply={applyBlurAction}
                  />
                </div>
              ) : annotateMode ? (
                <div className="relative inline-block">
                  <img
                    src={state.src!}
                    alt="adnotacje"
                    style={{
                      maxHeight: "min(65vh, calc(100svh - 280px))",
                      maxWidth: "100%",
                      display: "block",
                      filter: buildFilterString(brightness, contrast, saturation, hue, temperature),
                    }}
                    className="rounded-lg"
                  />
                  <AnnotateOverlay
                    annos={annotations}
                    onChange={setAnnotations}
                    displaySize={displaySize}
                    onCancel={() => { setAnnotateMode(false); setAnnotations([]); }}
                    onApply={applyAnnotateAction}
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
                        filter: buildFilterString(brightness, contrast, saturation, hue, temperature),
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
              <ScanBar onApply={mode => commit(src => applyScan(src, mode))} />
              <FiltersBar
                brightness={brightness}
                contrast={contrast}
                saturation={saturation}
                hue={hue}
                temperature={temperature}
                onChange={(b, c, s, h, t) => { setBrightness(b); setContrast(c); setSaturation(s); setHue(h); setTemperature(t); }}
                onReset={resetFilters}
                onAutoEnhance={handleAutoEnhance}
                onSharpen={handleSharpen}
                isAutoActive={isAutoActive}
                isSharpenActive={isSharpenActive}
              />
            </div>

            <p className="text-center text-gray-700 text-xs hidden sm:block">
              Zaznacz obszar myszką żeby przyciąć
            </p>
          </>
        )}
      </main>

      {slideshowMode && (
        <Slideshow
          pages={state.pages.map(p => p.src)}
          onClose={() => setSlideshowMode(false)}
        />
      )}

      <input
        ref={addPhotoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) handleFiles([file]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
