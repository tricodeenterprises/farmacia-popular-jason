import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ZoomIn, ZoomOut, RotateCcw, Palette } from "lucide-react";

interface Props {
  url: string | null;
  onClose: () => void;
}

export default function ImageViewer({ url, onClose }: Props) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [bw, setBw] = useState(false);
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  // Pinch-to-zoom state
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);

  const reset = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
    setBw(false);
  }, []);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setScale(s => Math.max(0.5, Math.min(5, s - e.deltaY * 0.002)));
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (scale <= 1) return;
    dragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    setTranslate(t => ({
      x: t.x + e.clientX - lastPos.current.x,
      y: t.y + e.clientY - lastPos.current.y,
    }));
    lastPos.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = () => { dragging.current = false; };

  // Touch handlers for pinch-to-zoom
  const getTouchDist = (touches: React.TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      pinchRef.current = { dist: getTouchDist(e.touches), scale };
    } else if (e.touches.length === 1 && scale > 1) {
      dragging.current = true;
      lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const newDist = getTouchDist(e.touches);
      const ratio = newDist / pinchRef.current.dist;
      setScale(Math.max(0.5, Math.min(5, pinchRef.current.scale * ratio)));
    } else if (e.touches.length === 1 && dragging.current && scale > 1) {
      const touch = e.touches[0];
      setTranslate(t => ({
        x: t.x + touch.clientX - lastPos.current.x,
        y: t.y + touch.clientY - lastPos.current.y,
      }));
      lastPos.current = { x: touch.clientX, y: touch.clientY };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchRef.current = null;
    if (e.touches.length === 0) dragging.current = false;
  };

  if (!url) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[200] flex flex-col"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose} />

        {/* Toolbar */}
        <div className="relative z-10 flex items-center justify-between p-3 bg-black/60">
          <div className="flex items-center gap-2">
            <button onClick={() => setScale(s => Math.min(5, s + 0.5))}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
              <ZoomIn className="w-5 h-5" />
            </button>
            <button onClick={() => setScale(s => Math.max(0.5, s - 0.5))}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
              <ZoomOut className="w-5 h-5" />
            </button>
            <span className="text-white/60 text-xs font-mono ml-1">{Math.round(scale * 100)}%</span>
            <button onClick={() => setBw(v => !v)}
              className={`p-2 rounded-full transition-colors text-white ${bw ? "bg-white/30" : "bg-white/10 hover:bg-white/20"}`}>
              <Palette className="w-5 h-5" />
            </button>
            <button onClick={reset}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
              <RotateCcw className="w-5 h-5" />
            </button>
          </div>
          <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Image */}
        <div className="relative z-10 flex-1 flex items-center justify-center overflow-hidden"
          style={{ touchAction: "none" }}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <img
            src={url}
            alt="Visualizar"
            draggable={false}
            className="max-w-[95vw] max-h-[85vh] select-none"
            style={{
              transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
              transition: dragging.current ? "none" : "transform 0.15s ease-out",
              filter: bw ? "grayscale(100%) contrast(1.2)" : "none",
              cursor: scale > 1 ? "grab" : "default",
            }}
          />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}