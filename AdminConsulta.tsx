import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { createPortal } from "react-dom";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera, Upload, Loader2, CheckCircle, User, Users, Receipt,
  ChevronRight, ChevronLeft, FileCheck, ShieldCheck, FileText,
  AlertTriangle, CalendarCheck, Image,
} from "lucide-react";
import CameraCapture from "./CameraCapture";
import { useCameraStream } from "@/hooks/useCameraStream";
import GalleryPicker from "./GalleryPicker";
import type { GaleriaItem } from "@/hooks/useGaleria";

interface Props {
  paciente: any;
  ciclo: any;
  onClose: () => void;
  galeriaFotos?: GaleriaItem[];
  galeriaLoading?: boolean;
}

type Step = "operador" | "tipo" | "documentos" | "cupom" | "confirmar";

import { formatCpfMask, formatDateBR, validateCpfDigits } from "@/lib/format-utils";
import { printDispensacaoCupom, type PrintItem } from "@/lib/print-cupom";
import { calculateCycleLimit, calculateNextWithdrawalDate } from "@/lib/ciclo-utils";

export default function NovaDispensacao({ paciente, ciclo, onClose, galeriaFotos = [], galeriaLoading = false }: Props) {
  const { user } = useAuth();
  const [showGalleryPicker, setShowGalleryPicker] = useState(false);
  const [galleryTarget, setGalleryTarget] = useState("");
  const isFirstDispensation = ciclo.total_dispensacoes === 0;
  const [step, setStep] = useState<Step>(isFirstDispensation ? "tipo" : "cupom");
  const [tipo, setTipo] = useState<"proprio" | "representante" | null>(isFirstDispensation ? null : null);

  useEffect(() => {
    setStep(isFirstDispensation ? "tipo" : "cupom");
  }, [isFirstDispensation, ciclo.id]);

  // For 2nd+ dispensation, load the tipo_retirada from the first dispensation in this cycle
  useEffect(() => {
    if (!isFirstDispensation) {
      supabase
        .from("dispensacoes")
        .select("tipo_retirada")
        .eq("ciclo_id", ciclo.id)
        .eq("cancelada", false)
        .order("created_at", { ascending: true })
        .limit(1)
        .then(({ data }) => {
          const first = data?.[0];
          if (first) {
            setTipo(first.tipo_retirada as "proprio" | "representante");
          } else {
            setTipo("proprio");
          }
        });
    }
  }, [ciclo.id, isFirstDispensation]);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // Operador = logged-in user (each person has their own login)
  const [operadorId] = useState<string | null>(user?.id || null);
  const [operadorNome, setOperadorNome] = useState("");

  useEffect(() => {
    if (user?.id) {
      supabase.from("profiles").select("nome").eq("id", user.id).single().then(({ data }) => {
        setOperadorNome(data?.nome || "");
      });
    }
  }, [user?.id]);

  // Titular doc
  const [titularDocMode, setTitularDocMode] = useState<"combined" | "separate" | null>(null);
  const [titularDocPreview, setTitularDocPreview] = useState<string | null>(null);
  const [titularDocFile, setTitularDocFile] = useState<File | null>(null);
  const [titularCpfPreview, setTitularCpfPreview] = useState<string | null>(null);
  const [titularCpfFile, setTitularCpfFile] = useState<File | null>(null);
  const [titularDocSaved, setTitularDocSaved] = useState(false);
  const [savingDocs, setSavingDocs] = useState(false);

  // Representative
  const [repNome, setRepNome] = useState("");
  const [repCpf, setRepCpf] = useState("");
  const [repDocPreview, setRepDocPreview] = useState<string | null>(null);
  const [repDocFile, setRepDocFile] = useState<File | null>(null);
  const [procuracaoPreview, setProcuracaoPreview] = useState<string | null>(null);
  const [procuracaoFile, setProcuracaoFile] = useState<File | null>(null);
  const [procuracaoValidade, setProcuracaoValidade] = useState("");
  const [procuracaoIndeterminada, setProcuracaoIndeterminada] = useState(true);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrDetails, setOcrDetails] = useState<string[]>([]);

  // Existing docs
  const [existingDocs, setExistingDocs] = useState<any[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedProcuracaoId, setSelectedProcuracaoId] = useState<string | null>(null);

  // Cupom
  const [cupomPreview, setCupomPreview] = useState<string | null>(null);
  const [cupomFile, setCupomFile] = useState<File | null>(null);
  const [cupomQrPreview, setCupomQrPreview] = useState<string | null>(null);
  const [cupomQrFile, setCupomQrFile] = useState<File | null>(null);
  const [cupomValidation, setCupomValidation] = useState<any>(null);
  const [cupomOcrLoading, setCupomOcrLoading] = useState(false);
  const [datasConfirmadas, setDatasConfirmadas] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [dispensadoHoje, setDispensadoHoje] = useState<boolean | null>(null);
  const [dataDispensacao, setDataDispensacao] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

  // Camera
  const { showCamera, stream: cameraStream, openCamera: openCameraStream, closeCamera } = useCameraStream();
  const [cameraTarget, setCameraTarget] = useState("titularDoc");
  const [cameraMode, setCameraMode] = useState<"main" | "extra">("main");

  // Extra cupom photos
  const [extraCupomPhotos, setExtraCupomPhotos] = useState<{ preview: string; file: File }[]>([]);
  const extraCupomRef = useRef<HTMLInputElement>(null);
  const cupomQrRef = useRef<HTMLInputElement>(null);

  // File refs
  const titularDocRef = useRef<HTMLInputElement>(null);
  const titularCpfRef = useRef<HTMLInputElement>(null);
  const repDocRef = useRef<HTMLInputElement>(null);
  const procuracaoRef = useRef<HTMLInputElement>(null);
  const cupomRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadDocs = async () => {
      // Only load docs for the current cycle
      const { data } = await supabase
        .from("documentos")
        .select("*")
        .eq("paciente_id", paciente.id)
        .eq("ciclo_id", ciclo.id)
        .eq("status", "ativo")
        .order("created_at", { ascending: false });
      setExistingDocs(data || []);
    };
    loadDocs();
  }, [paciente.id, ciclo.id]);

  // Draft pattern: nada é persistido até "Registrar".
  // Arquivos existem apenas em memória (React state).
  // Se fechar/cancelar, tudo é descartado automaticamente.

  const patientHasIdentidade = existingDocs.some(d =>
    ["identidade", "identidade_com_cpf", "cpf"].includes(d.tipo)
  );
  const now = new Date();
  const existingProcuracoes = existingDocs.filter(d => d.tipo === "procuracao" && new Date(d.validade_ate) > now);
  const expiredProcuracoes = existingDocs.filter(d => d.tipo === "procuracao" && new Date(d.validade_ate) <= now);
  const existingRepDocs = existingDocs.filter(d => d.tipo === "doc_representante" && new Date(d.validade_ate) > now);

  const repCpfClean = repCpf.replace(/\D/g, "");
  const repCpfValid = repCpfClean.length === 11 && validateCpfDigits(repCpfClean);
  const repNameMatchesPatient = repNome.trim().toLowerCase() === paciente.nome.trim().toLowerCase();

  const isDocStepValid = () => {
    if (tipo === "proprio") return patientHasIdentidade || titularDocSaved;
    if (tipo === "representante") {
      const hasRepDoc = !!repDocFile || !!selectedDocId;
      const hasProcuracao = !!procuracaoFile || !!selectedProcuracaoId;
      const hasName = repNome.trim().length > 0;
      const cpfOk = repCpfValid;
      const nameOk = !repNameMatchesPatient;
      return hasRepDoc && hasProcuracao && hasName && cpfOk && nameOk;
    }
    return false;
  };

  const openCamera = (target: string, mode: "main" | "extra" = "main") => { setCameraTarget(target); setCameraMode(mode); openCameraStream(); };
  const openGallery = (target: string) => { setGalleryTarget(target); setShowGalleryPicker(true); };

  const handleGallerySelect = (file: File) => {
    const targets: Record<string, [React.Dispatch<any>, React.Dispatch<any>, boolean?]> = {
      titularDoc: [setTitularDocFile, setTitularDocPreview],
      titularCpf: [setTitularCpfFile, setTitularCpfPreview],
      repDoc: [setRepDocFile, setRepDocPreview, true],
      procuracao: [setProcuracaoFile, setProcuracaoPreview],
      cupom: [setCupomFile, setCupomPreview],
      cupomQr: [setCupomQrFile, setCupomQrPreview],
    };
    const t = targets[galleryTarget];
    if (t) processFileForPreview(file, t[0], t[1], !!t[2]);
  };

  const handleCameraCapture = (file: File) => {
    closeCamera();
    if (cameraMode === "extra" && cameraTarget === "cupom") {
      addExtraCupomPhoto(file);
      return;
    }
    const targets: Record<string, [React.Dispatch<any>, React.Dispatch<any>, boolean?]> = {
      titularDoc: [setTitularDocFile, setTitularDocPreview],
      titularCpf: [setTitularCpfFile, setTitularCpfPreview],
      repDoc: [setRepDocFile, setRepDocPreview, true],
      procuracao: [setProcuracaoFile, setProcuracaoPreview],
      cupom: [setCupomFile, setCupomPreview],
      cupomQr: [setCupomQrFile, setCupomQrPreview],
    };
    const t = targets[cameraTarget];
    if (t) processFileForPreview(file, t[0], t[1], !!t[2]);
  };

  const addExtraCupomPhoto = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setExtraCupomPhotos(prev => [...prev, { preview: dataUrl, file }]);
      runCupomOcrExtra(dataUrl.split(",")[1]);
    };
    reader.readAsDataURL(file);
  };

  const runCupomOcrExtra = async (base64: string) => {
    setCupomOcrLoading(true);
    try {
      const receita = ciclo.receitas || {};
      const { data, error } = await supabase.functions.invoke("ocr-document", {
        body: {
          imageBase64: base64,
          tipo: "cupom_fiscal",
          contexto_ciclo: {
            data_emissao_receita: receita.data_emissao,
            validade_receita: receita.validade_ate || ciclo.data_fim,
            ultima_retirada: ciclo.ultima_retirada,
            intervalo_dias: ciclo.intervalo_dias,
            total_dispensacoes: ciclo.total_dispensacoes,
            limite_maximo: ciclo.limite_maximo,
            tipo: receita.tipo || "medicamento",
          },
        },
      });
      if (error) throw error;
      if (data.data_compra) {
        setCupomValidation(data);
        setDataDispensacao(data.data_compra);
        setDatasConfirmadas(false);
        toast.success("Dados do cupom com assinatura detectados!");
      }
    } catch (e) {
      console.error("OCR cupom extra error:", e);
    } finally {
      setCupomOcrLoading(false);
    }
  };

  const processFileForPreview = (
    file: File,
    fileSetter: (f: File | null) => void,
    previewSetter: (s: string | null) => void,
    runOcr?: boolean
  ) => {
    fileSetter(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      previewSetter(dataUrl);
      if (runOcr) runOCR(dataUrl.split(",")[1]);
      // Auto-run cupom OCR when cupom is uploaded
      if (fileSetter === setCupomFile) {
        runCupomOCR(dataUrl.split(",")[1]);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFileCapture = (
    setter: (f: File | null) => void,
    previewSetter: (s: string | null) => void,
    runOcr?: boolean
  ) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_SIZE) {
      toast.error(`Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máximo: 10MB.`);
      e.target.value = "";
      return;
    }
    processFileForPreview(file, setter, previewSetter, runOcr);
  };

  const getQualityFeedback = (data: any): string[] => {
    const feedback: string[] = [];
    const qualidade = data.score_qualidade ?? null;
    const confianca = data.score_confianca ?? null;
    if (qualidade !== null) {
      if (qualidade >= 90) feedback.push(`📸 Qualidade: Excelente (${qualidade}%)`);
      else if (qualidade >= 70) feedback.push(`📸 Qualidade: Boa (${qualidade}%)`);
      else if (qualidade >= 50) feedback.push(`📸 Qualidade: Regular (${qualidade}%) — tente foto mais nítida`);
      else feedback.push(`📸 Qualidade: Baixa (${qualidade}%) — recomendamos outra foto`);
    }
    if (confianca !== null && confianca < 70) {
      feedback.push(`⚠️ Confiança: ${confianca}% — confira com atenção`);
    }
    if (data.problemas_imagem?.length > 0) {
      feedback.push(`🔍 ${data.problemas_imagem.join(", ")}`);
    }
    return feedback;
  };

  const runOCR = async (base64: string) => {
    setOcrLoading(true);
    setOcrDetails([]);
    try {
      const { data, error } = await supabase.functions.invoke("ocr-document", {
        body: { imageBase64: base64, tipo: "documento" },
      });
      if (error) throw error;
      const details: string[] = [];
      details.push(...getQualityFeedback(data));
      if (details.length > 0) details.push("");
      if (data.nome_completo) { setRepNome(data.nome_completo); details.push("✅ Nome: " + data.nome_completo); }
      if (data.cpf) { setRepCpf(data.cpf.replace(/\D/g, "")); details.push("✅ CPF: " + data.cpf); }
      setOcrDetails(details);
      if (data.nome_completo || data.cpf) toast.success("Dados extraídos com sucesso!");
      else if ((data.score_qualidade ?? 100) < 50) toast.warning("Foto com qualidade baixa. Preencha manualmente.");
      else toast.warning("Não foi possível ler o documento. Preencha manualmente.");
    } catch {
      toast.warning("Não foi possível ler o documento. Preencha manualmente.");
    } finally {
      setOcrLoading(false);
    }
  };

  const runCupomOCR = async (base64: string) => {
    setCupomOcrLoading(true);
    setCupomValidation(null);
    setDatasConfirmadas(false);
    try {
      const receita = ciclo.receitas || {};
      const { data, error } = await supabase.functions.invoke("ocr-document", {
        body: {
          imageBase64: base64,
          tipo: "cupom_fiscal",
          contexto_ciclo: {
            data_emissao_receita: receita.data_emissao,
            validade_receita: receita.validade_ate || ciclo.data_fim,
            ultima_retirada: ciclo.ultima_retirada,
            intervalo_dias: ciclo.intervalo_dias,
            total_dispensacoes: ciclo.total_dispensacoes,
            limite_maximo: ciclo.limite_maximo,
            tipo: receita.tipo || "medicamento",
          },
        },
      });
      if (error) throw error;

      if (data.data_compra) {
        // Valid cupom with data found
        setCupomValidation(data);
        setDataDispensacao(data.data_compra);
        const qualidade = data.score_qualidade ?? 100;
        if (data.validacao) {
          if (data.validacao.dentro_validade && data.validacao.intervalo_respeitado) {
            toast.success("Cupom validado! Datas conferem ✓");
          } else {
            toast.warning("Atenção: verifique as observações da IA sobre datas.");
          }
        }
        if (qualidade < 70) {
          toast.info(`Dados lidos, mas qualidade da foto é ${qualidade}%. Confira com atenção.`);
        }
      } else {
        // No data found - might be wrong cupom (QR code one)
        const qualidade = data.score_qualidade ?? 100;
        if (data.erro && data.erro.toLowerCase().includes("qr")) {
          toast.warning("Este cupom parece ter QR code. Troque pela foto do cupom com a relação de medicamentos e assinatura.");
        } else if (qualidade < 50) {
          toast.warning("Qualidade da foto do cupom está baixa. Tente outra foto.");
        } else {
          toast.warning("Dados do cupom não encontrados. Certifique-se de fotografar o cupom com a assinatura e relação de medicamentos.");
        }
        // Store partial validation for reference
        setCupomValidation(data);
      }
    } catch {
      toast.warning("Não foi possível validar o cupom automaticamente.");
    } finally {
      setCupomOcrLoading(false);
    }
  };

  // Re-run OCR when cupom file is replaced (e.g., user takes new photo)
  const handleCupomReplace = (file: File) => {
    setCupomFile(file);
    setCupomValidation(null);
    setDatasConfirmadas(false);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setCupomPreview(dataUrl);
      runCupomOCR(dataUrl.split(",")[1]);
    };
    reader.readAsDataURL(file);
  };

  // Dispensation number for folder organization (same pattern as SetupCiclo)
  const dispensacaoNumero = ciclo.total_dispensacoes + 1;

  const saveTitularDocs = async () => {
    if (!titularDocFile) { toast.error("Envie o documento com foto."); return; }
    if (titularDocMode === "separate" && !titularCpfFile) { toast.error("Envie o CPF separado."); return; }
    setSavingDocs(true);
    try {
      const validade = new Date();
      validade.setFullYear(validade.getFullYear() + 10);
      const tipoDoc = titularDocMode === "combined" ? "identidade_com_cpf" : "identidade";
      const url1 = await uploadFile(titularDocFile, `disp_${dispensacaoNumero}/identidade`);
      await supabase.from("documentos").insert({
        paciente_id: paciente.id, ciclo_id: ciclo.id, tipo: tipoDoc, arquivo_url: url1,
        validade_ate: validade.toISOString(), uploaded_by: user?.id,
        dados_extraidos: { foto_modo: titularDocMode, dispensacao_numero: dispensacaoNumero },
      });
      if (titularDocMode === "separate" && titularCpfFile) {
        const url2 = await uploadFile(titularCpfFile, `disp_${dispensacaoNumero}/cpf`);
        await supabase.from("documentos").insert({
          paciente_id: paciente.id, ciclo_id: ciclo.id, tipo: "cpf", arquivo_url: url2,
          validade_ate: validade.toISOString(), uploaded_by: user?.id,
          dados_extraidos: { dispensacao_numero: dispensacaoNumero },
        });
      }
      setTitularDocSaved(true);
      toast.success("Documentos do titular salvos!");
    } catch (err: any) {
      toast.error("Erro ao salvar: " + (err.message || ""));
    } finally {
      setSavingDocs(false);
    }
  };

  const uploadFile = async (file: File, folder: string): Promise<string> => {
    const ext = file.name.split(".").pop();
    const path = `pacientes/${paciente.id}/${folder}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("documentos").upload(path, file);
    if (error) throw error;
    const { data } = supabase.storage.from("documentos").getPublicUrl(path);
    return data.publicUrl;
  };

  const handleRegistrar = async () => {
    if (savingRef.current) return;
    if (!tipo) { toast.error("Aguarde o carregamento do tipo de retirada para continuar."); return; }
    if (!cupomFile) { toast.error("Cupom fiscal é obrigatório."); return; }
    if (!confirmChecked) { toast.error("Confirme a verificação."); return; }

    // Correção #1: Validar se receita ainda está válida no momento do registro
    const fimCiclo = new Date(ciclo.data_fim + "T23:59:59");
    if (new Date() > fimCiclo) {
      toast.error("A receita deste ciclo expirou. Não é possível registrar nova dispensação.");
      return;
    }

    // Correção #4: Validar se data informada não é anterior à última retirada
    if (ciclo.ultima_retirada && dataDispensacao && dataDispensacao < ciclo.ultima_retirada) {
      toast.error(`A data da dispensação não pode ser anterior à última retirada (${new Date(ciclo.ultima_retirada + "T00:00:00").toLocaleDateString("pt-BR")}).`);
      return;
    }

    savingRef.current = true;
    setSaving(true);
    // Use the dispensation date (from coupon AI or manual input) instead of today
    const dataRetirada = dataDispensacao;
    try {
      let docRepresentanteId = selectedDocId;
      let procuracaoId = selectedProcuracaoId;

      if (tipo === "representante" && repDocFile) {
        const url = await uploadFile(repDocFile, `disp_${dispensacaoNumero}/rep_doc`);
        const validade = new Date(); validade.setFullYear(validade.getFullYear() + 10);
        const { data: docData } = await supabase.from("documentos").insert({
          paciente_id: paciente.id, ciclo_id: ciclo.id, tipo: "doc_representante", arquivo_url: url,
          validade_ate: validade.toISOString(), uploaded_by: user?.id,
          dados_extraidos: { nome: repNome, cpf: repCpf, dispensacao_numero: dispensacaoNumero },
        }).select().single();
        if (docData) docRepresentanteId = docData.id;
      }
      if (tipo === "representante" && procuracaoFile) {
        const url = await uploadFile(procuracaoFile, `disp_${dispensacaoNumero}/procuracao`);
        const validade = new Date();
        if (procuracaoIndeterminada) validade.setFullYear(validade.getFullYear() + 10);
        else if (procuracaoValidade) validade.setTime(new Date(procuracaoValidade + "T23:59:59").getTime());
        else validade.setFullYear(validade.getFullYear() + 1);
        const { data: procData } = await supabase.from("documentos").insert({
          paciente_id: paciente.id, ciclo_id: ciclo.id, tipo: "procuracao", arquivo_url: url,
          validade_ate: validade.toISOString(), uploaded_by: user?.id,
          dados_extraidos: { dispensacao_numero: dispensacaoNumero },
        }).select().single();
        if (procData) procuracaoId = procData.id;
      }

      const cupomUrl = await uploadFile(cupomFile, `disp_${dispensacaoNumero}/cupom_fiscal`);

      // Upload extra cupom photos
      for (let i = 0; i < extraCupomPhotos.length; i++) {
        const extraUrl = await uploadFile(extraCupomPhotos[i].file, `disp_${dispensacaoNumero}/cupom_fiscal_extra_${i + 1}`);
        const extraValidade = new Date();
        extraValidade.setMonth(extraValidade.getMonth() + 1);
        await supabase.from("documentos").insert({
          paciente_id: paciente.id, ciclo_id: ciclo.id, tipo: "cupom_fiscal",
          arquivo_url: extraUrl, validade_ate: extraValidade.toISOString(), uploaded_by: user?.id,
          dados_extraidos: { dispensacao_numero: ciclo.total_dispensacoes + 1, extra: true, index: i + 1 },
        });
      }

      // Save main cupom fiscal as a document for traceability
      const cupomValidade = new Date();
      cupomValidade.setMonth(cupomValidade.getMonth() + 1);
      // Persist OCR-extracted items so the relatório individual e o de período possam mostrá-los
      const cupomItens: PrintItem[] = Array.isArray(cupomValidation?.itens)
        ? (cupomValidation!.itens as any[]).map((it: any) =>
            typeof it === "string"
              ? { codigo: null, nome: it, quantidade: null }
              : { codigo: it?.codigo ?? null, nome: String(it?.nome ?? "—"), quantidade: it?.quantidade != null ? String(it.quantidade) : null },
          )
        : [];
      await supabase.from("documentos").insert({
        paciente_id: paciente.id,
        ciclo_id: ciclo.id,
        tipo: "cupom_fiscal",
        arquivo_url: cupomUrl,
        validade_ate: cupomValidade.toISOString(),
        uploaded_by: user?.id,
        dados_extraidos: {
          dispensacao_numero: ciclo.total_dispensacoes + 1,
          itens: cupomItens,
          data_compra: cupomValidation?.data_compra ?? null,
          data_proxima_retirada: cupomValidation?.data_proxima_retirada ?? null,
          numero_cupom: cupomValidation?.numero_cupom ?? null,
        },
      });

      // Save cupom fiscal QR code
      if (cupomQrFile) {
        const cupomQrUrl = await uploadFile(cupomQrFile, `disp_${dispensacaoNumero}/cupom_fiscal_qr`);
        await supabase.from("documentos").insert({
          paciente_id: paciente.id,
          ciclo_id: ciclo.id,
          tipo: "cupom_fiscal",
          arquivo_url: cupomQrUrl,
          validade_ate: cupomValidade.toISOString(),
          uploaded_by: user?.id,
          dados_extraidos: { subtipo: "qr_code", dispensacao_numero: ciclo.total_dispensacoes + 1 },
        });
      }

      const { error } = await supabase.from("dispensacoes").insert({
        ciclo_id: ciclo.id, paciente_id: paciente.id, tipo_retirada: tipo!,
        registrada_por: user!.id,
        operador_id: null,
        data_dispensacao_real: dataRetirada,
        documento_representante_id: tipo === "representante" ? docRepresentanteId : null,
        procuracao_id: tipo === "representante" ? procuracaoId : null,
        snapshot_ciclo: {
          total_dispensacoes: ciclo.total_dispensacoes, ultima_retirada: ciclo.ultima_retirada,
          data_registro: dataRetirada,
          operador_id: operadorId, operador_nome: operadorNome,
          representante: tipo === "representante" ? { nome: repNome, cpf: repCpf } : null,
          cupom_fiscal_url: cupomUrl,
        },
      });
      if (error) { toast.error("Erro ao registrar."); setSaving(false); return; }

      const novoTotalDispensacoes = ciclo.total_dispensacoes + 1;
      const cicloUpdates: Record<string, any> = {
        ultima_retirada: dataRetirada,
        total_dispensacoes: novoTotalDispensacoes,
      };

      if (ciclo.total_dispensacoes === 0) {
        const dataFimCiclo = (ciclo.receitas as any)?.validade_ate || ciclo.data_fim;
        cicloUpdates.data_inicio = dataRetirada;
        cicloUpdates.data_fim = dataFimCiclo;
        cicloUpdates.limite_maximo = calculateCycleLimit({
          tipoReceita: (ciclo.receitas as any)?.tipo || "medicamento",
          dataInicio: dataRetirada,
          dataFim: dataFimCiclo,
          primeiraRetirada: dataRetirada,
          intervaloDias: ciclo.intervalo_dias,
        });
      }

      await supabase.from("ciclos").update(cicloUpdates).eq("id", ciclo.id);

      await supabase.from("logs").insert({
        user_id: user?.id, acao: "nova_dispensacao",
        detalhes: { paciente_id: paciente.id, ciclo_id: ciclo.id, tipo_retirada: tipo, operador_id: operadorId, operador_nome: operadorNome, representante: tipo === "representante" ? repNome : null, cupom_fiscal: true },
      });

      toast.success("Dispensação registrada com sucesso!");

      // Imprimir comprovante (Elgin i9) se houver itens ou se confirmado pelo usuário
      const itensParaImprimir: PrintItem[] = Array.isArray(cupomValidation?.itens)
        ? (cupomValidation!.itens as any[]).map((it: any) =>
            typeof it === "string"
              ? { codigo: null, nome: it, quantidade: null }
              : { codigo: it?.codigo ?? null, nome: String(it?.nome ?? "—"), quantidade: it?.quantidade != null ? String(it.quantidade) : null },
          )
        : [];
      const totalCicloAtualizado = cicloUpdates.limite_maximo || ciclo.limite_maximo || null;
      const numeroRetirada = ciclo.total_dispensacoes + 1;
      const limiteInicial = (ciclo.receitas as any)?.tipo === "fralda" ? 18 : 6;
      const quantidadeDisponivelAgora = totalCicloAtualizado ? Math.max(0, totalCicloAtualizado - numeroRetirada) : null;
      const perdidasPorAtraso = totalCicloAtualizado ? Math.max(0, limiteInicial - totalCicloAtualizado) : null;
      const proximaRetirada = calculateNextWithdrawalDate(dataRetirada, ciclo.intervalo_dias || 30);

      const wantsPrint = window.confirm("Imprimir comprovante de dispensação na Elgin i9?");
      if (wantsPrint) {
        printDispensacaoCupom({
          pacienteNome: paciente.nome,
          pacienteCpf: paciente.cpf ? formatCpfMask(paciente.cpf) : null,
          dataDispensacao: dataRetirada,
          dataCriacao: new Date().toISOString().split("T")[0],
          intervaloDias: ciclo.intervalo_dias || 30,
          operadorNome: operadorNome || null,
          tipoRetirada: tipo === "representante" ? "Representante" : "Próprio paciente",
          itens: itensParaImprimir,
          numero: numeroRetirada,
          totalCiclo: totalCicloAtualizado,
          quantidadeDisponivelAgora,
          limiteInicial,
          perdidasPorAtraso,
        });
      }

      if (paciente.telefone && window.confirm("Enviar comprovante simplificado pelo WhatsApp do cliente?")) {
        const primeiroNome = paciente.nome?.split(" ")?.[0] || "";
        const tipoLabel = (ciclo.receitas as any)?.tipo === "fralda" ? "fralda" : "medicamento";
        const ultimaPossivel = totalCicloAtualizado ? numeroRetirada >= totalCicloAtualizado : false;
        const msg = [
          `Olá, ${primeiroNome}.`,
          "",
          `Sua retirada de ${tipoLabel} foi registrada em ${formatDateBR(dataRetirada)}.`,
          `Próxima retirada: ${formatDateBR(proximaRetirada)}.`,
          ultimaPossivel ? "Atenção: esta foi a última retirada possível com a receita atual. Será necessário renovar a receita para continuar." : null,
          "",
          "Farmácia Cantagalo",
        ].filter(Boolean).join("\n");
        const phone = `55${String(paciente.telefone).replace(/\D/g, "")}`;
        window.open(`https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}`, "_blank");
      }
      onClose();
    } catch (err: any) {
      toast.error("Erro: " + (err.message || "Falha no registro"));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  // 2nd+ dispensation in the same cycle only needs operador + cupom
  // Skip operador step since each user has their own login
  const steps: Step[] = isFirstDispensation
    ? ["tipo", "documentos", "cupom", "confirmar"]
    : ["cupom", "confirmar"];
  const stepIndex = steps.indexOf(step);
  const allStepLabels: Record<Step, string> = { operador: "Operador", tipo: "Identificação", documentos: "Documentos", cupom: "Cupom Fiscal", confirmar: "Confirmar" };
  const allStepIcons: Record<Step, any> = { operador: User, tipo: User, documentos: FileText, cupom: Receipt, confirmar: ShieldCheck };
  const stepLabels = steps.map(s => allStepLabels[s]);
  const stepIcons = steps.map(s => allStepIcons[s]);

  const canGoNext = () => {
    if ((step === "cupom" || step === "confirmar") && !tipo) return false;
    if (step === "tipo") return !!tipo;
    if (step === "documentos") return isDocStepValid();
    if (step === "cupom") return !!cupomFile && !!cupomQrFile && datasConfirmadas && dispensadoHoje !== null && !!dataDispensacao;
    return confirmChecked;
  };

  const goNext = () => { const i = stepIndex; if (i < steps.length - 1) setStep(steps[i + 1]); };
  const goBack = () => { const i = stepIndex; if (i > 0) setStep(steps[i - 1]); };

  const renderUploadArea = (
    label: string, preview: string | null,
    fileRef: React.RefObject<HTMLInputElement>,
    cameraId: string,
    onReset: () => void,
    extraContent?: React.ReactNode
  ) => (
    <div className="space-y-2">
      <Label className="text-xs font-medium">{label}</Label>
      {!preview ? (
        <div className={`grid gap-2 ${galeriaFotos.length > 0 ? "grid-cols-3" : "grid-cols-2"}`}>
          {galeriaFotos.length > 0 && (
            <Button type="button" variant="outline" className="h-14 border-dashed border-2 flex flex-col gap-1 text-xs rounded-xl border-blue-400/50 bg-blue-500/5" onClick={() => openGallery(cameraId)}>
              <Image className="w-4 h-4 text-blue-500" /> Galeria ({galeriaFotos.length})
            </Button>
          )}
          <Button type="button" variant="outline" className="h-14 border-dashed border-2 flex flex-col gap-1 text-xs rounded-xl" onClick={() => openCamera(cameraId)}>
            <Camera className="w-4 h-4 text-muted-foreground" /> Foto
          </Button>
          <Button type="button" variant="outline" className="h-14 border-dashed border-2 flex flex-col gap-1 text-xs rounded-xl" onClick={() => fileRef.current?.click()}>
            <Upload className="w-4 h-4 text-muted-foreground" /> Anexar
          </Button>
        </div>
      ) : (
        <div className="relative">
          <img src={preview} alt={label} className="w-full max-h-24 object-contain rounded-xl border" />
          <Button variant="ghost" size="sm" className="mt-1 text-xs" onClick={onReset}>Trocar</Button>
          {extraContent}
        </div>
      )}
    </div>
  );

  const renderDocSelector = (
    docs: any[], selectedId: string | null,
    onSelect: (id: string, d: any) => void, onClear: () => void, labelText: string
  ) => {
    if (docs.length === 0 && !selectedId) return null;
    if (selectedId) return (
      <div className="p-2.5 rounded-xl bg-primary/5 border border-primary/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileCheck className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">{labelText} selecionado ✓</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onClear} className="text-xs">Alterar</Button>
      </div>
    );
    return (
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground font-medium">Documentos válidos:</p>
        {docs.map(d => {
          const validUntil = new Date(d.validade_ate);
          return (
            <button key={d.id} onClick={() => onSelect(d.id, d)}
              className="w-full text-left p-2 rounded-xl text-sm flex items-center gap-2 bg-muted/50 hover:bg-muted transition-all">
              <FileCheck className="w-4 h-4 text-primary shrink-0" />
              <span className="truncate">{(d.dados_extraidos as any)?.nome || labelText}</span>
              <span className="text-xs text-muted-foreground ml-auto">
                Válido até {validUntil.toLocaleDateString("pt-BR")}
              </span>
            </button>
          );
        })}
        <p className="text-[10px] text-muted-foreground text-center">ou envie novo abaixo</p>
      </div>
    );
  };

  const hiddenInputs = (
    <>
      <input ref={titularDocRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleFileCapture(setTitularDocFile, setTitularDocPreview)} />
      <input ref={titularCpfRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleFileCapture(setTitularCpfFile, setTitularCpfPreview)} />
      <input ref={repDocRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleFileCapture(setRepDocFile, setRepDocPreview, true)} />
      <input ref={procuracaoRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleFileCapture(setProcuracaoFile, setProcuracaoPreview)} />
      <input ref={cupomRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleFileCapture(setCupomFile, setCupomPreview)} />
      <input ref={cupomQrRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleFileCapture(setCupomQrFile, setCupomQrPreview)} />
      <input ref={extraCupomRef} type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) addExtraCupomPhoto(f);
        e.target.value = "";
      }} />
    </>
  );

  return createPortal(
    <>
      <CameraCapture open={showCamera} stream={cameraStream} onCapture={handleCameraCapture} onClose={() => closeCamera()} title="Tirar Foto" />
      <GalleryPicker
        open={showGalleryPicker}
        fotos={galeriaFotos}
        loading={galeriaLoading}
        onSelect={handleGallerySelect}
        onClose={() => setShowGalleryPicker(false)}
        title="Selecionar da Galeria"
      />
      {/* Custom overlay replacing Radix Dialog to avoid pointer-event blocking */}
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="fixed inset-0 bg-black/80" onClick={() => setShowExitConfirm(true)} />
        <div className="relative z-50 w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl p-0 border bg-background shadow-lg mx-4">
          <div className="px-5 pt-5 pb-2 shrink-0">
            <div className="pb-1 flex flex-col space-y-1.5 text-center sm:text-left">
              <h2 className="text-lg font-semibold leading-none tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                Novo Atendimento
              </h2>
              <p className="text-sm text-muted-foreground">
                {paciente.nome} — {ciclo.total_dispensacoes + 1}ª de {ciclo.limite_maximo}
              </p>
            </div>

            {hiddenInputs}

            <div className="flex items-center gap-0.5 py-2">
              {steps.map((s, i) => {
                const Icon = stepIcons[i];
                const done = i < stepIndex;
                const active = i === stepIndex;
                return (
                  <div key={s} className="flex items-center flex-1">
                    <div className={`flex items-center gap-1 ${!done && !active ? "opacity-35" : ""}`}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all ${
                        done ? "bg-primary text-primary-foreground" :
                        active ? "bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-1 ring-offset-background" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {done ? <CheckCircle className="w-3.5 h-3.5" /> : <Icon className="w-3 h-3" />}
                      </div>
                      <span className="text-[9px] font-medium hidden sm:block">{stepLabels[i]}</span>
                    </div>
                    {i < steps.length - 1 && (
                      <div className={`h-[2px] w-3 mx-0.5 shrink-0 rounded ${done ? "bg-primary" : "bg-muted"}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-3">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -15 }}
              transition={{ duration: 0.15 }}
              className="space-y-4 min-h-[180px]"
            >
              {/* Operador step removed - using logged-in user */}

              {step === "tipo" && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground text-center">Quem está retirando?</p>
                  <div className="grid grid-cols-2 gap-3">
                    {([
                      { value: "proprio" as const, label: "Titular", desc: "O próprio paciente", icon: User },
                      { value: "representante" as const, label: "Representante", desc: "Retirada por terceiro", icon: Users },
                    ]).map(opt => (
                      <motion.button
                        key={opt.value}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setTipo(opt.value)}
                        className={`p-4 rounded-2xl border-2 text-center transition-all ${
                          tipo === opt.value
                            ? "border-primary bg-primary/5 shadow-md"
                            : "border-border/50 hover:border-primary/30"
                        }`}
                      >
                        <opt.icon className={`w-7 h-7 mx-auto mb-1.5 ${tipo === opt.value ? "text-primary" : "text-muted-foreground"}`} />
                        <p className="font-semibold text-sm">{opt.label}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{opt.desc}</p>
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}

              {step === "documentos" && tipo === "proprio" && (
                <div className="space-y-3">
                  {(patientHasIdentidade || titularDocSaved) ? (
                    <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20 text-center space-y-1">
                      <FileCheck className="w-8 h-8 mx-auto text-primary" />
                      <p className="text-sm font-semibold text-primary">Documentos já salvos ✓</p>
                      <p className="text-xs text-muted-foreground">Você pode prosseguir.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="p-3 rounded-xl bg-muted/40 border border-border text-center">
                        <p className="text-xs text-muted-foreground mb-2">O CPF está no mesmo documento?</p>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            variant={titularDocMode === "combined" ? "default" : "outline"}
                            size="sm" className="rounded-xl text-xs"
                            onClick={() => { setTitularDocMode("combined"); setTitularCpfFile(null); setTitularCpfPreview(null); }}
                          >
                            Sim, junto
                          </Button>
                          <Button
                            variant={titularDocMode === "separate" ? "default" : "outline"}
                            size="sm" className="rounded-xl text-xs"
                            onClick={() => setTitularDocMode("separate")}
                          >
                            Não, separado
                          </Button>
                        </div>
                      </div>

                      {titularDocMode && (
                        <div className="space-y-3">
                          {renderUploadArea(
                            titularDocMode === "combined" ? "Documento com Foto + CPF" : "Documento com Foto",
                            titularDocPreview, titularDocRef, "titularDoc",
                            () => { setTitularDocPreview(null); setTitularDocFile(null); }
                          )}
                          {titularDocMode === "separate" && renderUploadArea(
                            "CPF (separado)", titularCpfPreview, titularCpfRef, "titularCpf",
                            () => { setTitularCpfPreview(null); setTitularCpfFile(null); }
                          )}
                          {titularDocFile && (titularDocMode === "combined" || titularCpfFile) && (
                            <Button onClick={saveTitularDocs} disabled={savingDocs} className="w-full rounded-xl">
                              {savingDocs ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Salvando...</> : "Salvar Documentos"}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {step === "documentos" && tipo === "representante" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Nome Completo *</Label>
                      <Input value={repNome} onChange={(e) => setRepNome(e.target.value)} placeholder="Nome completo do representante" className="rounded-xl text-sm" />
                      {repNameMatchesPatient && repNome.trim().length > 0 && (
                        <p className="text-xs text-destructive">⚠️ Nome não pode ser igual ao do paciente.</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">CPF *</Label>
                      <Input
                        value={formatCpfMask(repCpf)}
                        onChange={(e) => setRepCpf(e.target.value.replace(/\D/g, "").slice(0, 11))}
                        placeholder="000.000.000-00"
                        className="font-mono rounded-xl text-sm"
                      />
                      {repCpfClean.length === 11 && !repCpfValid && (
                        <p className="text-xs text-destructive">⚠️ CPF inválido (dígitos verificadores incorretos).</p>
                      )}
                      {repCpfClean.length > 0 && repCpfClean.length < 11 && (
                        <p className="text-xs text-muted-foreground">{repCpfClean.length}/11 dígitos</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Documento do Representante *</Label>
                    {renderDocSelector(existingRepDocs, selectedDocId,
                      (id, d) => { setSelectedDocId(id); setRepNome((d.dados_extraidos as any)?.nome || repNome); setRepCpf((d.dados_extraidos as any)?.cpf || repCpf); },
                      () => setSelectedDocId(null), "Documento"
                    )}
                    {!selectedDocId && renderUploadArea(
                      "Documento com foto", repDocPreview, repDocRef, "repDoc",
                      () => { setRepDocPreview(null); setRepDocFile(null); },
                      <>
                        {ocrLoading && <div className="flex items-center gap-1 mt-1 text-xs text-primary"><Loader2 className="w-3 h-3 animate-spin" /> Lendo...</div>}
                        {ocrDetails.length > 0 && (
                          <div className="mt-1 p-2 rounded-xl bg-muted text-xs space-y-0.5">
                            {ocrDetails.map((d, i) => <p key={i}>{d}</p>)}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Procuração *</Label>
                    {renderDocSelector(existingProcuracoes, selectedProcuracaoId,
                      (id) => setSelectedProcuracaoId(id),
                      () => setSelectedProcuracaoId(null), "Procuração"
                    )}
                    {!selectedProcuracaoId && renderUploadArea(
                      "Procuração", procuracaoPreview, procuracaoRef, "procuracao",
                      () => { setProcuracaoPreview(null); setProcuracaoFile(null); }
                    )}
                    {procuracaoFile && (
                      <div className="p-2.5 rounded-xl bg-muted/40 space-y-2">
                        <div className="flex items-center gap-2">
                          <Checkbox checked={procuracaoIndeterminada} onCheckedChange={(c) => setProcuracaoIndeterminada(!!c)} />
                          <span className="text-xs font-medium">Prazo indeterminado</span>
                        </div>
                        {!procuracaoIndeterminada && (
                          <div className="space-y-1">
                            <Label className="text-xs">Validade</Label>
                            <Input type="date" value={procuracaoValidade} onChange={(e) => setProcuracaoValidade(e.target.value)} className="rounded-xl text-sm" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Validation summary */}
                  {tipo === "representante" && (
                    <div className="p-3 rounded-xl bg-muted/40 border border-border space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground mb-1">Checklist obrigatório:</p>
                      {[
                        { ok: repNome.trim().length > 0 && !repNameMatchesPatient, label: "Nome do representante" },
                        { ok: repCpfValid, label: "CPF válido do representante" },
                        { ok: !!repDocFile || !!selectedDocId, label: "Documento de identidade" },
                        { ok: !!procuracaoFile || !!selectedProcuracaoId, label: "Procuração" },
                      ].map((item, i) => (
                        <p key={i} className={`text-xs flex items-center gap-1.5 ${item.ok ? "text-green-600" : "text-muted-foreground"}`}>
                          {item.ok ? "✅" : "⬜"} {item.label}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {step === "cupom" && (
                <div className="space-y-3">
                  {!isFirstDispensation && !tipo && (
                    <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Carregando o tipo de retirada deste ciclo...
                    </div>
                  )}

                  <div className="text-center space-y-1">
                    <Receipt className="w-7 h-7 mx-auto text-primary" />
                    <p className="text-sm font-medium">Cupom Fiscal com Assinatura</p>
                    <p className="text-xs text-muted-foreground">Envie o cupom com a <strong>relação de medicamentos</strong> e assinatura.</p>
                    <p className="text-[10px] text-amber-600 font-medium">⚠️ NÃO envie o cupom com QR code.</p>
                  </div>

                  {/* Pergunta: Dispensado hoje? */}
                  <div className="p-3 rounded-xl border-2 border-primary/30 bg-primary/5 space-y-3">
                    <p className="text-sm font-semibold text-center">A dispensação foi realizada hoje?</p>
                    <div className="flex gap-2">
                      <Button type="button" variant={dispensadoHoje === true ? "default" : "outline"}
                        className="flex-1 rounded-xl" onClick={() => {
                          setDispensadoHoje(true);
                          const d = new Date();
                          setDataDispensacao(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
                          setDatasConfirmadas(false);
                        }}>
                        ✅ Sim, hoje
                      </Button>
                      <Button type="button" variant={dispensadoHoje === false ? "default" : "outline"}
                        className="flex-1 rounded-xl" onClick={() => {
                          setDispensadoHoje(false);
                          setDataDispensacao("");
                          setDatasConfirmadas(false);
                        }}>
                        ❌ Não, outra data
                      </Button>
                    </div>
                  </div>

                  {/* Se NÃO foi hoje: input manual */}
                  {dispensadoHoje === false && (
                    <div className="p-3 rounded-xl border border-amber-300 bg-amber-50 space-y-2">
                      <Label className="text-xs font-semibold text-amber-800">📅 Informe a data da dispensação:</Label>
                      <Input
                        type="date"
                        value={dataDispensacao}
                        onChange={(e) => { setDataDispensacao(e.target.value); setDatasConfirmadas(false); }}
                        className="rounded-xl text-sm"
                      />
                      {dataDispensacao && (
                        <p className="text-xs text-muted-foreground">
                          Próxima retirada calculada: <strong>{(() => {
                            const [y, m, dd] = dataDispensacao.split("-").map(Number);
                            const next = new Date(y, m - 1, dd);
                            next.setDate(next.getDate() + (ciclo.intervalo_dias || 29) + 1);
                            return next.toLocaleDateString("pt-BR");
                          })()}</strong> ({(ciclo.intervalo_dias || 29) + 1} dias)
                        </p>
                      )}
                    </div>
                  )}

                  {/* Se SIM: mostra data de hoje e próxima */}
                  {dispensadoHoje === true && (
                    <div className="p-3 rounded-xl border border-green-200 bg-green-50 space-y-1">
                      <p className="text-xs text-green-700">📅 Data da dispensação: <strong>{new Date(dataDispensacao + "T00:00:00").toLocaleDateString("pt-BR")}</strong></p>
                      <p className="text-xs text-muted-foreground">
                        Próxima retirada: <strong>{(() => {
                          const [y, m, dd] = dataDispensacao.split("-").map(Number);
                          const next = new Date(y, m - 1, dd);
                          next.setDate(next.getDate() + (ciclo.intervalo_dias || 29) + 1);
                          return next.toLocaleDateString("pt-BR");
                        })()}</strong>
                      </p>
                    </div>
                  )}

                  {/* Upload do cupom só aparece após responder e ter data */}
                  {dispensadoHoje !== null && dataDispensacao && (
                    <>
                      {renderUploadArea("Cupom Fiscal Assinado", cupomPreview, cupomRef, "cupom",
                        () => { setCupomPreview(null); setCupomFile(null); setCupomValidation(null); setDatasConfirmadas(false); setExtraCupomPhotos([]); }
                      )}

                      {/* Extra cupom photos + add button */}
                      {cupomPreview && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            {extraCupomPhotos.map((ep, i) => (
                              <div key={i} className="relative w-16 h-16 rounded-lg border overflow-hidden">
                                <img src={ep.preview} alt={`Cupom extra ${i + 1}`} className="w-full h-full object-cover" />
                                <button type="button" className="absolute top-0 right-0 bg-destructive text-destructive-foreground rounded-bl text-[10px] w-4 h-4 flex items-center justify-center"
                                  onClick={() => setExtraCupomPhotos(prev => prev.filter((_, j) => j !== i))}>×</button>
                              </div>
                            ))}
                            <div className="flex gap-1">
                              <Button type="button" variant="outline" size="sm" className="h-16 w-16 border-dashed flex flex-col gap-0.5 text-[10px] rounded-lg"
                                onClick={() => openCamera("cupom", "extra")}>
                                <Camera className="w-3 h-3" />+
                              </Button>
                              <Button type="button" variant="outline" size="sm" className="h-16 w-16 border-dashed flex flex-col gap-0.5 text-[10px] rounded-lg"
                                onClick={() => extraCupomRef.current?.click()}>
                                <Upload className="w-3 h-3" />+
                              </Button>
                            </div>
                          </div>
                          <p className="text-[10px] text-muted-foreground">Adicione mais fotos do cupom assinado se necessário</p>
                        </div>
                      )}

                      {/* Upload cupom QR Code */}
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">📱 Cupom Fiscal QR Code *</Label>
                        <p className="text-[10px] text-muted-foreground">Envie o cupom que contém o QR Code (apenas para arquivo).</p>
                        {!cupomQrPreview ? (
                          <div className="grid grid-cols-2 gap-2">
                            <Button type="button" variant="outline" className="h-14 border-dashed border-2 flex flex-col gap-1 text-xs rounded-xl" onClick={() => openCamera("cupomQr")}>
                              <Camera className="w-4 h-4 text-muted-foreground" /> Foto
                            </Button>
                            <Button type="button" variant="outline" className="h-14 border-dashed border-2 flex flex-col gap-1 text-xs rounded-xl" onClick={() => cupomQrRef.current?.click()}>
                              <Upload className="w-4 h-4 text-muted-foreground" /> Anexar
                            </Button>
                          </div>
                        ) : (
                          <div className="relative">
                            <img src={cupomQrPreview} alt="Cupom QR Code" className="w-full max-h-24 object-contain rounded-xl border" />
                            <Button variant="ghost" size="sm" className="mt-1 text-xs" onClick={() => { setCupomQrPreview(null); setCupomQrFile(null); }}>Trocar</Button>
                          </div>
                        )}
                      </div>

                      {/* AI Validation Loading */}
                      {cupomOcrLoading && (
                        <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/20">
                          <Loader2 className="w-4 h-4 animate-spin text-primary" />
                          <span className="text-sm text-primary">Validando cupom com IA...</span>
                        </div>
                      )}

                      {/* AI Validation Results */}
                      {cupomValidation && !cupomOcrLoading && (
                        <div className="rounded-xl border bg-muted/30 p-3 space-y-2">
                          <p className="text-xs font-semibold flex items-center gap-1.5">
                            <CalendarCheck className="w-4 h-4 text-primary" /> Validação IA
                          </p>
                          {cupomValidation.data_compra && (
                            <p className="text-xs">📅 Data no cupom: <strong>{new Date(cupomValidation.data_compra + "T00:00:00").toLocaleDateString("pt-BR")}</strong></p>
                          )}
                          {cupomValidation.data_proxima_retirada && (
                            <p className="text-xs">📆 Próxima retirada (PROX.COM): <strong>{new Date(cupomValidation.data_proxima_retirada + "T00:00:00").toLocaleDateString("pt-BR")}</strong></p>
                          )}
                          {cupomValidation.validacao && (
                            <div className="space-y-1.5">
                              <p className={`text-xs flex items-center gap-1 ${cupomValidation.validacao.dentro_validade ? "text-green-600" : "text-destructive"}`}>
                                {cupomValidation.validacao.dentro_validade ? "✅" : "❌"} Dentro da validade da receita
                              </p>
                              <p className={`text-xs flex items-center gap-1 ${cupomValidation.validacao.intervalo_respeitado ? "text-green-600" : "text-destructive"}`}>
                                {cupomValidation.validacao.intervalo_respeitado ? "✅" : "❌"} Intervalo entre retiradas respeitado
                              </p>
                              {cupomValidation.validacao.observacoes && (
                                <div className="p-2 rounded-lg bg-muted/50 border border-border/50 mt-1">
                                  <p className="text-[11px] text-muted-foreground">{cupomValidation.validacao.observacoes}</p>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Botão confirmar datas */}
                          {!datasConfirmadas ? (
                            <Button type="button" variant="outline"
                              className="w-full rounded-xl border-2 border-amber-400 bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold"
                              onClick={() => { setDatasConfirmadas(true); toast.success("Datas conferidas ✓"); }}>
                              <CheckCircle className="w-4 h-4 mr-2" />
                              Confirmo que conferi as datas acima
                            </Button>
                          ) : (
                            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-green-50 border border-green-200 text-green-700">
                              <CheckCircle className="w-4 h-4" />
                              <span className="text-xs font-semibold">Datas conferidas ✓</span>
                              <button type="button" className="ml-auto text-[10px] underline text-muted-foreground hover:text-foreground"
                                onClick={() => setDatasConfirmadas(false)}>Refazer</button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Sem validação IA mas tem cupom: confirmar manual */}
                      {cupomFile && cupomQrFile && !cupomValidation && !cupomOcrLoading && (
                        <>
                          {!datasConfirmadas ? (
                            <Button type="button" variant="outline"
                              className="w-full rounded-xl border-2 border-amber-400 bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold"
                              onClick={() => { setDatasConfirmadas(true); toast.success("Datas conferidas ✓"); }}>
                              <CheckCircle className="w-4 h-4 mr-2" />
                              Confirmo que conferi as datas
                            </Button>
                          ) : (
                            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-green-50 border border-green-200 text-green-700">
                              <CheckCircle className="w-4 h-4" />
                              <span className="text-xs font-semibold">Datas conferidas ✓</span>
                              <button type="button" className="ml-auto text-[10px] underline text-muted-foreground hover:text-foreground"
                                onClick={() => setDatasConfirmadas(false)}>Refazer</button>
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              )}

              {step === "confirmar" && (
                <div className="space-y-3">
                  <div className="text-center space-y-0.5">
                    <ShieldCheck className="w-7 h-7 mx-auto text-primary" />
                    <p className="text-sm font-medium">Revisar e Confirmar</p>
                  </div>

                  <div className="space-y-1.5 p-3 rounded-2xl bg-muted/40 text-sm">
                    {[
                      ["Operador", operadorNome],
                      ["Paciente", paciente.nome],
                      ["CPF", formatCpfMask(paciente.cpf)],
                      ["Dispensação", `${ciclo.total_dispensacoes + 1}ª de ${ciclo.limite_maximo}`],
                      ["Data retirada", new Date(dataDispensacao + "T00:00:00").toLocaleDateString("pt-BR")],
                      ["Retirada", tipo === "proprio" ? "Titular" : "Representante"],
                      ...(tipo === "representante" && repNome ? [["Representante", repNome]] : []),
                      ["Documentos", "✓ Validados"],
                      ["Cupom assinado", "✓ Anexado"],
                      ["Cupom QR Code", cupomQrFile ? "✓ Anexado" : "❌"],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between py-1">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium">{value}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-2xl bg-muted/50 border border-border">
                    <Checkbox id="confirmDocs" checked={confirmChecked} onCheckedChange={(c) => setConfirmChecked(!!c)} className="mt-0.5" />
                    <label htmlFor="confirmDocs" className="text-sm cursor-pointer leading-snug">
                      Confirmo que conferi todos os documentos presencialmente.
                    </label>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
          </div>

          <div className="flex items-center justify-between px-5 py-3 border-t border-border shrink-0 bg-background">
            <Button variant="ghost" onClick={stepIndex === 0 ? () => setShowExitConfirm(true) : goBack} className="rounded-xl min-h-[44px]">
              {stepIndex === 0 ? "Cancelar" : <><ChevronLeft className="w-4 h-4 mr-1" /> Voltar</>}
            </Button>
            {step === "confirmar" ? (
              <Button
                onClick={handleRegistrar}
                disabled={saving || !confirmChecked}
                className="rounded-xl bg-gradient-to-r from-emerald-500 to-green-400 text-white hover:opacity-90 shadow-md min-h-[44px]"
              >
                {saving ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Registrando...</> : "✅ Registrar"}
              </Button>
            ) : (
              <Button onClick={goNext} disabled={!canGoNext()} className="rounded-xl min-h-[44px]">
                Próximo <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              Deseja realmente sair?
            </AlertDialogTitle>
            <AlertDialogDescription>
              O progresso atual será perdido e nenhum dado será salvo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar aqui</AlertDialogCancel>
            <AlertDialogAction onClick={onClose} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Sim, sair
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>,
    document.body
  );
}
