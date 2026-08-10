import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera, Upload, Loader2, CheckCircle, AlertCircle, RefreshCw, Plus, X,
  FlipHorizontal, ImageIcon,
} from "lucide-react";
import CameraCapture from "./CameraCapture";
import { useCameraStream } from "@/hooks/useCameraStream";

interface Props {
  pacienteId: string;
  cicloId?: string;
  preSelectedType?: "identidade" | "doc_representante" | "procuracao";
  onClose: () => void;
}

type DocType = "identidade" | "cpf" | "doc_representante" | "procuracao";
type PhotoMode = "single" | "front_back";

interface DocUpload {
  tipo: DocType;
  photoMode: PhotoMode;
  frontPreview: string | null;
  frontFile: File | null;
  backPreview: string | null;
  backFile: File | null;
  ocrLoading: boolean;
  ocrStatus: "idle" | "success" | "error";
  ocrDetails: string[];
  dadosExtraidos: any;
  rgTemCpf: boolean;
  validadeDeterminada: boolean;
  validadeData: string;
  extraPages: { preview: string; file: File }[];
}

const emptyDoc = (tipo: DocType): DocUpload => ({
  tipo,
  photoMode: "single",
  frontPreview: null,
  frontFile: null,
  backPreview: null,
  backFile: null,
  ocrLoading: false,
  ocrStatus: "idle",
  ocrDetails: [],
  dadosExtraidos: null,
  rgTemCpf: false,
  validadeDeterminada: false,
  validadeData: "",
  extraPages: [],
});

const docTypeLabels: Record<string, string> = {
  identidade: "🪪 Documento do Paciente (RG/CPF)",
  doc_representante: "👤 Documento do Representante",
  procuracao: "📋 Procuração",
};

const photoModeOptions: { value: PhotoMode; label: string; description: string; icon: React.ElementType }[] = [
  { value: "single", label: "Apenas frente", description: "Uma foto do documento", icon: ImageIcon },
  { value: "front_back", label: "Frente e Verso", description: "Duas fotos separadas (frente + verso)", icon: FlipHorizontal },
];

