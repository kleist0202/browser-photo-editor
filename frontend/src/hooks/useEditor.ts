import { useReducer, useCallback, useEffect, useRef } from "react";
import type { PixelCrop } from "react-image-crop";
import jsPDF from "jspdf";
import { warpPerspective, type Point } from "../utils/homography";
import { saveState, loadState, clearState } from "../utils/storage";

export type Page = { src: string; history: string[]; future: string[] };

export type Stroke = { kind: "stroke"; color: string; size: number; pts: { x: number; y: number }[] };
export type TextAnno = { kind: "text"; color: string; size: number; x: number; y: number; text: string };
export type Annotation = Stroke | TextAnno;

type State = {
  src: string | null;
  history: string[];
  future: string[];
  pages: Page[];
  editingPageIndex: number | null;
  hydrated: boolean;
};

type Action =
  | { type: "HYDRATE"; src: string | null; history: string[]; future: string[]; pages: Page[]; editingPageIndex: number | null }
  | { type: "LOAD"; src: string }
  | { type: "LOAD_PAGE"; index: number }
  | { type: "COMMIT"; result: string }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "RESET" }
  | { type: "ADD_PAGE"; src: string }
  | { type: "REMOVE_PAGE"; index: number }
  | { type: "REORDER_PAGES"; from: number; to: number }
  | { type: "CLEAR_PAGES" };

function syncCurrentToPages(state: State): Page[] {
  if (state.editingPageIndex === null || !state.src) return state.pages;
  if (state.editingPageIndex < 0 || state.editingPageIndex >= state.pages.length) return state.pages;
  const next = state.pages.slice();
  next[state.editingPageIndex] = {
    src: state.src,
    history: state.history,
    future: state.future,
  };
  return next;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "HYDRATE":
      return {
        src: action.src,
        history: action.history,
        future: action.future,
        pages: action.pages,
        editingPageIndex: action.editingPageIndex,
        hydrated: true,
      };

    case "LOAD": {
      // Save current edit state to the page being edited (if any), then append the new file as a fresh page
      const pagesAfterSync = syncCurrentToPages(state);
      const newPages: Page[] = [
        ...pagesAfterSync,
        { src: action.src, history: [], future: [] },
      ];
      return {
        ...state,
        src: action.src,
        history: [],
        future: [],
        pages: newPages,
        editingPageIndex: newPages.length - 1,
        hydrated: true,
      };
    }

    case "LOAD_PAGE": {
      const pagesAfterSync = syncCurrentToPages(state);
      const target = pagesAfterSync[action.index];
      if (!target) return state;
      return {
        ...state,
        src: target.src,
        history: target.history,
        future: target.future,
        pages: pagesAfterSync,
        editingPageIndex: action.index,
        hydrated: true,
      };
    }

    case "COMMIT":
      return {
        ...state,
        src: action.result,
        history: state.src ? [...state.history, state.src] : state.history,
        future: [],
        hydrated: true,
      };

    case "UNDO": {
      const prev = state.history[state.history.length - 1];
      if (!prev || !state.src) return state;
      return {
        ...state,
        src: prev,
        history: state.history.slice(0, -1),
        future: [state.src, ...state.future],
        hydrated: true,
      };
    }

    case "REDO": {
      const [next, ...rest] = state.future;
      if (!next) return state;
      return {
        ...state,
        src: next,
        history: state.src ? [...state.history, state.src] : state.history,
        future: rest,
        hydrated: true,
      };
    }

    case "RESET":
      return { ...state, src: null, history: [], future: [], editingPageIndex: null, hydrated: true };

    case "ADD_PAGE": {
      const pageData: Page = {
        src: action.src,
        history: state.history,
        future: state.future,
      };
      const editing = state.editingPageIndex;
      if (editing !== null && editing >= 0 && editing < state.pages.length) {
        const next = state.pages.slice();
        next[editing] = pageData;
        return { ...state, pages: next };
      }
      return { ...state, pages: [...state.pages, pageData] };
    }

    case "REMOVE_PAGE": {
      const idx = action.index;
      const newPages = state.pages.filter((_, i) => i !== idx);
      let editing = state.editingPageIndex;
      if (editing !== null) {
        if (idx === editing) editing = null;
        else if (idx < editing) editing = editing - 1;
      }
      return { ...state, pages: newPages, editingPageIndex: editing };
    }

    case "REORDER_PAGES": {
      const { from, to } = action;
      if (from === to || from < 0 || to < 0 || from >= state.pages.length || to >= state.pages.length) {
        return state;
      }
      const next = state.pages.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      let editing = state.editingPageIndex;
      if (editing !== null) {
        if (editing === from) editing = to;
        else if (from < editing && to >= editing) editing = editing - 1;
        else if (from > editing && to <= editing) editing = editing + 1;
      }
      return { ...state, pages: next, editingPageIndex: editing };
    }

    case "CLEAR_PAGES":
      return { ...state, pages: [], editingPageIndex: null };
  }
}

