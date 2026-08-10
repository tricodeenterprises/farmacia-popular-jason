import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera, Upload, Loader2, CheckCircle, User, Users,
  ChevronRight, ChevronLeft, Shield, FileText, Save,
  AlertTriangle, Search, Eye, AlertCircle, X, Receipt, Plus, Image,
} from "lucide-react";
import CameraCapture from "./CameraCapture";
import { useCameraStream } from "@/hooks/useCameraStream";
import ImageViewer from "./ImageViewer";
import GalleryPicker from "./GalleryPicker";
import type { GaleriaItem } from "@/hooks/useGaleria";
import { CATEGORIAS, CATEGORY_CONFIG, categoriaLabel, normalizeCategoria, storedIntervalFor, type CategoriaDispensacao } from "@/lib/categorias";
import { addDaysToDateStr, calculateCycleLimit, getTodayLocalDateStr, isFutureDateStr } from "@/lib/ciclo-utils";

interface Props {
  paciente: any;
  cicloId?: string;
  onComplete: () => void;
  onCancel?: () => void;
  galeriaFotos?: GaleriaItem[];
  galeriaLoading?: boolean;
}

type TipoRetirada = "proprio" | "representante";
type SetupStep = "receita" | "tipo_retirada" | "doc_paciente" | "doc_representante" | "procuracao" | "cupom_fiscal" | "resumo";

import { formatCpfMask, formatDateBR, validateCpfDigits } from "@/lib/format-utils";

