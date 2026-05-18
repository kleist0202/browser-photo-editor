import { useRef, useState } from "react";

type Props = { onFiles: (files: File[]) => void };

export default function DropZone({ onFiles }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const pickImages = (list: FileList | null | undefined) =>
    list ? Array.from(list).filter(f => f.type.startsWith("image/")) : [];

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = pickImages(e.dataTransfer.files);
    if (files.length > 0) onFiles(files);
  };

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`
        flex flex-col items-center justify-center gap-4 w-full h-72
        border-2 border-dashed rounded-2xl cursor-pointer transition-colors
        ${dragging
          ? "border-indigo-400 bg-indigo-950/30"
          : "border-gray-700 bg-gray-900 hover:border-gray-500"}
      `}
    >
      <div className="text-5xl">📷</div>
      <div className="text-center">
        <p className="text-white font-medium">Przeciągnij zdjęcia lub kliknij</p>
        <p className="text-gray-500 text-sm mt-1">
          JPG, PNG, WEBP, RAW — wiele plików = osobne strony PDF
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => {
          const files = pickImages(e.target.files);
          if (files.length > 0) onFiles(files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