function drawToCanvas(
  img: HTMLImageElement,
  transform: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  width: number,
  height: number
): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  transform(ctx, width, height);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  return canvas.toDataURL("image/png"); // tymczasowo PNG żeby nie tracić jakości
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = src;
  });
}

export type DownloadOpts = {
  format: "jpeg" | "png";
  quality: number; // 1-100
  targetSizeKB?: number; // tylko dla JPEG
};

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error("toBlob failed")), type, quality);
  });
}

async function compressJpegToTarget(canvas: HTMLCanvasElement, targetBytes: number): Promise<Blob> {
  let working = canvas;
  for (let downscale = 0; downscale < 6; downscale++) {
    const minBlob = await canvasToBlob(working, "image/jpeg", 0.05);
    if (minBlob.size <= targetBytes) {
      let lo = 0.05, hi = 0.95, best: Blob = minBlob;
      for (let i = 0; i < 8; i++) {
        const q = (lo + hi) / 2;
        const blob = await canvasToBlob(working, "image/jpeg", q);
        if (blob.size <= targetBytes) { best = blob; lo = q; }
        else { hi = q; }
      }
      return best;
    }
    const next = document.createElement("canvas");
    next.width = Math.max(1, Math.round(working.width * 0.8));
    next.height = Math.max(1, Math.round(working.height * 0.8));
    const ctx = next.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, next.width, next.height);
    ctx.drawImage(working, 0, 0, next.width, next.height);
    working = next;
  }
  return canvasToBlob(working, "image/jpeg", 0.05);
}

