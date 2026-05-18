import { useReducer, useCallback } from "react";
import type { PixelCrop } from "react-image-crop";

type State = {
  src: string | null;
  history: string[];
};

type Action =
  | { type: "LOAD"; src: string }
  | { type: "COMMIT"; result: string }
  | { type: "UNDO" }
  | { type: "RESET" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "LOAD":
      return { src: action.src, history: [] };

    case "COMMIT":
      return {
        src: action.result,
        history: state.src ? [...state.history, state.src] : state.history,
      };

    case "UNDO": {
      const prev = state.history[state.history.length - 1];
      if (!prev) return state;
      return { src: prev, history: state.history.slice(0, -1) };
    }

    case "RESET":
      return { src: null, history: [] };
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

export function useEditor() {
  const [state, dispatch] = useReducer(reducer, { src: null, history: [] });

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

  const download = useCallback((src: string, format: "jpeg" | "png", quality: number) => {
    // Konwertuj do wybranego formatu przy pobieraniu
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      if (format === "jpeg") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL(`image/${format}`, quality / 100);
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `edited.${format === "jpeg" ? "jpg" : "png"}`;
      a.click();
    };
    img.src = src;
  }, []);

  return { state, dispatch, loadFile, applyRotation, applyFlip, applyCrop, download };
}
