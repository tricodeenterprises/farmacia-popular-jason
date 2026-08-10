import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Camera, Upload, Loader2, CheckCircle, AlertCircle, Search, FileText, Shield, Plus, X, ArrowRight, Calendar, Stethoscope, User, CreditCard, CheckSquare } from "lucide-react";
import CameraCapture from "./CameraCapture";
import { useCameraStream } from "@/hooks/useCameraStream";
import { addDaysToDateStr, calculateCycleLimit } from "@/lib/ciclo-utils";

interface Props {
  pacienteId: string;
  onClose: () => void;
}

function formatDateBR(dateStr: string | null): string {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  if (!y || !m || !d) return dateStr;
  return `${d}/${m}/${y}`;
}

export default function NovaReceita({ pacienteId, onClose }: Props) {
  const { user } = useAuth();
  const [dataEmissao, setDataEmissao] = useState("");
  const [nomeMedico, setNomeMedico] = useState("");
  const [tipoReceita, setTipoReceita] = useState<"medicamento" | "fralda">("medicamento");
  const [saving, setSaving] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<"idle" | "success" | "error">("idle");
  const [receitaPreview, setReceitaPreview] = useState<string | null>(null);
  const [receitaFile, setReceitaFile] = useState<File | null>(null);
  const [extraPhotos, setExtraPhotos] = useState<{ preview: string; file: File }[]>([]);
  // CRM removed - not used
  const [ocrDetails, setOcrDetails] = useState<string[]>([]);
  const { showCamera, stream: cameraStream, openCamera: openCameraStream, closeCamera } = useCameraStream();
  const [cameraMode, setCameraMode] = useState<"main" | "extra">("main");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const extraFileRef = useRef<HTMLInputElement>(null);
  // Date confidence state
  const [dateConfidence, setDateConfidence] = useState<number | null>(null);
  const [dateIsHandwritten, setDateIsHandwritten] = useState(false);
  const [dateObservations, setDateObservations] = useState<string | null>(null);
  const [dateAlternative, setDateAlternative] = useState<string | null>(null);
  const [dateConfirmedByUser, setDateConfirmedByUser] = useState(false);


  const processFile = (file: File) => {
    setReceitaFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setReceitaPreview(dataUrl);
      runOCR(dataUrl.split(",")[1]);
    };
    reader.readAsDataURL(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    if (e.target) e.target.value = "";
  };

  const handleCameraCapture = (file: File) => {
    if (cameraMode === "extra") {
      addExtraPhoto(file);
    } else {
      processFile(file);
    }
  };

  const addExtraPhoto = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setExtraPhotos(prev => [...prev, { preview: dataUrl, file }]);
    };
    reader.readAsDataURL(file);
  };

  const handleExtraFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) addExtraPhoto(file);
    if (e.target) e.target.value = "";
  };

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

  const runOCR = async (base64: string) => {
    setOcrLoading(true);
    setOcrStatus("idle");
    setOcrDetails([]);
    setDateConfidence(null);
    setDateIsHandwritten(false);
    setDateObservations(null);
    setDateAlternative(null);
    setDateConfirmedByUser(false);
    try {
      const { data, error } = await supabase.functions.invoke("ocr-document", {
        body: { imageBase64: base64, tipo: "receita" },
      });
      if (error) throw error;
      if (data.erro && !data.data_emissao && !data.crm && !data.nome_medico) { toast.error(data.erro); setOcrStatus("error"); setOcrDetails(["❌ " + data.erro, ...getQualityFeedback(data)]); return; }

      const details: string[] = [];
      details.push(...getQualityFeedback(data));
      if (details.length > 0) details.push("");

      // Date confidence handling
      const dConf = data.data_confianca ?? null;
      const dManuscrita = data.data_manuscrita ?? false;
      setDateConfidence(dConf);
      setDateIsHandwritten(dManuscrita);
      setDateObservations(data.data_observacoes || null);
      setDateAlternative(data.data_alternativa || null);

      if (data.data_emissao) {
        setDataEmissao(data.data_emissao);
        let dateLabel = "✅ Data de emissão: " + formatDateBR(data.data_emissao);
        if (dManuscrita) dateLabel += " (manuscrita)";
        if (dConf !== null) {
          if (dConf >= 90) dateLabel += ` — Confiança: ${dConf}% ✅`;
          else if (dConf >= 70) dateLabel += ` — Confiança: ${dConf}% ⚠️`;
          else if (dConf >= 50) dateLabel += ` — Confiança: ${dConf}% ⚠️ VERIFICAR`;
          else dateLabel += ` — Confiança: ${dConf}% 🚨 PROVÁVEL ERRO`;
        }
        details.push(dateLabel);
        if (data.data_observacoes) details.push(`📝 ${data.data_observacoes}`);
        if (data.data_alternativa) details.push(`🔄 Interpretação alternativa: ${formatDateBR(data.data_alternativa)}`);

        // Auto-confirm if high confidence and not handwritten
        if (!dManuscrita && dConf !== null && dConf >= 90) {
          setDateConfirmedByUser(true);
        }
      } else {
        details.push("❌ Data de emissão não encontrada");
      }

      if (data.nome_medico) { setNomeMedico(data.nome_medico); details.push("✅ Médico: " + data.nome_medico); } else { details.push("❌ Nome do médico não encontrado"); }
      if (data.tipo_receita) { setTipoReceita(data.tipo_receita); details.push("✅ Tipo: " + (data.tipo_receita === "fralda" ? "Fralda" : "Medicamento")); }
      if (data.medicamentos?.length) { details.push("✅ " + data.medicamentos.length + " item(ns) encontrado(s)"); }
      details.push("");
      details.push("⚠️ Confira manualmente se os dados estão corretos.");

      setOcrDetails(details);
      const hasAny = data.data_emissao || data.crm || data.nome_medico;
      if (hasAny) { setOcrStatus("success"); toast.success("Dados extraídos da receita!"); }
      else {
        setOcrStatus("error");
        const qualidade = data.score_qualidade ?? 100;
        if (qualidade < 50) toast.warning("Qualidade da foto baixa. Tente uma foto mais nítida.");
        else toast.warning("Receita ilegível. Preencha manualmente.");
      }
    } catch {
      toast.error("Erro ao processar receita. Preencha manualmente.");
      setOcrStatus("error");
      setOcrDetails(["❌ Falha no processamento"]);
    } finally {
      setOcrLoading(false);
    }
  };

  const getReceitaVencida = () => {
    if (!dataEmissao) return false;
    const emissao = new Date(dataEmissao + "T00:00:00");
    const validade = new Date(emissao);
    validade.setDate(validade.getDate() + 180);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return hoje > validade;
  };

  const needsDateConfirmation = dateConfidence !== null && (dateConfidence < 70 || dateIsHandwritten) && !dateConfirmedByUser;
  const isFormComplete = () => !!dataEmissao && !!receitaFile && !!nomeMedico && !getReceitaVencida() && !needsDateConfirmation;

  const handleSave = async () => {
    if (!dataEmissao) { toast.error("Data de emissão obrigatória."); return; }
    if (!receitaFile) { toast.error("Foto da receita obrigatória."); return; }
    if (!nomeMedico) { toast.error("Nome do médico é obrigatório."); return; }
    if (getReceitaVencida()) { toast.error("Receita vencida! Não é possível registrar."); return; }

    await doSave();
  };

  const doSave = async () => {
    setSaving(true);

    let arquivoUrl = "";
    if (receitaFile) {
      const ext = receitaFile.name.split(".").pop();
      const path = `receitas/${pacienteId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("documentos").upload(path, receitaFile);
      if (upErr) {
        toast.error("Erro ao enviar imagem da receita.");
        setSaving(false);
        return;
      }
      const { data: urlData } = supabase.storage.from("documentos").getPublicUrl(path);
      arquivoUrl = urlData.publicUrl;
    }

    const extraUrls: string[] = [];
    for (const ep of extraPhotos) {
      const ext = ep.file.name.split(".").pop();
      const path = `receitas/${pacienteId}/extra_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("documentos").upload(path, ep.file);
      if (!upErr) {
        const { data: urlData } = supabase.storage.from("documentos").getPublicUrl(path);
        extraUrls.push(urlData.publicUrl);
      }
    }


    const validadeStr = addDaysToDateStr(dataEmissao, 180);
    const intervalo = tipoReceita === "fralda" ? 10 : 29;

    // data_inicio = data de emissão da receita (NOT the system date)
    const dataInicioStr = dataEmissao;

    const { data: receita, error: recErr } = await supabase
      .from("receitas")
      .insert({
        paciente_id: pacienteId,
        arquivo_url: arquivoUrl,
        data_emissao: dataEmissao,
        validade_ate: validadeStr,
        crm: null,
        nome_medico: nomeMedico || null,
        uploaded_by: user?.id,
        tipo: tipoReceita,
        dados_extraidos: extraUrls.length > 0 ? { fotos_extras: extraUrls } : null,
      })
      .select()
      .single();

    if (recErr || !receita) {
      toast.error(recErr?.message ? `Erro ao criar receita: ${recErr.message}` : "Erro ao criar receita.");
      setSaving(false);
      return;
    }

    const limiteMaximo = calculateCycleLimit({
      tipoReceita,
      dataInicio: dataInicioStr,
      dataFim: validadeStr,
      primeiraRetirada: dataInicioStr,
      intervaloDias: intervalo,
    });

    // Novo ciclo começa sem dispensações — ultima_retirada será preenchida na 1ª dispensação
    const { error: cicloErr } = await supabase.from("ciclos").insert({
      paciente_id: pacienteId,
      receita_id: receita.id,
      data_inicio: dataInicioStr,
      data_fim: validadeStr,
      intervalo_dias: intervalo,
      limite_maximo: limiteMaximo,
      ultima_retirada: null,
    });

    if (cicloErr) {
      toast.error("Erro ao criar ciclo.");
    } else {
      await supabase.from("logs").insert({
        user_id: user?.id,
        acao: "nova_receita",
        detalhes: { paciente_id: pacienteId, receita_id: receita.id, tipo: tipoReceita },
      });
      toast.success("Receita registrada e ciclo iniciado!");
    }
    setSaving(false);
    onClose();
  };


  const steps = [
    { icon: FileText, label: "RECEITA", active: true },
    { icon: User, label: "PACIENTE", active: false },
    { icon: CreditCard, label: "PAGAMENTO", active: false },
    { icon: CheckSquare, label: "CONFIRMAR", active: false },
  ];

  return (
    <>
      <CameraCapture
        open={showCamera}
        stream={cameraStream}
        onCapture={handleCameraCapture}
        onClose={() => closeCamera()}
        title="Tirar Foto da Receita"
      />

      <Dialog open onOpenChange={() => onClose()}>
        <DialogContent className="w-full max-w-2xl max-h-[100dvh] sm:max-h-[95vh] overflow-y-auto p-0 rounded-none sm:rounded-2xl border-0 sm:border shadow-xl bg-[hsl(var(--background))] sm:m-4" style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
          
          {/* Header */}
          <div className="text-center pt-6 sm:pt-8 pb-2 sm:pb-4 px-4 sm:px-6">
            <h1 className="text-lg sm:text-[22px] font-bold tracking-tight text-foreground">
              Novo Ciclo
            </h1>
          </div>

          {/* Stepper */}
          <div className="flex items-center justify-center gap-0 px-4 sm:px-6 pb-4 sm:pb-6">
            {steps.map((step, i) => (
              <div key={step.label} className="flex items-center">
                <div className="flex flex-col items-center gap-1">
                  <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all ${
                    step.active
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    <step.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </div>
                </div>
                {i < steps.length - 1 && (
                  <div className="w-6 sm:w-16 h-[2px] bg-muted mx-1 sm:mx-2" />
                )}
              </div>
            ))}
          </div>

          <div className="px-4 sm:px-6 pb-6 sm:pb-8 space-y-6 sm:space-y-8">
            {/* PASSO 1: DIGITALIZAÇÃO */}
            <div className="space-y-3">
              <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleFileSelect} />
              <input ref={extraFileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleExtraFileSelect} />

              {!receitaPreview ? (
                <div className="grid grid-cols-2 gap-3 w-full">
                  <button
                    type="button"
                    className="h-[72px] sm:h-[80px] rounded-xl border border-border flex flex-col items-center justify-center gap-2 hover:border-primary/40 hover:bg-primary/5 active:bg-primary/10 transition-all bg-background"
                    onClick={() => { setCameraMode("main"); openCameraStream(); }}
                  >
                    <Camera className="w-6 h-6 text-muted-foreground" />
                    <span className="text-[13px] font-medium text-foreground">Tirar Foto</span>
                  </button>
                  <button
                    type="button"
                    className="h-[72px] sm:h-[80px] rounded-xl border border-border flex flex-col items-center justify-center gap-2 hover:border-primary/40 hover:bg-primary/5 active:bg-primary/10 transition-all bg-background"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-6 h-6 text-muted-foreground" />
                    <span className="text-[13px] font-medium text-foreground">Anexar Arquivo</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3 border rounded-2xl p-4 bg-background">
                  <div className="relative rounded-xl overflow-hidden border bg-muted/20">
                    <img src={receitaPreview} alt="Receita" className="w-full max-h-44 object-contain p-2" />
                    <div className="absolute top-2 right-2 flex gap-2">
                      {ocrLoading && <div className="bg-background/90 rounded-full p-2 shadow-sm"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>}
                      {ocrStatus === "success" && <div className="bg-background/90 rounded-full p-2 shadow-sm"><CheckCircle className="w-5 h-5 text-green-600" /></div>}
                      {ocrStatus === "error" && <div className="bg-background/90 rounded-full p-2 shadow-sm"><AlertCircle className="w-5 h-5 text-destructive" /></div>}
                    </div>
                    <div className="p-2 border-t bg-muted/30">
                      <Button variant="ghost" size="sm" className="rounded-lg text-xs" onClick={() => { setReceitaPreview(null); setReceitaFile(null); setExtraPhotos([]); setOcrStatus("idle"); setOcrDetails([]); }}>🔄 Trocar foto</Button>
                    </div>
                    {ocrDetails.length > 0 && (
                      <div className="mx-3 mb-3 p-2.5 rounded-xl bg-muted/50 text-xs space-y-0.5">
                        <p className="font-semibold mb-1">Resultado da leitura:</p>
                        {ocrDetails.map((d, i) => <p key={i}>{d}</p>)}
                      </div>
                    )}
                  </div>

                  {extraPhotos.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {extraPhotos.map((ep, i) => (
                        <div key={i} className="relative group">
                          <img src={ep.preview} alt={`Foto ${i + 2}`} className="w-20 h-16 object-cover rounded-lg border" />
                          <button type="button" onClick={() => setExtraPhotos(prev => prev.filter((_, j) => j !== i))}
                            className="absolute -top-1.5 -right-1.5 bg-destructive text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" className="rounded-xl text-xs" onClick={() => { setCameraMode("extra"); openCameraStream(); }}>
                      <Plus className="w-4 h-4 mr-1" /> Tirar Mais Foto
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="rounded-xl text-xs" onClick={() => extraFileRef.current?.click()}>
                      <Plus className="w-4 h-4 mr-1" /> Anexar Mais
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* PASSO 2: INFORMAÇÕES MÉDICAS */}
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <div className="w-[3px] h-5 rounded-full bg-primary" />
                <h2 className="text-[13px] font-bold uppercase tracking-widest text-foreground">
                  Passo 2: Informações Médicas
                </h2>
              </div>

              <div className="border rounded-2xl p-4 sm:p-5 bg-background space-y-4 sm:space-y-5">
                {/* Tipo de Receita */}
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-medium flex items-center gap-2 text-foreground">
                    <FileText className="w-4 h-4 text-primary" /> Tipo de Receita
                  </Label>
                  <Select value={tipoReceita} onValueChange={(v) => setTipoReceita(v as any)}>
                    <SelectTrigger className="h-12 rounded-xl text-[14px] bg-background border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="medicamento">Medicamento (30 dias)</SelectItem>
                      <SelectItem value="fralda">Fralda (intervalo configurável)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">Selecione a categoria que melhor descreve seu documento.</p>
                </div>

                {/* Data + Médico side by side */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <Label className="text-[13px] font-medium flex items-center gap-2 text-foreground">
                      <Calendar className="w-4 h-4 text-primary" /> Data de Emissão *
                    </Label>
                    <Input
                      type="date"
                      value={dataEmissao}
                      onChange={(e) => {
                        setDataEmissao(e.target.value);
                        // Manual change = user confirmed
                        if (dateConfidence !== null) setDateConfirmedByUser(true);
                      }}
                      className="h-12 rounded-xl text-[14px] bg-background"
                    />

                    {/* Date confidence indicator */}
                    {dataEmissao && dateConfidence !== null && (
                      <div className={`p-2.5 rounded-lg border ${
                        dateConfidence >= 90 ? "bg-green-500/10 border-green-500/30" :
                        dateConfidence >= 70 ? "bg-amber-500/10 border-amber-500/30" :
                        dateConfidence >= 50 ? "bg-orange-500/10 border-orange-500/30" :
                        "bg-destructive/10 border-destructive/30"
                      }`}>
                        <div className="flex items-center gap-2 mb-1">
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                dateConfidence >= 90 ? "bg-green-500" :
                                dateConfidence >= 70 ? "bg-amber-500" :
                                dateConfidence >= 50 ? "bg-orange-500" :
                                "bg-destructive"
                              }`}
                              style={{ width: `${dateConfidence}%` }}
                            />
                          </div>
                          <span className={`text-[11px] font-bold ${
                            dateConfidence >= 90 ? "text-green-700" :
                            dateConfidence >= 70 ? "text-amber-700" :
                            dateConfidence >= 50 ? "text-orange-700" :
                            "text-destructive"
                          }`}>
                            {dateConfidence}%
                          </span>
                        </div>
                        <p className={`text-[11px] font-medium ${
                          dateConfidence >= 90 ? "text-green-700" :
                          dateConfidence >= 70 ? "text-amber-700" :
                          dateConfidence >= 50 ? "text-orange-700" :
                          "text-destructive"
                        }`}>
                          {dateIsHandwritten && "✍️ Data manuscrita — "}
                          {dateConfidence >= 90 ? "Data claramente legível" :
                           dateConfidence >= 70 ? "Data legível, verifique" :
                           dateConfidence >= 50 ? "⚠️ Data difícil de ler — verifique com atenção" :
                           dateConfidence > 0 ? "🚨 Data quase ilegível — alta chance de erro" :
                           "🚫 Data ilegível — 0% de chance de estar correta"}
                        </p>
                        {dateObservations && (
                          <p className="text-[10px] text-muted-foreground mt-1">📝 {dateObservations}</p>
                        )}
                        {dateAlternative && (
                          <div className="mt-2 flex items-center gap-2">
                            <p className="text-[11px] text-muted-foreground">Poderia ser: <strong>{formatDateBR(dateAlternative)}</strong></p>
                            <button
                              type="button"
                              className="text-[11px] font-semibold text-primary underline"
                              onClick={() => {
                                const oldDate = dataEmissao;
                                setDataEmissao(dateAlternative);
                                setDateAlternative(oldDate);
                                setDateConfirmedByUser(false);
                              }}
                            >
                              Usar esta data
                            </button>
                          </div>
                        )}

                        {/* Confirmation button when needed */}
                        {needsDateConfirmation && (
                          <button
                            type="button"
                            onClick={() => setDateConfirmedByUser(true)}
                            className="mt-2 w-full h-10 rounded-lg bg-primary text-primary-foreground text-[12px] font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5"
                          >
                            <CheckCircle className="w-4 h-4" /> Confirmo que a data {formatDateBR(dataEmissao)} está correta
                          </button>
                        )}
                        {dateConfirmedByUser && dateConfidence < 90 && (
                          <p className="text-[10px] text-green-700 font-medium mt-1">✅ Data confirmada pelo operador</p>
                        )}
                      </div>
                    )}

                    {dataEmissao && (
                      getReceitaVencida() ? (
                        <div className="p-2 rounded-lg bg-destructive/10 border border-destructive/30">
                          <p className="text-[11px] text-destructive font-semibold">🚫 Receita VENCIDA!</p>
                        </div>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">
                          Validade: {(() => {
                            const d = new Date(dataEmissao + "T00:00:00");
                            d.setDate(d.getDate() + 180);
                            return formatDateBR(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
                          })()} (180 dias)
                        </p>
                      )
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[13px] font-medium flex items-center gap-2 text-foreground">
                      <Stethoscope className="w-4 h-4 text-primary" /> Médico Prescritor *
                    </Label>
                    {nomeMedico ? (
                      <div className="flex items-center gap-2 p-2.5 rounded-xl border bg-muted/40 h-12">
                        <Shield className="w-4 h-4 text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-[13px] truncate text-foreground">{nomeMedico}</p>
                        </div>
                        <Button variant="ghost" size="sm" className="rounded-lg text-[11px] h-7 px-2 shrink-0" onClick={() => setNomeMedico("")}>
                          Alterar
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Input
                          value={nomeMedico}
                          onChange={(e) => setNomeMedico(e.target.value)}
                          placeholder="Nome do médico prescritor..."
                          className="h-12 rounded-xl text-[14px] bg-background"
                          autoComplete="off"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t">
              <Button variant="ghost" onClick={onClose} className="rounded-xl h-12 text-destructive hover:text-destructive hover:bg-destructive/10 text-[13px] font-medium w-full sm:w-auto">
                <X className="w-4 h-4 mr-1.5" /> Cancelar
              </Button>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                <p className="text-[11px] text-muted-foreground hidden sm:block max-w-[220px] text-right leading-relaxed">
                  Certifique-se que os dados estão corretos antes de avançar.
                </p>
                <Button
                  onClick={handleSave}
                  disabled={saving || ocrLoading || !isFormComplete()}
                  className="rounded-full h-12 px-8 bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg text-[14px] font-semibold w-full sm:w-auto"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...
                    </>
                  ) : (
                    <>
                      Próximo Passo <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
