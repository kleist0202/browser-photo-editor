import { useReducer, useCallback, useEffect, useRef } from "react";
import type { PixelCrop } from "react-image-crop";
import jsPDF from "jspdf";
import { warpPerspective, type Point } from "../utils/homography";
import { saveState, loadState, clearState } from "../utils/storage";

type State = {
  src: string | null;
  history: string[];
  future: string[];
  pages: string[];
  hydrated: boolean;
};

type Action =
  | { type: "HYDRATE"; src: string | null; history: string[]; future: string[]; pages: string[] }
  | { type: "LOAD"; src: string }
  | { type: "COMMIT"; result: string }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "RESET" }
  | { type: "ADD_PAGE"; src: string }
  | { type: "REMOVE_PAGE"; index: number }
  | { type: "CLEAR_PAGES" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "HYDRATE":
      return {
        src: action.src,
        history: action.history,
        future: action.future,
        pages: action.pages,
        hydrated: true,
      };

    case "LOAD":
      return { src: action.src, history: [], future: [], pages: state.pages, hydrated: true };

    case "COMMIT":
      return {
        src: action.result,
        history: state.src ? [...state.history, state.src] : state.history,
        future: [],
        pages: state.pages,
        hydrated: true,
      };

    case "UNDO": {
      const prev = state.history[state.history.length - 1];
      if (!prev || !state.src) return state;
      return {
        src: prev,
        history: state.history.slice(0, -1),
        future: [state.src, ...state.future],
        pages: state.pages,
        hydrated: true,
      };
    }

    case "REDO": {
      const [next, ...rest] = state.future;
      if (!next) return state;
      return {
        src: next,
        history: state.src ? [...state.history, state.src] : state.history,
        future: rest,
        pages: state.pages,
        hydrated: true,
      };
    }

    case "RESET":
      return { src: null, history: [], future: [], pages: state.pages, hydrated: true };

    case "ADD_PAGE":
      return { ...state, pages: [...state.pages, action.src] };

    case "REMOVE_PAGE":
      return { ...state, pages: state.pages.filter((_, i) => i !== action.index) };

    case "CLEAR_PAGES":
      return { ...state, pages: [] };
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
  const [state, dispatch] = useReducer(reducer, { src: null, history: [], future: [], pages: [], hydrated: false });
  const hydratedRef = useRef(false);

  useEffect(() => {
    loadState()
      .then(stored => dispatch({
        type: "HYDRATE",
        src: stored?.src ?? null,
        history: stored?.history ?? [],
        future: stored?.future ?? [],
        pages: stored?.pages ?? [],
      }))
      .catch(() => dispatch({ type: "HYDRATE", src: null, history: [], future: [], pages: [] }));
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
      }).catch(() => {});
    }
  }, [state.src, state.history, state.future, state.pages, state.hydrated]);

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

  const downloadPdf = useCallback(async (pages: string[], marginMm = 8) => {
    if (pages.length === 0) return;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = (marginMm * 72) / 25.4;
    const maxW = pageW - 2 * margin;
    const maxH = pageH - 2 * margin;

    for (let i = 0; i < pages.length; i++) {
      if (i > 0) doc.addPage();
      const img = await loadImage(pages[i]);
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

  return { state, dispatch, loadFile, applyRotation, applyFlip, applyCrop, applyFilters, applyScan, applyPerspective, download, downloadPdf };
}
