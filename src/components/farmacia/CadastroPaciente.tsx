import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Camera, Upload, Loader2, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";
import CameraCapture from "./CameraCapture";
import { useCameraStream } from "@/hooks/useCameraStream";

function validateCpfDigits(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
  let rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  if (rest !== parseInt(digits[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
  rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  return rest === parseInt(digits[10]);
}

interface Props {
  cpfInicial: string;
  ocrDataInicial?: any;
  ocrImageDataUrlInicial?: string | null;
  onSaved: (paciente: any) => void;
  onCancel: () => void;
}

export default function CadastroPaciente({ cpfInicial, ocrDataInicial, ocrImageDataUrlInicial, onSaved, onCancel }: Props) {
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState(cpfInicial);
  const [telefone, setTelefone] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [saving, setSaving] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<"idle" | "success" | "error">("idle");
  const [docPreview, setDocPreview] = useState<string | null>(null);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [ocrDetails, setOcrDetails] = useState<string[]>([]);
  const [qualityIssue, setQualityIssue] = useState<string | null>(null);
  const { showCamera, stream: cameraStream, openCamera: openCameraStream, closeCamera } = useCameraStream();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ocrDataInicial && ocrImageDataUrlInicial) {
      setDocPreview(ocrImageDataUrlInicial);
      fetch(ocrImageDataUrlInicial).then(res => res.blob()).then(blob => {
        const file = new File([blob], "documento_ocr.jpg", { type: blob.type });
        setDocFile(file);
      });
      
      const details: string[] = [];
      if (ocrDataInicial.nome_completo) { setNome(ocrDataInicial.nome_completo); details.push("✅ Nome: " + ocrDataInicial.nome_completo); } else { details.push("❌ Nome não encontrado"); }
      if (ocrDataInicial.cpf) { setCpf(ocrDataInicial.cpf.replace(/\D/g, "")); details.push("✅ CPF encontrado"); }
      if (ocrDataInicial.data_nascimento) { setDataNascimento(ocrDataInicial.data_nascimento); details.push("✅ Nascimento: " + formatDateBR(ocrDataInicial.data_nascimento)); }
      
      details.push("");
      details.push("⚠️ Confira manualmente se os dados estão corretos.");
      setOcrDetails(details);
      setOcrStatus(ocrDataInicial.nome_completo || ocrDataInicial.cpf ? "success" : "error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatDateBR = (dateStr: string) => {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-");
    if (!y || !m || !d) return dateStr;
    return `${d}/${m}/${y}`;
  };

  const checkImageQuality = (img: HTMLImageElement): string | null => {
    if (img.naturalWidth < 400 || img.naturalHeight < 300) return "Imagem muito pequena. Resolução mínima: 400x300px.";
    if (img.naturalWidth < 640 || img.naturalHeight < 480) return "Resolução baixa. A leitura pode ser imprecisa.";
    return null;
  };

  const processFile = (file: File) => {
    setDocFile(file);
    setQualityIssue(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setDocPreview(dataUrl);
      const img = new Image();
      img.onload = () => {
        const issue = checkImageQuality(img);
        if (issue) { setQualityIssue(issue); toast.warning(issue); }
        runOCR(dataUrl.split(",")[1]);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleCameraCapture = (file: File) => {
    processFile(file);
  };

  const runOCR = async (base64: string) => {
    setOcrLoading(true);
    setOcrStatus("idle");
    setOcrDetails([]);
    try {
      const { data, error } = await supabase.functions.invoke("ocr-document", {
        body: { imageBase64: base64, tipo: "documento" },
      });
      if (error) throw error;
      if (data.erro) { toast.error(data.erro); setOcrStatus("error"); setOcrDetails(["❌ " + data.erro]); return; }

      const details: string[] = [];
      if (data.nome_completo) { setNome(data.nome_completo); details.push("✅ Nome: " + data.nome_completo); } else { details.push("❌ Nome não encontrado"); }
      if (data.cpf) { setCpf(data.cpf.replace(/\D/g, "")); details.push("✅ CPF encontrado"); } else { details.push("❌ CPF não encontrado"); }
      
      if (data.data_nascimento) { setDataNascimento(data.data_nascimento); details.push("✅ Nascimento: " + formatDateBR(data.data_nascimento)); } else { details.push("⚠️ Data de nascimento não encontrada"); }
      

      details.push("");
      details.push("⚠️ Confira manualmente se os dados estão corretos.");

      setOcrDetails(details);
      const hasAny = data.nome_completo || data.cpf;
      if (hasAny) { setOcrStatus("success"); toast.success("Dados extraídos do documento!"); }
      else { setOcrStatus("error"); toast.warning("Documento ilegível. Preencha manualmente."); }
    } catch {
      toast.error("Erro ao processar documento. Preencha manualmente.");
      setOcrStatus("error");
      setOcrDetails(["❌ Falha no processamento"]);
    } finally {
      setOcrLoading(false);
    }
  };

  const resetPhoto = () => {
    setDocPreview(null);
    setDocFile(null);
    setOcrStatus("idle");
    setOcrDetails([]);
    setQualityIssue(null);
  };

  const handleSave = async () => {
    if (!nome.trim()) { toast.error("Nome é obrigatório."); return; }
    const cleanCpf = cpf.replace(/\D/g, "");
    if (cleanCpf.length !== 11) { toast.error("CPF deve ter 11 dígitos."); return; }
    if (!validateCpfDigits(cleanCpf)) { toast.error("CPF inválido! Verifique os dígitos."); return; }
    if (!dataNascimento) { toast.error("Data de nascimento é obrigatória."); return; }
    const cleanTel = telefone.replace(/\D/g, "");
    if (cleanTel.length > 0 && cleanTel.length < 10) { toast.error("Telefone deve ter no mínimo 10 dígitos."); return; }

    // Check for duplicate CPF
    const { data: existing } = await supabase
      .from("pacientes")
      .select("id, nome, ativo")
      .eq("cpf", cleanCpf)
      .maybeSingle();

    if (existing) {
      if (existing.ativo === false) {
        toast.error(`⚠️ Já existe um cliente inativo com este CPF: ${existing.nome}. Contate o administrador para reativar.`);
      } else {
        toast.error(`⚠️ Já existe um cliente cadastrado com este CPF: ${existing.nome}.`);
      }
      return;
    }

    // Check for duplicate name
    const { data: existingName } = await supabase
      .from("pacientes")
      .select("id, nome, cpf")
      .ilike("nome", nome.trim())
      .eq("ativo", true)
      .maybeSingle();

    if (existingName) {
      const maskedCpf = existingName.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
      toast.error(`⚠️ Já existe um cliente com o nome "${existingName.nome}" (CPF: ${maskedCpf}).`);
      return;
    }

    setSaving(true);

    let docUrl = "";
    if (docFile) {
      const ext = docFile.name.split(".").pop();
      const path = `pacientes/${cleanCpf}/documento_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("documentos").upload(path, docFile);
      if (!upErr) {
        const { data: urlData } = supabase.storage.from("documentos").getPublicUrl(path);
        docUrl = urlData.publicUrl;
      }
    }

    const { data, error } = await supabase
      .from("pacientes")
      .insert({
        nome: nome.trim(),
        cpf: cleanCpf,
        data_nascimento: dataNascimento || null,
        telefone: cleanTel || null,
      } as any)
      .select()
      .single();

    if (error) {
      toast.error("Erro ao cadastrar: " + error.message);
      setSaving(false);
      return;
    }

    if (docUrl && data) {
      const validade = new Date();
      validade.setFullYear(validade.getFullYear() + 10);
      await supabase.from("documentos").insert({
        paciente_id: data.id,
        tipo: "identidade",
        arquivo_url: docUrl,
        validade_ate: validade.toISOString(),
        dados_extraidos: { cpf: cleanCpf, nome: nome.trim(), data_nascimento: dataNascimento },
      });
    }

    toast.success("Paciente cadastrado!");
    onSaved(data);
    setSaving(false);
  };

  return (
    <>
      <CameraCapture
        open={showCamera}
        stream={cameraStream}
        onCapture={handleCameraCapture}
        onClose={() => closeCamera()}
        title="Tirar Foto do Documento"
      />
      <Card className="max-w-5xl mx-auto">
        <CardHeader>
          <CardTitle>Novo Paciente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-base font-semibold">📷 Foto do Documento (RG/CPF)</Label>
            <p className="text-xs text-muted-foreground">Tire uma foto ou envie a imagem para preenchimento automático dos dados</p>
            <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleFileAttach} />

            {!docPreview ? (
              <div className="grid grid-cols-2 gap-3">
                <Button type="button" variant="outline" className="h-24 border-dashed border-2 flex flex-col gap-2" onClick={() => openCameraStream()}>
                  <Camera className="w-8 h-8 text-muted-foreground" />
                  <span className="text-sm">Tirar Foto</span>
                </Button>
                <Button type="button" variant="outline" className="h-24 border-dashed border-2 flex flex-col gap-2" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="w-8 h-8 text-muted-foreground" />
                  <span className="text-sm">Anexar Arquivo</span>
                </Button>
              </div>
            ) : (
              <div className="relative">
                <img src={docPreview} alt="Documento" className="w-full max-h-48 object-contain rounded-lg border" />
                <div className="absolute top-2 right-2 flex gap-2">
                  {ocrLoading && <div className="bg-background/90 rounded-full p-2"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>}
                  {ocrStatus === "success" && <div className="bg-background/90 rounded-full p-2"><CheckCircle className="w-5 h-5 text-green-500" /></div>}
                  {ocrStatus === "error" && <div className="bg-background/90 rounded-full p-2"><AlertCircle className="w-5 h-5 text-destructive" /></div>}
                </div>
                {qualityIssue && (
                  <div className="mt-2 p-2 rounded bg-destructive/10 border border-destructive/30 text-sm text-destructive flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{qualityIssue}</span>
                  </div>
                )}
                <div className="flex gap-2 mt-2">
                  <Button variant="ghost" size="sm" onClick={resetPhoto}>
                    <RefreshCw className="w-4 h-4 mr-1" /> Trocar foto
                  </Button>
                </div>
                {ocrDetails.length > 0 && (
                  <div className="mt-2 p-2 rounded bg-muted text-xs space-y-0.5">
                    <p className="font-semibold mb-1">Resultado da leitura:</p>
                    {ocrDetails.map((d, i) => <p key={i}>{d}</p>)}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>CPF *</Label>
            <Input value={cpf} onChange={(e) => setCpf(e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="00000000000" className="font-mono" autoComplete="off" />
          </div>

          <div className="space-y-2">
            <Label>Nome Completo *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do paciente" autoComplete="off" />
          </div>

          <div className="space-y-2">
            <Label>Data de Nascimento *</Label>
            <Input type="date" value={dataNascimento} onChange={(e) => setDataNascimento(e.target.value)} required />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Telefone (WhatsApp)
              <span className="text-xs font-normal text-muted-foreground bg-accent/50 px-2 py-0.5 rounded-full">opcional</span>
            </Label>
            <Input
              type="tel"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value.replace(/\D/g, "").slice(0, 11))}
              placeholder="11999999999"
              className="font-mono"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">DDD + número (ex: 11999999999). Sem telefone, o paciente não receberá alertas por WhatsApp.</p>
          </div>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={onCancel}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || ocrLoading}>
              {saving ? "Salvando..." : "Salvar Paciente"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