export default function UploadDocumento({ pacienteId, cicloId, preSelectedType, onClose }: Props) {
  const { user } = useAuth();
  const initialType = preSelectedType || "identidade";
  const [doc, setDoc] = useState<DocUpload>(emptyDoc(initialType as DocType));
  const [saving, setSaving] = useState(false);
  const { showCamera, stream: cameraStream, openCamera: openCameraStream, closeCamera } = useCameraStream();
  const [cameraTarget, setCameraTarget] = useState<"front" | "back">("front");
  const frontFileRef = useRef<HTMLInputElement>(null);
  const backFileRef = useRef<HTMLInputElement>(null);
  const extraPageRef = useRef<HTMLInputElement>(null);

  const updateDoc = (updates: Partial<DocUpload>) => {
    setDoc(prev => ({ ...prev, ...updates }));
  };

  const processFile = (f: File, target: "front" | "back") => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (target === "front") {
        updateDoc({ frontPreview: dataUrl, frontFile: f });
        if (doc.tipo !== "procuracao") runOCR(dataUrl.split(",")[1]);
      } else {
        updateDoc({ backPreview: dataUrl, backFile: f });
      }
    };
    reader.readAsDataURL(f);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, target: "front" | "back") => {
    const f = e.target.files?.[0];
    if (!f) return;
    processFile(f, target);
  };

  const handleCameraCapture = (file: File) => {
    processFile(file, cameraTarget);
  };

  const openCamera = (target: "front" | "back") => {
    setCameraTarget(target);
    openCameraStream();
  };

  const handleExtraPage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      updateDoc({ extraPages: [...doc.extraPages, { preview: dataUrl, file: f }] });
    };
    reader.readAsDataURL(f);
  };

  const runOCR = async (base64: string) => {
    updateDoc({ ocrLoading: true, ocrStatus: "idle", ocrDetails: [] });
    try {
      const { data, error } = await supabase.functions.invoke("ocr-document", {
        body: { imageBase64: base64, tipo: "documento" },
      });
      if (error) throw error;
      if (data.erro) {
        updateDoc({ ocrStatus: "error", ocrDetails: ["⚠️ " + data.erro, "", "Você ainda pode salvar o documento manualmente."], ocrLoading: false });
        toast.warning("Leitura automática falhou. Você pode salvar mesmo assim.");
        return;
      }

      const details: string[] = [];
      if (data.nome_completo) details.push("✅ Nome: " + data.nome_completo);
      else details.push("❌ Nome não encontrado");
      if (data.cpf) details.push("✅ CPF: " + data.cpf);
      else details.push("❌ CPF não encontrado");
      if (data.rg) details.push("✅ RG: " + data.rg);
      if (data.data_nascimento) details.push("✅ Nascimento");
      details.push("");
      details.push("⚠️ Confira manualmente os dados.");

      const hasData = data.nome_completo || data.cpf || data.rg;
      updateDoc({
        ocrStatus: hasData ? "success" : "error",
        ocrDetails: details,
        ocrLoading: false,
        dadosExtraidos: data,
        rgTemCpf: !!data.cpf,
      });
      if (hasData) toast.success("Documento processado!");
    } catch {
      updateDoc({ ocrStatus: "error", ocrDetails: ["❌ Falha no processamento"], ocrLoading: false });
      toast.error("Erro ao processar documento.");
    }
  };

  const uploadFile = async (file: File, suffix: string) => {
    const ext = file.name.split(".").pop();
    const path = `pacientes/${pacienteId}/${doc.tipo}_${suffix}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("documentos").upload(path, file);
    if (error) return null;
    const { data: urlData } = supabase.storage.from("documentos").getPublicUrl(path);
    return urlData.publicUrl;
  };

  const handleSave = async () => {
    if (!doc.frontFile) { toast.error("Envie a foto do documento."); return; }
    if (doc.photoMode === "front_back" && !doc.backFile) { toast.error("Envie a foto do verso do documento."); return; }

    setSaving(true);

    // Upload front
    const frontUrl = await uploadFile(doc.frontFile, doc.photoMode === "single" ? "doc" : "frente");
    if (!frontUrl) { toast.error("Erro no upload."); setSaving(false); return; }

    let validadeDate = new Date();
    if (doc.tipo === "procuracao" && doc.validadeDeterminada && doc.validadeData) {
      validadeDate = new Date(doc.validadeData + "T23:59:59");
    } else {
      validadeDate.setFullYear(validadeDate.getFullYear() + 10);
    }

    const tipoSalvar = doc.rgTemCpf && doc.tipo === "identidade" ? "identidade_com_cpf" : doc.tipo;

    // Save front document
    await supabase.from("documentos").insert({
      paciente_id: pacienteId,
      ciclo_id: cicloId || null,
      tipo: tipoSalvar,
      arquivo_url: frontUrl,
      validade_ate: validadeDate.toISOString(),
      uploaded_by: user?.id,
      dados_extraidos: {
        ...doc.dadosExtraidos,
        foto_modo: doc.photoMode,
        lado: doc.photoMode === "front_back" ? "frente" : "unica",
      },
    });

    // Upload back if separate
    if (doc.photoMode === "front_back" && doc.backFile) {
      const backUrl = await uploadFile(doc.backFile, "verso");
      if (backUrl) {
        await supabase.from("documentos").insert({
          paciente_id: pacienteId,
          ciclo_id: cicloId || null,
          tipo: tipoSalvar,
          arquivo_url: backUrl,
          validade_ate: validadeDate.toISOString(),
          uploaded_by: user?.id,
          dados_extraidos: { lado: "verso", foto_modo: "front_back" },
        });
      }
    }

    // Upload extra pages for procuracao
    for (let i = 0; i < doc.extraPages.length; i++) {
      const ep = doc.extraPages[i];
      const epUrl = await uploadFile(ep.file, `page${i + 2}`);
      if (epUrl) {
        await supabase.from("documentos").insert({
          paciente_id: pacienteId,
          ciclo_id: cicloId || null,
          tipo: "procuracao",
          arquivo_url: epUrl,
          validade_ate: validadeDate.toISOString(),
          uploaded_by: user?.id,
          dados_extraidos: { pagina: i + 2 },
        });
      }
    }

    await supabase.from("logs").insert({
      user_id: user?.id,
      acao: "upload_documento",
      detalhes: { paciente_id: pacienteId, tipo: doc.tipo, modo: doc.photoMode },
    });

    toast.success("Documento salvo!");
    onClose();
    setSaving(false);
  };

  const [dragOverFront, setDragOverFront] = useState(false);
  const [dragOverBack, setDragOverBack] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent, target: "front" | "back") => {
    e.preventDefault();
    e.stopPropagation();
    if (target === "front") setDragOverFront(false);
    else setDragOverBack(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.type.startsWith("image/") || file.type === "application/pdf")) {
      processFile(file, target);
    } else {
      toast.error("Arquivo inválido. Use imagem ou PDF.");
    }
  }, [doc.tipo]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const hasMainPhoto = !!doc.frontPreview;
  const photoLabel = "Frente";
  const showBackUpload = doc.photoMode === "front_back";
  const showPhotoModeSelector = doc.tipo !== "procuracao";

  return (
    <>
      <CameraCapture
        open={showCamera}
        stream={cameraStream}
        onCapture={handleCameraCapture}
        onClose={() => closeCamera()}
        title={`Tirar Foto - ${cameraTarget === "front" ? photoLabel : "Verso"}`}
      />
      <Dialog open onOpenChange={() => onClose()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-display)" }}>
              {docTypeLabels[doc.tipo] || "Upload de Documento"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <input ref={frontFileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => handleFileSelect(e, "front")} />
            <input ref={backFileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => handleFileSelect(e, "back")} />
            <input ref={extraPageRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleExtraPage} />

            {/* ═══ Photo Mode Selector ═══ */}
            {showPhotoModeSelector && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Modo de captura</Label>
                <div className="grid grid-cols-2 gap-2">
                  {photoModeOptions.map((mode) => (
                    <motion.button
                      key={mode.value}
                      onClick={() => updateDoc({
                        photoMode: mode.value,
                        frontPreview: null, frontFile: null,
                        backPreview: null, backFile: null,
                        ocrStatus: "idle", ocrDetails: [], dadosExtraidos: null,
                      })}
                      className={`p-3 rounded-xl border-2 text-center transition-all ${
                        doc.photoMode === mode.value
                          ? "border-primary bg-primary/10 shadow-md"
                          : "border-border/50 hover:border-primary/30"
                      }`}
                      style={doc.photoMode === mode.value ? { boxShadow: "0 0 15px rgba(var(--primary),0.15)" } : {}}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <mode.icon className={`w-5 h-5 mx-auto mb-1 ${doc.photoMode === mode.value ? "text-primary" : "text-muted-foreground"}`} />
                      <p className="text-xs font-semibold leading-tight">{mode.label}</p>
                    </motion.button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground text-center">
                  {photoModeOptions.find(m => m.value === doc.photoMode)?.description}
                </p>
              </div>
            )}


            {/* Procuração validity */}
            {doc.tipo === "procuracao" && (
              <div className="space-y-2 p-3 rounded-xl bg-muted/40">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={doc.validadeDeterminada}
                    onCheckedChange={(c) => updateDoc({ validadeDeterminada: !!c })}
                  />
                  <span className="text-xs font-medium">Procuração tem validade determinada</span>
                </div>
                {doc.validadeDeterminada && (
                  <Input
                    type="date"
                    value={doc.validadeData}
                    onChange={(e) => updateDoc({ validadeData: e.target.value })}
                    className="text-sm rounded-xl"
                  />
                )}
              </div>
            )}

            {/* ═══ FRONT / MAIN Photo ═══ */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                📸 {photoLabel}
              </Label>
              {!doc.frontPreview ? (
                <div
                  className={`relative rounded-xl border-2 border-dashed transition-all ${
                    dragOverFront
                      ? "border-primary bg-primary/10 shadow-[0_0_20px_rgba(var(--primary),0.2)]"
                      : "border-border/50"
                  }`}
                  onDrop={(e) => handleDrop(e, "front")}
                  onDragOver={(e) => { handleDragOver(e); setDragOverFront(true); }}
                  onDragEnter={(e) => { e.preventDefault(); setDragOverFront(true); }}
                  onDragLeave={() => setDragOverFront(false)}
                >
                  {dragOverFront && (
                    <div className="absolute inset-0 flex items-center justify-center z-10 rounded-xl bg-primary/10 backdrop-blur-sm">
                      <p className="text-sm font-semibold text-primary">Solte o arquivo aqui</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3 p-1">
                    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-20 w-full border-dashed border-2 flex flex-col gap-2 rounded-xl hover:border-primary/50 hover:bg-primary/5 transition-all"
                        onClick={() => openCamera("front")}
                      >
                        <Camera className="w-7 h-7 text-muted-foreground" />
                        <span className="text-xs">Tirar Foto</span>
                      </Button>
                    </motion.div>
                    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-20 w-full border-dashed border-2 flex flex-col gap-2 rounded-xl hover:border-primary/50 hover:bg-primary/5 transition-all"
                        onClick={() => frontFileRef.current?.click()}
                      >
                        <Upload className="w-7 h-7 text-muted-foreground" />
                        <span className="text-xs">Anexar Arquivo</span>
                      </Button>
                    </motion.div>
                  </div>
                  <p className="text-[10px] text-muted-foreground text-center pb-2">ou arraste e solte aqui</p>
                </div>
              ) : (
                <PhotoPreview
                  preview={doc.frontPreview}
                  ocrLoading={doc.ocrLoading}
                  ocrStatus={doc.ocrStatus}
                  ocrDetails={doc.ocrDetails}
                  onReset={() => updateDoc({ frontPreview: null, frontFile: null, ocrStatus: "idle", ocrDetails: [], dadosExtraidos: null })}
                />
              )}
            </div>

            {/* ═══ BACK Photo (only for front_back mode) ═══ */}
            <AnimatePresence>
              {showBackUpload && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2 overflow-hidden"
                >
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    🔄 Verso
                  </Label>
                  {!doc.backPreview ? (
                    <div
                      className={`relative rounded-xl border-2 border-dashed transition-all ${
                        dragOverBack
                          ? "border-primary bg-primary/10 shadow-[0_0_20px_rgba(var(--primary),0.2)]"
                          : "border-border/50"
                      }`}
                      onDrop={(e) => handleDrop(e, "back")}
                      onDragOver={(e) => { handleDragOver(e); setDragOverBack(true); }}
                      onDragEnter={(e) => { e.preventDefault(); setDragOverBack(true); }}
                      onDragLeave={() => setDragOverBack(false)}
                    >
                      {dragOverBack && (
                        <div className="absolute inset-0 flex items-center justify-center z-10 rounded-xl bg-primary/10 backdrop-blur-sm">
                          <p className="text-sm font-semibold text-primary">Solte o arquivo aqui</p>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-3 p-1">
                        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-20 w-full border-dashed border-2 flex flex-col gap-2 rounded-xl hover:border-primary/50 hover:bg-primary/5 transition-all"
                            onClick={() => openCamera("back")}
                          >
                            <Camera className="w-7 h-7 text-muted-foreground" />
                            <span className="text-xs">Tirar Foto</span>
                          </Button>
                        </motion.div>
                        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-20 w-full border-dashed border-2 flex flex-col gap-2 rounded-xl hover:border-primary/50 hover:bg-primary/5 transition-all"
                            onClick={() => backFileRef.current?.click()}
                          >
                            <Upload className="w-7 h-7 text-muted-foreground" />
                            <span className="text-xs">Anexar Arquivo</span>
                          </Button>
                        </motion.div>
                      </div>
                      <p className="text-[10px] text-muted-foreground text-center pb-2">ou arraste e solte aqui</p>
                    </div>
                  ) : (
                    <PhotoPreview
                      preview={doc.backPreview}
                      onReset={() => updateDoc({ backPreview: null, backFile: null })}
                    />
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Extra pages for any document type */}
            {doc.frontPreview && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                  {doc.tipo === "procuracao" ? "Páginas adicionais" : "Fotos adicionais"}
                </Label>
                {doc.extraPages.map((ep, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-xl bg-muted/40">
                    <img src={ep.preview} alt={`Página ${i + 2}`} className="w-16 h-12 object-cover rounded-lg border" />
                    <span className="text-xs font-medium flex-1">Página {i + 2}</span>
                    <Button variant="ghost" size="sm" className="rounded-lg" onClick={() => {
                      updateDoc({ extraPages: doc.extraPages.filter((_, j) => j !== i) });
                    }}><X className="w-3 h-3" /></Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => extraPageRef.current?.click()}>
                  <Plus className="w-4 h-4 mr-1" /> {doc.tipo === "procuracao" ? "Adicionar Página" : "Adicionar Foto"}
                </Button>
              </div>
            )}

            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" onClick={onClose} className="rounded-xl">Cancelar</Button>
              <Button
                onClick={handleSave}
                disabled={saving || !doc.frontFile || doc.ocrLoading || (doc.photoMode === "front_back" && !doc.backFile)}
                className="rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90 shadow-md"
              >
                {saving ? "Salvando..." : "Salvar Documento"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ─── Reusable Photo Preview ─── */
function PhotoPreview({
  preview,
  ocrLoading,
  ocrStatus,
  ocrDetails,
  onReset,
}: {
  preview: string;
  ocrLoading?: boolean;
  ocrStatus?: "idle" | "success" | "error";
  ocrDetails?: string[];
  onReset: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative rounded-xl overflow-hidden border bg-muted/20"
    >
      <img src={preview} alt="Documento" className="w-full max-h-40 object-contain p-2" />
      <div className="absolute top-2 right-2 flex gap-2">
        {ocrLoading && <div className="bg-background/90 rounded-full p-2 shadow-sm"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>}
        {ocrStatus === "success" && <div className="bg-background/90 rounded-full p-2 shadow-sm"><CheckCircle className="w-5 h-5 text-green-500" /></div>}
        {ocrStatus === "error" && <div className="bg-background/90 rounded-full p-2 shadow-sm"><AlertCircle className="w-5 h-5 text-destructive" /></div>}
      </div>
      <div className="p-2 border-t bg-muted/30">
        <Button variant="ghost" size="sm" className="rounded-lg text-xs" onClick={onReset}>
          <RefreshCw className="w-3 h-3 mr-1" /> Trocar foto
        </Button>
      </div>
      {ocrDetails && ocrDetails.length > 0 && (
        <div className="px-3 pb-3">
          <div className="p-2.5 rounded-xl bg-muted/50 text-xs space-y-0.5">
            <p className="font-semibold mb-1">Resultado da leitura:</p>
            {ocrDetails.map((d, i) => <p key={i}>{d}</p>)}
          </div>
        </div>
      )}
    </motion.div>
  );
}
