import { useEffect, useRef, useState } from "react";

type Props = {
  pages: string[];
  startIndex?: number;
  onClose: () => void;
};

const MIN_INTERVAL = 1000;
const MAX_INTERVAL = 10000;
const DEFAULT_INTERVAL = 3000;
const TRANSITION_MS = 500;

export default function Slideshow({ pages, startIndex = 0, onClose }: Props) {
  const [idx, setIdx] = useState(Math.min(Math.max(0, startIndex), Math.max(0, pages.length - 1)));
  const [playing, setPlaying] = useState(false);
  const [intervalMs, setIntervalMs] = useState(DEFAULT_INTERVAL);
  const [recording, setRecording] = useState(false);
  const [prevIdx, setPrevIdx] = useState<number | null>(null);
  const prevIdxRef = useRef(idx);

  useEffect(() => {
    if (prevIdxRef.current !== idx) {
      setPrevIdx(prevIdxRef.current);
      prevIdxRef.current = idx;
      const t = window.setTimeout(() => setPrevIdx(null), TRANSITION_MS);
      return () => clearTimeout(t);
    }
  }, [idx]);

  const recordVideo = async () => {
    if (recording || pages.length === 0) return;
    setRecording(true);
    setPlaying(true);

    const canvasW = 1920, canvasH = 1080;
    const canvas = document.createElement("canvas");
    canvas.width = canvasW;
    canvas.height = canvasH;
    // Offscreen but in DOM — browser nadal renderuje canvas, captureStream łapie klatki niezawodnie.
    canvas.style.cssText = "position:fixed;left:-9999px;top:0;pointer-events:none;";
    document.body.appendChild(canvas);

    try {
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, canvasW, canvasH);

      // 1) Preload wszystkich obrazków zanim cokolwiek się rusza
      const imgs = await Promise.all(pages.map(src => new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = reject;
        im.src = src;
      })));

      const drawCenteredAt = (img: HTMLImageElement, alpha: number) => {
        const scale = Math.min(canvasW / img.naturalWidth, canvasH / img.naturalHeight);
        const w = img.naturalWidth * scale;
        const h = img.naturalHeight * scale;
        const x = (canvasW - w) / 2;
        const y = (canvasH - h) / 2;
        ctx.globalAlpha = alpha;
        ctx.drawImage(img, x, y, w, h);
        ctx.globalAlpha = 1;
      };
      const drawSlide = (img: HTMLImageElement) => {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, canvasW, canvasH);
        drawCenteredAt(img, 1);
      };
      const drawCrossfade = (a: HTMLImageElement, b: HTMLImageElement, t: number) => {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, canvasW, canvasH);
        drawCenteredAt(a, 1 - t);
        drawCenteredAt(b, t);
      };

      // 2) Narysuj PIERWSZY slajd, daj jedną klatkę paintu, dopiero potem startuj recorder.
      drawSlide(imgs[0]);
      setIdx(0);
      await new Promise<void>(r => requestAnimationFrame(() => r()));
      await new Promise<void>(r => requestAnimationFrame(() => r()));

      const types = ["video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
      const mimeType = types.find(t => MediaRecorder.isTypeSupported(t)) ?? "video/webm";
      const stream = (canvas as HTMLCanvasElement & { captureStream(fps?: number): MediaStream }).captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.start();

      // 3) Trzymaj pierwszy slajd
      await new Promise<void>(r => setTimeout(r, intervalMs));

      // 4) Reszta slajdów — crossfade + hold
      const FADE_STEPS = 20;
      const stepDelay = TRANSITION_MS / FADE_STEPS;
      for (let i = 1; i < imgs.length; i++) {
        for (let s = 1; s <= FADE_STEPS; s++) {
          drawCrossfade(imgs[i - 1], imgs[i], s / FADE_STEPS);
          await new Promise<void>(r => setTimeout(r, stepDelay));
        }
        setIdx(i);
        await new Promise<void>(r => setTimeout(r, intervalMs));
      }

      // 5) Zanim recorder skończy kodowanie/zapis, wracaj UI na początek
      setIdx(0);

      recorder.stop();
      await new Promise<void>(resolve => { recorder.onstop = () => resolve(); });

      const blob = new Blob(chunks, { type: mimeType });
      const ext = mimeType.includes("mp4") ? "mp4" : "webm";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `slideshow.${ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error("Nagrywanie nieudane:", err);
      alert("Nie udało się nagrać wideo w tej przeglądarce.");
    } finally {
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      setPlaying(false);
      setRecording(false);
    }
  };

  useEffect(() => {
    if (!playing || recording || pages.length < 2) return;
    const id = window.setTimeout(() => {
      setIdx(i => (i + 1) % pages.length);
    }, intervalMs);
    return () => clearTimeout(id);
  }, [playing, recording, intervalMs, idx, pages.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") setIdx(i => (i - 1 + pages.length) % pages.length);
      else if (e.key === "ArrowRight") setIdx(i => (i + 1) % pages.length);
      else if (e.key === " ") { e.preventDefault(); setPlaying(p => !p); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pages.length, onClose]);

  if (pages.length === 0) return null;

  const prev = () => setIdx(i => (i - 1 + pages.length) % pages.length);
  const next = () => setIdx(i => (i + 1) % pages.length);

  return (
    <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
      {prevIdx !== null && (
        <img
          key={`prev-${prevIdx}`}
          src={pages[prevIdx]}
          alt=""
          className="absolute inset-0 m-auto max-w-full max-h-full object-contain select-none pointer-events-none"
          style={{ animation: `slideFadeOut ${TRANSITION_MS}ms ease-out forwards` }}
          draggable={false}
        />
      )}
      <img
        key={`cur-${idx}`}
        src={pages[idx]}
        alt={`slajd ${idx + 1}`}
        className="absolute inset-0 m-auto max-w-full max-h-full object-contain select-none"
        style={{ animation: `slideFadeIn ${TRANSITION_MS}ms ease-out forwards` }}
        draggable={false}
      />

      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-3
        bg-black/60 backdrop-blur px-3 py-1.5 rounded-xl text-white text-sm font-mono">
        {idx + 1} / {pages.length}
      </div>

      <button
        onClick={onClose}
        title="Zamknij (Esc)"
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/60 backdrop-blur
          text-white hover:bg-black/80 transition-colors flex items-center justify-center text-xl"
      >
        ×
      </button>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-wrap items-center gap-3
        bg-black/60 backdrop-blur px-4 py-2 rounded-xl">
        <button
          onClick={prev}
          title="Poprzedni (←)"
          disabled={pages.length < 2}
          className="text-white hover:text-indigo-400 text-2xl px-2 disabled:opacity-30"
        >
          ◀
        </button>
        <button
          onClick={() => setPlaying(p => !p)}
          title={playing ? "Pauza (Spacja)" : "Play (Spacja)"}
          disabled={pages.length < 2}
          className="text-white hover:text-indigo-400 text-2xl px-2 disabled:opacity-30"
        >
          {playing ? "⏸" : "▶"}
        </button>
        <button
          onClick={next}
          title="Następny (→)"
          disabled={pages.length < 2}
          className="text-white hover:text-indigo-400 text-2xl px-2 disabled:opacity-30"
        >
          ▶
        </button>
        <div className="w-px h-6 bg-white/30 mx-1" />
        <label className="flex items-center gap-2 text-white text-xs">
          <span className="font-mono w-10 text-right">{(intervalMs / 1000).toFixed(1)}s</span>
          <input
            type="range"
            min={MIN_INTERVAL}
            max={MAX_INTERVAL}
            step={500}
            value={intervalMs}
            onChange={e => setIntervalMs(Number(e.target.value))}
            className="w-24 accent-indigo-500"
          />
        </label>
        <div className="w-px h-6 bg-white/30 mx-1" />
        <button
          onClick={recordVideo}
          disabled={recording || pages.length === 0}
          title={recording ? "Nagrywanie…" : "Zapisz jako wideo"}
          className="text-white text-xs px-2 py-1 rounded bg-indigo-600/80 hover:bg-indigo-500
            disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {recording ? "⏺ Nagrywanie…" : "🎬 Wideo"}
        </button>
      </div>
    </div>
  );
}
