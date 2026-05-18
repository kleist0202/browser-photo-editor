import { useRef, useState } from "react";

type Props = { onFile: (file: File) => void };

export default function DropZone({ onFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) onFile(file);
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
        <p className="text-white font-medium">Przeciągnij zdjęcie lub kliknij</p>
        <p className="text-gray-500 text-sm mt-1">JPG, PNG, WEBP, RAW</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
      />
    </div>
  );
}