export function useEditor() {
  const [state, dispatch] = useReducer(reducer, {
    src: null, history: [], future: [], pages: [], editingPageIndex: null, hydrated: false,
  });
  const hydratedRef = useRef(false);

  useEffect(() => {
    loadState()
      .then(stored => {
        const rawPages = stored?.pages ?? [];
        const pages: Page[] = rawPages.map((p: unknown) =>
          typeof p === "string"
            ? { src: p, history: [], future: [] }
            : { src: (p as Page).src, history: (p as Page).history ?? [], future: (p as Page).future ?? [] }
        );
        dispatch({
          type: "HYDRATE",
          src: stored?.src ?? null,
          history: stored?.history ?? [],
          future: stored?.future ?? [],
          pages,
          editingPageIndex: stored?.editingPageIndex ?? null,
        });
      })
      .catch(() => dispatch({
        type: "HYDRATE", src: null, history: [], future: [], pages: [], editingPageIndex: null,
      }));
  }, []);

  useEffect(() => {
    if (!state.hydrated) return;
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      return;
    }
    if (state.src === null && state.history.length === 0 && state.future.length === 0 && state.pages.length === 0) {
      clearState().catch(() => {});
    } else {
      saveState({
        src: state.src,
        history: state.history,
        future: state.future,
        pages: state.pages,
        editingPageIndex: state.editingPageIndex,
      }).catch(() => {});
    }
  }, [state.src, state.history, state.future, state.pages, state.editingPageIndex, state.hydrated]);

  const loadFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      if (e.target?.result)
        dispatch({ type: "LOAD", src: e.target.result as string });
    };
    reader.readAsDataURL(file);
  }, []);

  const applyRotation = useCallback(async (src: string, deg: number): Promise<string> => {
    const img = await loadImage(src);
    const swap = deg === 90 || deg === 270;
    return drawToCanvas(
      img,
      (ctx, w, h) => {
        ctx.translate(w / 2, h / 2);
        ctx.rotate((deg * Math.PI) / 180);
      },
      swap ? img.height : img.width,
      swap ? img.width : img.height,
    );
  }, []);

  const applyFlip = useCallback(async (src: string, dir: "h" | "v"): Promise<string> => {
    const img = await loadImage(src);
    return drawToCanvas(
      img,
      (ctx, w, h) => {
        if (dir === "h") { ctx.translate(w, 0);  ctx.scale(-1,  1); }
        else             { ctx.translate(0, h);  ctx.scale( 1, -1); }
        ctx.translate(img.width / 2, img.height / 2);
      },
      img.width,
      img.height,
    );
  }, []);

  const applyCrop = useCallback(async (src: string, crop: PixelCrop): Promise<string> => {
    const img = await loadImage(src);
    const canvas = document.createElement("canvas");
    canvas.width = crop.width;
    canvas.height = crop.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
    return canvas.toDataURL("image/png");
  }, []);

  const applyPerspective = useCallback(async (
    src: string,
    displayPoints: Point[],
    displaySize: { w: number; h: number },
  ): Promise<string> => {
    const img = await loadImage(src);
    const scaleX = img.width  / displaySize.w;
    const scaleY = img.height / displaySize.h;
    const naturalPoints = displayPoints.map(p => ({
      x: p.x * scaleX,
      y: p.y * scaleY,
    }));
    return warpPerspective(img, naturalPoints);
  }, []);

  const applyScan = useCallback(async (
    src: string,
    mode: "bw" | "gray" | "enhanced",
  ): Promise<string> => {
    const img = await loadImage(src);
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;

    if (mode === "gray") {
      ctx.filter = "grayscale(1) contrast(1.3) brightness(1.05)";
      ctx.drawImage(img, 0, 0);
    } else if (mode === "enhanced") {
      ctx.filter = "grayscale(1) contrast(1.8) brightness(1.15)";
      ctx.drawImage(img, 0, 0);
    } else {
      // bw — próg binarny: każdy piksel albo biały albo czarny
      ctx.filter = "grayscale(1)";
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const avg = data[i]; // po grayscale R=G=B
        const val = avg > 140 ? 255 : 0;
        data[i] = data[i + 1] = data[i + 2] = val;
      }
      ctx.putImageData(imageData, 0, 0);
    }

    return canvas.toDataURL("image/png");
  }, []);

  const applyAutoEnhance = useCallback(async (src: string): Promise<string> => {
    const img = await loadImage(src);
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    const histR = new Uint32Array(256);
    const histG = new Uint32Array(256);
    const histB = new Uint32Array(256);
    for (let i = 0; i < data.length; i += 4) {
      histR[data[i]]++;
      histG[data[i + 1]]++;
      histB[data[i + 2]]++;
    }

    const total = data.length / 4;
    const findPct = (hist: Uint32Array, pct: number): number => {
      const target = total * pct;
      let cum = 0;
      for (let v = 0; v < 256; v++) {
        cum += hist[v];
        if (cum >= target) return v;
      }
      return 255;
    };

    const LO = 0.005, HI = 0.995;
    const makeLut = (lo: number, hi: number): Uint8Array => {
      const lut = new Uint8Array(256);
      if (hi <= lo) {
        for (let v = 0; v < 256; v++) lut[v] = v;
        return lut;
      }
      const scale = 255 / (hi - lo);
      for (let v = 0; v < 256; v++) {
        if (v <= lo) lut[v] = 0;
        else if (v >= hi) lut[v] = 255;
        else lut[v] = Math.round((v - lo) * scale);
      }
      return lut;
    };

    const lutR = makeLut(findPct(histR, LO), findPct(histR, HI));
    const lutG = makeLut(findPct(histG, LO), findPct(histG, HI));
    const lutB = makeLut(findPct(histB, LO), findPct(histB, HI));

    for (let i = 0; i < data.length; i += 4) {
      data[i]     = lutR[data[i]];
      data[i + 1] = lutG[data[i + 1]];
      data[i + 2] = lutB[data[i + 2]];
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL("image/png");
  }, []);

  const applySharpen = useCallback(async (src: string): Promise<string> => {
    const img = await loadImage(src);
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const w = canvas.width;
    const h = canvas.height;
    const imageData = ctx.getImageData(0, 0, w, h);
    const s = imageData.data;
    const dst = new Uint8ClampedArray(s.length);
    const stride = w * 4;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) {
          let sum = 5 * s[p + c];
          if (x > 0)      sum -= s[p - 4 + c];
          if (x < w - 1)  sum -= s[p + 4 + c];
          if (y > 0)      sum -= s[p - stride + c];
          if (y < h - 1)  sum -= s[p + stride + c];
          dst[p + c] = sum;
        }
        dst[p + 3] = s[p + 3];
      }
    }

    ctx.putImageData(new ImageData(dst, w, h), 0, 0);
    return canvas.toDataURL("image/png");
  }, []);

  const applyAnnotations = useCallback(async (
    src: string,
    annos: Annotation[],
    displaySize: { w: number; h: number },
  ): Promise<string> => {
    const img = await loadImage(src);
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);

    const scaleX = img.width / displaySize.w;
    const scaleY = img.height / displaySize.h;
    const scale = Math.max(scaleX, scaleY);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const a of annos) {
      if (a.kind === "stroke") {
        ctx.strokeStyle = a.color;
        ctx.lineWidth = a.size * scale;
        ctx.beginPath();
        for (let i = 0; i < a.pts.length; i++) {
          const x = a.pts[i].x * scaleX;
          const y = a.pts[i].y * scaleY;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else {
        ctx.fillStyle = a.color;
        ctx.font = `${a.size * scale}px sans-serif`;
        ctx.textBaseline = "top";
        ctx.fillText(a.text, a.x * scaleX, a.y * scaleY);
      }
    }

    return canvas.toDataURL("image/png");
  }, []);

  const applyBlur = useCallback(async (
    src: string,
    displayRegions: { x: number; y: number; w: number; h: number }[],
    displaySize: { w: number; h: number },
    blockSize: number,
  ): Promise<string> => {
    const img = await loadImage(src);
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);

    const scaleX = img.width / displaySize.w;
    const scaleY = img.height / displaySize.h;
    const naturalBlock = Math.max(1, Math.round(blockSize * Math.max(scaleX, scaleY)));

    for (const dr of displayRegions) {
      const x = Math.max(0, Math.round(dr.x * scaleX));
      const y = Math.max(0, Math.round(dr.y * scaleY));
      const w = Math.min(canvas.width - x, Math.round(dr.w * scaleX));
      const h = Math.min(canvas.height - y, Math.round(dr.h * scaleY));
      if (w < 1 || h < 1) continue;

      const tw = Math.max(1, Math.round(w / naturalBlock));
      const th = Math.max(1, Math.round(h / naturalBlock));

      const temp = document.createElement("canvas");
      temp.width = tw;
      temp.height = th;
      const tctx = temp.getContext("2d")!;
      tctx.imageSmoothingEnabled = false;
      tctx.drawImage(canvas, x, y, w, h, 0, 0, tw, th);

      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(temp, 0, 0, tw, th, x, y, w, h);
    }

    return canvas.toDataURL("image/png");
  }, []);

  const applyFilters = useCallback(async (
    src: string,
    brightness: number,
    contrast: number,
    saturation: number,
  ): Promise<string> => {
    const img = await loadImage(src);
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.filter = `brightness(${brightness / 100}) contrast(${contrast / 100}) saturate(${saturation / 100})`;
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL("image/png");
  }, []);

  const download = useCallback(async (src: string, opts: DownloadOpts) => {
    const img = await loadImage(src);
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    if (opts.format === "jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, img.width, img.height);
    }
    ctx.drawImage(img, 0, 0);

    let blob: Blob;
    if (opts.format === "jpeg" && opts.targetSizeKB && opts.targetSizeKB > 0) {
      blob = await compressJpegToTarget(canvas, opts.targetSizeKB * 1024);
    } else {
      blob = await canvasToBlob(canvas, `image/${opts.format}`,
        opts.format === "jpeg" ? opts.quality / 100 : undefined);
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `edited.${opts.format === "jpeg" ? "jpg" : "png"}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);

  const applyCollage = useCallback(async (
    items: { src: string; natW: number; natH: number; cx: number; cy: number; w: number; rotation: number }[],
    canvasSize: { w: number; h: number },
  ): Promise<string> => {
    if (items.length === 0) throw new Error("empty");
    const scale = Math.min(3, Math.floor(2400 / Math.max(canvasSize.w, canvasSize.h)));
    const k = Math.max(2, scale);
    const canvasW = canvasSize.w * k;
    const canvasH = canvasSize.h * k;

    const canvas = document.createElement("canvas");
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasW, canvasH);

    for (const it of items) {
      const img = await loadImage(it.src);
      const w = it.w * k;
      const h = (it.w * it.natH / it.natW) * k;
      const cx = it.cx * k;
      const cy = it.cy * k;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((it.rotation * Math.PI) / 180);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
    }

    return canvas.toDataURL("image/png");
  }, []);

  const downloadPdf = useCallback(async (
    pages: string[],
    marginMm = 8,
    pdfOpts: { format: "a4" | "letter"; orientation: "portrait" | "landscape" | "auto" } = {
      format: "a4", orientation: "auto",
    },
  ) => {
    if (pages.length === 0) return;
    const margin = (marginMm * 72) / 25.4;

    const imgs = await Promise.all(pages.map(loadImage));
    const orientations: ("portrait" | "landscape")[] = imgs.map(img =>
      pdfOpts.orientation === "auto"
        ? (img.width >= img.height ? "landscape" : "portrait")
        : pdfOpts.orientation
    );

    const doc = new jsPDF({ unit: "pt", format: pdfOpts.format, orientation: orientations[0] });

    for (let i = 0; i < pages.length; i++) {
      if (i > 0) doc.addPage(pdfOpts.format, orientations[i]);
      const img = imgs[i];
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const maxW = pageW - 2 * margin;
      const maxH = pageH - 2 * margin;

      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, img.width, img.height);
      ctx.drawImage(img, 0, 0);
      const jpegUrl = canvas.toDataURL("image/jpeg", 0.85);

      const ratio = Math.min(maxW / img.width, maxH / img.height);
      const w = img.width * ratio;
      const h = img.height * ratio;
      const x = (pageW - w) / 2;
      const y = (pageH - h) / 2;
      doc.addImage(jpegUrl, "JPEG", x, y, w, h);
    }

    doc.save("scan.pdf");
  }, []);

  return { state, dispatch, loadFile, applyRotation, applyFlip, applyCrop, applyFilters, applyScan, applyPerspective, applyBlur, applyAutoEnhance, applySharpen, applyAnnotations, applyCollage, download, downloadPdf };
}
