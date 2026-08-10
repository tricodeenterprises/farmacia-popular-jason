import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  User, FileText, Calendar, Package, Clock, ChevronDown, ChevronUp,
  Eye, Edit2, Save, X, Cake, Shield, Activity,
  XCircle, Lock, AlertTriangle, Loader2, FolderOpen, Image,
  Phone, MessageCircle, Camera, Trash2,
} from "lucide-react";
import NovaDispensacao from "./NovaDispensacao";
import { printDispensacaoCupom } from "@/lib/print-cupom";
import { Printer } from "lucide-react";
import SetupCiclo from "./SetupCiclo";
import ImageViewer from "./ImageViewer";
import BatchPhotoCapture from "./BatchPhotoCapture";
import GalleryPicker from "./GalleryPicker";
import { useGaleria } from "@/hooks/useGaleria";
import { addDaysToDateStr, calculateCycleLimit, calculateNextWithdrawalDate } from "@/lib/ciclo-utils";

interface Props {
  paciente: any;
}

import { formatCpfMask, formatDateBR } from "@/lib/format-utils";

function InfoField({ icon: Icon, label, value, mono }: { icon: React.ElementType; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-3 p-2.5 rounded-xl bg-muted/40 hover:bg-muted/60 transition-colors">
      <div className="shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
        <p className={`text-sm font-semibold mt-0.5 ${mono ? "font-mono" : ""}`}>{value}</p>
      </div>
    </div>
  );
}