export default function SetupCiclo({ paciente, cicloId, onComplete, onCancel, galeriaFotos = [], galeriaLoading = false }: Props) {
  const { user } = useAuth();
  const [showGalleryPicker, setShowGalleryPicker] = useState(false);
  const [galleryTarget, setGalleryTarget] = useState("");
  const needsReceita = !cicloId;
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // ═══ OPERADOR = LOGGED-IN USER ═══
  const [operadorId] = useState<string | null>(user?.id || null);
  const [operadorNome, setOperadorNome] = useState<string>("");

  useEffect(() => {
    if (user?.id) {
      supabase.from("profiles").select("nome").eq("id", user.id).single().then(({ data }) => {
        setOperadorNome(data?.nome || "");
      });
    }
  }, [user?.id]);

  // ═══ RECEITA STATE ═══
  const [receitaPreview, setReceitaPreview] = useState<string | null>(null);
  const [receitaFile, setReceitaFile] = useState<File | null>(null);
  const [dataEmissao, setDataEmissao] = useState("");
  const [tipoReceita, setTipoReceita] = useState<CategoriaDispensacao>("medicamento");
  const [ocrReceitaLoading, setOcrReceitaLoading] = useState(false);
  const [ocrReceitaStatus, setOcrReceitaStatus] = useState<"idle" | "success" | "error">("idle");
  const [ocrReceitaDetails, setOcrReceitaDetails] = useState<string[]>([]);

  // ═══ TIPO RETIRADA ═══
  const [tipoRetirada, setTipoRetirada] = useState<TipoRetirada | null>(null);

  // ═══ DOC PACIENTE ═══
  const [docPacientePreview, setDocPacientePreview] = useState<string | null>(null);
  const [docPacienteFile, setDocPacienteFile] = useState<File | null>(null);
  const [ocrPacLoading, setOcrPacLoading] = useState(false);
  const [ocrPacDetails, setOcrPacDetails] = useState<string[]>([]);

  // ═══ REPRESENTANTE ═══
  const [repNome, setRepNome] = useState("");
  const [repCpf, setRepCpf] = useState("");
  const [repDocPreview, setRepDocPreview] = useState<string | null>(null);
  const [repDocFile, setRepDocFile] = useState<File | null>(null);
  const [ocrRepLoading, setOcrRepLoading] = useState(false);
  const [ocrRepDetails, setOcrRepDetails] = useState<string[]>([]);

  // ═══ PROCURAÇÃO ═══
  const [procuracaoPreview, setProcuracaoPreview] = useState<string | null>(null);
  const [procuracaoFile, setProcuracaoFile] = useState<File | null>(null);
  const [procuracaoIndeterminada, setProcuracaoIndeterminada] = useState(false);
  const [procuracaoEmissao, setProcuracaoEmissao] = useState("");
  const [procuracaoValidade, setProcuracaoValidade] = useState("");

  // ═══ REAPROVEITAMENTO DE DOCUMENTOS ═══
  const [reuseDocs, setReuseDocs] = useState(false);
  const [reusableDocs, setReusableDocs] = useState<any[]>([]);

  useEffect(() => {
    const loadReusableDocs = async () => {
      if (!needsReceita) return;
      const tiposReutilizaveis = [
        "identidade",
        "documento",
        "documento_paciente",
        "doc_paciente",
        "doc_representante",
        "documento_representante",
        "procuracao",
        "declaracao",
        "declaração",
      ];
      const { data } = await supabase
        .from("documentos")
        .select("*")
        .eq("paciente_id", paciente.id)
        .in("tipo", tiposReutilizaveis)
        .eq("status", "ativo")
        .order("created_at", { ascending: false })
        .limit(40);
      setReusableDocs(data || []);
    };
    loadReusableDocs();
  }, [paciente.id, needsReceita]);

  const latestReusableDoc = (tipos: string[]) => reusableDocs.find((doc: any) => tipos.includes(doc.tipo));
  const reusablePacienteDoc = latestReusableDoc(["identidade", "documento", "documento_paciente", "doc_paciente"]);
  const reusableRepDoc = latestReusableDoc(["doc_representante", "documento_representante"]);
  const reusableProcuracao = latestReusableDoc(["procuracao", "declaracao", "declaração"]);
  const canReusePacienteDoc = reuseDocs && !!reusablePacienteDoc;
  const canReuseRepDoc = reuseDocs && !!reusableRepDoc;
  const canReuseProcuracao = reuseDocs && !!reusableProcuracao;

  // ═══ CUPOM FISCAL ═══
  const [cupomPreview, setCupomPreview] = useState<string | null>(null);
  const [cupomFile, setCupomFile] = useState<File | null>(null);
  const [cupomQrPreview, setCupomQrPreview] = useState<string | null>(null);
  const [cupomQrFile, setCupomQrFile] = useState<File | null>(null);
  const [cupomOcrLoading, setCupomOcrLoading] = useState(false);
  const [cupomDataCompra, setCupomDataCompra] = useState<string | null>(null);
  const [cupomDataProxima, setCupomDataProxima] = useState<string | null>(null);
  const [cupomDatasConfirmadas, setCupomDatasConfirmadas] = useState(false);
  const [dispensadoHoje, setDispensadoHoje] = useState<boolean | null>(null);

  // ═══ SAVING / CAMERA / PREVIEW ═══
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const { showCamera, stream: cameraStream, openCamera: openCameraStream, closeCamera } = useCameraStream();
  const [cameraTarget, setCameraTarget] = useState("receita");
  const [cameraMode, setCameraMode] = useState<"main" | "extra">("main");
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  // ═══ EXTRA PHOTOS PER SECTION ═══
  const [extraPhotos, setExtraPhotos] = useState<Record<string, { preview: string; file: File }[]>>({});

  const addExtraPhoto = (target: string, file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setExtraPhotos(prev => ({
        ...prev,
        [target]: [...(prev[target] || []), { preview: dataUrl, file }],
      }));
      // If it's an extra cupom photo, run OCR on it too
      if (target === "cupom") {
        runCupomOcrIfNeeded(dataUrl.split(",")[1]);
      }
    };
    reader.readAsDataURL(file);
  };

  // Run cupom OCR on extra photo if previous OCR didn't find valid data
  const runCupomOcrIfNeeded = async (base64: string) => {
    // Always try - the AI will identify which cupom has the signature
    setCupomOcrLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ocr-document", {
        body: {
          imageBase64: base64, tipo: "cupom_fiscal",
          contexto_ciclo: {
            data_emissao_receita: dataEmissao,
            validade_receita: null,
            ultima_retirada: null,
            intervalo_dias: storedIntervalFor(tipoReceita),
            total_dispensacoes: 0,
            tipo: tipoReceita,
          },
        },
      });
      if (error) throw error;
      // Only update if this photo returned valid data
      if (data.data_compra) {
        setCupomDataCompra(data.data_compra);
        setCupomDatasConfirmadas(false);
        if (data.data_proxima_retirada) setCupomDataProxima(data.data_proxima_retirada);
        if (isFutureDateStr(data.data_compra)) {
          toast.warning("A data lida no cupom é futura. Confira se não é a data de próxima retirada e corrija antes de registrar.");
        } else {
          toast.success("Dados do cupom com assinatura detectados!");
        }
      }
    } catch (e) {
      console.error("OCR cupom extra error:", e);
    } finally {
      setCupomOcrLoading(false);
    }
  };

  const removeExtraPhoto = (target: string, index: number) => {
    setExtraPhotos(prev => ({
      ...prev,
      [target]: (prev[target] || []).filter((_, i) => i !== index),
    }));
  };

  // File refs
  const receitaRef = useRef<HTMLInputElement>(null);
  const docPacienteRef = useRef<HTMLInputElement>(null);
  const repDocRef = useRef<HTMLInputElement>(null);
  const procuracaoRef = useRef<HTMLInputElement>(null);
  const cupomRef = useRef<HTMLInputElement>(null);
  const cupomQrRef = useRef<HTMLInputElement>(null);
  const extraFileRef = useRef<HTMLInputElement>(null);


  // ═══ STEPS ═══
  type ExtendedStep = SetupStep;
  const getSteps = (): ExtendedStep[] => {
    const base: ExtendedStep[] = [];
    if (needsReceita) base.push("receita");
    base.push("tipo_retirada", "doc_paciente");
    if (tipoRetirada === "representante") base.push("doc_representante", "procuracao");
    base.push("cupom_fiscal", "resumo");
    return base;
  };

  const steps = getSteps();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const currentStep = steps[Math.min(currentStepIndex, steps.length - 1)];


  // ═══ VALIDATIONS ═══
  const repCpfClean = repCpf.replace(/\D/g, "");
  const repCpfValid = repCpfClean.length === 11 && validateCpfDigits(repCpfClean);
  const repNameMatchesPatient = repNome.trim().toLowerCase() === paciente.nome.trim().toLowerCase();

  const getReceitaVencida = () => {
    if (!dataEmissao) return false;
    const emissao = new Date(dataEmissao + "T00:00:00");
    const validade = new Date(emissao);
    validade.setDate(validade.getDate() + 180);
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    return hoje > validade;
  };

  const canGoNext = (): boolean => {
    switch (currentStep) {
      case "receita":
        return !!receitaFile && !!dataEmissao && !getReceitaVencida();
      case "tipo_retirada": return !!tipoRetirada;
      case "doc_paciente": return !!docPacienteFile || canReusePacienteDoc;
      case "doc_representante":
        return (!!repDocFile || canReuseRepDoc) && repNome.trim().length > 0 && repCpfValid && !repNameMatchesPatient;
      case "procuracao":
        return !!procuracaoFile || canReuseProcuracao || (!!procuracaoFile && (procuracaoIndeterminada || (!!procuracaoEmissao && !!procuracaoValidade)));
      case "cupom_fiscal": return !!cupomFile && !!cupomQrFile && !!cupomDataCompra && cupomDatasConfirmadas && dispensadoHoje !== null && !isFutureDateStr(cupomDataCompra) && !(dataEmissao && cupomDataCompra < dataEmissao);
      case "resumo": return true;
      default: return false;
    }
  };

  const goNext = () => { if (currentStepIndex < steps.length - 1) setCurrentStepIndex(currentStepIndex + 1); };
  const goBack = () => { if (currentStepIndex > 0) setCurrentStepIndex(currentStepIndex - 1); };

  // ═══ CAMERA / FILE / GALLERY HELPERS ═══
  const openCamera = (target: string) => { setCameraTarget(target); setCameraMode("main"); openCameraStream(); };
  const openCameraExtra = (target: string) => { setCameraTarget(target); setCameraMode("extra"); openCameraStream(); };
  const openGallery = (target: string) => { setGalleryTarget(target); setShowGalleryPicker(true); };

  const handleGallerySelect = (file: File) => {
    // Same as camera capture but from gallery (already cropped)
    const targets: Record<string, [any, any, boolean?]> = {
      receita: [setReceitaFile, setReceitaPreview],
      docPaciente: [setDocPacienteFile, setDocPacientePreview, true],
      repDoc: [setRepDocFile, setRepDocPreview, true],
      procuracao: [setProcuracaoFile, setProcuracaoPreview],
      cupom: [setCupomFile, setCupomPreview],
      cupomQr: [setCupomQrFile, setCupomQrPreview],
    };
    const t = targets[galleryTarget];
    if (t) processFile(file, t[0], t[1], !!t[2]);
  };

  const handleCameraCapture = (file: File) => {
    closeCamera();
    if (cameraMode === "extra") {
      addExtraPhoto(cameraTarget, file);
      return;
    }
    const targets: Record<string, [any, any, boolean?]> = {
      receita: [setReceitaFile, setReceitaPreview],
      docPaciente: [setDocPacienteFile, setDocPacientePreview, true],
      repDoc: [setRepDocFile, setRepDocPreview, true],
      procuracao: [setProcuracaoFile, setProcuracaoPreview],
      cupom: [setCupomFile, setCupomPreview],
      cupomQr: [setCupomQrFile, setCupomQrPreview],
    };
    const t = targets[cameraTarget];
    if (t) processFile(file, t[0], t[1], !!t[2]);
  };

  const processFile = (
    file: File, setFile: (f: File | null) => void,
    setPreview: (s: string | null) => void, runOcr?: boolean
  ) => {
    setFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setPreview(dataUrl);
      if (cameraTarget === "receita") runOcrReceita(dataUrl.split(",")[1]);
      else if (cameraTarget === "docPaciente") runOcrPaciente(dataUrl.split(",")[1]);
      else if (cameraTarget === "cupom") { setCupomDatasConfirmadas(false); setCupomDataCompra(null); setCupomDataProxima(null); runCupomOcr(dataUrl.split(",")[1]); }
      else if (runOcr) runOcrDoc(dataUrl.split(",")[1]);
    };
    reader.readAsDataURL(file);
  };

  const handleFileSelect = (
    setFile: (f: File | null) => void, setPreview: (s: string | null) => void,
    ocrType?: "receita" | "paciente" | "representante"
  ) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (f.size > MAX_SIZE) {
      toast.error(`Arquivo muito grande (${(f.size / 1024 / 1024).toFixed(1)}MB). Máximo: 10MB.`);
      e.target.value = "";
      return;
    }
    setFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setPreview(dataUrl);
      if (ocrType === "receita") runOcrReceita(dataUrl.split(",")[1]);
      else if (ocrType === "paciente") runOcrPaciente(dataUrl.split(",")[1]);
      else if (ocrType === "representante") runOcrDoc(dataUrl.split(",")[1]);
      else if (ocrType === "cupom" as any) { setCupomDatasConfirmadas(false); setCupomDataCompra(null); setCupomDataProxima(null); runCupomOcr(dataUrl.split(",")[1]); }
    };
    reader.readAsDataURL(f);
  };

  // ═══ QUALITY FEEDBACK HELPER ═══
  const getQualityFeedback = (data: any): string[] => {
    const feedback: string[] = [];
    const qualidade = data.score_qualidade ?? null;
    const confianca = data.score_confianca ?? null;
    if (qualidade !== null) {
      if (qualidade >= 90) feedback.push(`📸 Qualidade da imagem: Excelente (${qualidade}%)`);
      else if (qualidade >= 70) feedback.push(`📸 Qualidade da imagem: Boa (${qualidade}%)`);
      else if (qualidade >= 50) feedback.push(`📸 Qualidade da imagem: Regular (${qualidade}%) — tente uma foto mais nítida`);
      else feedback.push(`📸 Qualidade da imagem: Baixa (${qualidade}%) — recomendamos tirar outra foto com melhor iluminação`);
    }
    if (confianca !== null && confianca < 70) {
      feedback.push(`⚠️ Confiança nos dados: ${confianca}% — confira com atenção`);
    }
    if (data.problemas_imagem?.length > 0) {
      feedback.push(`🔍 Problemas: ${data.problemas_imagem.join(", ")}`);
    }
    return feedback;
  };

  // ═══ OCR ═══
  const runOcrReceita = async (base64: string) => {
    setOcrReceitaLoading(true); setOcrReceitaStatus("idle"); setOcrReceitaDetails([]);
    try {
      const { data, error } = await supabase.functions.invoke("ocr-document", { body: { imageBase64: base64, tipo: "receita" } });
      if (error) throw error;
      if (data.erro && !data.data_emissao && !data.tipo_receita) { setOcrReceitaStatus("error"); setOcrReceitaDetails(["❌ " + data.erro, ...getQualityFeedback(data)]); return; }
      const details: string[] = [];
      // Quality feedback first
      details.push(...getQualityFeedback(data));
      if (details.length > 0) details.push("");
      if (data.data_emissao) { setDataEmissao(data.data_emissao); details.push("✅ Data: " + formatDateBR(data.data_emissao)); } else details.push("❌ Data não encontrada");
      if (data.tipo_receita) { setTipoReceita(normalizeCategoria(data.tipo_receita)); details.push("✅ Tipo: " + categoriaLabel(data.tipo_receita)); }
      details.push(""); details.push("⚠️ Confira manualmente.");
      setOcrReceitaDetails(details);
      const hasData = data.data_emissao || data.tipo_receita;
      const isLowQuality = (data.score_qualidade ?? 100) < 50;
      setOcrReceitaStatus(hasData ? (isLowQuality ? "success" : "success") : "error");
      if (hasData) toast.success("Dados extraídos da receita!");
      else if (isLowQuality) toast.warning("Qualidade da foto baixa. Tente uma foto mais nítida.");
    } catch { setOcrReceitaStatus("error"); setOcrReceitaDetails(["❌ Falha no processamento"]); }
    finally { setOcrReceitaLoading(false); }
  };

  const runOcrPaciente = async (base64: string) => {
    setOcrPacLoading(true); setOcrPacDetails([]);
    try {
      const { data, error } = await supabase.functions.invoke("ocr-document", { body: { imageBase64: base64, tipo: "documento" } });
      if (error) throw error;
      const details: string[] = [];
      details.push(...getQualityFeedback(data));
      if (details.length > 0) details.push("");
      if (data.nome_completo) details.push("✅ Nome: " + data.nome_completo);
      if (data.cpf) details.push("✅ CPF: " + data.cpf);
      if (data.data_nascimento) details.push("✅ Nascimento: " + formatDateBR(data.data_nascimento));
      if (data.endereco) details.push("✅ Endereço encontrado");
      const hasExtracted = [data.nome_completo, data.cpf, data.data_nascimento, data.endereco].some(Boolean);
      if (!hasExtracted) details.push("⚠️ Nenhum dado extraído automaticamente.");
      else { details.push(""); details.push("⚠️ Confira se os dados conferem com o cadastro."); }
      setOcrPacDetails(details);
      if (hasExtracted) toast.success("Dados do documento lidos!");
      else if ((data.score_qualidade ?? 100) < 50) toast.warning("Foto com qualidade baixa. Os dados podem ser imprecisos.");
    } catch { toast.warning("Leitura automática falhou."); }
    finally { setOcrPacLoading(false); }
  };

  const runOcrDoc = async (base64: string) => {
    setOcrRepLoading(true); setOcrRepDetails([]);
    try {
      const { data, error } = await supabase.functions.invoke("ocr-document", { body: { imageBase64: base64, tipo: "documento" } });
      if (error) throw error;
      const details: string[] = [];
      details.push(...getQualityFeedback(data));
      if (details.length > 0) details.push("");
      if (data.nome_completo) { setRepNome(data.nome_completo); details.push("✅ Nome: " + data.nome_completo); }
      if (data.cpf) { setRepCpf(data.cpf.replace(/\D/g, "")); details.push("✅ CPF: " + data.cpf); }
      setOcrRepDetails(details);
      if (data.nome_completo || data.cpf) toast.success("Dados extraídos!");
      else if ((data.score_qualidade ?? 100) < 50) toast.warning("Foto com qualidade baixa. Preencha manualmente.");
    } catch { toast.warning("Leitura automática falhou."); }
    finally { setOcrRepLoading(false); }
  };


  // ═══ OCR CUPOM FISCAL ═══
  const runCupomOcr = async (base64: string) => {
    setCupomOcrLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ocr-document", {
        body: {
          imageBase64: base64, tipo: "cupom_fiscal",
          contexto_ciclo: {
            data_emissao_receita: dataEmissao,
            validade_receita: null,
            ultima_retirada: null,
            intervalo_dias: storedIntervalFor(tipoReceita),
            total_dispensacoes: 0,
            tipo: tipoReceita,
          },
        },
      });
      if (error) throw error;
      if (data.data_compra) {
        setCupomDataCompra(data.data_compra);
        if (data.data_proxima_retirada) setCupomDataProxima(data.data_proxima_retirada);
        if (isFutureDateStr(data.data_compra)) {
          toast.warning("A data lida no cupom é futura. Confira se não é a data de próxima retirada e corrija antes de registrar.");
        }
        const qualidade = data.score_qualidade ?? 100;
        if (qualidade < 70) {
          toast.info(`Dados lidos, mas qualidade da foto é ${qualidade}%. Confira com atenção.`);
        } else {
          toast.success("Dados do cupom extraídos!");
        }
      } else {
        const qualidade = data.score_qualidade ?? 100;
        if (data.erro && data.erro.toLowerCase().includes("qr")) {
          toast.warning("Este cupom parece ter QR code. Adicione outra foto com o cupom que contém a relação de medicamentos e assinatura.");
        } else if (qualidade < 50) {
          toast.warning("Qualidade da foto do cupom está baixa. Tente outra foto ou adicione o cupom com assinatura.");
        } else {
          toast.warning("Dados do cupom não encontrados. Se você tirou foto do cupom errado, adicione outra foto com o cupom que contém a assinatura.");
        }
      }
    } catch (e) {
      console.error("OCR cupom error:", e);
      toast.error("Erro ao processar cupom. Preencha a data manualmente.");
    } finally {
      setCupomOcrLoading(false);
    }
  };

  // ═══ UPLOAD + SAVE ═══
  const uploadFile = async (file: File, folder: string): Promise<string> => {
    const ext = file.name.split(".").pop();
    const path = `pacientes/${paciente.id}/${folder}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("documentos").upload(path, file);
    if (error) throw error;
    const { data } = supabase.storage.from("documentos").getPublicUrl(path);
    return data.publicUrl;
  };


  const copyReusableDocument = async (doc: any, finalCicloId: string, folder: string, extraData: Record<string, any> = {}) => {
    if (!doc?.arquivo_url) return null;
    let copiedUrl = doc.arquivo_url;
    try {
      const response = await fetch(doc.arquivo_url);
      if (response.ok) {
        const blob = await response.blob();
        const cleanUrl = String(doc.arquivo_url).split("?")[0];
        const ext = cleanUrl.includes(".") ? cleanUrl.split(".").pop() || "jpg" : "jpg";
        const path = `pacientes/${paciente.id}/ciclo_${finalCicloId}/${folder}_reutilizado_${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from("documentos").upload(path, blob, { contentType: blob.type || "application/octet-stream" });
        if (!error) {
          const { data } = supabase.storage.from("documentos").getPublicUrl(path);
          copiedUrl = data.publicUrl;
        }
      }
    } catch (error) {
      console.warn("Falha ao copiar arquivo físico; mantendo URL original como referência.", error);
    }

    const dadosExtraidos = {
      ...((doc.dados_extraidos as any) || {}),
      ...extraData,
      reutilizado: true,
      documento_origem_id: doc.id,
    };

    const { data, error } = await supabase.from("documentos").insert({
      paciente_id: paciente.id,
      ciclo_id: finalCicloId,
      tipo: doc.tipo,
      arquivo_url: copiedUrl,
      validade_ate: doc.validade_ate,
      uploaded_by: user?.id,
      dados_extraidos: dadosExtraidos,
    }).select().single();

    if (error) throw new Error(`Erro ao reutilizar documento ${doc.tipo}: ${error.message}`);
    return data;
  };

  const handleSave = async () => {
    if (savingRef.current) return;
    if (needsReceita && (!receitaFile || !dataEmissao)) { toast.error("Dados da receita incompletos."); return; }
    if (!docPacienteFile && !canReusePacienteDoc) { toast.error("Documento do paciente obrigatório."); return; }
    if (!cupomFile) { toast.error("Cupom fiscal obrigatório."); return; }
    if (tipoRetirada === "representante") {
      if (!repDocFile && !canReuseRepDoc) { toast.error("Documento do representante obrigatório."); return; }
      if (!procuracaoFile && !canReuseProcuracao) { toast.error("Procuração obrigatória."); return; }
      if (!repCpfValid) { toast.error("CPF do representante inválido."); return; }
      if (repNameMatchesPatient) { toast.error("Nome do representante não pode ser igual ao do paciente."); return; }
    }
    if (!cupomDataCompra) { toast.error("Informe a data da dispensação."); return; }
    if (isFutureDateStr(cupomDataCompra)) {
      toast.error(`A data da dispensação não pode ser futura. Hoje é ${formatDateBR(getTodayLocalDateStr())}.`);
      return;
    }

    savingRef.current = true;
    setSaving(true);
    try {
      let finalCicloId = cicloId;

      // ═══ Validate max 2 cycles per type ═══
      if (needsReceita) {
        const { data: existingCycles } = await supabase
          .from("ciclos")
          .select("id, receita_id, receitas(tipo)")
          .eq("paciente_id", paciente.id)
          .eq("status", "ativo");

        const sameTypeCycles = (existingCycles || []).filter((c: any) =>
          (c.receitas as any)?.tipo === tipoReceita
        );
        if (sameTypeCycles.length >= 2) {
          toast.error(`Limite de 2 ciclos ativos de ${CATEGORY_CONFIG[tipoReceita].label} atingido. Encerre um ciclo antes de registrar outra receita.`);
          savingRef.current = false;
          setSaving(false);
          return;
        }
      }

      // ═══ 1. Create receita + ciclo if needed ═══
      if (needsReceita && receitaFile) {
        // Upload receita
        const recUrl = await uploadFile(receitaFile, "receita");

        // Calc dates
        const validadeStr = addDaysToDateStr(dataEmissao, 180);
        const intervalo = storedIntervalFor(tipoReceita);
        const dataRetiradaReal = cupomDataCompra || (() => {
          const today = new Date();
          return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        })();
        // Sem migration: ciclos.data_inicio representa a primeira retirada real.
        // receitas.data_emissao preserva a emissão da receita.
        const dataInicioStr = dataRetiradaReal;
        const limiteMaximo = calculateCycleLimit({
          tipoReceita,
          dataInicio: dataInicioStr,
          dataFim: validadeStr,
          primeiraRetirada: dataInicioStr,
          intervaloDias: intervalo,
        });

        // Create receita
        const { data: receita, error: recErr } = await supabase.from("receitas").insert({
          paciente_id: paciente.id, arquivo_url: recUrl, data_emissao: dataEmissao,
          validade_ate: validadeStr, nome_medico: null,
          uploaded_by: user?.id, tipo: tipoReceita, operador_id: null,
        }).select().single();
        if (recErr || !receita) throw new Error(recErr?.message ? `Erro ao criar receita: ${recErr.message}` : "Erro ao criar receita.");

        // Create ciclo - already with 1st dispensation counted
        const { data: cicloData, error: cicloErr } = await supabase.from("ciclos").insert({
          paciente_id: paciente.id, receita_id: receita.id, data_inicio: dataInicioStr,
          data_fim: validadeStr, intervalo_dias: intervalo, limite_maximo: limiteMaximo,
          total_dispensacoes: 1, ultima_retirada: dataRetiradaReal,
        }).select().single();
        if (cicloErr || !cicloData) throw new Error("Erro ao criar ciclo.");
        finalCicloId = cicloData.id;
      }

      if (!finalCicloId) throw new Error("Ciclo não identificado.");

      // Use coupon date as the actual dispensation/withdrawal date
      const dataRetirada = cupomDataCompra || (() => {
        const today = new Date();
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      })();

      // ═══ 2. Upload documents ═══
      const validade10y = new Date(); validade10y.setFullYear(validade10y.getFullYear() + 10);

      // Dispensation number for folder organization
      const dispensacaoNumero = 1;

      // Save receita extra photos
      for (let i = 0; i < (extraPhotos["receita"] || []).length; i++) {
        const ep = (extraPhotos["receita"] || [])[i];
        const epUrl = await uploadFile(ep.file, `disp_${dispensacaoNumero}/receita_extra_${i + 1}`);
        const { error: recExErr } = await supabase.from("documentos").insert({
          paciente_id: paciente.id, ciclo_id: finalCicloId, tipo: "receita",
          arquivo_url: epUrl, validade_ate: validade10y.toISOString(), uploaded_by: user?.id,
          dados_extraidos: { pagina: i + 2, dispensacao_numero: dispensacaoNumero },
        });
        if (recExErr) console.error("Erro ao salvar receita extra:", recExErr.message);
      }

      // Save or reuse identity document
      if (canReusePacienteDoc && reusablePacienteDoc && !docPacienteFile) {
        await copyReusableDocument(reusablePacienteDoc, finalCicloId, `disp_${dispensacaoNumero}/identidade`, {
          foto_modo: "reutilizado_ciclo_anterior",
          tipo_retirada: tipoRetirada,
          dispensacao_numero: dispensacaoNumero,
        });
      } else if (docPacienteFile) {
        const docUrl = await uploadFile(docPacienteFile, `disp_${dispensacaoNumero}/identidade`);
        const { error: docErr } = await supabase.from("documentos").insert({
          paciente_id: paciente.id, ciclo_id: finalCicloId, tipo: "identidade",
          arquivo_url: docUrl, validade_ate: validade10y.toISOString(), uploaded_by: user?.id,
          dados_extraidos: { foto_modo: "setup_inicial", tipo_retirada: tipoRetirada, dispensacao_numero: dispensacaoNumero },
        });
        if (docErr) throw new Error("Erro ao salvar identidade: " + docErr.message);

        // Upload extra photos for doc_paciente
        for (let i = 0; i < (extraPhotos["docPaciente"] || []).length; i++) {
          const ep = (extraPhotos["docPaciente"] || [])[i];
          const epUrl = await uploadFile(ep.file, `disp_${dispensacaoNumero}/identidade_extra_${i + 1}`);
          const { error: epErr } = await supabase.from("documentos").insert({
            paciente_id: paciente.id, ciclo_id: finalCicloId, tipo: "identidade",
            arquivo_url: epUrl, validade_ate: validade10y.toISOString(), uploaded_by: user?.id,
            dados_extraidos: { pagina: i + 2, dispensacao_numero: dispensacaoNumero },
          });
          if (epErr) console.error("Erro ao salvar identidade extra:", epErr.message);
        }
      }

      let docRepresentanteId: string | null = null;
      let procuracaoId: string | null = null;

      if (tipoRetirada === "representante") {
        if (repDocFile) {
          const repUrl = await uploadFile(repDocFile, `disp_${dispensacaoNumero}/rep_doc`);
          const { data: repDocData, error: repErr } = await supabase.from("documentos").insert({
            paciente_id: paciente.id, ciclo_id: finalCicloId, tipo: "doc_representante",
            arquivo_url: repUrl, validade_ate: validade10y.toISOString(), uploaded_by: user?.id,
            dados_extraidos: { nome: repNome, cpf: repCpf, dispensacao_numero: dispensacaoNumero },
          }).select().single();
          if (repErr) throw new Error("Erro ao salvar doc representante: " + repErr.message);
          if (repDocData) docRepresentanteId = repDocData.id;

          for (let i = 0; i < (extraPhotos["repDoc"] || []).length; i++) {
            const ep = (extraPhotos["repDoc"] || [])[i];
            const epUrl = await uploadFile(ep.file, `disp_${dispensacaoNumero}/rep_doc_extra_${i + 1}`);
            const { error: repExErr } = await supabase.from("documentos").insert({
              paciente_id: paciente.id, ciclo_id: finalCicloId, tipo: "doc_representante",
              arquivo_url: epUrl, validade_ate: validade10y.toISOString(), uploaded_by: user?.id,
              dados_extraidos: { pagina: i + 2, dispensacao_numero: dispensacaoNumero },
            });
            if (repExErr) console.error("Erro ao salvar rep extra:", repExErr.message);
          }
        } else if (canReuseRepDoc && reusableRepDoc) {
          const copied = await copyReusableDocument(reusableRepDoc, finalCicloId, `disp_${dispensacaoNumero}/rep_doc`, {
            nome: repNome,
            cpf: repCpf,
            dispensacao_numero: dispensacaoNumero,
          });
          docRepresentanteId = copied?.id ?? null;
        }

        if (procuracaoFile) {
          const procUrl = await uploadFile(procuracaoFile, `disp_${dispensacaoNumero}/procuracao`);
          const procVal = new Date();
          if (procuracaoIndeterminada) procVal.setFullYear(procVal.getFullYear() + 10);
          else if (procuracaoValidade) procVal.setTime(new Date(procuracaoValidade + "T23:59:59").getTime());
          else procVal.setFullYear(procVal.getFullYear() + 1);

          const { data: procData, error: procErr } = await supabase.from("documentos").insert({
            paciente_id: paciente.id, ciclo_id: finalCicloId, tipo: "procuracao",
            arquivo_url: procUrl, validade_ate: procVal.toISOString(), uploaded_by: user?.id,
            dados_extraidos: { representante_nome: repNome, representante_cpf: repCpf, data_emissao: procuracaoEmissao || null, data_validade: procuracaoValidade || null, indeterminada: procuracaoIndeterminada, dispensacao_numero: dispensacaoNumero },
          }).select().single();
          if (procErr) throw new Error("Erro ao salvar procuração: " + procErr.message);
          if (procData) procuracaoId = procData.id;

          for (let i = 0; i < (extraPhotos["procuracao"] || []).length; i++) {
            const ep = (extraPhotos["procuracao"] || [])[i];
            const epUrl = await uploadFile(ep.file, `disp_${dispensacaoNumero}/procuracao_extra_${i + 1}`);
            const { error: procExErr } = await supabase.from("documentos").insert({
              paciente_id: paciente.id, ciclo_id: finalCicloId, tipo: "procuracao",
              arquivo_url: epUrl, validade_ate: procVal.toISOString(), uploaded_by: user?.id,
              dados_extraidos: { pagina: i + 2, dispensacao_numero: dispensacaoNumero },
            });
            if (procExErr) console.error("Erro ao salvar procuração extra:", procExErr.message);
          }
        } else if (canReuseProcuracao && reusableProcuracao) {
          const copied = await copyReusableDocument(reusableProcuracao, finalCicloId, `disp_${dispensacaoNumero}/procuracao`, {
            representante_nome: repNome,
            representante_cpf: repCpf,
            dispensacao_numero: dispensacaoNumero,
          });
          procuracaoId = copied?.id ?? null;
        }
      }

      // ═══ 3. Upload cupom fiscal ═══
      const cupomUrl = await uploadFile(cupomFile!, `disp_${dispensacaoNumero}/cupom_fiscal`);
      const cupomValidade = new Date();
      cupomValidade.setMonth(cupomValidade.getMonth() + 1);
      const { error: cupomErr } = await supabase.from("documentos").insert({
        paciente_id: paciente.id, ciclo_id: finalCicloId, tipo: "cupom_fiscal",
        arquivo_url: cupomUrl, validade_ate: cupomValidade.toISOString(), uploaded_by: user?.id,
        dados_extraidos: { dispensacao_numero: dispensacaoNumero },
      });
      if (cupomErr) throw new Error("Erro ao salvar cupom fiscal: " + cupomErr.message);

      // Upload cupom fiscal QR code
      if (cupomQrFile) {
        const cupomQrUrl = await uploadFile(cupomQrFile, `disp_${dispensacaoNumero}/cupom_fiscal_qr`);
        await supabase.from("documentos").insert({
          paciente_id: paciente.id, ciclo_id: finalCicloId, tipo: "cupom_fiscal",
          arquivo_url: cupomQrUrl, validade_ate: cupomValidade.toISOString(), uploaded_by: user?.id,
          dados_extraidos: { subtipo: "qr_code", dispensacao_numero: dispensacaoNumero },
        });
      }

      // Upload extra cupom photos
      for (let i = 0; i < (extraPhotos["cupom"] || []).length; i++) {
        const ep = (extraPhotos["cupom"] || [])[i];
        const epUrl = await uploadFile(ep.file, `disp_${dispensacaoNumero}/cupom_fiscal_extra_${i + 1}`);
        const { error: cupExErr } = await supabase.from("documentos").insert({
          paciente_id: paciente.id, ciclo_id: finalCicloId, tipo: "cupom_fiscal",
          arquivo_url: epUrl, validade_ate: cupomValidade.toISOString(), uploaded_by: user?.id,
          dados_extraidos: { pagina: i + 2, dispensacao_numero: dispensacaoNumero },
        });
        if (cupExErr) console.error("Erro ao salvar cupom extra:", cupExErr.message);
      }

      // ═══ 4. Register first dispensation ═══
      await supabase.from("dispensacoes").insert({
        ciclo_id: finalCicloId, paciente_id: paciente.id, tipo_retirada: tipoRetirada!,
        registrada_por: user!.id,
        operador_id: null,
        data_dispensacao_real: dataRetirada,
        documento_representante_id: tipoRetirada === "representante" ? docRepresentanteId : null,
        procuracao_id: tipoRetirada === "representante" ? procuracaoId : null,
        snapshot_ciclo: {
          total_dispensacoes: 0, ultima_retirada: null,
          data_registro: dataRetirada,
          operador_id: operadorId, operador_nome: operadorNome,
          representante: tipoRetirada === "representante" ? { nome: repNome, cpf: repCpf } : null,
          cupom_fiscal_url: cupomUrl,
        },
      });

      // If existing ciclo (not new), update its counters too
      if (!needsReceita && finalCicloId) {
        await supabase.from("ciclos").update({
          total_dispensacoes: 1, ultima_retirada: dataRetirada,
        }).eq("id", finalCicloId);
      }

      // ═══ 5. Log ═══
      await supabase.from("logs").insert([{
        user_id: user?.id, acao: needsReceita ? "nova_receita_setup_completo" : "setup_ciclo_documentos",
        detalhes: {
          paciente_id: paciente.id, ciclo_id: finalCicloId, tipo_retirada: tipoRetirada,
          dispensacao_registrada: true, dispensacao_numero: dispensacaoNumero,
          operador_id: operadorId, operador_nome: operadorNome,
          representante: tipoRetirada === "representante" ? { nome: repNome, cpf: repCpf } : null,
        } as any,
      }]);

      toast.success("Ciclo configurado e 1ª dispensação registrada!");
      onComplete();
    } catch (err: any) {
      toast.error("Erro: " + (err.message || "Falha ao salvar"));
    } finally { savingRef.current = false; setSaving(false); }
  };

  // ═══ STEP CONFIG ═══
  const stepConfig: Record<string, { label: string; icon: React.ElementType }> = {
    operador: { label: "Operador", icon: User },
    receita: { label: "Receita", icon: FileText },
    tipo_retirada: { label: "Tipo", icon: Users },
    doc_paciente: { label: "Doc. Paciente", icon: FileText },
    doc_representante: { label: "Representante", icon: User },
    procuracao: { label: "Procuração", icon: FileText },
    cupom_fiscal: { label: "Cupom Fiscal", icon: Receipt },
    resumo: { label: "Confirmar", icon: Shield },
  };

  // ═══ UPLOAD AREA WITH PREVIEW + EXTRA PHOTOS ═══
  const handleExtraFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) addExtraPhoto(cameraTarget, f);
    if (e.target) e.target.value = "";
  };

  const renderUploadArea = (
    label: string, preview: string | null,
    fileRef: React.RefObject<HTMLInputElement>, cameraId: string,
    onReset: () => void, extraContent?: React.ReactNode
  ) => {
    const sectionExtras = extraPhotos[cameraId] || [];
    return (
      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wider">{label}</Label>
        {!preview ? (
          <div className={galeriaFotos.length > 0 ? "grid grid-cols-3 gap-2" : "grid grid-cols-2 gap-2"}>
            {galeriaFotos.length > 0 && (
              <Button type="button" variant="outline"
                className="h-20 border-dashed border-2 flex flex-col gap-2 rounded-xl hover:border-primary/50 hover:bg-primary/5 transition-all border-blue-400/50 bg-blue-500/5"
                onClick={() => openGallery(cameraId)}>
                <Image className="w-6 h-6 text-blue-500" />
                <span className="text-xs font-medium text-blue-600">Galeria ({galeriaFotos.length})</span>
              </Button>
            )}
            <Button type="button" variant="outline"
              className="h-20 border-dashed border-2 flex flex-col gap-2 rounded-xl hover:border-primary/50 hover:bg-primary/5 transition-all"
              onClick={() => openCamera(cameraId)}>
              <Camera className="w-6 h-6 text-muted-foreground" />
              <span className="text-xs font-medium">Tirar Foto</span>
            </Button>
            <Button type="button" variant="outline"
              className="h-20 border-dashed border-2 flex flex-col gap-2 rounded-xl hover:border-primary/50 hover:bg-primary/5 transition-all"
              onClick={() => fileRef.current?.click()}>
              <Upload className="w-6 h-6 text-muted-foreground" />
              <span className="text-xs font-medium">Anexar</span>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="relative rounded-xl overflow-hidden border bg-muted/20">
              <img src={preview} alt={label} className="w-full max-h-64 object-contain p-2" />
              <div className="absolute top-2 right-2">
                <div className="bg-background/90 rounded-full p-1.5 shadow-sm">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                </div>
              </div>
              <div className="p-2 border-t bg-muted/30 flex items-center gap-2">
                <Button variant="ghost" size="sm" className="rounded-lg text-xs" onClick={() => setViewingImage(preview)}>
                  <Eye className="w-3.5 h-3.5 mr-1" /> Visualizar
                </Button>
                <Button variant="ghost" size="sm" className="rounded-lg text-xs" onClick={() => {
                  onReset();
                  setExtraPhotos(prev => { const n = { ...prev }; delete n[cameraId]; return n; });
                }}>
                  🔄 Trocar
                </Button>
              </div>
              {extraContent}
            </div>

            {/* Extra photos thumbnails */}
            {sectionExtras.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {sectionExtras.map((ep, i) => (
                  <div key={i} className="relative group">
                    <img src={ep.preview} alt={`Foto ${i + 2}`} className="w-20 h-16 object-cover rounded-lg border" />
                    <button type="button" onClick={() => removeExtraPhoto(cameraId, i)}
                      className="absolute -top-1.5 -right-1.5 bg-destructive text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* + buttons */}
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => openCameraExtra(cameraId)}>
                <Plus className="w-4 h-4 mr-1" /> Mais Foto
              </Button>
              <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => { setCameraTarget(cameraId); extraFileRef.current?.click(); }}>
                <Plus className="w-4 h-4 mr-1" /> Anexar Mais
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <CameraCapture open={showCamera} stream={cameraStream} onCapture={handleCameraCapture} onClose={() => closeCamera()} title="Tirar Foto do Documento" />

      {/* Gallery Picker */}
      <GalleryPicker
        open={showGalleryPicker}
        fotos={galeriaFotos}
        loading={galeriaLoading}
        onSelect={handleGallerySelect}
        onClose={() => setShowGalleryPicker(false)}
        title="Selecionar da Galeria"
      />

      {/* Image viewer with zoom & B&W */}
      <ImageViewer url={viewingImage} onClose={() => setViewingImage(null)} />

      {/* Hidden file inputs */}
      <input ref={receitaRef} type="file" accept="image/*,.pdf" className="hidden"
        onChange={handleFileSelect(setReceitaFile, setReceitaPreview, "receita")} />
      <input ref={docPacienteRef} type="file" accept="image/*,.pdf" className="hidden"
        onChange={handleFileSelect(setDocPacienteFile, setDocPacientePreview, "paciente")} />
      <input ref={repDocRef} type="file" accept="image/*,.pdf" className="hidden"
        onChange={handleFileSelect(setRepDocFile, setRepDocPreview, "representante")} />
      <input ref={procuracaoRef} type="file" accept="image/*,.pdf" className="hidden"
        onChange={handleFileSelect(setProcuracaoFile, setProcuracaoPreview)} />
      <input ref={cupomRef} type="file" accept="image/*,.pdf" className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]; if (!f) return;
          setCupomFile(f); setCupomDatasConfirmadas(false); setCupomDataCompra(null); setCupomDataProxima(null);
          const reader = new FileReader();
          reader.onload = (ev) => { const dataUrl = ev.target?.result as string; setCupomPreview(dataUrl); runCupomOcr(dataUrl.split(",")[1]); };
          reader.readAsDataURL(f);
        }} />
      <input ref={extraFileRef} type="file" accept="image/*,.pdf" className="hidden"
        onChange={handleExtraFileInput} />

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-[2rem] border border-primary/20 bg-white shadow-sm flex flex-col">
        <div className="p-4 sm:p-6 pb-0 space-y-4">
        {/* Header */}
        <div className="text-center space-y-1">
          <Shield className="w-8 h-8 mx-auto text-primary" />
          <h4 className="text-base font-bold text-primary" style={{ fontFamily: "var(--font-display)" }}>
            {needsReceita ? "Novo Ciclo — Setup Completo" : "Setup Inicial do Ciclo"}
          </h4>
          <p className="text-xs text-muted-foreground">
            {needsReceita ? "Registre a receita, documentação e cupom fiscal para iniciar o ciclo." : "Configure a documentação obrigatória e registre a 1ª dispensação."}
          </p>
        </div>

        {needsReceita && reusableDocs.length > 0 && (
          <div className="rounded-2xl border border-primary/20 bg-white/85 p-3 shadow-sm space-y-2">
            <div className="flex items-start gap-3">
              <Checkbox checked={reuseDocs} onCheckedChange={(checked) => setReuseDocs(!!checked)} className="mt-1" />
              <div className="space-y-1 flex-1">
                <p className="text-sm font-bold text-foreground">Reutilizar documentos válidos do ciclo anterior</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  O sistema copia apenas documentos do paciente, documento do representante, declaração/procuração. Receita e cupom fiscal continuam obrigatórios e não são reutilizados.
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {reusablePacienteDoc && <Badge variant="secondary" className="rounded-full">Documento do paciente</Badge>}
                  {reusableRepDoc && <Badge variant="secondary" className="rounded-full">Doc. representante</Badge>}
                  {reusableProcuracao && <Badge variant="secondary" className="rounded-full">Procuração/declaração</Badge>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-0.5 flex-wrap">
          {steps.map((s, i) => {
            const cfg = stepConfig[s];
            const Icon = cfg.icon;
            const done = i < currentStepIndex;
            const active = i === currentStepIndex;
            return (
              <div key={s} className="flex items-center">
                <div className={`flex items-center gap-1 px-1.5 py-1 rounded-lg text-[10px] transition-all ${
                  done ? "bg-primary/15 text-primary" :
                  active ? "bg-primary text-primary-foreground shadow-md" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {done ? <CheckCircle className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
                  <span className="font-medium hidden sm:inline">{cfg.label}</span>
                </div>
                {i < steps.length - 1 && <div className={`w-3 h-[2px] mx-0.5 rounded ${done ? "bg-primary" : "bg-border"}`} />}
              </div>
            );
          })}
        </div>
        </div>

        {/* Scrollable Content */}
        <div className="px-4 sm:px-6 py-4 sm:py-5 space-y-5">
        <AnimatePresence mode="wait">
          <motion.div key={currentStep} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.15 }} className="min-h-[320px]">

            {/* Operador step removed - using logged-in user */}

            {/* ═══ TELA: RECEITA ═══ */}
            {currentStep === "receita" && (
              <div className="space-y-4">
                <div className="text-center space-y-1">
                  <p className="text-sm font-semibold">📋 Receita Médica</p>
                  <p className="text-xs text-muted-foreground">Envie a foto da receita para preenchimento automático.</p>
                </div>

                {renderUploadArea("📷 Foto da Receita *", receitaPreview, receitaRef, "receita",
                  () => { setReceitaPreview(null); setReceitaFile(null); setOcrReceitaStatus("idle"); setOcrReceitaDetails([]); },
                  <>
                    {ocrReceitaLoading && (
                      <div className="px-3 pb-2 flex items-center gap-2 text-xs text-primary">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Processando receita...
                      </div>
                    )}
                    {ocrReceitaDetails.length > 0 && (
                      <div className="mx-3 mb-3 p-2.5 rounded-xl bg-muted/50 text-xs space-y-0.5">
                        <p className="font-semibold mb-1">Resultado da leitura:</p>
                        {ocrReceitaDetails.map((d, i) => <p key={i}>{d}</p>)}
                      </div>
                    )}
                  </>
                )}

                {/* Tipo */}
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Tipo de Receita</Label>
                  <Select value={tipoReceita} onValueChange={(v) => setTipoReceita(v as any)}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIAS.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {CATEGORY_CONFIG[cat].emoji} {CATEGORY_CONFIG[cat].label} ({CATEGORY_CONFIG[cat].effectiveIntervalDays} dias)
                        </SelectItem>
                      ))}

                    </SelectContent>
                  </Select>
                </div>

                {/* Data Emissão */}
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Data de Emissão *</Label>
                  <Input type="date" value={dataEmissao} onChange={(e) => setDataEmissao(e.target.value)} className="rounded-xl" />
                  {dataEmissao && (getReceitaVencida() ? (
                    <div className="p-2 rounded-lg bg-destructive/10 border border-destructive/30">
                      <p className="text-xs text-destructive font-semibold">🚫 Receita VENCIDA!</p>
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Validade: {formatDateBR((() => {
                        const d = new Date(dataEmissao + "T00:00:00");
                        d.setDate(d.getDate() + 180);
                        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                      })())} (180 dias)
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* ═══ TELA: TIPO RETIRADA ═══ */}
            {currentStep === "tipo_retirada" && (
              <div className="space-y-4">
                <div className="text-center">
                  <p className="text-sm font-semibold mb-1">Quem realizará a retirada?</p>
                  <p className="text-xs text-muted-foreground">Selecione o responsável pelas dispensações.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {([
                    { value: "proprio" as TipoRetirada, label: "Próprio Paciente", desc: "O paciente retira pessoalmente", icon: User,
                      docs: ["Identidade do paciente", "Cupom fiscal"] },
                    { value: "representante" as TipoRetirada, label: "Responsável Legal", desc: "Terceiro autorizado", icon: Users,
                      docs: ["Identidade do paciente", "Identidade do representante", "Procuração", "Cupom fiscal"] },
                  ]).map(opt => (
                    <motion.button key={opt.value} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                      onClick={() => { setTipoRetirada(opt.value); setCurrentStepIndex(currentStepIndex); }}
                      className={`p-4 rounded-2xl border-2 text-left transition-all space-y-2 ${
                        tipoRetirada === opt.value ? "border-primary bg-primary/5 shadow-md" : "border-border/50 hover:border-primary/30"
                      }`}>
                      <div className="flex items-center gap-2">
                        <opt.icon className={`w-6 h-6 ${tipoRetirada === opt.value ? "text-primary" : "text-muted-foreground"}`} />
                        <span className="font-bold text-sm">{opt.label}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{opt.desc}</p>
                      <div className="pt-1 border-t border-border/30 space-y-0.5">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Documentos obrigatórios:</p>
                        {opt.docs.map((d, i) => <p key={i} className="text-[11px] text-muted-foreground">• {d}</p>)}
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {/* ═══ TELA: DOC PACIENTE ═══ */}
            {currentStep === "doc_paciente" && (
              <div className="space-y-4">
                <div className="text-center space-y-1">
                  <p className="text-sm font-semibold">👤 Dados do Paciente</p>
                  <p className="text-xs text-muted-foreground">Preencha os dados e envie a identidade do paciente.</p>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Nome Completo *</Label>
                    <Input value={paciente.nome} disabled className="rounded-xl bg-muted/50" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">CPF *</Label>
                    <Input value={formatCpfMask(paciente.cpf)} disabled className="font-mono rounded-xl bg-muted/50" />
                  </div>
                </div>
                {renderUploadArea("🪪 IDENTIDADE DO PACIENTE *", docPacientePreview, docPacienteRef, "docPaciente",
                  () => { setDocPacientePreview(null); setDocPacienteFile(null); setOcrPacDetails([]); },
                  <>
                    {ocrPacLoading && <div className="px-3 pb-2 flex items-center gap-2 text-xs text-primary"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Lendo documento...</div>}
                    {ocrPacDetails.length > 0 && (
                      <div className="mx-3 mb-3 p-2.5 rounded-xl bg-muted/50 text-xs space-y-0.5">
                        <p className="font-semibold mb-1">Dados extraídos:</p>
                        {ocrPacDetails.map((d, i) => <p key={i}>{d}</p>)}
                      </div>
                    )}
                  </>
                )}
                <div className="p-3 rounded-xl bg-muted/40 border border-border space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Checklist:</p>
                  {[
                    { ok: !!paciente.nome, label: "Nome preenchido" },
                    { ok: !!paciente.cpf && paciente.cpf.replace(/\D/g, "").length === 11, label: "CPF válido" },
                    { ok: !!docPacienteFile || canReusePacienteDoc, label: canReusePacienteDoc && !docPacienteFile ? "Identidade reutilizada" : "Identidade anexada" },
                  ].map((item, i) => (
                    <p key={i} className={`text-xs flex items-center gap-1.5 ${item.ok ? "text-green-600" : "text-muted-foreground"}`}>
                      {item.ok ? "✅" : "⬜"} {item.label}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* ═══ TELA: DOC REPRESENTANTE ═══ */}
            {currentStep === "doc_representante" && (
              <div className="space-y-4">
                <div className="text-center space-y-1">
                  <p className="text-sm font-semibold">👤 Dados do Representante Legal</p>
                  <p className="text-xs text-muted-foreground">Preencha os dados e envie a identidade do representante.</p>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Nome Completo *</Label>
                    <Input value={repNome} onChange={(e) => setRepNome(e.target.value)} placeholder="Nome completo" className="rounded-xl" />
                    {repNameMatchesPatient && repNome.trim().length > 0 && (
                      <p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Nome igual ao do paciente.</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">CPF *</Label>
                    <Input value={formatCpfMask(repCpf)} onChange={(e) => setRepCpf(e.target.value.replace(/\D/g, "").slice(0, 11))}
                      placeholder="000.000.000-00" className="font-mono rounded-xl" />
                    {repCpfClean.length === 11 && !repCpfValid && (
                      <p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> CPF inválido.</p>
                    )}
                    {repCpfClean.length > 0 && repCpfClean.length < 11 && (
                      <p className="text-xs text-muted-foreground">{repCpfClean.length}/11 dígitos</p>
                    )}
                  </div>
                </div>
                {renderUploadArea("🪪 Identidade do Representante *", repDocPreview, repDocRef, "repDoc",
                  () => { setRepDocPreview(null); setRepDocFile(null); setOcrRepDetails([]); },
                  <>
                    {ocrRepLoading && <div className="px-3 pb-2 flex items-center gap-2 text-xs text-primary"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Lendo...</div>}
                    {ocrRepDetails.length > 0 && (
                      <div className="mx-3 mb-3 p-2.5 rounded-xl bg-muted/50 text-xs space-y-0.5">
                        <p className="font-semibold mb-1">Dados extraídos:</p>
                        {ocrRepDetails.map((d, i) => <p key={i}>{d}</p>)}
                      </div>
                    )}
                  </>
                )}
                <div className="p-3 rounded-xl bg-muted/40 border border-border space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Checklist:</p>
                  {[
                    { ok: repNome.trim().length > 0 && !repNameMatchesPatient, label: "Nome preenchido" },
                    { ok: repCpfValid, label: "CPF válido" },
                    { ok: !!repDocFile || canReuseRepDoc, label: canReuseRepDoc && !repDocFile ? "Identidade reutilizada" : "Identidade anexada" },
                  ].map((item, i) => (
                    <p key={i} className={`text-xs flex items-center gap-1.5 ${item.ok ? "text-green-600" : "text-muted-foreground"}`}>
                      {item.ok ? "✅" : "⬜"} {item.label}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* ═══ TELA: PROCURAÇÃO ═══ */}
            {currentStep === "procuracao" && (
              <div className="space-y-4">
                <div className="text-center space-y-1">
                  <p className="text-sm font-semibold">📋 Procuração</p>
                  <p className="text-xs text-muted-foreground">Envie a procuração que autoriza a retirada e informe as datas.</p>
                </div>
                {renderUploadArea("📋 Procuração *", procuracaoPreview, procuracaoRef, "procuracao",
                  () => { setProcuracaoPreview(null); setProcuracaoFile(null); }
                )}

                <div className="p-3 rounded-xl bg-muted/40 border border-border space-y-3">
                  <div className="flex items-center gap-2">
                    <Checkbox checked={procuracaoIndeterminada} onCheckedChange={(c) => {
                      setProcuracaoIndeterminada(!!c);
                      if (c) { setProcuracaoEmissao(""); setProcuracaoValidade(""); }
                    }} />
                    <span className="text-xs font-medium">Validade indeterminada (sem datas)</span>
                  </div>
                  {!procuracaoIndeterminada && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Data de Emissão *</Label>
                        <Input type="date" value={procuracaoEmissao} onChange={(e) => setProcuracaoEmissao(e.target.value)} className="rounded-xl text-sm" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Data de Validade *</Label>
                        <Input type="date" value={procuracaoValidade} onChange={(e) => setProcuracaoValidade(e.target.value)} className="rounded-xl text-sm" />
                        {procuracaoValidade && new Date(procuracaoValidade + "T23:59:59") < new Date() && (
                          <p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Procuração vencida!</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-3 rounded-xl bg-muted/40 border border-border space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Checklist:</p>
                  {[
                    { ok: !!procuracaoFile || canReuseProcuracao, label: canReuseProcuracao && !procuracaoFile ? "Procuração reutilizada" : "Procuração anexada" },
                    { ok: canReuseProcuracao || procuracaoIndeterminada || (!!procuracaoEmissao && !!procuracaoValidade), label: canReuseProcuracao && !procuracaoFile ? "Datas herdadas do documento anterior" : "Datas preenchidas ou indeterminada" },
                  ].map((item, i) => (
                    <p key={i} className={`text-xs flex items-center gap-1.5 ${item.ok ? "text-green-600" : "text-muted-foreground"}`}>
                      {item.ok ? "✅" : "⬜"} {item.label}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* ═══ TELA: CUPOM FISCAL ═══ */}
            {currentStep === "cupom_fiscal" && (
              <div className="space-y-4">
                <div className="text-center space-y-1">
                  <Receipt className="w-7 h-7 mx-auto text-primary" />
                  <p className="text-sm font-semibold">🧾 Cupom Fiscal</p>
                  <p className="text-xs text-muted-foreground">Envie o cupom fiscal assinado referente à 1ª retirada.</p>
                </div>

                {/* Pergunta: Dispensado hoje? */}
                <div className="p-3 rounded-xl border-2 border-primary/30 bg-primary/5 space-y-3">
                  <p className="text-sm font-semibold text-center">A dispensação foi realizada hoje?</p>
                  <div className="flex gap-2">
                    <Button type="button" variant={dispensadoHoje === true ? "default" : "outline"}
                      className="flex-1 rounded-xl" onClick={() => {
                        setDispensadoHoje(true);
                        const d = new Date();
                        const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                        setCupomDataCompra(todayStr);
                        setCupomDatasConfirmadas(false);
                      }}>
                      ✅ Sim, hoje
                    </Button>
                    <Button type="button" variant={dispensadoHoje === false ? "default" : "outline"}
                      className="flex-1 rounded-xl" onClick={() => {
                        setDispensadoHoje(false);
                        setCupomDataCompra(null);
                        setCupomDatasConfirmadas(false);
                      }}>
                      ❌ Não, outra data
                    </Button>
                  </div>
                </div>

                {/* Se NÃO foi hoje: input manual */}
                {dispensadoHoje === false && (
                  <div className="p-3 rounded-xl border border-amber-300 bg-amber-50 space-y-2">
                    <Label className="text-xs font-semibold text-amber-800">📅 Informe a data da dispensação:</Label>
                    <Input type="date" value={cupomDataCompra || ""}
                      onChange={(e) => { setCupomDataCompra(e.target.value); setCupomDatasConfirmadas(false); }}
                      className="rounded-xl text-sm" />
                    {cupomDataCompra && dataEmissao && cupomDataCompra < dataEmissao && (
                      <div className="p-2 rounded-lg bg-destructive/10 border border-destructive/30">
                        <p className="text-xs text-destructive font-semibold">🚫 Data anterior à emissão da receita ({formatDateBR(dataEmissao)})!</p>
                      </div>
                    )}
                    {cupomDataCompra && !(cupomDataCompra < dataEmissao) && (
                      <p className="text-xs text-muted-foreground">
                        Próxima retirada calculada: <strong>{(() => {
                          const [y, m, dd] = cupomDataCompra.split("-").map(Number);
                          const intervalo = storedIntervalFor(tipoReceita);
                          const next = new Date(y, m - 1, dd);
                          next.setDate(next.getDate() + intervalo + 1);
                          return next.toLocaleDateString("pt-BR");
                        })()}</strong>
                      </p>
                    )}
                  </div>
                )}

                {/* Se SIM: mostra data de hoje e próxima */}
                {dispensadoHoje === true && cupomDataCompra && (
                  <div className="p-3 rounded-xl border border-green-200 bg-green-50 space-y-1">
                    <p className="text-xs text-green-700">📅 Data da dispensação: <strong>{new Date(cupomDataCompra + "T00:00:00").toLocaleDateString("pt-BR")}</strong></p>
                    <p className="text-xs text-muted-foreground">
                      Próxima retirada: <strong>{(() => {
                        const [y, m, dd] = cupomDataCompra.split("-").map(Number);
                        const intervalo = storedIntervalFor(tipoReceita);
                        const next = new Date(y, m - 1, dd);
                        next.setDate(next.getDate() + intervalo + 1);
                        return next.toLocaleDateString("pt-BR");
                      })()}</strong>
                    </p>
                  </div>
                )}

                {/* Upload do cupom após responder e ter data */}
                {dispensadoHoje !== null && cupomDataCompra && (
                  <>
                    {renderUploadArea("🧾 Cupom Fiscal Assinado *", cupomPreview, cupomRef, "cupom",
                      () => { setCupomPreview(null); setCupomFile(null); setCupomDataProxima(null); setCupomDatasConfirmadas(false); }
                    )}

                    {cupomOcrLoading && (
                      <div className="p-3 rounded-xl bg-muted/40 border border-border text-center">
                        <p className="text-xs text-muted-foreground animate-pulse">⏳ Processando cupom com IA...</p>
                      </div>
                    )}

                    {cupomFile && !cupomOcrLoading && cupomDataProxima && (
                      <div className="p-3 rounded-xl bg-accent/10 border border-accent/30 space-y-2">
                        <p className="text-xs font-semibold">📋 IA detectou no cupom:</p>
                        <p className="text-xs">📆 Próxima retirada (PROX.COM): <strong>{new Date(cupomDataProxima + "T00:00:00").toLocaleDateString("pt-BR")}</strong></p>
                      </div>
                    )}

                    {/* Upload cupom QR Code */}
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider">📱 Cupom Fiscal QR Code *</Label>
                      <p className="text-[10px] text-muted-foreground">Envie o cupom que contém o QR Code (apenas para arquivo).</p>
                      {!cupomQrPreview ? (
                        <div className="grid grid-cols-2 gap-3">
                          <Button type="button" variant="outline"
                            className="h-20 border-dashed border-2 flex flex-col gap-2 rounded-xl hover:border-primary/50 hover:bg-primary/5 transition-all"
                            onClick={() => openCamera("cupomQr")}>
                            <Camera className="w-6 h-6 text-muted-foreground" />
                            <span className="text-xs font-medium">Tirar Foto</span>
                          </Button>
                          <Button type="button" variant="outline"
                            className="h-20 border-dashed border-2 flex flex-col gap-2 rounded-xl hover:border-primary/50 hover:bg-primary/5 transition-all"
                            onClick={() => cupomQrRef.current?.click()}>
                            <Upload className="w-6 h-6 text-muted-foreground" />
                            <span className="text-xs font-medium">Anexar</span>
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="relative rounded-xl overflow-hidden border bg-muted/20">
                            <img src={cupomQrPreview} alt="Cupom QR Code" className="w-full max-h-64 object-contain p-2" />
                            <div className="absolute top-2 right-2">
                              <div className="bg-background/90 rounded-full p-1.5 shadow-sm">
                                <CheckCircle className="w-5 h-5 text-green-500" />
                              </div>
                            </div>
                            <div className="p-2 border-t bg-muted/30 flex items-center gap-2">
                              <Button variant="ghost" size="sm" className="rounded-lg text-xs" onClick={() => setViewingImage(cupomQrPreview)}>
                                <Eye className="w-3.5 h-3.5 mr-1" /> Visualizar
                              </Button>
                              <Button variant="ghost" size="sm" className="rounded-lg text-xs" onClick={() => { setCupomQrPreview(null); setCupomQrFile(null); }}>
                                🔄 Trocar
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                      <input ref={cupomQrRef} type="file" accept="image/*,.pdf" className="hidden"
                        onChange={handleFileSelect(setCupomQrFile, setCupomQrPreview)} />
                    </div>

                    {/* Confirmar datas */}
                    {cupomFile && cupomQrFile && !cupomOcrLoading && (
                      <>
                        {!cupomDatasConfirmadas ? (
                          <Button type="button" variant="outline" size="sm"
                            className="w-full border-amber-400 bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold"
                            onClick={() => setCupomDatasConfirmadas(true)}>
                            ✅ Confirmo que conferi as datas acima
                          </Button>
                        ) : (
                          <div className="flex items-center justify-between p-2.5 rounded-xl bg-green-50 border border-green-200">
                            <Badge variant="secondary" className="bg-green-100 text-green-700">✓ Datas conferidas</Badge>
                            <Button type="button" variant="ghost" size="sm" className="text-xs h-6" onClick={() => setCupomDatasConfirmadas(false)}>Refazer</Button>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}

                <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-1">
                  <p className="text-xs text-muted-foreground">
                    ℹ️ São necessários <strong>dois cupons</strong>: o cupom com assinatura (para validação) e o cupom com QR Code (para arquivo).
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-muted/40 border border-border space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Checklist:</p>
                  {[
                    { ok: dispensadoHoje !== null, label: "Informou se é hoje ou outra data" },
                    { ok: !!cupomDataCompra, label: "Data da retirada definida" },
                    { ok: !!cupomFile, label: "Cupom fiscal assinado anexado" },
                    { ok: !!cupomQrFile, label: "Cupom fiscal QR Code anexado" },
                    { ok: cupomDatasConfirmadas, label: "Datas conferidas" },
                  ].map((item, i) => (
                    <p key={i} className={`text-xs flex items-center gap-1.5 ${item.ok ? "text-green-600" : "text-muted-foreground"}`}>
                      {item.ok ? "✅" : "⬜"} {item.label}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* ═══ TELA: RESUMO ═══ */}
            {currentStep === "resumo" && (
              <div className="space-y-4">
                <div className="text-center space-y-1">
                  <Shield className="w-7 h-7 mx-auto text-primary" />
                  <p className="text-sm font-semibold">Confirmar {needsReceita ? "Ciclo" : "Setup"} + 1ª Dispensação</p>
                  <p className="text-xs text-muted-foreground">Revise os dados. Ao confirmar, a <strong>1ª dispensação será registrada automaticamente</strong>.</p>
                </div>
                <div className="space-y-1.5 p-3 rounded-2xl bg-muted/40 text-sm">
                  {[
                    ["Operador", operadorNome],
                    ["Paciente", paciente.nome],
                    ["CPF", formatCpfMask(paciente.cpf)],
                    ...(needsReceita ? [
                      ["Receita", receitaFile ? "✅ Anexada" : "❌"],
                      ["Emissão da Receita", formatDateBR(dataEmissao)],
                      ["Tipo", `${CATEGORY_CONFIG[tipoReceita].emoji} ${CATEGORY_CONFIG[tipoReceita].label}`],
                    ] : []),
                    ["Retirada", tipoRetirada === "proprio" ? "Próprio Paciente" : "Responsável Legal"],
                    ["Doc. Paciente", docPacienteFile ? "✅ Anexado" : (canReusePacienteDoc ? "✅ Reutilizado" : "❌")],
                    ...(tipoRetirada === "representante" ? [
                      ["Representante", repNome],
                      ["CPF Rep.", formatCpfMask(repCpf)],
                      ["Doc. Rep.", repDocFile ? "✅" : (canReuseRepDoc ? "✅ Reutilizado" : "❌")],
                      ["Procuração", procuracaoFile ? "✅" : (canReuseProcuracao ? "✅ Reutilizada" : "❌")],
                      ["Emissão Proc.", procuracaoIndeterminada ? "—" : formatDateBR(procuracaoEmissao)],
                      ["Val. Procuração", procuracaoIndeterminada ? "Indeterminada" : formatDateBR(procuracaoValidade)],
                    ] : []),
                    ["Cupom Assinado", cupomFile ? "✅ Anexado" : "❌"],
                    ["Cupom QR Code", cupomQrFile ? "✅ Anexado" : "❌"],
                    ["Data Retirada (cupom)", cupomDataCompra ? formatDateBR(cupomDataCompra) : "—"],
                    ...(cupomDataProxima ? [["Próxima Retirada", formatDateBR(cupomDataProxima)]] : []),
                    ["Dispensação", "1ª retirada será registrada"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between py-1 border-b border-border/20 last:border-0">
                      <span className="text-muted-foreground text-xs">{label}</span>
                      <span className="font-medium text-xs">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
        </div>

        {/* Sticky Navigation */}
        <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 p-4 border-t border-primary/20 bg-white/95 backdrop-blur-sm shrink-0 rounded-b-[2rem]">
          {currentStepIndex > 0 ? (
            <Button variant="ghost" size="sm" onClick={goBack} className="rounded-xl min-h-[44px]">
              <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
            </Button>
          ) : onCancel ? (
            <Button variant="ghost" size="sm" onClick={() => setShowExitConfirm(true)} className="rounded-xl min-h-[44px]">
              <X className="w-4 h-4 mr-1" /> Cancelar
            </Button>
          ) : <div />}

          {currentStep === "resumo" ? (
            <Button onClick={handleSave} disabled={saving}
              className="rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90 shadow-lg min-h-[44px] px-4 font-bold text-sm">
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</> : <><Save className="w-4 h-4 mr-2" /> Confirmar</>}
            </Button>
          ) : (
            <Button onClick={goNext} disabled={!canGoNext()} className="rounded-xl min-h-[44px] px-6">
              Próximo <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </motion.div>

      <AlertDialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deseja realmente sair?</AlertDialogTitle>
            <AlertDialogDescription>
              Todo o progresso do ciclo será perdido e você precisará começar novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar aqui</AlertDialogCancel>
            <AlertDialogAction onClick={() => onCancel?.()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Sim, sair
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
