import { useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Image, X, Check, Trash2, Loader2 } from "lucide-react";
import type { GaleriaItem } from "@/hooks/useGaleria";
import ImageCropEditor from "./ImageCropEditor";

interface Props {
  open: boolean;
  fotos: GaleriaItem[];
  loading: boolean;
  onSelect: (file: File) => void;
  onClose: () => void;
  onRemove?: (id: string) => void;
  title?: string;
}

export default function GalleryPicker({ open, fotos, loading, onSelect, onClose, onRemove, title = "Selecionar da Galeria" }: Props) {
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [cropping, setCropping] = useState(false);

  const handleSelect = (url: string) => {
    setSelectedUrl(url);
    setCropping(true);
  };

  const handleCropConfirm = (file: File) => {
    setCropping(false);
    setSelectedUrl(null);
    onSelect(file);
    onClose();
  };

  if (!open) return null;

  return createPortal(
    <>
      {cropping && selectedUrl && (
        <ImageCropEditor
          src={selectedUrl}
          onConfirm={handleCropConfirm}
          onCancel={() => { setCropping(false); setSelectedUrl(null); }}
        />
      )}
      <div className="fixed inset-0 z-[90] flex items-center justify-center">
        <div className="fixed inset-0 bg-black/80" onClick={onClose} />
        <div className="relative z-10 w-full max-w-md max-h-[85vh] flex flex-col rounded-2xl bg-background border shadow-xl mx-4">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b shrink-0">
            <div className="flex items-center gap-2">
              <Image className="w-5 h-5 text-primary" />
              <h3 className="text-base font-bold" style={{ fontFamily: "var(--font-display)" }}>{title}</h3>
              <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{fotos.length} fotos</span>
            </div>
            <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : fotos.length === 0 ? (
              <div className="text-center py-12">
                <Image className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">Galeria vazia</p>
                <p className="text-xs text-muted-foreground mt-1">Use a Câmera Rápida para adicionar fotos.</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {fotos.map((foto) => (
                  <div key={foto.id} className="relative group aspect-square rounded-xl overflow-hidden border border-border/50 cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                    onClick={() => handleSelect(foto.arquivo_url)}>
                    <img src={foto.arquivo_url} alt="Galeria" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <Check className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                    </div>
                    {onRemove && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onRemove(foto.id); }}
                        className="absolute top-1 right-1 w-6 h-6 bg-destructive/90 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t shrink-0">
            <p className="text-[10px] text-muted-foreground text-center">
              Toque numa foto para selecionar e recortar. A foto original permanece na galeria.
            </p>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
