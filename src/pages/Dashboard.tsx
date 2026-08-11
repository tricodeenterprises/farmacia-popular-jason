import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  Search, Camera, Upload, Loader2, ScanLine, AlertTriangle, X, Plus, UserPlus,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import PacientePanel from "@/components/farmacia/PacientePanel";
import CadastroPaciente from "@/components/farmacia/CadastroPaciente";
import CameraCapture from "@/components/farmacia/CameraCapture";
import { useCameraStream } from "@/hooks/useCameraStream";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { motion, AnimatePresence } from "framer-motion";
import DashboardWhatsAppFAB from "@/components/DashboardWhatsAppFAB";
import { categoriaLabelComEmoji } from "@/lib/categorias";

function formatDateBR(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR");
}

export default function Dashboard() {
  const { effectiveRole, profile } = useAuth();
  const navigate = useNavigate();
  const [expiredCycles, setExpiredCycles] = useState<any[]>([]);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  useEffect(() => {
    const checkExpired = async () => {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const ontem = new Date(hoje);
      ontem.setDate(ontem.getDate() - 1);
      const { data } = await supabase
        .from("ciclos")
        .select("*, receitas(tipo, nome_medico), pacientes(nome, cpf)")
        .eq("status", "encerrado")
        .eq("motivo_encerramento", "expirado")
        .gte("encerrado_em", ontem.toISOString())
        .order("encerrado_em", { ascending: false })
        .limit(10);
      setExpiredCycles(data || []);
    };
    checkExpired();
  }, []);

  const [cpf, setCpf] = useState("");
  const [searchMode, setSearchMode] = useState<"cpf" | "nome">("cpf");
  const [nomeBusca, setNomeBusca] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [paciente, setPaciente] = useState<any>(null);
  const [showCadastro, setShowCadastro] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [pendingPaciente, setPendingPaciente] = useState<any>(null);
  const { showCamera, stream: cameraStream, openCamera: openCameraStream, closeCamera } = useCameraStream();
  const [ocrLoading, setOcrLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [ocrData, setOcrData] = useState<any>(null);
  const [ocrImageDataUrl, setOcrImageDataUrl] = useState<string | null>(null);
  const [capturedPhotos, setCapturedPhotos] = useState<{ preview: string; file: File }[]>([]);

  const formatCpf = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    return digits
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  };

  const handleSearch = async (rawCpf?: string) => {
    const cleanCpf = (rawCpf || cpf).replace(/\D/g, "");
    if (cleanCpf.length !== 11) {
      toast.error("CPF deve ter 11 dígitos.");
      return;
    }
    setSearching(true);
    setNotFound(false);
    setPaciente(null);
    setShowCadastro(false);
    setShowConfirmation(false);
    setPendingPaciente(null);

    const { data, error } = await supabase
      .from("pacientes")
      .select("*")
      .eq("cpf", cleanCpf)
      .eq("ativo", true)
      .maybeSingle();

    if (error) {
      toast.error("Erro ao buscar paciente.");
    } else if (!data) {
      const { data: inactive } = await supabase
        .from("pacientes")
        .select("nome")
        .eq("cpf", cleanCpf)
        .eq("ativo", false)
        .maybeSingle();
      if (inactive) {
        toast.error(`Cliente "${inactive.nome}" encontrado mas está INATIVO. Contate o administrador.`);
      } else {
        setNotFound(true);
      }
    } else {
      setPendingPaciente(data);
      setShowConfirmation(true);
    }
    setSearching(false);
  };

  const handleSearchByName = async () => {
    const nome = nomeBusca.trim();
    if (nome.length < 3) {
      toast.error("Digite pelo menos 3 caracteres do nome.");
      return;
    }
    setSearching(true);
    setNotFound(false);
    setPaciente(null);
    setShowCadastro(false);
    setShowConfirmation(false);
    setPendingPaciente(null);
    setSearchResults([]);

    const { data, error } = await supabase
      .from("pacientes")
      .select("*")
      .eq("ativo", true)
      .ilike("nome", `%${nome}%`)
      .order("nome")
      .limit(10);

    if (error) {
      toast.error("Erro ao buscar paciente.");
    } else if (!data || data.length === 0) {
      setNotFound(true);
    } else if (data.length === 1) {
      setPendingPaciente(data[0]);
      setShowConfirmation(true);
    } else {
      setSearchResults(data);
    }
    setSearching(false);
  };

  const selectSearchResult = (p: any) => {
    setSearchResults([]);
    setPendingPaciente(p);
    setShowConfirmation(true);
  };

  const confirmPatient = () => {
    setPaciente(pendingPaciente);
    setShowConfirmation(false);
    setPendingPaciente(null);
  };

  const rejectPatient = () => {
    setShowConfirmation(false);
    setPendingPaciente(null);
    toast.info("Busca cancelada. Tente novamente.");
  };

  const processOcrImage = async (file: File) => {
    setOcrLoading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target?.result as string);
        reader.onerror = () => reject(new Error("Erro ao ler arquivo"));
        reader.readAsDataURL(file);
      });
      setOcrImageDataUrl(dataUrl);
      setCapturedPhotos(prev => [...prev, { preview: dataUrl, file }]);
      const base64 = dataUrl.split(",")[1];
      try {
        const { data, error } = await supabase.functions.invoke("ocr-document", {
          body: { imageBase64: base64, tipo: "documento" },
        });
        if (error) throw error;
        setOcrData(data);
        if (data.cpf) {
          const cleanCpf = data.cpf.replace(/\D/g, "").slice(0, 11);
          if (cleanCpf.length === 11) {
            setCpf(formatCpf(cleanCpf));
            toast.success(`CPF detectado: ${formatCpf(cleanCpf)}`);
            await handleSearch(cleanCpf);
          } else {
            setCpf(formatCpf(cleanCpf));
            toast.warning(`CPF parcialmente detectado. Complete manualmente.`);
          }
        } else {
          toast.warning("CPF não detectado na imagem. Digite manualmente.");
        }
      } catch {
        toast.warning("Erro no OCR, mas a foto foi salva. Digite o CPF manualmente.");
      }
    } catch {
      toast.error("Erro ao processar imagem.");
    } finally {
      setOcrLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processOcrImage(file);
    e.target.value = "";
  };

  const handleNewSearch = () => {
    setPaciente(null);
    setCpf("");
    setNomeBusca("");
    setSearchResults([]);
    setNotFound(false);
    setShowCadastro(false);
    setShowConfirmation(false);
    setPendingPaciente(null);
    setCapturedPhotos([]);
    setOcrImageDataUrl(null);
    setOcrData(null);
  };

  const removePhoto = (index: number) => {
    setCapturedPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Bom dia";
    if (hour < 18) return "Boa tarde";
    return "Boa noite";
  };

  const firstName = profile?.nome?.split(" ")[0] || "Operador";
  const activeAlerts = expiredCycles.filter(c => !dismissedAlerts.has(c.id));

  return (
    <AppLayout title="Sistema">
      <div className="space-y-6">

        {/* ═══ 1. Saudação e contexto ═══ */}
        {!paciente && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center pt-2 pb-1"
          >
            <h1
              className="text-xl sm:text-2xl font-bold text-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {getGreeting()}, {firstName} 👋
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Identifique o paciente para iniciar o atendimento
            </p>
          </motion.div>
        )}

        {/* ═══ 2. Alertas críticos ═══ */}
        <AnimatePresence>
          {activeAlerts.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-2"
            >
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                Alertas recentes
              </p>
              {activeAlerts.map((c) => {
                const pacNome = (c as any).pacientes?.nome || "Paciente";
                const pacCpf = (c as any).pacientes?.cpf || "";
                const tipo = categoriaLabelComEmoji((c as any).receitas?.tipo);
                return (
                  <motion.div
                    key={c.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/8 border border-amber-500/20 text-foreground"
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">Ciclo expirado</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {pacNome} {pacCpf ? `(${pacCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")})` : ""} — {tipo} — {formatDateBR(c.encerrado_em)}
                      </p>
                    </div>
                    <button
                      className="shrink-0 p-1 rounded-lg text-muted-foreground hover:bg-secondary transition-colors"
                      onClick={() => setDismissedAlerts(prev => new Set([...prev, c.id]))}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══ 3. Card principal de busca ═══ */}
        <AnimatePresence mode="wait">
          {!paciente && (
            <motion.div
              key="search"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Card className="overflow-hidden border-border/40 bg-card/95 backdrop-blur-xl xl:max-w-5xl xl:mx-auto">
                <CardContent className="space-y-5 p-5 sm:p-6">
                  {/* Captura por foto */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => openCameraStream()}
                      disabled={ocrLoading}
                      className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-border/50 bg-secondary/30 hover:bg-secondary/60 hover:border-primary/30 transition-all group"
                    >
                      {ocrLoading ? (
                        <Loader2 className="w-7 h-7 animate-spin text-primary" />
                      ) : (
                        <Camera className="w-7 h-7 text-primary group-hover:scale-105 transition-transform" />
                      )}
                      <span className="text-xs font-semibold text-foreground/80">Tirar Foto</span>
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={ocrLoading}
                      className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-border/50 bg-secondary/30 hover:bg-secondary/60 hover:border-accent/30 transition-all group"
                    >
                      {ocrLoading ? (
                        <Loader2 className="w-7 h-7 animate-spin text-accent" />
                      ) : (
                        <Upload className="w-7 h-7 text-accent group-hover:scale-105 transition-transform" />
                      )}
                      <span className="text-xs font-semibold text-foreground/80">Anexar Foto</span>
                    </button>
                  </div>

                  <p className="text-[11px] text-muted-foreground text-center">
                    🔒 A foto não é salva — usada apenas para leitura do CPF
                  </p>

                  {/* Divisor */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-border/50" />
                    <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">ou busque manualmente</span>
                    <div className="flex-1 h-px bg-border/50" />
                  </div>

                  {/* Toggle CPF / Nome */}
                  <div className="flex gap-1.5 justify-center p-1 bg-secondary/50 rounded-xl">
                    <button
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                        searchMode === "cpf"
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={() => setSearchMode("cpf")}
                    >
                      Por CPF
                    </button>
                    <button
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                        searchMode === "nome"
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={() => setSearchMode("nome")}
                    >
                      Por Nome
                    </button>
                  </div>

                  {/* Campo de busca */}
                  {searchMode === "cpf" ? (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        placeholder="000.000.000-00"
                        value={cpf}
                        onChange={(e) => setCpf(formatCpf(e.target.value))}
                        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                        className="text-lg text-center tracking-wider min-h-[48px]"
                        disabled={ocrLoading}
                      />
                      <Button
                        onClick={() => handleSearch()}
                        disabled={searching || ocrLoading}
                        size="lg"
                        className="w-full sm:w-auto min-h-[48px] px-6"
                      >
                        <Search className="w-5 h-5 mr-2" />
                        {searching ? "Buscando..." : "Consultar"}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        placeholder="Nome do paciente"
                        value={nomeBusca}
                        onChange={(e) => setNomeBusca(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSearchByName()}
                        className="text-lg text-center min-h-[48px]"
                        disabled={ocrLoading}
                      />
                      <Button
                        onClick={handleSearchByName}
                        disabled={searching || ocrLoading}
                        size="lg"
                        className="w-full sm:w-auto min-h-[48px] px-6"
                      >
                        <Search className="w-5 h-5 mr-2" />
                        {searching ? "Buscando..." : "Buscar"}
                      </Button>
                    </div>
                  )}

                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />

                  {/* Fotos capturadas */}
                  {capturedPhotos.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Fotos capturadas</Label>
                      <div className="flex flex-wrap gap-2">
                        {capturedPhotos.map((photo, i) => (
                          <div key={i} className="relative group">
                            <img src={photo.preview} alt={`Foto ${i + 1}`} className="w-16 h-12 object-cover rounded-lg border border-border/50" />
                            <button
                              type="button"
                              onClick={() => removePhoto(i)}
                              className="absolute -top-1 -right-1 bg-destructive text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => openCameraStream()}
                          disabled={ocrLoading}
                          className="w-16 h-12 border border-dashed border-border/60 rounded-lg flex flex-col items-center justify-center gap-0.5 hover:border-primary/40 hover:bg-primary/5 transition-all"
                        >
                          <Plus className="w-4 h-4 text-muted-foreground" />
                          <span className="text-[9px] text-muted-foreground">Mais</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* OCR loading */}
                  {ocrLoading && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center justify-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/15"
                    >
                      <ScanLine className="w-4 h-4 text-primary animate-pulse" />
                      <span className="text-sm text-primary font-medium">Lendo documento...</span>
                    </motion.div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══ 4. Resultados múltiplos ═══ */}
        <AnimatePresence mode="wait">
          {searchResults.length > 0 && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-2"
            >
              <p className="text-sm font-semibold text-foreground text-center">
                {searchResults.length} pacientes encontrados
              </p>
              {searchResults.map((p) => (
                <motion.button
                  key={p.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => selectSearchResult(p)}
                  className="w-full text-left p-4 rounded-xl bg-card/90 border border-border/40 hover:border-primary/30 hover:shadow-sm transition-all"
                >
                  <p className="text-base font-semibold text-foreground">{p.nome}</p>
                  <p className="text-sm text-muted-foreground font-mono">{formatCpf(p.cpf)}</p>
                </motion.button>
              ))}
              <Button variant="ghost" size="sm" onClick={handleNewSearch} className="w-full text-muted-foreground mt-1">
                Limpar Busca
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══ 5. Confirmação do paciente ═══ */}
        <AnimatePresence mode="wait">
          {showConfirmation && pendingPaciente && (
            <motion.div
              key="confirmation"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              className="space-y-3"
            >
              <p className="text-center text-sm font-semibold text-foreground">
                Confirme os dados do paciente
              </p>

              <div className="rounded-xl border border-primary/20 bg-card/95 p-5 space-y-4">
                <div className="text-center">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">CPF</p>
                  <p className="text-2xl sm:text-3xl font-bold font-mono text-foreground tracking-wider">
                    {formatCpf(pendingPaciente.cpf)}
                  </p>
                </div>
                <div className="h-px bg-border/40" />
                <div className="text-center">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Nome Completo</p>
                  <p className="text-xl sm:text-2xl font-bold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
                    {pendingPaciente.nome}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={rejectPatient}
                  className="min-h-[48px] border-destructive/25 text-destructive hover:bg-destructive/8"
                >
                  ❌ Não é esse
                </Button>
                <Button
                  size="lg"
                  onClick={confirmPatient}
                  className="min-h-[48px]"
                >
                  ✅ Confirmar
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══ Paciente não encontrado ═══ */}
        <AnimatePresence mode="wait">
          {notFound && !showCadastro && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="text-center space-y-4 py-8"
            >
              <div className="w-14 h-14 rounded-full bg-secondary/60 flex items-center justify-center mx-auto">
                <Search className="w-6 h-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">Paciente não encontrado</p>
                <p className="text-sm text-muted-foreground mt-1">Deseja cadastrar um novo paciente?</p>
              </div>
              <Button onClick={() => setShowCadastro(true)} className="min-h-[44px]">
                <UserPlus className="w-4 h-4 mr-2" />
                Cadastrar Novo Paciente
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {showCadastro && (
          <CadastroPaciente
            cpfInicial={cpf.replace(/\D/g, "")}
            ocrDataInicial={ocrData}
            ocrImageDataUrlInicial={ocrImageDataUrl}
            onSaved={(p) => {
              setPaciente(p);
              setShowCadastro(false);
              setNotFound(false);
            }}
            onCancel={() => setShowCadastro(false)}
          />
        )}

        {/* ═══ 6. Paciente selecionado ═══ */}
        {paciente && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between xl:max-w-[1480px] xl:mx-auto">
              <Button variant="ghost" size="sm" onClick={handleNewSearch} className="text-muted-foreground">
                <Search className="w-4 h-4 mr-1" /> Nova Consulta
              </Button>
              <p className="text-xs text-muted-foreground font-mono">
                CPF: {formatCpf(paciente.cpf)}
              </p>
            </div>
            <PacientePanel paciente={paciente} />
          </motion.div>
        )}
      </div>

      <CameraCapture
        open={showCamera}
        stream={cameraStream}
        onCapture={(file) => {
          closeCamera();
          processOcrImage(file);
        }}
        onClose={() => closeCamera()}
        title="Fotografar CPF"
      />
      <DashboardWhatsAppFAB />
    </AppLayout>
  );
}