export default function PacientePanel({ paciente: pacienteProp }: Props) {
  const { isMaster, user } = useAuth();
  const [paciente, setPaciente] = useState(pacienteProp);
  const [cicloAtivo, setCicloAtivo] = useState<any>(null);
  const [activeCiclos, setActiveCiclos] = useState<any[]>([]);
  const [allCiclos, setAllCiclos] = useState<any[]>([]);
  const [dispensacoes, setDispensacoes] = useState<any[]>([]);
  const [cycleDocs, setCycleDocs] = useState<any[]>([]);
  const [allDocVersions, setAllDocVersions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSetupNovo, setShowSetupNovo] = useState(false);
  const [showDispensacao, setShowDispensacao] = useState(false);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [showCicloHistory, setShowCicloHistory] = useState(false);

  // Cycle selector (date verification)
  const [showCycleSelector, setShowCycleSelector] = useState(false);
  const [cycleSelectorDate, setCycleSelectorDate] = useState("");
  const [cycleSelectorMatch, setCycleSelectorMatch] = useState<any>(null);
  const [showHistoricoDisp, setShowHistoricoDisp] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({ nome: "", telefone: "" });
  const [showPhoneGate, setShowPhoneGate] = useState(false);
  const [phoneGateValue, setPhoneGateValue] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);

  // Editar ciclo (master)
  const [editingCiclo, setEditingCiclo] = useState(false);
  const [editCicloData, setEditCicloData] = useState({ data_inicio: "", ultima_retirada: "", proxima_retirada: "" });
  const [savingCiclo, setSavingCiclo] = useState(false);
  const [corrigindoCiclo, setCorrigindoCiclo] = useState(false);
  const [encerrandoEAbrindo, setEncerrandoEAbrindo] = useState(false);

  // Encerrar ciclo
  const [showEncerrarCiclo, setShowEncerrarCiclo] = useState(false);
  const [motivoEncerramento, setMotivoEncerramento] = useState("");
  const [encerrando, setEncerrando] = useState(false);

  // Cancelar dispensação
  const [cancelDispId, setCancelDispId] = useState<string | null>(null);
  const [justificativaCancelamento, setJustificativaCancelamento] = useState("");
  const [cancelando, setCancelando] = useState(false);

  // Galeria
  const galeria = useGaleria(paciente.id);
  const [showBatchCamera, setShowBatchCamera] = useState(false);
  const [showGaleriaView, setShowGaleriaView] = useState(false);

  // Maps for user names (operadores removed - using profiles only)
  const [profileMap, setProfileMap] = useState<Record<string, string>>({});

  // Manual items dialog (when cupom não tem itens extraídos)
  const [itemsDialog, setItemsDialog] = useState<null | {
    disp: any;
    posicao: number;
    docId: string | null;
    items: { codigo: string; nome: string; quantidade: string }[];
  }>(null);
  const [savingItems, setSavingItems] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [ciclosRes, dispRes, allDocsRes, profilesRes] = await Promise.all([
      supabase.from("ciclos").select("*, receitas(*)").eq("paciente_id", paciente.id).order("created_at", { ascending: false }),
      supabase.from("dispensacoes").select("*, ciclos(intervalo_dias, limite_maximo, receitas(tipo))").eq("paciente_id", paciente.id).order("created_at", { ascending: false }).limit(50),
      supabase.from("documentos").select("*").eq("paciente_id", paciente.id).order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, nome"),
    ]);

    // Build profile lookup map
    const prfMap: Record<string, string> = {};
    (profilesRes.data || []).forEach((p: any) => { prfMap[p.id] = p.nome; });
    setProfileMap(prfMap);
    let allCiclosData = ciclosRes.data || [];

    // Auto-close expired cycles
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    for (const c of allCiclosData) {
      if (c.status === "ativo") {
        const fimDate = new Date(c.data_fim + "T23:59:59");
        const diaApos = new Date(fimDate);
        diaApos.setDate(diaApos.getDate() + 1);
        diaApos.setHours(0, 0, 0, 0);
        if (hoje >= diaApos) {
          await supabase.from("ciclos").update({
            status: "encerrado",
            motivo_encerramento: "expirado",
            encerrado_em: new Date().toISOString(),
          }).eq("id", c.id);
          c.status = "encerrado";
          c.motivo_encerramento = "expirado";
          c.encerrado_em = new Date().toISOString();
        }
      }
    }

    if (isMaster) {
      allCiclosData = await Promise.all(allCiclosData.map(async (c: any) => {
        if (c.status !== "ativo") return c;

        const tipoReceita = (c.receitas as any)?.tipo || "medicamento";
        const expectedDataFim = (c.receitas as any)?.validade_ate || c.data_fim;
        const expectedLimite = calculateCycleLimit({
          tipoReceita,
          dataInicio: c.data_inicio,
          dataFim: expectedDataFim,
          primeiraRetirada: c.data_inicio,
          intervaloDias: c.intervalo_dias,
        });

        const updates: Record<string, any> = {};
        if (c.limite_maximo !== expectedLimite) updates.limite_maximo = expectedLimite;

        if (Object.keys(updates).length === 0) return c;

        const { error } = await supabase.from("ciclos").update(updates).eq("id", c.id);
        if (error) {
          console.error("Falha ao normalizar ciclo", c.id, error.message);
          return c;
        }

        return { ...c, ...updates };
      }));
    }

    const allActive = allCiclosData.filter((c: any) => c.status === "ativo");
    setAllCiclos(allCiclosData);
    setActiveCiclos(allActive);
    // Keep current selection if still active, otherwise pick first
    setCicloAtivo((prev: any) => {
      if (prev && allActive.find((c: any) => c.id === prev.id)) {
        return allActive.find((c: any) => c.id === prev.id);
      }
      return allActive[0] || null;
    });
    setDispensacoes(dispRes.data || []);
    setAllDocVersions(allDocsRes.data || []);
    const firstActive = allActive[0] || null;
    const docs = (allDocsRes.data || []).filter((d: any) =>
      d.ciclo_id === firstActive?.id && d.status === "ativo"
    );
    setCycleDocs(docs);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [paciente.id, isMaster]);

  // Update cycleDocs when switching between active cycles
  useEffect(() => {
    if (cicloAtivo && allDocVersions.length > 0) {
      const docs = allDocVersions.filter((d: any) =>
        d.ciclo_id === cicloAtivo.id && d.status === "ativo"
      );
      setCycleDocs(docs);
    }
  }, [cicloAtivo?.id, allDocVersions]);

  const calcStatusForCiclo = (ciclo: any) => {
    if (!ciclo) return { label: "SEM CICLO ATIVO", color: "status-bloqueado", canDispense: false, actionLabel: "Registrar receita", info: "Registre uma receita para iniciar o ciclo.", proximaRetirada: null, reasons: ["Nenhum ciclo ativo"] };
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const fimCiclo = new Date(ciclo.data_fim + "T23:59:59");
    if (hoje > fimCiclo) return { label: "RECEITA VENCIDA", color: "status-bloqueado", canDispense: false, actionLabel: "Registrar nova receita", info: "A validade terminou. Inicie uma nova receita para continuar.", proximaRetirada: null, reasons: ["Receita expirada"] };
    if (ciclo.total_dispensacoes >= ciclo.limite_maximo) return { label: "LIMITE ATINGIDO", color: "status-bloqueado", canDispense: false, actionLabel: "Encerrar e iniciar nova", info: `Máximo de ${ciclo.limite_maximo} retiradas atingido.`, proximaRetirada: null, reasons: ["Limite de retiradas atingido"] };
    const restantes = ciclo.limite_maximo - ciclo.total_dispensacoes;
    const proximaStr = ciclo.ultima_retirada
      ? calculateNextWithdrawalDate(ciclo.ultima_retirada, ciclo.intervalo_dias)
      : ciclo.data_inicio;
    if (proximaStr) {
      const proxima = new Date(proximaStr + "T00:00:00");
      if (hoje < proxima) {
        const dias = Math.ceil((proxima.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
        return { label: `AGUARDAR ${dias} DIA${dias === 1 ? "" : "S"}`, color: "status-proximo", canDispense: false, actionLabel: "Aguardar data", info: `Restam ${restantes} retirada(s). Válido até ${formatDateBR(ciclo.data_fim)}.`, proximaRetirada: proximaStr, reasons: [`Aguardar ${dias} dia(s)`] };
      }
    }
    return { label: "LIBERADO PARA RETIRADA", color: "status-liberado", canDispense: true, actionLabel: "Registrar dispensação", info: `${restantes} retirada(s) disponíveis. Válido até ${formatDateBR(ciclo.data_fim)}.`, proximaRetirada: proximaStr, reasons: [] };
  };

  const status = calcStatusForCiclo(cicloAtivo);
  const additionalIssues: string[] = [];
  if (!paciente.data_nascimento) additionalIssues.push("Data de nascimento não cadastrada");
  if (!paciente.ativo) additionalIssues.push("Cliente está INATIVO");
  if (!paciente.telefone) additionalIssues.push("Telefone não cadastrado");
  const canDispenseAll = status.canDispense && additionalIssues.length === 0;
  const allBlockReasons = [...status.reasons, ...additionalIssues];

  const calculateExpectedLimitForCiclo = (ciclo: any) => {
    if (!ciclo) return null;
    return calculateCycleLimit({
      tipoReceita: (ciclo.receitas as any)?.tipo || "medicamento",
      dataInicio: ciclo.data_inicio,
      dataFim: ciclo.data_fim,
      primeiraRetirada: ciclo.data_inicio,
      intervaloDias: ciclo.intervalo_dias,
    });
  };

  const expectedLimitForActive = calculateExpectedLimitForCiclo(cicloAtivo);
  const hasLimitMismatch = !!cicloAtivo && expectedLimitForActive !== null && expectedLimitForActive !== cicloAtivo.limite_maximo;

  const primaryActionLabel = !cicloAtivo
    ? "Registrar receita"
    : canDispenseAll
      ? "Registrar dispensação"
      : status.label === "RECEITA VENCIDA" || status.label === "LIMITE ATINGIDO"
        ? "Encerrar e iniciar nova"
        : status.actionLabel || "Aguardar data";

  const runPrimaryAction = () => {
    if (!cicloAtivo) {
      setShowSetupNovo(true);
      return;
    }
    if (canDispenseAll) {
      handleNovoAtendimento();
      return;
    }
    if (status.label === "RECEITA VENCIDA" || status.label === "LIMITE ATINGIDO") {
      handleEncerrarEAbrirNovo();
      return;
    }
    toast.info(status.info || "Ainda não está liberado para retirada.");
  };

  const buildCleanPatientWhatsAppMessage = () => {
    const firstName = paciente.nome?.split(" ")?.[0] || "";
    const tipo = (cicloAtivo?.receitas as any)?.tipo === "fralda" ? "fralda" : "medicamento";
    const linhas = [
      `Olá, ${firstName}.`,
      "",
      status.proximaRetirada
        ? `Sua próxima retirada de ${tipo} está prevista para ${formatDateBR(status.proximaRetirada)}.`
        : `Seu atendimento de ${tipo} precisa de atualização na farmácia.`,
      status.label === "RECEITA VENCIDA" ? "A receita atual está vencida. Para continuar, será necessário apresentar uma nova receita." : null,
      status.label === "LIMITE ATINGIDO" ? "Esta foi a última retirada possível com a receita atual. Para continuar, será necessário renovar a receita." : null,
      "",
      "Farmácia Cantagalo",
    ].filter(Boolean);
    return linhas.join("\n");
  };

  const buildDispensacaoWhatsAppMessage = (disp: any) => {
    const firstName = paciente.nome?.split(" ")?.[0] || "";
    const dataRetirada = (disp.data_dispensacao_real ?? disp.created_at?.split("T")[0]) || null;
    const intervalo = disp.ciclos?.intervalo_dias ?? cicloAtivo?.intervalo_dias ?? 30;
    const proxima = dataRetirada ? calculateNextWithdrawalDate(dataRetirada, intervalo) : null;
    const tipo = (disp.ciclos?.receitas?.tipo || (cicloAtivo?.receitas as any)?.tipo) === "fralda" ? "fralda" : "medicamento";
    return [
      `Olá, ${firstName}.`,
      "",
      `Sua dispensação de ${tipo} foi registrada na Farmácia Cantagalo.`,
      dataRetirada ? `Retirada: ${formatDateBR(dataRetirada)}` : null,
      proxima ? `Próxima retirada: ${formatDateBR(proxima)}` : null,
      "",
      "Farmácia Cantagalo",
    ].filter(Boolean).join("\n");
  };

  // Check if phone is missing and show gate
  useEffect(() => {
    if (!paciente.telefone) setShowPhoneGate(true);
  }, [paciente.telefone]);

  const savePhoneGate = async () => {
    const clean = phoneGateValue.replace(/\D/g, "");
    if (clean.length < 10) { toast.error("Telefone inválido (mínimo 10 dígitos)."); return; }
    setSavingPhone(true);
    const { error } = await supabase.from("pacientes").update({ telefone: clean }).eq("id", paciente.id);
    if (error) { toast.error("Erro ao salvar telefone."); setSavingPhone(false); return; }
    setPaciente({ ...paciente, telefone: clean });
    setShowPhoneGate(false);
    setSavingPhone(false);
    toast.success("Telefone cadastrado!");
  };

  const buildWhatsAppUrl = (message: string) => {
    const phone = "55" + (paciente.telefone || "").replace(/\D/g, "");
    return `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
  };

  const startEdit = () => {
    setEditData({ nome: paciente.nome, telefone: paciente.telefone || "" });
    setEditing(true);
  };

  const saveEdit = async () => {
    const cleanTel = editData.telefone.replace(/\D/g, "");
    if (cleanTel && cleanTel.length < 10) { toast.error("Telefone inválido."); return; }
    const { error } = await supabase.from("pacientes").update({
      nome: editData.nome.trim(),
      telefone: cleanTel || null,
    }).eq("id", paciente.id);
    if (error) { toast.error("Erro ao salvar."); return; }
    await supabase.from("logs").insert([{ user_id: user?.id, acao: "editar_paciente", detalhes: { paciente_id: paciente.id, antes: { nome: paciente.nome, telefone: paciente.telefone }, depois: { nome: editData.nome.trim(), telefone: cleanTel || null } } as any }]);
    setPaciente({ ...paciente, nome: editData.nome.trim(), telefone: cleanTel || null });
    setEditing(false);
    toast.success("Dados atualizados!");
  };

  // saveEdit already defined above - remove old one

  const startEditCiclo = () => {
    if (!cicloAtivo) return;
    let proxCalc = "";
    if (cicloAtivo.ultima_retirada) {
      proxCalc = calculateNextWithdrawalDate(cicloAtivo.ultima_retirada, cicloAtivo.intervalo_dias);
    }
    setEditCicloData({
      data_inicio: cicloAtivo.data_inicio || "",
      ultima_retirada: cicloAtivo.ultima_retirada || "",
      proxima_retirada: proxCalc,
    });
    setEditingCiclo(true);
  };

  const saveEditCiclo = async () => {
    if (!cicloAtivo) return;
    setSavingCiclo(true);
    try {
      const receita = cicloAtivo.receitas as any;
      const intervalo = cicloAtivo.intervalo_dias;
      const dataFimAtual = receita?.validade_ate || cicloAtivo.data_fim;
      const ultimaRetiradaStr = editCicloData.ultima_retirada || null;

      if (!editCicloData.data_inicio) {
        toast.error("Informe a primeira retirada.");
        setSavingCiclo(false);
        return;
      }

      if (ultimaRetiradaStr && ultimaRetiradaStr < editCicloData.data_inicio) {
        toast.error("Última retirada não pode ser anterior à primeira retirada.");
        setSavingCiclo(false);
        return;
      }

      const limiteMaximo = calculateCycleLimit({
        tipoReceita: receita?.tipo || "medicamento",
        dataInicio: editCicloData.data_inicio,
        dataFim: dataFimAtual,
        primeiraRetirada: editCicloData.data_inicio,
        intervaloDias: intervalo,
      });

      const { error: cicloErr } = await supabase.from("ciclos").update({
        data_inicio: editCicloData.data_inicio,
        data_fim: dataFimAtual,
        ultima_retirada: ultimaRetiradaStr,
        limite_maximo: limiteMaximo,
      }).eq("id", cicloAtivo.id);

      if (cicloErr) {
        console.error("Erro ao atualizar ciclo:", cicloErr);
        toast.error("Erro ao atualizar ciclo: " + cicloErr.message);
        setSavingCiclo(false);
        return;
      }

      await supabase.from("logs").insert([{
        user_id: user?.id,
        acao: "editar_ciclo",
        detalhes: {
          ciclo_id: cicloAtivo.id,
          paciente_id: paciente.id,
          primeira_retirada: editCicloData.data_inicio,
          ultima_retirada: ultimaRetiradaStr,
          limite_maximo: limiteMaximo,
          data_fim: dataFimAtual,
        } as any,
      }]);

      toast.success("Ciclo atualizado com sucesso!");
      setEditingCiclo(false);
      await fetchData();
    } catch (err: any) {
      console.error("Erro ao salvar edição do ciclo:", err);
      toast.error("Erro: " + (err.message || "Erro desconhecido"));
    } finally {
      setSavingCiclo(false);
    }
  };

  const handleEncerrarCiclo = async () => {
    if (!cicloAtivo || !motivoEncerramento.trim()) return;
    setEncerrando(true);
    const { error } = await supabase.from("ciclos").update({
      status: "encerrado", motivo_encerramento: "manual",
      encerrado_em: new Date().toISOString(), encerrado_por: user?.id,
    }).eq("id", cicloAtivo.id);
    if (error) { toast.error("Erro ao encerrar ciclo."); setEncerrando(false); return; }
    await supabase.from("logs").insert([{
      user_id: user?.id, acao: "encerrar_ciclo_manual",
      detalhes: { ciclo_id: cicloAtivo.id, motivo: motivoEncerramento.trim(), paciente_id: paciente.id } as any,
    }]);
    toast.success("Ciclo encerrado!");
    setShowEncerrarCiclo(false);
    setMotivoEncerramento("");
    setEncerrando(false);
    fetchData();
  };

  const handleCorrigirCicloAtual = async () => {
    if (!cicloAtivo || expectedLimitForActive === null) return;
    setCorrigindoCiclo(true);
    const { error } = await supabase.from("ciclos").update({
      limite_maximo: expectedLimitForActive,
    }).eq("id", cicloAtivo.id);
    if (error) {
      toast.error("Erro ao corrigir ciclo.");
      setCorrigindoCiclo(false);
      return;
    }
    await supabase.from("logs").insert([{
      user_id: user?.id,
      acao: "corrigir_limite_ciclo",
      detalhes: {
        ciclo_id: cicloAtivo.id,
        paciente_id: paciente.id,
        limite_anterior: cicloAtivo.limite_maximo,
        limite_corrigido: expectedLimitForActive,
      } as any,
    }]);
    toast.success("Cálculo do ciclo corrigido.");
    setCorrigindoCiclo(false);
    fetchData();
  };

  const handleEncerrarEAbrirNovo = async () => {
    if (!cicloAtivo || encerrandoEAbrindo) return;
    const receita = cicloAtivo.receitas as any;
    const tipo = receita?.tipo === "fralda" ? "fralda" : "medicamento";
    const ok = window.confirm(
      `Encerrar o ciclo atual de ${tipo}?\n\nPaciente: ${paciente.nome}\nRetiradas: ${cicloAtivo.total_dispensacoes}/${cicloAtivo.limite_maximo}\nValidade: ${formatDateBR(cicloAtivo.data_fim)}\n\nDepois disso o formulário de nova receita será aberto.`,
    );
    if (!ok) return;
    setEncerrandoEAbrindo(true);
    const { error } = await supabase.from("ciclos").update({
      status: "encerrado",
      motivo_encerramento: "substituido_por_nova_receita",
      encerrado_em: new Date().toISOString(),
      encerrado_por: user?.id,
    }).eq("id", cicloAtivo.id);
    if (error) {
      toast.error("Erro ao encerrar ciclo.");
      setEncerrandoEAbrindo(false);
      return;
    }
    await supabase.from("logs").insert([{
      user_id: user?.id,
      acao: "encerrar_e_iniciar_nova_receita",
      detalhes: { ciclo_id: cicloAtivo.id, paciente_id: paciente.id } as any,
    }]);
    toast.success("Ciclo encerrado. Cadastre a nova receita.");
    setEncerrandoEAbrindo(false);
    await fetchData();
    setShowSetupNovo(true);
  };

  const handleCancelarDispensacao = async () => {
    if (!cancelDispId || !justificativaCancelamento.trim()) return;
    setCancelando(true);
    const disp = dispensacoes.find(d => d.id === cancelDispId);
    const { error } = await supabase.from("dispensacoes").update({
      cancelada: true, cancelada_por: user?.id,
      justificativa_cancelamento: justificativaCancelamento.trim(),
    }).eq("id", cancelDispId);
    if (error) { toast.error("Erro ao cancelar dispensação."); setCancelando(false); return; }
    if (disp?.ciclo_id) {
      const ciclo = allCiclos.find(c => c.id === disp.ciclo_id);
      if (ciclo) {
        await supabase.from("ciclos").update({
          total_dispensacoes: Math.max(0, (ciclo.total_dispensacoes || 1) - 1),
        }).eq("id", disp.ciclo_id);
      }
    }
    await supabase.from("logs").insert([{
      user_id: user?.id, acao: "cancelar_dispensacao",
      detalhes: { dispensacao_id: cancelDispId, justificativa: justificativaCancelamento.trim(), paciente_id: paciente.id } as any,
    }]);
    toast.success("Dispensação cancelada!");
    setCancelDispId(null);
    setJustificativaCancelamento("");
    setCancelando(false);
    fetchData();
  };

  const handleImprimirDispensacao = async (d: any, posicao: number) => {
    try {
      const cicloId = d.ciclo_id;
      let itens: any[] = [];
      let docAlvoId: string | null = null;
      if (cicloId) {
        const { data: docs } = await supabase
          .from("documentos")
          .select("id, created_at, dados_extraidos")
          .eq("paciente_id", paciente.id)
          .eq("ciclo_id", cicloId)
          .eq("tipo", "cupom_fiscal");
        if (docs && docs.length > 0) {
          // Ignora QR code, prioriza o cupom principal mais próximo da dispensação
          const candidatos = docs.filter((doc: any) => {
            const de = (doc.dados_extraidos as any) || {};
            return de.subtipo !== "qr_code" && !de.extra && !de.pagina;
          });
          const dispTs = new Date(d.created_at).getTime();
          const sorted = [...candidatos].sort((a, b) =>
            Math.abs(new Date(a.created_at).getTime() - dispTs) -
            Math.abs(new Date(b.created_at).getTime() - dispTs),
          );
          const comItens = sorted.find((doc: any) => Array.isArray((doc.dados_extraidos as any)?.itens) && (doc.dados_extraidos as any).itens.length > 0);
          const escolhido = comItens || sorted[0] || candidatos[0];
          docAlvoId = escolhido?.id ?? null;
          const raw = (escolhido?.dados_extraidos as any)?.itens;
          if (Array.isArray(raw)) {
            itens = raw.map((it: any) =>
              typeof it === "string"
                ? { codigo: null, nome: it, quantidade: null }
                : { codigo: it.codigo ?? it.code ?? null, nome: String(it.nome ?? it.name ?? "—"), quantidade: it.quantidade != null ? String(it.quantidade) : (it.qtd != null ? String(it.qtd) : null) },
            );
          }
        }
      }
      if (itens.length === 0) {
        // Abre diálogo para inserir manualmente sem gastar IA
        setItemsDialog({
          disp: d,
          posicao,
          docId: docAlvoId,
          items: [{ codigo: "", nome: "", quantidade: "" }],
        });
        return;
      }
      doPrintCupom(d, posicao, itens);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao preparar impressão.");
    }
  };

  const doPrintCupom = (d: any, posicao: number, itens: any[]) => {
    const ciclo = d.ciclos || allCiclos.find((c: any) => c.id === d.ciclo_id);
    const intervalo = ciclo?.intervalo_dias ?? 30;
    const totalCiclo = ciclo?.limite_maximo ?? null;
    const tipoReceita = (ciclo?.receitas as any)?.tipo === "fralda" ? "fralda" : "medicamento";
    const limiteInicial = tipoReceita === "fralda" ? 18 : 6;
    const quantidadeDisponivelAgora = totalCiclo ? Math.max(0, totalCiclo - posicao) : null;
    const perdidasPorAtraso = totalCiclo ? Math.max(0, limiteInicial - totalCiclo) : null;
    const operadorNome = (d.registrada_por && profileMap[d.registrada_por]) || (d.operador_id && profileMap[d.operador_id]) || null;
    const ok = printDispensacaoCupom({
      pacienteNome: paciente.nome,
      pacienteCpf: paciente.cpf,
      dataDispensacao: d.data_dispensacao_real ?? d.created_at?.split("T")[0],
      dataCriacao: d.created_at?.split("T")[0],
      intervaloDias: intervalo,
      operadorNome,
      tipoRetirada: d.tipo_retirada,
      itens,
      numero: posicao,
      totalCiclo,
      quantidadeDisponivelAgora,
      limiteInicial,
      perdidasPorAtraso,
    });
    if (!ok) toast.error("Bloqueio de pop-up. Permita pop-ups para imprimir.");
  };

  const handleSaveAndPrintItems = async () => {
    if (!itemsDialog) return;
    const limpos = itemsDialog.items
      .map(i => ({ codigo: i.codigo.trim() || null, nome: i.nome.trim(), quantidade: i.quantidade.trim() || null }))
      .filter(i => i.nome.length > 0);
    if (limpos.length === 0) {
      toast.error("Informe ao menos um medicamento.");
      return;
    }
    setSavingItems(true);
    try {
      if (itemsDialog.docId) {
        // Lê dados atuais e mescla itens (sem perder o resto)
        const { data: docAtual } = await supabase
          .from("documentos")
          .select("dados_extraidos")
          .eq("id", itemsDialog.docId)
          .maybeSingle();
        const merged = { ...((docAtual?.dados_extraidos as any) || {}), itens: limpos, itens_origem: "manual" };
        const { error } = await supabase
          .from("documentos")
          .update({ dados_extraidos: merged })
          .eq("id", itemsDialog.docId);
        if (error) throw error;
        await supabase.from("logs").insert({
          user_id: user?.id, acao: "itens_cupom_manual",
          detalhes: { documento_id: itemsDialog.docId, dispensacao_id: itemsDialog.disp.id, paciente_id: paciente.id, qtd_itens: limpos.length } as any,
        });
        toast.success("Itens salvos no cupom.");
      } else {
        toast.info("Não foi possível localizar o cupom para salvar — imprimindo apenas.");
      }
      doPrintCupom(itemsDialog.disp, itemsDialog.posicao, limpos);
      setItemsDialog(null);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar itens.");
    } finally {
      setSavingItems(false);
    }
  };

  const motivoLabels: Record<string, string> = {
    nova_receita: "Nova receita registrada",
    expirado: "Ciclo expirado",
    manual: "Encerrado manualmente",
    limite: "Limite de retiradas atingido",
  };

  const getDocsByCiclo = (cicloId: string) => allDocVersions.filter((d: any) => d.ciclo_id === cicloId);

  // Handle "Novo Atendimento" click - if multiple cycles, show date verification
  const handleNovoAtendimento = () => {
    if (activeCiclos.length <= 1) {
      setShowDispensacao(true);
      return;
    }
    // Multiple active cycles: ask for emission date as proof
    setCycleSelectorDate("");
    setCycleSelectorMatch(null);
    setCycleSelectorMatches([]);
    setShowCycleSelector(true);
  };

  // Match emission date against active cycles (may return multiple)
  const [cycleSelectorMatches, setCycleSelectorMatches] = useState<any[]>([]);

  const handleCycleSelectorDateChange = (dateStr: string) => {
    setCycleSelectorDate(dateStr);
    if (!dateStr) { setCycleSelectorMatch(null); setCycleSelectorMatches([]); return; }
    const matches = activeCiclos.filter((c: any) => c.data_inicio === dateStr);
    setCycleSelectorMatches(matches);
    setCycleSelectorMatch(matches.length === 1 ? matches[0] : null);
  };

  // Confirm cycle selection and proceed to dispensação
  const confirmCycleSelection = (cycle?: any) => {
    const selected = cycle || cycleSelectorMatch;
    if (selected) {
      setCicloAtivo(selected);
      setShowCycleSelector(false);
      setShowDispensacao(true);
    }
  };

  // Check if can add new cycle (max 2 per type)
  const canAddNewCycle = () => {
    // Count per type
    const medCount = activeCiclos.filter((c: any) => (c.receitas as any)?.tipo !== "fralda").length;
    const fraldaCount = activeCiclos.filter((c: any) => (c.receitas as any)?.tipo === "fralda").length;
    return medCount < 2 || fraldaCount < 2; // at least one type has room
  };

  const getMaxCycleTypeMessage = () => {
    const medCount = activeCiclos.filter((c: any) => (c.receitas as any)?.tipo !== "fralda").length;
    const fraldaCount = activeCiclos.filter((c: any) => (c.receitas as any)?.tipo === "fralda").length;
    const msgs: string[] = [];
    if (medCount >= 2) msgs.push("Medicamento (2/2)");
    if (fraldaCount >= 2) msgs.push("Fralda (2/2)");
    return msgs.length > 0 ? `Limite atingido: ${msgs.join(", ")}` : null;
  };

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
        className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
    </div>
  );

  return (
    <>
    <ImageViewer url={viewingImage} onClose={() => setViewingImage(null)} />
    <BatchPhotoCapture
      open={showBatchCamera}
      onClose={() => { setShowBatchCamera(false); galeria.refresh(); }}
      onPhotoCaptured={galeria.addFoto}
      currentCount={galeria.count}
      maxPhotos={galeria.maxPhotos}
    />
    <GalleryPicker
      open={showGaleriaView}
      fotos={galeria.fotos}
      loading={galeria.loading}
      onSelect={() => {}}
      onClose={() => setShowGaleriaView(false)}
      onRemove={galeria.removeFoto}
      title="Galeria do Cliente"
    />
    {/* Phone Gate Dialog */}
    {showPhoneGate && (
      <Dialog open onOpenChange={(open) => { if (!open) setShowPhoneGate(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <Phone className="w-5 h-5" /> Telefone Obrigatório
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              É necessário cadastrar o número de telefone (WhatsApp) deste paciente para continuar.
            </p>
            <div className="space-y-2">
              <Label>Telefone (WhatsApp) *</Label>
              <Input
                type="tel"
                value={phoneGateValue}
                onChange={(e) => setPhoneGateValue(e.target.value.replace(/\D/g, "").slice(0, 11))}
                placeholder="11999999999"
                className="font-mono rounded-xl min-h-[44px]"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">DDD + número (ex: 11999999999)</p>
            </div>
            <Button onClick={savePhoneGate} disabled={savingPhone} className="w-full rounded-xl min-h-[44px]">
              <Save className="w-4 h-4 mr-2" />
              {savingPhone ? "Salvando..." : "Salvar Telefone"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )}

    <div className="max-w-4xl mx-auto space-y-5">

      {/* ═══ Status Banner(s) ═══ */}
      {activeCiclos.length > 1 ? (
        /* When 2 cycles active, show separate mini-banners for each */
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {activeCiclos.map((c: any) => {
            const st = calcStatusForCiclo(c);
            const tipo = (c.receitas as any)?.tipo;
            const isSelected = cicloAtivo?.id === c.id;
            return (
              <motion.button
                key={c.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => setCicloAtivo(c)}
                className={`relative rounded-2xl overflow-hidden text-left transition-all ${isSelected ? "ring-2 ring-primary shadow-lg" : "opacity-70 hover:opacity-90"}`}
              >
                <div className={`${st.color === "status-bloqueado"
                  ? "bg-gradient-to-br from-[hsl(260,60%,8%)] via-[hsl(270,50%,12%)] to-[hsl(280,40%,6%)] border border-violet-500/20"
                  : st.color} rounded-2xl p-3 sm:p-4 text-center`}>
                  <p className="text-xs font-bold uppercase tracking-widest mb-1 opacity-70">
                    {tipo === "fralda" ? "🧷 Ciclo de Fraldas" : "💊 Ciclo de Medicamentos"}
                  </p>
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <Activity className="w-4 h-4" />
                    <p className={`text-sm sm:text-base font-bold tracking-wider ${st.color === "status-bloqueado" ? "text-transparent bg-clip-text bg-gradient-to-r from-violet-300 via-purple-200 to-cyan-300" : ""}`}
                      style={{ fontFamily: "var(--font-display)" }}>
                      {st.label}
                    </p>
                  </div>
                  <p className={`text-xs ${st.color === "status-bloqueado" ? "text-violet-200/70" : "opacity-80"}`}>{st.info}</p>
                  {st.proximaRetirada && <p className="text-sm font-semibold mt-1">📅 {formatDateBR(st.proximaRetirada)}</p>}
                </div>
              </motion.button>
            );
          })}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className="relative rounded-2xl overflow-hidden"
        >
          {status.color === "status-bloqueado" ? (
            <div className="relative bg-gradient-to-br from-[hsl(260,60%,8%)] via-[hsl(270,50%,12%)] to-[hsl(280,40%,6%)] rounded-2xl p-4 sm:p-6 text-center border border-violet-500/20 shadow-[0_0_40px_-10px_hsl(270,80%,60%,0.3)]">
              <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
                <div className="absolute top-0 left-1/4 right-1/4 h-[1px] bg-gradient-to-r from-transparent via-violet-400/60 to-transparent" />
                <div className="absolute bottom-0 left-1/3 right-1/3 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />
                <div className="absolute top-1/2 -translate-y-1/2 -left-2 w-32 h-32 bg-violet-500/10 rounded-full blur-3xl" />
                <div className="absolute top-1/2 -translate-y-1/2 -right-2 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl" />
              </div>
              <div className="relative z-10">
                {cicloAtivo && <p className="text-xs font-bold uppercase tracking-widest mb-2 text-violet-300/60">
                  {(cicloAtivo.receitas as any)?.tipo === "fralda" ? "🧷 Ciclo de Fraldas" : "💊 Ciclo de Medicamentos"}
                </p>}
                <motion.div
                  animate={{ opacity: [0.6, 1, 0.6] }}
                  transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                  className="flex items-center justify-center gap-2.5 mb-2"
                >
                  <Activity className="w-5 h-5 text-violet-400 drop-shadow-[0_0_8px_hsl(270,80%,60%,0.8)]" />
                  <p className="text-base sm:text-xl font-bold tracking-[0.1em] sm:tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-r from-violet-300 via-purple-200 to-cyan-300"
                    style={{ fontFamily: "var(--font-display)" }}>
                    {status.label}
                  </p>
                </motion.div>
                <p className="text-sm text-violet-200/70">{status.info}</p>
                {status.proximaRetirada && <p className="text-base font-semibold mt-1 text-violet-200/80">📅 Próxima: {formatDateBR(status.proximaRetirada)}</p>}
              </div>
            </div>
          ) : (
            <div className={`${status.color} rounded-2xl p-3 sm:p-4 text-center relative overflow-hidden`}>
              <div className="relative z-10">
                {cicloAtivo && <p className="text-xs font-bold uppercase tracking-widest mb-1 opacity-60">
                  {(cicloAtivo.receitas as any)?.tipo === "fralda" ? "🧷 Ciclo de Fraldas" : "💊 Ciclo de Medicamentos"}
                </p>}
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Activity className="w-5 h-5" />
                  <p className="text-base sm:text-xl font-bold tracking-wider sm:tracking-widest" style={{ fontFamily: "var(--font-display)" }}>{status.label}</p>
                </div>
                <p className="text-sm opacity-80">{status.info}</p>
                {status.proximaRetirada && <p className="text-base font-semibold mt-1">📅 Próxima: {formatDateBR(status.proximaRetirada)}</p>}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* ═══ Painel operacional rápido ═══ */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="hero-card rounded-[1.6rem] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2 min-w-0">
            <div className="section-chip">Decisão do atendimento</div>
            <h2 className="text-xl sm:text-2xl font-black leading-tight truncate">{paciente.nome}</h2>
            <p className="text-sm text-muted-foreground">{status.info}</p>
          </div>
          <Badge className={`${status.color} rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide self-start sm:self-auto`}>
            {status.label}
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="metric-card">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Próxima retirada</p>
            <p className="text-2xl font-black text-primary mt-1">{status.proximaRetirada ? formatDateBR(status.proximaRetirada) : "—"}</p>
          </div>
          <div className="metric-card">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Dispensações</p>
            <p className="text-2xl font-black mt-1">{cicloAtivo ? `${cicloAtivo.total_dispensacoes}/${cicloAtivo.limite_maximo}` : "—"}</p>
          </div>
          <div className="metric-card">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Validade</p>
            <p className="text-xl font-black mt-1">{cicloAtivo ? formatDateBR(cicloAtivo.data_fim) : "—"}</p>
          </div>
        </div>

        {isMaster && hasLimitMismatch && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 space-y-2">
            <p className="font-bold">O limite salvo parece diferente do cálculo atual.</p>
            <p>Salvo: <strong>{cicloAtivo?.limite_maximo}</strong> · Calculado: <strong>{expectedLimitForActive}</strong></p>
            <Button size="sm" variant="outline" className="rounded-xl border-amber-400 bg-white" onClick={handleCorrigirCicloAtual} disabled={corrigindoCiclo}>
              {corrigindoCiclo ? "Corrigindo..." : "Corrigir cálculo do ciclo"}
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Button size="lg" onClick={runPrimaryAction} disabled={encerrandoEAbrindo || (!canDispenseAll && status.label.startsWith("AGUARDAR"))} className="min-h-[52px] rounded-2xl text-base font-bold floating-action">
            <Package className="w-5 h-5 mr-2" />
            {encerrandoEAbrindo ? "Processando..." : primaryActionLabel}
          </Button>
          {paciente.telefone && (
            <a href={buildWhatsAppUrl(buildCleanPatientWhatsAppMessage())} target="_blank" rel="noopener noreferrer" className="sm:col-span-1">
              <Button variant="outline" size="lg" className="w-full min-h-[52px] rounded-2xl text-base font-bold border-primary/30 text-primary hover:bg-primary/5">
                <MessageCircle className="w-5 h-5 mr-2" /> WhatsApp
              </Button>
            </a>
          )}
          {canAddNewCycle() && (
            <Button variant="secondary" size="lg" className="min-h-[52px] rounded-2xl text-base font-bold" onClick={() => setShowSetupNovo(true)}>
              <FileText className="w-5 h-5 mr-2" /> Nova receita
            </Button>
          )}
        </div>
      </motion.div>

      {/* ═══ Dados do Paciente (collapsible) ═══ */}
      <Collapsible>
        <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-gradient-to-br from-violet-600 to-purple-500 shadow-lg">
                  <User className="w-[18px] h-[18px] text-white" />
                </div>
                <div className="text-left">
                  <h3 className="text-base font-bold" style={{ fontFamily: "var(--font-display)" }}>{paciente.nome}</h3>
                  <p className="text-xs text-muted-foreground font-mono">{formatCpfMask(paciente.cpf)}</p>
                </div>
              </div>
              <ChevronDown className="w-5 h-5 text-muted-foreground" />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-4 pb-4 space-y-2 border-t border-border/30 pt-3">
              {editing ? (
                <div className="space-y-3">
                  <div className="space-y-1"><Label className="text-xs">Nome</Label><Input value={editData.nome} onChange={(e) => setEditData({ ...editData, nome: e.target.value })} className="rounded-xl" /></div>
                  <div className="space-y-1"><Label className="text-xs">Telefone</Label><Input type="tel" value={editData.telefone} onChange={(e) => setEditData({ ...editData, telefone: e.target.value.replace(/\D/g, "").slice(0, 11) })} placeholder="11999999999" className="rounded-xl font-mono" /></div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveEdit} className="rounded-xl"><Save className="w-4 h-4 mr-1" /> Salvar</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="rounded-xl"><X className="w-4 h-4" /></Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <InfoField icon={Cake} label="Nascimento" value={formatDateBR(paciente.data_nascimento)} />
                  <InfoField icon={Phone} label="Telefone" value={paciente.telefone ? paciente.telefone.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3") : "Não cadastrado"} />
                  {paciente.telefone && (
                    <a href={buildWhatsAppUrl(`Olá ${paciente.nome.split(" ")[0]}! 👋`)} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm" className="rounded-xl text-xs gap-1.5 border-green-500/30 text-green-600 hover:bg-green-500/10 w-full">
                        <MessageCircle className="w-3.5 h-3.5" /> Enviar WhatsApp
                      </Button>
                    </a>
                  )}
                  {isMaster && (
                    <Button variant="ghost" size="sm" onClick={startEdit} className="rounded-xl text-xs mt-1">
                      <Edit2 className="w-3 h-3 mr-1" /> Editar Dados
                    </Button>
                  )}
                </div>
              )}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* ═══ Galeria do Cliente ═══ */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden relative">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500 to-cyan-400 z-10" />
        <div className="flex items-center justify-between p-4 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-gradient-to-br from-blue-500 to-cyan-400 shadow-lg">
              <Camera className="w-[18px] h-[18px] text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold" style={{ fontFamily: "var(--font-display)" }}>Galeria</h3>
              <p className="text-xs text-muted-foreground">{galeria.count}/{galeria.maxPhotos} fotos</p>
            </div>
          </div>
        </div>
        <div className="px-4 pb-4 space-y-3">
          {/* Thumbnails preview */}
          {galeria.count > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {galeria.fotos.slice(0, 6).map(f => (
                <div key={f.id} className="relative group shrink-0">
                  <img src={f.arquivo_url} alt="Galeria" className="w-16 h-16 object-cover rounded-lg border border-border/50" />
                  <button type="button" onClick={() => galeria.removeFoto(f.id)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {galeria.count > 6 && (
                <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <span className="text-xs text-muted-foreground font-semibold">+{galeria.count - 6}</span>
                </div>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="rounded-xl h-11 border-dashed border-2 hover:border-primary/50 hover:bg-primary/5"
              onClick={() => setShowBatchCamera(true)}
              disabled={!galeria.canAdd}
            >
              <Camera className="w-4 h-4 mr-1.5" /> Câmera Rápida
            </Button>
            <Button
              variant="outline"
              className="rounded-xl h-11 border-dashed border-2 hover:border-primary/50 hover:bg-primary/5"
              onClick={() => setShowGaleriaView(true)}
              disabled={galeria.count === 0}
            >
              <Image className="w-4 h-4 mr-1.5" /> Ver Galeria ({galeria.count})
            </Button>
          </div>
        </div>
      </div>

      {/* ═══ Ciclo Ativo ═══ */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden relative">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-500 to-green-400 z-10" />
        <div className="flex items-center justify-between p-4 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-gradient-to-br from-emerald-500 to-green-400 shadow-lg">
              <Calendar className="w-[18px] h-[18px] text-white" />
            </div>
            <h3 className="text-base font-bold" style={{ fontFamily: "var(--font-display)" }}>
              {activeCiclos.length > 1 ? "Ciclos Ativos" : "Ciclo Ativo"}
            </h3>
          </div>
          {activeCiclos.length === 0 && !showSetupNovo && (
            <Button size="sm" onClick={() => setShowSetupNovo(true)} className="rounded-xl bg-gradient-to-r from-emerald-500 to-green-400 text-white hover:opacity-90 shadow-md">
              <FileText className="w-4 h-4 mr-1" /> Nova Receita
            </Button>
          )}
        </div>

        {/* Tab selector for multiple active cycles */}
        {activeCiclos.length > 1 && (
          <div className="px-4 pb-2 flex gap-2">
            {activeCiclos.map((c: any) => {
              const tipo = (c.receitas as any)?.tipo;
              const isSelected = cicloAtivo?.id === c.id;
              return (
                <Button
                  key={c.id}
                  size="sm"
                  variant={isSelected ? "default" : "outline"}
                  className={`rounded-xl text-xs flex-1 ${isSelected ? "" : "opacity-60"}`}
                  onClick={() => setCicloAtivo(c)}
                >
                  {tipo === "fralda" ? "🧷 Fralda" : "💊 Medicamento"}
                </Button>
              );
            })}
          </div>
        )}

        <div className="px-4 pb-4">

          {cicloAtivo ? (
            <div className="space-y-4">
              {/* Cycle info grid */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Tipo", value: (cicloAtivo.receitas as any)?.tipo === "fralda" ? "🧷 Fralda" : "💊 Medicamento" },
                  { label: "Dispensações", value: `${cicloAtivo.total_dispensacoes} / ${cicloAtivo.limite_maximo}` },
                  { label: "Primeira Retirada", value: formatDateBR(cicloAtivo.data_inicio) },
                  { label: "Validade da Receita", value: formatDateBR(cicloAtivo.data_fim) },
                  { label: "Última Retirada", value: formatDateBR(cicloAtivo.ultima_retirada) },
                  ...(status.proximaRetirada ? [{ label: "Próxima", value: formatDateBR(status.proximaRetirada) }] : []),
                  ...((cicloAtivo.receitas as any)?.operador_id ? [{ label: "Operador (Ciclo)", value: profileMap[(cicloAtivo.receitas as any).operador_id] || "—" }] : []),
                  ...((cicloAtivo.receitas as any)?.uploaded_by ? [{ label: "Registrado por", value: profileMap[(cicloAtivo.receitas as any).uploaded_by] || "—" }] : []),
                ].map((item) => (
                  <div key={item.label} className="p-2.5 rounded-xl bg-muted/40">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{item.label}</p>
                    <p className="text-sm font-semibold mt-0.5">{item.value}</p>
                  </div>
                ))}
              </div>

              {/* WhatsApp Quick Actions removed per user request */}

              {/* Master: Edit cycle */}
              {isMaster && !editingCiclo && (
                <Button variant="ghost" size="sm" onClick={startEditCiclo} className="rounded-xl text-xs w-full">
                  <Edit2 className="w-3 h-3 mr-1" /> Editar Dados do Ciclo
                </Button>
              )}

              {editingCiclo && (
                <div className="p-3 rounded-xl border border-primary/30 bg-primary/5 space-y-3">
                  <p className="text-xs font-semibold text-primary">✏️ Editar Ciclo (Master)</p>
                  <div className="space-y-1">
                    <Label className="text-xs">Primeira Retirada</Label>
                    <Input type="date" value={editCicloData.data_inicio}
                      onChange={(e) => setEditCicloData({ ...editCicloData, data_inicio: e.target.value })}
                      className="rounded-xl" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Última Retirada</Label>
                    <Input type="date" value={editCicloData.ultima_retirada}
                      onChange={(e) => {
                        const val = e.target.value;
                        let prox = "";
                          if (val && cicloAtivo) prox = calculateNextWithdrawalDate(val, cicloAtivo.intervalo_dias);
                        setEditCicloData({ ...editCicloData, ultima_retirada: val, proxima_retirada: prox });
                      }}
                      className="rounded-xl" />
                    <p className="text-[10px] text-muted-foreground">Deixe vazio se não houve retirada ainda.</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Próxima Retirada</Label>
                    <Input type="date" value={editCicloData.proxima_retirada}
                      onChange={(e) => {
                        const val = e.target.value;
                        let ult = "";
                          if (val && cicloAtivo) ult = addDaysToDateStr(val, -(cicloAtivo.intervalo_dias + 1));
                        setEditCicloData({ ...editCicloData, proxima_retirada: val, ultima_retirada: ult });
                      }}
                      className="rounded-xl" />
                    <p className="text-[10px] text-muted-foreground">Alterar recalcula a última retirada automaticamente.</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveEditCiclo} disabled={savingCiclo || !editCicloData.data_inicio} className="rounded-xl">
                      {savingCiclo ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />} Salvar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingCiclo(false)} className="rounded-xl">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Progress bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Progresso</span>
                  <span>{cicloAtivo.total_dispensacoes}/{cicloAtivo.limite_maximo}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(cicloAtivo.total_dispensacoes / cicloAtivo.limite_maximo) * 100}%` }}
                    transition={{ delay: 0.3, duration: 0.6 }}
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-green-400"
                  />
                </div>
              </div>

              {/* Ver Receita - same layout as other docs */}
              {(cicloAtivo.receitas as any)?.arquivo_url && (
                <div className="flex items-center justify-between p-2 rounded-lg bg-background/60">
                  <div className="flex items-center gap-2">
                    <span>📋</span>
                    <span className="text-sm">Receita</span>
                  </div>
                  <Button variant="ghost" size="sm" className="rounded-lg h-7 px-2 text-xs" onClick={() => setViewingImage((cicloAtivo.receitas as any).arquivo_url)}>
                    <Eye className="w-3 h-3 mr-1" /> Ver
                  </Button>
                </div>
              )}

              {/* ════════════════════════════════════════════════ */}
              {/* Documentos do ciclo (view-only) + botão dispensação */}
              {/* ════════════════════════════════════════════════ */}
              <div className="space-y-4">
                {/* Documentos do ciclo agrupados por dispensação */}
                {(() => {
                  const docsByDisp: Record<number, any[]> = {};
                  const docsWithoutDisp: any[] = [];
                  cycleDocs.forEach((doc: any) => {
                    const num = (doc.dados_extraidos as any)?.dispensacao_numero;
                    if (num) {
                      if (!docsByDisp[num]) docsByDisp[num] = [];
                      docsByDisp[num].push(doc);
                    } else {
                      docsWithoutDisp.push(doc);
                    }
                  });
                  const dispNums = Object.keys(docsByDisp).map(Number).sort((a, b) => a - b);

                  if (dispNums.length === 0 && docsWithoutDisp.length === 0) return null;

                  return (
                    <div className="space-y-3">
                      {dispNums.map((num) => (
                        <Collapsible key={num} defaultOpen={num === dispNums[dispNums.length - 1]}>
                          <div className="rounded-xl border border-border/50 bg-muted/20 overflow-hidden">
                            <CollapsibleTrigger asChild>
                              <button className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                  📁 {num}ª Retirada
                                  <span className="text-[10px] font-normal">({docsByDisp[num].length} docs)</span>
                                </p>
                                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                              </button>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="px-3 pb-3 space-y-1.5">
                                {docsByDisp[num].map((doc: any) => (
                                  <div key={doc.id} className="flex items-center justify-between p-2 rounded-lg bg-background/60">
                                    <div className="flex items-center gap-2">
                                    <span>{doc.tipo === "procuracao" ? "📋" : doc.tipo === "doc_representante" ? "👤" : doc.tipo === "cupom_fiscal" ? "🧾" : doc.tipo === "cupom_fiscal_qr" ? "📱" : "🪪"}</span>
                                      <span className="text-sm capitalize">{doc.tipo.replace(/_/g, " ")}</span>
                                    </div>
                                    <Button variant="ghost" size="sm" className="rounded-lg h-7 px-2 text-xs" onClick={() => setViewingImage(doc.arquivo_url)}>
                                        <Eye className="w-3 h-3 mr-1" /> Ver
                                      </Button>
                                  </div>
                                ))}
                              </div>
                            </CollapsibleContent>
                          </div>
                        </Collapsible>
                      ))}
                      {docsWithoutDisp.length > 0 && (
                        <div className="rounded-xl border border-border/50 bg-muted/20 p-3 space-y-1.5">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                            📄 Outros Documentos
                          </p>
                          {docsWithoutDisp.map((doc: any) => (
                            <div key={doc.id} className="flex items-center justify-between p-2 rounded-lg bg-background/60">
                              <div className="flex items-center gap-2">
                                <span>{doc.tipo === "procuracao" ? "📋" : doc.tipo === "doc_representante" ? "👤" : doc.tipo === "cupom_fiscal" ? "🧾" : doc.tipo === "cupom_fiscal_qr" ? "📱" : "🪪"}</span>
                                <span className="text-sm capitalize">{doc.tipo.replace(/_/g, " ")}</span>
                              </div>
                                <Button variant="ghost" size="sm" className="rounded-lg h-7 px-2 text-xs" onClick={() => setViewingImage(doc.arquivo_url)}>
                                  <Eye className="w-3 h-3 mr-1" /> Ver
                                </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Block reasons */}
                {allBlockReasons.length > 0 && (
                  <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 space-y-1">
                    <p className="text-xs font-semibold text-destructive flex items-center gap-1">
                      <Shield className="w-3.5 h-3.5" /> Pendências:
                    </p>
                    {allBlockReasons.map((r, i) => <p key={i} className="text-xs text-destructive">• {r}</p>)}
                  </div>
                )}

                {/* Add another cycle - max 2 per type */}
                {canAddNewCycle() ? (
                  <Button variant="outline" size="sm"
                    className="w-full rounded-xl border-primary/30 text-primary hover:bg-primary/10"
                    onClick={() => setShowSetupNovo(true)}>
                    <FileText className="w-4 h-4 mr-1" /> Adicionar Nova Receita
                  </Button>
                ) : (
                  <div className="p-3 rounded-xl bg-muted/60 border border-border/50 text-center space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground flex items-center justify-center gap-1">
                      <Lock className="w-3.5 h-3.5" /> {getMaxCycleTypeMessage()}
                    </p>
                    <p className="text-[11px] text-muted-foreground">Encerre um ciclo existente para registrar uma nova receita do mesmo tipo.</p>
                  </div>
                )}

                {/* Master: Encerrar Ciclo */}
                {isMaster && (
                  <Button variant="outline" size="sm"
                    className="w-full rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10"
                    onClick={() => { setMotivoEncerramento(""); setShowEncerrarCiclo(true); }}>
                    <Lock className="w-4 h-4 mr-1" /> Encerrar Ciclo Manualmente
                  </Button>
                )}
              </div>

              {/* Ciclos encerrados */}
              {allCiclos.filter(c => c.status !== "ativo").length > 0 && (
                <Collapsible open={showCicloHistory} onOpenChange={setShowCicloHistory}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full rounded-xl border-t border-border pt-3 mt-2">
                      {showCicloHistory ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
                      Ciclos Encerrados ({allCiclos.filter(c => c.status !== "ativo").length})
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3 mt-3">
                    {allCiclos.filter(c => c.status !== "ativo").map((c) => {
                      const cicloDocs = getDocsByCiclo(c.id);
                      const receita = c.receitas as any;
                      return (
                        <div key={c.id} className="rounded-xl border border-border/50 bg-muted/20 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span>{receita?.tipo === "fralda" ? "🧷" : "💊"}</span>
                              <span className="text-sm font-semibold">{formatDateBR(c.data_inicio)} → {formatDateBR(c.data_fim)}</span>
                            </div>
                            <Badge variant="outline" className="text-xs rounded-lg">{c.total_dispensacoes}/{c.limite_maximo}</Badge>
                          </div>
                          {c.motivo_encerramento && (
                            <div className="flex items-center gap-2 text-xs p-2 rounded-lg bg-destructive/5 border border-destructive/15">
                              <span className="text-destructive font-medium">🔒 {motivoLabels[c.motivo_encerramento] || c.motivo_encerramento}</span>
                              {c.encerrado_em && <span className="text-muted-foreground ml-auto">{formatDateBR(c.encerrado_em.split("T")[0])}</span>}
                            </div>
                          )}
                          {receita?.arquivo_url && (
                            <button onClick={() => setViewingImage(receita.arquivo_url)} className="text-xs text-primary underline flex items-center gap-1">
                              <FileText className="w-3 h-3" /> Ver Receita
                            </button>
                          )}
                          {cicloDocs.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Documentos</p>
                              {cicloDocs.map((doc: any) => (
                                <div key={doc.id} className="flex items-center justify-between text-xs p-1.5 rounded-lg bg-muted/40">
                                  <span className="capitalize">{doc.tipo.replace(/_/g, " ")}</span>
                                  <button onClick={() => setViewingImage(doc.arquivo_url)} className="text-primary underline">Ver</button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {showSetupNovo ? (
                <SetupCiclo
                  paciente={paciente}
                  onComplete={() => { setShowSetupNovo(false); fetchData(); galeria.limparGaleria(); }}
                  onCancel={() => setShowSetupNovo(false)}
                  galeriaFotos={galeria.fotos}
                  galeriaLoading={galeria.loading}
                />
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-50 via-background to-blue-50 border-2 border-dashed border-violet-300/50 p-4 sm:p-8"
                >
                  {/* Neon glow accent */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 rounded-b-full bg-gradient-to-r from-violet-500 to-blue-500 shadow-[0_0_20px_rgba(139,92,246,0.4)]" />
                  
                  {/* Floating icon */}
                  <motion.div
                    animate={{ y: [0, -8, 0], rotateZ: [0, 3, -3, 0] }}
                    transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                    className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center shadow-xl shadow-violet-500/20 mb-4"
                  >
                    <FileText className="w-8 h-8 text-white" />
                  </motion.div>

                  <div className="text-center space-y-2">
                    <h4 className="text-lg font-bold bg-gradient-to-r from-violet-600 to-blue-600 bg-clip-text text-transparent" style={{ fontFamily: "var(--font-display)" }}>
                      Nenhum Ciclo Ativo
                    </h4>
                    <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                      Para iniciar um novo ciclo de dispensação, registre uma receita médica válida.
                    </p>
                  </div>

                  <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="mt-5">
                    <Button
                      size="lg"
                      onClick={() => setShowSetupNovo(true)}
                      className="w-full min-h-[52px] rounded-xl text-base font-bold bg-gradient-to-r from-violet-600 to-blue-600 text-white hover:opacity-90 shadow-lg shadow-violet-500/20"
                    >
                      <FileText className="w-5 h-5 mr-2" />
                      Nova Receita
                    </Button>
                  </motion.div>

                  {/* Subtle decorative dots */}
                  <div className="absolute bottom-3 right-3 flex gap-1 opacity-30">
                    {[...Array(3)].map((_, i) => (
                      <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-violet-400"
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.3 }} />
                    ))}
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ═══ Histórico de Dispensações (collapsible) ═══ */}
      {/* Botão Histórico de Retiradas */}
      {dispensacoes.length > 0 && !showHistoricoDisp && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Button
            variant="outline"
            className="w-full rounded-2xl min-h-[48px] text-base font-semibold border-2 border-cyan-500/30 hover:bg-cyan-500/5"
            onClick={() => setShowHistoricoDisp(true)}
          >
            <Clock className="w-5 h-5 mr-2 text-cyan-500" />
            Ver Histórico de Retiradas ({dispensacoes.filter(d => !d.cancelada).length})
          </Button>
        </motion.div>
      )}

      <Collapsible open={showHistoricoDisp} onOpenChange={setShowHistoricoDisp}>
        <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
          {showHistoricoDisp && <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-gradient-to-br from-cyan-500 to-sky-400 shadow-lg">
                  <Clock className="w-[18px] h-[18px] text-white" />
                </div>
                <h3 className="text-base font-bold" style={{ fontFamily: "var(--font-display)" }}>
                  Histórico de Dispensações
                </h3>
                {dispensacoes.length > 0 && (
                  <Badge variant="secondary" className="rounded-lg">{dispensacoes.filter(d => !d.cancelada).length}</Badge>
                )}
              </div>
              <ChevronUp className="w-5 h-5 text-muted-foreground" />
            </button>
          </CollapsibleTrigger>}
          <CollapsibleContent>
            <div className="px-4 pb-4">
              {dispensacoes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhuma dispensação registrada.</p>
              ) : (
                <div className="space-y-2">
                  {dispensacoes.map((d, i) => {
                    const tipoReceita = (d as any).ciclos?.receitas?.tipo;
                    const snap = d.snapshot_ciclo as any;
                    return (
                      <div key={d.id}
                        className={`flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 rounded-xl gap-2 ${d.cancelada ? "bg-destructive/5 opacity-60" : "bg-muted/40 hover:bg-muted/60"} transition-colors`}>
                        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                          <Badge className={`rounded-lg ${d.cancelada ? "bg-destructive/20 text-destructive" : ""}`}>
                            {d.cancelada ? "✕" : `${dispensacoes.length - i}ª`}
                          </Badge>
                          <span className="text-sm capitalize">{d.tipo_retirada}</span>
                          {tipoReceita && <Badge variant="outline" className="text-xs rounded-lg">{tipoReceita === "fralda" ? "🧷" : "💊"}</Badge>}
                          {d.tipo_retirada === "representante" && snap?.representante?.nome && (
                            <span className="text-xs text-muted-foreground">({snap.representante.nome})</span>
                          )}
                          {d.cancelada && <span className="text-xs text-destructive">[Cancelada]</span>}
                          {d.operador_id && profileMap[d.operador_id] && (
                            <span className="text-[11px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">👤 {profileMap[d.operador_id]}</span>
                          )}
                          {d.registrada_por && profileMap[d.registrada_por] && (
                            <span className="text-[11px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">📝 {profileMap[d.registrada_por]}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground">{formatDateBR((d.data_dispensacao_real ?? d.created_at?.split("T")[0]) || null)}</span>
                          {!d.cancelada && (
                            <Button variant="ghost" size="sm"
                              className="h-7 w-7 p-0 rounded-lg text-primary hover:bg-primary/10"
                              onClick={() => handleImprimirDispensacao(d, dispensacoes.length - i)}
                              title="Imprimir comprovante">
                              <Printer className="w-4 h-4" />
                            </Button>
                          )}
                          {!d.cancelada && paciente.telefone && (
                            <a href={buildWhatsAppUrl(buildDispensacaoWhatsAppMessage(d))} target="_blank" rel="noopener noreferrer" title="Enviar WhatsApp da retirada">
                              <Button variant="ghost" size="sm"
                                className="h-7 w-7 p-0 rounded-lg text-emerald-600 hover:bg-emerald-500/10">
                                <MessageCircle className="w-4 h-4" />
                              </Button>
                            </a>
                          )}
                          {isMaster && !d.cancelada && (
                            <Button variant="ghost" size="sm"
                              className="h-7 w-7 p-0 rounded-lg text-destructive hover:bg-destructive/10"
                              onClick={() => { setCancelDispId(d.id); setJustificativaCancelamento(""); }}
                              title="Cancelar dispensação">
                              <XCircle className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* ═══ Todos os Arquivos ═══ */}
      {(() => {
        const allReceitas = allCiclos
          .filter((c: any) => c.receitas?.arquivo_url)
          .map((c: any) => ({
            id: c.receitas.id || c.id,
            tipo: c.receitas.tipo === "fralda" ? "🧷 Receita (Fralda)" : "💊 Receita (Medicamento)",
            url: c.receitas.arquivo_url,
            data: c.data_inicio,
            cicloStatus: c.status,
          }));

        // Categorize all docs
        const identidades = allDocVersions.filter((d: any) => ["identidade", "identidade_com_cpf", "cpf"].includes(d.tipo));
        const procuracoes = allDocVersions.filter((d: any) => d.tipo === "procuracao");
        const docsRepresentante = allDocVersions.filter((d: any) => d.tipo === "doc_representante");
        const cupons = allDocVersions.filter((d: any) => d.tipo === "cupom_fiscal" || d.tipo === "cupom_fiscal_qr");
        const outros = allDocVersions.filter((d: any) => !["identidade", "identidade_com_cpf", "cpf", "procuracao", "doc_representante", "cupom_fiscal", "cupom_fiscal_qr", "receita"].includes(d.tipo));

        const totalFiles = allReceitas.length + allDocVersions.length;
        if (totalFiles === 0) return null;

        const categoryColors: Record<string, { icon: string; gradient: string; border: string; bg: string }> = {
          receitas: { icon: "📋", gradient: "from-rose-500 to-pink-400", border: "border-rose-200", bg: "bg-rose-50" },
          identidade: { icon: "🪪", gradient: "from-blue-500 to-indigo-400", border: "border-blue-200", bg: "bg-blue-50" },
          cupom: { icon: "🧾", gradient: "from-emerald-500 to-green-400", border: "border-emerald-200", bg: "bg-emerald-50" },
          procuracao: { icon: "📋", gradient: "from-amber-500 to-yellow-400", border: "border-amber-200", bg: "bg-amber-50" },
          representante: { icon: "👤", gradient: "from-violet-500 to-purple-400", border: "border-violet-200", bg: "bg-violet-50" },
          outros: { icon: "📄", gradient: "from-slate-500 to-gray-400", border: "border-slate-200", bg: "bg-slate-50" },
        };

        const renderDocRow = (doc: any, iconStr: string) => (
          <div key={doc.id} className="flex items-center justify-between p-3 rounded-xl bg-background/80 hover:bg-muted/60 transition-colors border border-border/30">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-lg">{iconStr}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium capitalize truncate">{doc.tipo?.replace(/_/g, " ")}</p>
                <p className="text-[11px] text-muted-foreground">{formatDateBR(doc.created_at?.split("T")[0] || null)}</p>
              </div>
            </div>
            <a href={doc.arquivo_url} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="sm" className="rounded-lg h-8 px-3 text-xs gap-1.5 hover:bg-primary/10 hover:text-primary">
                <Eye className="w-3.5 h-3.5" /> Ver
              </Button>
            </a>
          </div>
        );

        const renderCategory = (
          title: string, items: any[], cat: keyof typeof categoryColors, iconOverride?: string,
          customRender?: () => React.ReactNode
        ) => {
          if (items.length === 0 && !customRender) return null;
          const c = categoryColors[cat];
          return (
            <div className={`rounded-2xl border ${c.border} ${c.bg} overflow-hidden`}>
              <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/20">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br ${c.gradient} shadow-sm`}>
                  <span className="text-sm">{iconOverride || c.icon}</span>
                </div>
                <h4 className="text-sm font-bold uppercase tracking-wider text-foreground/80">{title}</h4>
                <Badge variant="secondary" className="rounded-md text-[10px] h-5 ml-auto">{items.length}</Badge>
              </div>
              <div className="p-2.5 space-y-1.5">
                {customRender ? customRender() : items.map((doc: any) => renderDocRow(doc, iconOverride || c.icon))}
              </div>
            </div>
          );
        };

        return (
          <Collapsible>
            <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-gradient-to-br from-amber-500 to-orange-400 shadow-lg">
                      <FolderOpen className="w-[18px] h-[18px] text-white" />
                    </div>
                    <h3 className="text-base font-bold" style={{ fontFamily: "var(--font-display)" }}>
                      Todos os Arquivos
                    </h3>
                    <Badge variant="secondary" className="rounded-lg">{totalFiles}</Badge>
                  </div>
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 pb-4 space-y-3">

                  {/* Receitas */}
                  {allReceitas.length > 0 && renderCategory("Receitas", allReceitas, "receitas", "📋", () => (
                    <>
                      {allReceitas.map((r, i) => (
                        <div key={r.id + "-" + i} className="flex items-center justify-between p-3 rounded-xl bg-background/80 hover:bg-muted/60 transition-colors border border-border/30">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="text-lg">{r.tipo.startsWith("🧷") ? "🧷" : "💊"}</span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{r.tipo}</p>
                              <p className="text-[11px] text-muted-foreground">{formatDateBR(r.data)}</p>
                            </div>
                            {r.cicloStatus === "ativo" && <Badge className="text-[10px] rounded-md h-5">Ativo</Badge>}
                          </div>
                          <a href={r.url} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="sm" className="rounded-lg h-8 px-3 text-xs gap-1.5 hover:bg-primary/10 hover:text-primary">
                              <Eye className="w-3.5 h-3.5" /> Ver
                            </Button>
                          </a>
                        </div>
                      ))}
                    </>
                  ))}

                  {/* Identidade / CPF */}
                  {renderCategory("Identidade / CPF", identidades, "identidade", "🪪")}

                  {/* Procurações */}
                  {renderCategory("Procurações", procuracoes, "procuracao", "📋")}

                  {/* Documento do Responsável Legal */}
                  {renderCategory("Documento do Responsável Legal", docsRepresentante, "representante", "👤")}

                  {/* Cupons Fiscais */}
                  {renderCategory("Cupons Fiscais", cupons, "cupom", "🧾")}

                  {/* Outros */}
                  {outros.length > 0 && renderCategory("Outros Documentos", outros, "outros", "📄")}

                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        );
      })()}

      {/* ═══ Modals ═══ */}

      {/* Cycle Selector Dialog (date verification) */}
      {showCycleSelector && (
        <Dialog open onOpenChange={() => setShowCycleSelector(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-primary">
                <Calendar className="w-5 h-5" /> Selecionar Ciclo
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Há {activeCiclos.length} ciclos ativos. Informe a <strong>data da primeira retirada</strong> para identificar o ciclo correto.
              </p>
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Data da Primeira Retirada *</Label>
                <Input
                  type="date"
                  value={cycleSelectorDate}
                  onChange={(e) => handleCycleSelectorDateChange(e.target.value)}
                  className="rounded-xl min-h-[44px]"
                  autoFocus
                />
              </div>

              {/* Show all active cycles with view receita option */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ciclos Ativos</p>
                {activeCiclos.map((c: any) => {
                  const tipo = (c.receitas as any)?.tipo;
                  const isMatch = cycleSelectorDate && c.data_inicio === cycleSelectorDate;
                  const receitaUrl = (c.receitas as any)?.arquivo_url;
                  return (
                    <div key={c.id} className={`p-3 rounded-xl border transition-all ${isMatch ? "border-primary bg-primary/10 ring-2 ring-primary/30" : "border-border/50 bg-muted/30"}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span>{tipo === "fralda" ? "🧷" : "💊"}</span>
                          <div>
                            <p className="text-sm font-semibold">{tipo === "fralda" ? "Fralda" : "Medicamento"}</p>
                            <p className="text-xs text-muted-foreground">Primeira retirada: {formatDateBR(c.data_inicio)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {receitaUrl && (
                            <Button variant="ghost" size="sm" className="rounded-lg h-8 px-2 text-xs" onClick={() => setViewingImage(receitaUrl)}>
                              <Eye className="w-3.5 h-3.5 mr-1" /> Receita
                            </Button>
                          )}
                          {isMatch && (
                            <Badge className="bg-primary text-primary-foreground rounded-lg text-xs">✓ Encontrado</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                        <span>{c.total_dispensacoes}/{c.limite_maximo} disp.</span>
                        <span>Válido até {formatDateBR(c.data_fim)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {cycleSelectorDate && cycleSelectorMatches.length === 0 && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30">
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Nenhum ciclo encontrado com essa data de primeira retirada.
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">Verifique a data ou visualize as receitas acima para confirmar.</p>
                </div>
              )}

              {cycleSelectorDate && cycleSelectorMatches.length > 1 && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5" /> {cycleSelectorMatches.length} ciclos com a mesma data de primeira retirada.
                  </p>
                  <p className="text-[11px] text-muted-foreground">Selecione o ciclo correto abaixo:</p>
                  {cycleSelectorMatches.map((c: any) => {
                    const tipo = (c.receitas as any)?.tipo;
                    const receitaUrl = (c.receitas as any)?.arquivo_url;
                    const st = calcStatusForCiclo(c);
                    return (
                      <div key={c.id} className="p-3 rounded-xl border border-primary/30 bg-primary/5 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span>{tipo === "fralda" ? "🧷" : "💊"}</span>
                            <div>
                              <p className="text-sm font-semibold">{tipo === "fralda" ? "Fralda" : "Medicamento"}</p>
                              <p className="text-xs text-muted-foreground">{c.total_dispensacoes}/{c.limite_maximo} disp. • {st.label}</p>
                            </div>
                          </div>
                          {receitaUrl && (
                            <Button variant="ghost" size="sm" className="rounded-lg h-8 px-2 text-xs" onClick={() => setViewingImage(receitaUrl)}>
                              <Eye className="w-3.5 h-3.5 mr-1" /> Ver Receita
                            </Button>
                          )}
                        </div>
                        <Button size="sm" className="w-full rounded-xl" onClick={() => confirmCycleSelection(c)}>
                          <Package className="w-4 h-4 mr-1" /> Selecionar este ciclo
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setShowCycleSelector(false)} className="rounded-xl">Cancelar</Button>
                {cycleSelectorMatches.length === 1 && (
                  <Button
                    onClick={() => confirmCycleSelection()}
                    disabled={!cycleSelectorMatch}
                    className="rounded-xl"
                  >
                    <Package className="w-4 h-4 mr-1" /> Prosseguir
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Ações fixas para celular */}
      <div className="fixed left-3 right-3 bottom-24 z-30 md:hidden">
        <div className="surface-panel rounded-[1.4rem] p-2 grid grid-cols-2 gap-2">
          <Button onClick={runPrimaryAction} disabled={encerrandoEAbrindo || (!canDispenseAll && status.label.startsWith("AGUARDAR"))} className="min-h-[48px] rounded-2xl text-sm font-bold">
            <Package className="w-4 h-4 mr-1.5" />
            {canDispenseAll ? "Registrar" : status.label.startsWith("AGUARDAR") ? "Aguardar" : "Nova receita"}
          </Button>
          {paciente.telefone ? (
            <a href={buildWhatsAppUrl(buildCleanPatientWhatsAppMessage())} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" className="w-full min-h-[48px] rounded-2xl text-sm font-bold border-primary/30 text-primary">
                <MessageCircle className="w-4 h-4 mr-1.5" /> WhatsApp
              </Button>
            </a>
          ) : (
            <Button variant="outline" className="min-h-[48px] rounded-2xl text-sm font-bold" onClick={() => setShowPhoneGate(true)}>
              <Phone className="w-4 h-4 mr-1.5" /> Telefone
            </Button>
          )}
        </div>
      </div>

      {showDispensacao && cicloAtivo && <NovaDispensacao paciente={paciente} ciclo={cicloAtivo} onClose={() => { setShowDispensacao(false); fetchData(); galeria.limparGaleria(); }} galeriaFotos={galeria.fotos} galeriaLoading={galeria.loading} />}

      {/* Setup Novo Ciclo - rendered as overlay when there's already an active cycle */}
      {showSetupNovo && cicloAtivo && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm overflow-y-auto">
          <div className="min-h-full flex items-start justify-center p-4 pt-8">
            <div className="w-full max-w-2xl">
              <SetupCiclo
                paciente={paciente}
                onComplete={() => { setShowSetupNovo(false); fetchData(); galeria.limparGaleria(); }}
                onCancel={() => setShowSetupNovo(false)}
                galeriaFotos={galeria.fotos}
                galeriaLoading={galeria.loading}
              />
            </div>
          </div>
        </div>
      )}

      {/* Encerrar Ciclo Dialog */}
      {showEncerrarCiclo && (
        <Dialog open onOpenChange={() => setShowEncerrarCiclo(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" /> Encerrar Ciclo
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 space-y-1">
                <p className="text-sm font-semibold">Ciclo: {formatDateBR(cicloAtivo?.data_inicio)} → {formatDateBR(cicloAtivo?.data_fim)}</p>
                <p className="text-xs text-muted-foreground">Dispensações: {cicloAtivo?.total_dispensacoes}/{cicloAtivo?.limite_maximo}</p>
                <p className="text-xs text-destructive mt-2">⚠️ O ciclo será encerrado permanentemente.</p>
              </div>
              <div className="space-y-2">
                <Label>Motivo *</Label>
                <Textarea placeholder="Motivo do encerramento..." value={motivoEncerramento}
                  onChange={(e) => setMotivoEncerramento(e.target.value)} className="min-h-[80px] rounded-xl" />
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setShowEncerrarCiclo(false)} className="rounded-xl">Cancelar</Button>
                <Button variant="destructive" onClick={handleEncerrarCiclo} disabled={encerrando || !motivoEncerramento.trim()} className="rounded-xl">
                  {encerrando ? "Encerrando..." : "Encerrar"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Cancelar Dispensação Dialog */}
      {cancelDispId && (
        <Dialog open onOpenChange={() => setCancelDispId(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2">
                <XCircle className="w-5 h-5" /> Cancelar Dispensação
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
                <p className="text-sm text-destructive">⚠️ A dispensação será cancelada e o contador decrementado.</p>
              </div>
              <div className="space-y-2">
                <Label>Justificativa *</Label>
                <Textarea placeholder="Motivo do cancelamento..." value={justificativaCancelamento}
                  onChange={(e) => setJustificativaCancelamento(e.target.value)} className="min-h-[80px] rounded-xl" />
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setCancelDispId(null)} className="rounded-xl">Voltar</Button>
                <Button variant="destructive" onClick={handleCancelarDispensacao} disabled={cancelando || !justificativaCancelamento.trim()} className="rounded-xl">
                  {cancelando ? "Cancelando..." : "Confirmar"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {itemsDialog && (
        <Dialog open onOpenChange={(o) => { if (!o && !savingItems) setItemsDialog(null); }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-primary" /> Itens do cupom
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Esta dispensação não tem os medicamentos lidos automaticamente. Informe abaixo (código, nome e quantidade). Os dados serão salvos no cupom e usados em impressões futuras — sem consumir IA.
              </p>
              {itemsDialog.items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end border border-border/40 rounded-lg p-2">
                  <div className="col-span-3">
                    <Label className="text-[10px]">Código</Label>
                    <Input
                      value={it.codigo}
                      onChange={(e) => {
                        const v = e.target.value;
                        setItemsDialog((prev) => prev ? { ...prev, items: prev.items.map((x, i) => i === idx ? { ...x, codigo: v } : x) } : prev);
                      }}
                      placeholder="cód."
                      className="h-9"
                    />
                  </div>
                  <div className="col-span-6">
                    <Label className="text-[10px]">Medicamento</Label>
                    <Input
                      value={it.nome}
                      onChange={(e) => {
                        const v = e.target.value;
                        setItemsDialog((prev) => prev ? { ...prev, items: prev.items.map((x, i) => i === idx ? { ...x, nome: v } : x) } : prev);
                      }}
                      placeholder="nome"
                      className="h-9"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px]">Qtd</Label>
                    <Input
                      value={it.quantidade}
                      onChange={(e) => {
                        const v = e.target.value;
                        setItemsDialog((prev) => prev ? { ...prev, items: prev.items.map((x, i) => i === idx ? { ...x, quantidade: v } : x) } : prev);
                      }}
                      placeholder="qtd"
                      className="h-9"
                    />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => setItemsDialog((prev) => prev ? { ...prev, items: prev.items.filter((_, i) => i !== idx) } : prev)}
                      disabled={itemsDialog.items.length <= 1}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setItemsDialog((prev) => prev ? { ...prev, items: [...prev.items, { codigo: "", nome: "", quantidade: "" }] } : prev)}
              >
                + Adicionar item
              </Button>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setItemsDialog(null)} disabled={savingItems}>
                  Cancelar
                </Button>
                <Button className="flex-1" onClick={handleSaveAndPrintItems} disabled={savingItems}>
                  {savingItems ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Printer className="w-4 h-4 mr-1" /> Salvar e imprimir</>}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
    </>
  );
}
