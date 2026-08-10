import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Camera, RotateCcw, Check, X, Zap, ZapOff, Crop, Contrast } from "lucide-react";

interface Props {
  open: boolean;
  onCapture: (file: File) => void;
  onClose: () => void;
  title?: string;
  /** Pre-acquired MediaStream from useCameraStream hook (preserves gesture context) */
  stream?: MediaStream | null;
}

/* ─── Simple Crop UI (optimized for mobile) ─── */
function CropEditor({ src, onConfirm, onCancel }: {
  src: string; onConfirm: (cropped: string) => void; onCancel: () => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
  const activeRef = useRef<{ handle: string; mx: number; my: number; rect: typeof rect } | null>(null);

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
    const sx = rect.x * img.naturalWidth;
    const sy = rect.y * img.naturalHeight;
    const sw = rect.w * img.naturalWidth;
    const sh = rect.h * img.naturalHeight;
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    onConfirm(canvas.toDataURL("image/jpeg", 0.92));
  };

  const handles = [
    { key: "tl", style: { top: -14, left: -14, cursor: "nwse-resize" } },
    { key: "tr", style: { top: -14, right: -14, cursor: "nesw-resize" } },
    { key: "bl", style: { bottom: -14, left: -14, cursor: "nesw-resize" } },
    { key: "br", style: { bottom: -14, right: -14, cursor: "nwse-resize" } },
  ];

  return (
    <div className="fixed inset-0 z-[110] bg-black flex flex-col" style={{ width: "100vw", height: "100dvh", touchAction: "none" }}>
      <div className="flex items-center justify-between p-3 bg-black/80 text-white z-10">
        <div className="flex items-center gap-2">
          <Crop className="w-5 h-5" />
          <span className="text-sm font-medium">Recortar Imagem</span>
        </div>
        <button type="button" onClick={onCancel} className="p-2 rounded-full hover:bg-white/20">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 relative flex items-center justify-center overflow-hidden p-4" ref={containerRef}>
        <div className="relative inline-block max-w-full max-h-full">
          <img ref={imgRef} src={src} alt="Crop" className="max-w-full max-h-[70vh] object-contain select-none" draggable={false} />
          {/* Dark overlay with cutout */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-0 bg-black/60" style={{
              clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${rect.x*100}% ${rect.y*100}%, ${rect.x*100}% ${(rect.y+rect.h)*100}%, ${(rect.x+rect.w)*100}% ${(rect.y+rect.h)*100}%, ${(rect.x+rect.w)*100}% ${rect.y*100}%, ${rect.x*100}% ${rect.y*100}%)`
            }} />
          </div>
          {/* Crop selection */}
          <div className="absolute" style={{ left: `${rect.x*100}%`, top: `${rect.y*100}%`, width: `${rect.w*100}%`, height: `${rect.h*100}%` }}>
            <div className="absolute inset-0"
              onTouchStart={onDown("move")} onMouseDown={onDown("move")}
              style={{ cursor: "move" }} />
            {/* Border with corner lines like native crop */}
            <div className="absolute inset-0 border-2 border-white pointer-events-none">
              {/* Grid lines */}
              <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/40" />
              <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/40" />
              <div className="absolute top-1/3 left-0 right-0 h-px bg-white/40" />
              <div className="absolute top-2/3 left-0 right-0 h-px bg-white/40" />
            </div>
            {/* Handles */}
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
          <Check className="w-5 h-5 mr-2" /> Recortar
        </Button>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

export default function CameraCapture({ open, onCapture, onClose, title = "Tirar Foto", stream: externalStream }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flashOn, setFlashOn] = useState(false);
  const [flashSupported, setFlashSupported] = useState(false);
  const [cropping, setCropping] = useState(false);
  const [bwFilter, setBwFilter] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  const attachStream = useCallback((stream: MediaStream) => {
    streamRef.current = stream;
    const track = stream.getVideoTracks()[0];
    trackRef.current = track;

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }

    // Check torch support
    setTimeout(() => {
      try {
        const caps = track.getCapabilities?.() as any;
        setFlashSupported(!!caps?.torch);
      } catch {
        setFlashSupported(false);
      }
    }, 500);

    setCameraReady(true);
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      trackRef.current = null;
    }
    setCameraReady(false);
  }, []);

  // When opened with a pre-acquired stream, attach it
  useEffect(() => {
    if (open && externalStream) {
      setCaptured(null);
      setError(null);
      setFlashOn(false);
      setBwFilter(false);
      attachStream(externalStream);
    } else if (open && externalStream === null) {
      // Stream acquisition failed in parent
      setCaptured(null);
      setFlashOn(false);
      setBwFilter(false);
      setError("Não foi possível acessar a câmera. Verifique as permissões do navegador.");
    } else if (open && externalStream === undefined) {
      // Legacy mode: no stream prop, acquire here (fallback)
      setCaptured(null);
      setError(null);
      setFlashOn(false);
      setBwFilter(false);
      setCameraReady(false);
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      }).then(attachStream).catch(() => {
        setError("Não foi possível acessar a câmera. Verifique as permissões do navegador.");
      });
    }

    if (!open) {
      stopCamera();
      setCaptured(null);
      setCropping(false);
      setBwFilter(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, externalStream]);

  const toggleFlash = async () => {
    const track = trackRef.current;
    if (!track) return;
    try {
      const caps = track.getCapabilities?.() as any;
      if (!caps?.torch) {
        console.warn("Torch not supported on this device/browser");
        return;
      }
      const newState = !flashOn;
      await track.applyConstraints({ advanced: [{ torch: newState } as any] });
      setFlashOn(newState);
    } catch (err) {
      console.error("Flash toggle error:", err);
      try {
        const newState = !flashOn;
        await (track as any).applyConstraints({ torch: newState });
        setFlashOn(newState);
      } catch (err2) {
        console.error("Flash fallback also failed:", err2);
      }
    }
  };

  const takePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (bwFilter) {
      ctx.filter = "grayscale(100%)";
    }
    ctx.drawImage(video, 0, 0);
    ctx.filter = "none";
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setCaptured(dataUrl);
    stopCamera();
  };

  const retake = () => {
    setCaptured(null);
    setCropping(false);
    setBwFilter(false);
    // Need to re-acquire stream for retake
    setCameraReady(false);
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    }).then(attachStream).catch(() => {
      setError("Não foi possível acessar a câmera.");
    });
  };

  const confirm = (dataUrl?: string) => {
    const src = dataUrl || captured;
    if (!src) return;
    const byteString = atob(src.split(",")[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
    const file = new File([ab], `foto_${Date.now()}.jpg`, { type: "image/jpeg" });
    onCapture(file);
    onClose();
  };

  const handleClose = () => {
    onClose();
  };

  const handleCropConfirm = (croppedUrl: string) => {
    setCaptured(croppedUrl);
    setCropping(false);
  };

  if (!open) return null;

  return createPortal(
    <>
      {cropping && captured && (
        <CropEditor src={captured} onConfirm={handleCropConfirm} onCancel={() => setCropping(false)} />
      )}
      <div
        className="fixed inset-0 z-[100] bg-black flex flex-col"
        style={{ width: "100vw", height: "100dvh", position: "fixed", top: 0, left: 0, margin: 0, padding: 0 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-black/60 text-white z-10 shrink-0">
          <span className="text-sm font-medium truncate">{title}</span>
          <div className="flex items-center gap-1">
            {/* B&W filter toggle — shown during live view */}
            {!captured && (
              <button type="button" onClick={() => setBwFilter(!bwFilter)}
                className={`p-2.5 rounded-full transition-colors ${bwFilter ? "bg-white/30" : "hover:bg-white/20"}`}
                title={bwFilter ? "Remover filtro P&B" : "Filtro Preto e Branco"}>
                <Contrast className={`w-6 h-6 ${bwFilter ? "text-white" : "text-white/70"}`} />
              </button>
            )}
            {/* Flash toggle */}
            {!captured && (
              <button type="button" onClick={toggleFlash}
                className={`p-2.5 rounded-full transition-colors ${flashOn ? "bg-yellow-500/30" : "hover:bg-white/20"}`}
                title={flashSupported ? (flashOn ? "Desligar Flash" : "Ligar Flash") : "Flash não disponível"}>
                {flashOn ? <Zap className="w-6 h-6 text-yellow-400" /> : <ZapOff className="w-6 h-6 text-white/70" />}
              </button>
            )}
            <button type="button" onClick={handleClose} className="p-2.5 rounded-full hover:bg-white/20 transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Viewfinder / Preview */}
        <div className="flex-1 relative overflow-hidden bg-black">
          {error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-white">
              <Camera className="w-12 h-12 text-white/30 mb-4" />
              <p className="text-sm mb-4 text-center">{error}</p>
              <Button variant="outline" size="sm" onClick={handleClose} className="text-white border-white/50">
                Fechar
              </Button>
            </div>
          ) : !captured ? (
            <>
              <video ref={videoRef} autoPlay playsInline muted
                className="absolute inset-0 w-full h-full object-cover"
                style={{ filter: bwFilter ? "grayscale(100%)" : "none" }} />
              {!cameraReady && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-10 h-10 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                </div>
              )}
            </>
          ) : (
            <img src={captured} alt="Captura" className="absolute inset-0 w-full h-full object-contain" />
          )}
        </div>

        {/* Controls */}
        {!error && (
          <div className="bg-black/80 shrink-0" style={{ paddingBottom: "env(safe-area-inset-bottom, 16px)" }}>
            {!captured ? (
              <div className="flex items-center justify-center py-4">
                <button
                  type="button"
                  onClick={takePhoto}
                  disabled={!cameraReady}
                  className="rounded-full border-4 border-white bg-white/20 hover:bg-white/40 active:scale-95 transition-all flex items-center justify-center disabled:opacity-30"
                  style={{ width: 72, height: 72 }}
                >
                  <div className="w-14 h-14 rounded-full bg-white" />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-3 py-3 px-4">
                <Button variant="destructive" size="lg" onClick={retake} className="rounded-full px-5 flex-1 max-w-[140px]">
                  <RotateCcw className="w-5 h-5 mr-1" /> Refazer
                </Button>
                <Button size="lg" onClick={() => setCropping(true)} className="rounded-full px-5 flex-1 max-w-[140px] bg-blue-600 hover:bg-blue-700 text-white">
                  <Crop className="w-5 h-5 mr-1" /> Recortar
                </Button>
                <Button size="lg" onClick={() => confirm()} className="rounded-full px-5 flex-1 max-w-[140px] bg-green-600 hover:bg-green-700 text-white">
                  <Check className="w-5 h-5 mr-1" /> OK
                </Button>
              </div>
            )}
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </>,
    document.body
  );
}
