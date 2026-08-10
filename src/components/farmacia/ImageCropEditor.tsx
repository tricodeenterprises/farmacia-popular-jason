import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Crop, Check, X, RotateCw } from "lucide-react";

interface Props {
  src: string;
  onConfirm: (croppedFile: File) => void;
  onCancel: () => void;
}

export default function ImageCropEditor({ src, onConfirm, onCancel }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState({ x: 0.05, y: 0.05, w: 0.9, h: 0.9 });
  const [rotation, setRotation] = useState(0);
  const [localSrc, setLocalSrc] = useState<string>(src);
  const activeRef = useRef<{ handle: string; mx: number; my: number; rect: typeof rect } | null>(null);

  // Convert remote URLs to blob to avoid CORS canvas issues
  useEffect(() => {
    if (src.startsWith("blob:") || src.startsWith("data:")) {
      setLocalSrc(src);
      return;
    }
    fetch(src)
      .then(r => r.blob())
      .then(blob => setLocalSrc(URL.createObjectURL(blob)))
      .catch(() => setLocalSrc(src));
  }, [src]);

  const onDown = (handle: string) => (e: React.TouchEvent | React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const pt = "touches" in e ? e.touches[0] : e;
    activeRef.current = { handle, mx: pt.clientX, my: pt.clientY, rect: { ...rect } };
  };

  useEffect(() => {
    const onMove = (e: TouchEvent | MouseEvent) => {
      if (!activeRef.current || !containerRef.current) return;
      e.preventDefault();
      const pt = "touches" in e ? e.touches[0] : e;
      const cr = containerRef.current.getBoundingClientRect();
      const dx = (pt.clientX - activeRef.current.mx) / cr.width;
      const dy = (pt.clientY - activeRef.current.my) / cr.height;
      const s = activeRef.current.rect;
      const handle = activeRef.current.handle;

      if (handle === "move") {
        setRect({ ...s, x: Math.max(0, Math.min(1 - s.w, s.x + dx)), y: Math.max(0, Math.min(1 - s.h, s.y + dy)) });
      } else {
        let { x, y, w, h } = s;
        if (handle.includes("r")) w = Math.max(0.05, Math.min(1 - x, s.w + dx));
        if (handle.includes("l")) { const nw = Math.max(0.05, s.w - dx); x = s.x + s.w - nw; w = nw; x = Math.max(0, x); }
        if (handle.includes("b")) h = Math.max(0.05, Math.min(1 - y, s.h + dy));
        if (handle.includes("t")) { const nh = Math.max(0.05, s.h - dy); y = s.y + s.h - nh; h = nh; y = Math.max(0, y); }
        setRect({ x, y, w, h });
      }
    };
    const onUp = () => { activeRef.current = null; };
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchend", onUp);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchend", onUp);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const doCrop = () => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;

    // Apply rotation first
    const tempCanvas = document.createElement("canvas");
    const isVertical = rotation % 180 !== 0;
    tempCanvas.width = isVertical ? img.naturalHeight : img.naturalWidth;
    tempCanvas.height = isVertical ? img.naturalWidth : img.naturalHeight;
    const tCtx = tempCanvas.getContext("2d");
    if (!tCtx) return;
    tCtx.translate(tempCanvas.width / 2, tempCanvas.height / 2);
    tCtx.rotate((rotation * Math.PI) / 180);
    tCtx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

    // Then crop
    const sx = rect.x * tempCanvas.width;
    const sy = rect.y * tempCanvas.height;
    const sw = rect.w * tempCanvas.width;
    const sh = rect.h * tempCanvas.height;
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(tempCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `crop_${Date.now()}.jpg`, { type: "image/jpeg" });
      onConfirm(file);
    }, "image/jpeg", 0.92);
  };

  const handles = [
    { key: "tl", style: { top: -14, left: -14 } as React.CSSProperties },
    { key: "tr", style: { top: -14, right: -14 } as React.CSSProperties },
    { key: "bl", style: { bottom: -14, left: -14 } as React.CSSProperties },
    { key: "br", style: { bottom: -14, right: -14 } as React.CSSProperties },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[110] bg-black flex flex-col" style={{ width: "100vw", height: "100dvh", touchAction: "none" }}>
      <div className="flex items-center justify-between p-3 bg-black/80 text-white z-10">
        <div className="flex items-center gap-2">
          <Crop className="w-5 h-5" />
          <span className="text-sm font-medium">Recortar Imagem</span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setRotation(r => (r + 90) % 360)}
            className="p-2 rounded-full hover:bg-white/20 transition-colors">
            <RotateCw className="w-5 h-5" />
          </button>
          <button type="button" onClick={onCancel} className="p-2 rounded-full hover:bg-white/20">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
      <div className="flex-1 relative flex items-center justify-center overflow-hidden p-4" ref={containerRef}>
        <div className="relative inline-block max-w-full max-h-full">
          <img ref={imgRef} src={localSrc} alt="Crop" crossOrigin="anonymous"
            className="max-w-full max-h-[70vh] object-contain select-none"
            style={{ transform: `rotate(${rotation}deg)` }}
            draggable={false} />
          {/* Dark overlay with cutout */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-0 bg-black/60" style={{
              clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${rect.x*100}% ${rect.y*100}%, ${rect.x*100}% ${(rect.y+rect.h)*100}%, ${(rect.x+rect.w)*100}% ${(rect.y+rect.h)*100}%, ${(rect.x+rect.w)*100}% ${rect.y*100}%, ${rect.x*100}% ${rect.y*100}%)`
            }} />
          </div>
          {/* Crop selection */}
          <div className="absolute" style={{ left: `${rect.x*100}%`, top: `${rect.y*100}%`, width: `${rect.w*100}%`, height: `${rect.h*100}%` }}>
            <div className="absolute inset-0" onTouchStart={onDown("move")} onMouseDown={onDown("move")} style={{ cursor: "move" }} />
            <div className="absolute inset-0 border-2 border-white pointer-events-none">
              <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/40" />
              <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/40" />
              <div className="absolute top-1/3 left-0 right-0 h-px bg-white/40" />
              <div className="absolute top-2/3 left-0 right-0 h-px bg-white/40" />
            </div>
            {handles.map(({ key, style }) => (
              <div key={key}
                className="absolute w-7 h-7 bg-white rounded-full border-2 border-blue-500 shadow-lg"
                style={style}
                onTouchStart={onDown(key)} onMouseDown={onDown(key)}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="p-4 pb-6 bg-black/80 flex justify-center gap-4">
        <Button variant="destructive" size="lg" onClick={onCancel} className="rounded-full px-6">
          <X className="w-5 h-5 mr-2" /> Cancelar
        </Button>
        <Button size="lg" onClick={doCrop} className="rounded-full px-6 bg-green-600 hover:bg-green-700 text-white">
          <Check className="w-5 h-5 mr-2" /> Confirmar
        </Button>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>,
    document.body
  );
}
