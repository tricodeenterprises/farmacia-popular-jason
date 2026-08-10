import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Camera, X, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  onPhotoCaptured: (file: File) => Promise<boolean>;
  currentCount: number;
  maxPhotos: number;
}

export default function BatchPhotoCapture({ open, onClose, onPhotoCaptured, currentCount, maxPhotos }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(currentCount);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setCameraReady(false);
    setCount(currentCount);

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    }).then(stream => {
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setCameraReady(true);
    }).catch(() => {
      setError("Não foi possível acessar a câmera.");
    });

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      setCameraReady(false);
    };
  }, [open, currentCount]);

  const takePhoto = useCallback(async () => {
    if (count >= maxPhotos) { toast.warning(`Limite de ${maxPhotos} fotos atingido.`); return; }
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `galeria_${Date.now()}.jpg`, { type: "image/jpeg" });
      setSaving(true);
      const ok = await onPhotoCaptured(file);
      setSaving(false);
      if (ok) {
        setCount(prev => prev + 1);
        toast.success(`Foto ${count + 1} salva!`, { duration: 1500 });
      } else {
        toast.error("Erro ao salvar foto.");
      }
    }, "image/jpeg", 0.92);
  }, [count, maxPhotos, onPhotoCaptured]);

  if (!open) return null;

  const remaining = maxPhotos - count;

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black flex flex-col" style={{ width: "100vw", height: "100dvh" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-black/60 text-white z-10 shrink-0">
        <div className="flex items-center gap-2">
          <Camera className="w-5 h-5" />
          <span className="text-sm font-medium">Câmera Rápida</span>
          <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">
            {count}/{maxPhotos}
          </span>
        </div>
        <button type="button" onClick={onClose} className="p-2.5 rounded-full hover:bg-white/20 transition-colors">
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Viewfinder */}
      <div className="flex-1 relative overflow-hidden bg-black">
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-white">
            <Camera className="w-12 h-12 text-white/30 mb-4" />
            <p className="text-sm mb-4 text-center">{error}</p>
            <Button variant="outline" size="sm" onClick={onClose} className="text-white border-white/50">Fechar</Button>
          </div>
        ) : (
          <>
            <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
            {!cameraReady && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-10 h-10 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              </div>
            )}
          </>
        )}
      </div>

      {/* Controls */}
      {!error && (
        <div className="bg-black/80 shrink-0" style={{ paddingBottom: "env(safe-area-inset-bottom, 16px)" }}>
          <div className="flex items-center justify-center py-4 gap-6">
            <div className="text-center text-white">
              <p className="text-xs opacity-60">{remaining > 0 ? `${remaining} restantes` : "Limite atingido"}</p>
            </div>
            <button
              type="button"
              onClick={takePhoto}
              disabled={!cameraReady || saving || remaining <= 0}
              className="rounded-full border-4 border-white bg-white/20 hover:bg-white/40 active:scale-95 transition-all flex items-center justify-center disabled:opacity-30"
              style={{ width: 72, height: 72 }}
            >
              {saving ? (
                <Loader2 className="w-8 h-8 text-white animate-spin" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-white" />
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-12 h-12 rounded-full bg-green-600 flex items-center justify-center"
            >
              <Check className="w-6 h-6 text-white" />
            </button>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>,
    document.body
  );
}
