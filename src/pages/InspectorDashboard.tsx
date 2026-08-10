import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, FileText, Package, Calendar, Search, LogOut, Eye,
  ChevronDown, X, Clock, Activity, Pill,
  AlertTriangle, CheckCircle, XCircle, Maximize2,
  UserSearch, CalendarCheck, UserPlus, ClockAlert, Home, Lock,
} from "lucide-react";
import { format, parseISO, differenceInDays, addDays, isBefore, startOfDay, startOfMonth, endOfMonth } from "date-fns";
import ImageViewer from "@/components/farmacia/ImageViewer";
import AppLayout from "@/components/AppLayout";
import { ptBR } from "date-fns/locale";
import { getCycleClosureInfo } from "@/lib/ciclo-utils";

/* ─── Types ─── */
interface Paciente {
  id: string; nome: string; cpf: string; ativo: boolean;
  data_nascimento: string | null; telefone: string | null; created_at: string;
}
interface Ciclo {
  id: string; paciente_id: string; receita_id: string; status: string;
  data_inicio: string; data_fim: string; intervalo_dias: number;
  limite_maximo: number; total_dispensacoes: number; ultima_retirada: string | null;
  created_at: string;
}
interface Receita {
  id: string; paciente_id: string; tipo: string; data_emissao: string;
  validade_ate: string; arquivo_url: string; nome_medico: string | null;
  created_at: string;
}
interface Dispensacao {
  id: string; paciente_id: string; ciclo_id: string; tipo_retirada: string;
  cancelada: boolean; created_at: string; snapshot_ciclo: any;
}
interface Documento {
  id: string; paciente_id: string; tipo: string; arquivo_url: string;
  status: string; created_at: string; validade_ate: string;
}

/* ─── Colors ─── */
const NEON = {
  blue: "hsla(210, 80%, 45%, 1)",
  cyan: "hsla(190, 70%, 40%, 1)",
  purple: "hsla(270, 60%, 50%, 1)",
  magenta: "hsla(320, 60%, 50%, 1)",
  green: "hsla(150, 60%, 38%, 1)",
  amber: "hsla(42, 80%, 45%, 1)",
  red: "hsla(0, 70%, 50%, 1)",
};

/* ─── Animated Background ─── */
function JarvisBackground() {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden" style={{ background: "linear-gradient(135deg, #e8ecf4 0%, #dfe4ef 30%, #e2e7f0 60%, #edf0f5 100%)" }}>
      <div className="absolute inset-0 opacity-[0.06]" style={{
        backgroundImage: "linear-gradient(hsla(210,60%,45%,0.2) 1px, transparent 1px), linear-gradient(90deg, hsla(210,60%,45%,0.2) 1px, transparent 1px)",
        backgroundSize: "60px 60px",
      }} />
      <div className="absolute top-0 left-1/4 w-[800px] h-[600px] rounded-full" style={{ background: "radial-gradient(ellipse, hsla(210,80%,55%,0.06) 0%, transparent 70%)" }} />
      <motion.div
        className="absolute left-0 right-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, hsla(210,60%,45%,0.12), transparent)" }}
        animate={{ top: ["0%", "100%", "0%"] }}
        transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
}

/* ─── Glass Card ─── */
function GlassCard({ children, className = "", neonColor = NEON.blue, onClick }: {
  children: React.ReactNode; className?: string; neonColor?: string; onClick?: () => void;
}) {
  return (
    <motion.div
      className={`relative rounded-2xl overflow-hidden ${className}`}
      style={{
        background: "hsla(220, 30%, 98%, 0.85)",
        backdropFilter: "blur(20px)",
        border: `1px solid ${neonColor.replace("1)", "0.25)")}`,
        boxShadow: `0 2px 15px ${neonColor.replace("1)", "0.06)")}, 0 1px 3px hsla(220,20%,50%,0.08)`,
      }}
      whileHover={onClick ? { scale: 1.01, boxShadow: `0 0 35px ${neonColor.replace("1)", "0.18)")}` } : undefined}
      onClick={onClick}
      layout
    >
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${neonColor.replace("1)", "0.6)")}, transparent)` }} />
      {children}
    </motion.div>
  );
}

/* ─── Stat Counter ─── */
function StatCard({ label, value, icon: Icon, color, sub, active, onClick }: {
  label: string; value: number; icon: React.ElementType; color: string; sub?: string;
  active?: boolean; onClick?: () => void;
}) {
  const [displayVal, setDisplayVal] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = Math.max(1, Math.ceil(value / 30));
    const timer = setInterval(() => {
      start += step;
      if (start >= value) { setDisplayVal(value); clearInterval(timer); }
      else setDisplayVal(start);
    }, 30);
    return () => clearInterval(timer);
  }, [value]);

  return (
    <GlassCard neonColor={color} className={`p-6 cursor-pointer ${active ? "ring-2" : ""}`} onClick={onClick}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm uppercase tracking-widest font-semibold" style={{ color }}>{label}</p>
          <motion.p className="text-4xl font-bold mt-2" style={{ color, fontFamily: "var(--font-mono)" }}
            key={displayVal} initial={{ scale: 1.1 }} animate={{ scale: 1 }}>
            {displayVal}
          </motion.p>
          {sub && <p className="text-sm mt-1.5" style={{ color: "hsla(220, 20%, 40%, 0.8)" }}>{sub}</p>}
        </div>
        <div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{ background: color.replace("1)", "0.15)"), border: `1px solid ${color.replace("1)", "0.3)")}` }}>
          <Icon className="w-7 h-7" style={{ color }} />
        </div>
      </div>
      {active && <div className="mt-2 h-0.5 rounded-full" style={{ background: color }} />}
    </GlassCard>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isAtivo = status === "ativo";
  const color = isAtivo ? NEON.green : NEON.red;
  const Icon = isAtivo ? CheckCircle : XCircle;
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider"
      style={{ background: color.replace("1)", "0.15)"), color, border: `1px solid ${color.replace("1)", "0.35)")}` }}>
      <Icon className="w-4 h-4" /> {isAtivo ? "Ativo" : "Encerrado"}
    </span>
  );
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatLocalDateTime(date: Date, endOfDay = false): string {
  return `${formatLocalDate(date)}T${endOfDay ? "23:59:59" : "00:00:00"}`;
}

function parseLocalDateString(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/* ─── Main Inspector Dashboard ─── */
export default function InspectorDashboard() {
  const { user, profile, signOut, effectiveRole, isMaster } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [activeStatPanel, setActiveStatPanel] = useState<string | null>(null);

  const [counts, setCounts] = useState({
    pacientes: 0, ativos: 0, ciclosAtivos: 0, ciclosTotal: 0,
    receitas: 0, dispHoje: 0, dispTotal: 0, receitasAVencer: 0,
    ciclosAtrasados: 0, novosNoMes: 0, previstos: 0, pausados: 0, ciclosAEncerrar: 0,
  });

  const [detailData, setDetailData] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchSubmitted, setSearchSubmitted] = useState("");
  const [pacDetailData, setPacDetailData] = useState<{ ciclos: any[]; receitas: any[]; dispensacoes: any[]; documentos: any[] } | null>(null);

  const hasAccess = (effectiveRole as string) === "chefe" || (effectiveRole as string) === "inspetor" || isMaster;

  useEffect(() => {
    if (!hasAccess) return;
    loadCounts();
  }, [hasAccess]);

  const loadCounts = async () => {
    setLoading(true);
    const now = new Date();
    const hoje = formatLocalDate(now);
    const inicioHoje = formatLocalDateTime(now);
    const fimHoje = formatLocalDateTime(now, true);
    const inicioMes = formatLocalDateTime(startOfMonth(now));
    const fimMes = formatLocalDate(endOfMonth(now));

    const [pTotal, pAtivos, cAtivos, cTotal, rTotal, dHoje, dTotal, rVencer, activeCiclosRes, novosRes] = await Promise.all([
      supabase.from("pacientes").select("id", { count: "exact", head: true }),
      supabase.from("pacientes").select("id", { count: "exact", head: true }).eq("ativo", true),
      supabase.from("ciclos").select("id", { count: "exact", head: true }).eq("status", "ativo"),
      supabase.from("ciclos").select("id", { count: "exact", head: true }),
      supabase.from("receitas").select("id", { count: "exact", head: true }),
      supabase.from("dispensacoes").select("id", { count: "exact", head: true }).gte("created_at", inicioHoje).lte("created_at", fimHoje).eq("cancelada", false),
      supabase.from("dispensacoes").select("id", { count: "exact", head: true }),
      supabase.from("receitas").select("id", { count: "exact", head: true }).gte("validade_ate", hoje).lte("validade_ate", fimMes),
      supabase.from("ciclos").select("id, data_inicio, data_fim, intervalo_dias, limite_maximo, total_dispensacoes, ultima_retirada").eq("status", "ativo"),
      supabase.from("pacientes").select("id", { count: "exact", head: true }).gte("created_at", inicioMes),
    ]);

    const activeCiclos = activeCiclosRes.data || [];
    const hojeDate = startOfDay(now);
    let atrasados = 0;
    let previstosCount = 0;
    let pausados = 0;
    let ciclosAEncerrar = 0;
    let ciclosAtivosOperacionais = 0;
    activeCiclos.forEach((c: any) => {
      if (getCycleClosureInfo(c).shouldClose) { ciclosAEncerrar++; return; }
      const proxima = c.ultima_retirada
        ? startOfDay(addDays(parseLocalDateString(c.ultima_retirada), c.intervalo_dias + 1))
        : startOfDay(parseLocalDateString(c.data_inicio));
      const atrasoDias = differenceInDays(hojeDate, proxima);
      if (atrasoDias >= 60) { pausados++; return; }
      ciclosAtivosOperacionais++;
      if (isBefore(proxima, hojeDate)) atrasados++;
      if (proxima.getTime() === hojeDate.getTime()) previstosCount++;
    });

    setCounts({
      pacientes: pTotal.count || 0, ativos: pAtivos.count || 0,
      ciclosAtivos: ciclosAtivosOperacionais, ciclosTotal: cTotal.count || 0,
      receitas: rTotal.count || 0, dispHoje: dHoje.count || 0,
      dispTotal: dTotal.count || 0, receitasAVencer: rVencer.count || 0,
      ciclosAtrasados: atrasados, novosNoMes: novosRes.count || 0,
      previstos: previstosCount, pausados, ciclosAEncerrar,
    });
    setLoading(false);
  };

  const loadStatDetail = async (panel: string) => {
    if (activeStatPanel === panel) { setActiveStatPanel(null); return; }
    setActiveStatPanel(panel);
    setDetailLoading(true);
    setDetailData([]);

    const now = new Date();
    const hoje = formatLocalDate(now);
    const inicioHoje = formatLocalDateTime(now);
    const fimHoje = formatLocalDateTime(now, true);
    const fimMes = formatLocalDate(endOfMonth(now));
    const inicioMes = formatLocalDateTime(startOfMonth(now));
    const hojeDate = startOfDay(now);

    switch (panel) {
      case "pacientes": {
        const { data } = await supabase.from("pacientes").select("id, nome, cpf, ativo, telefone").order("nome").limit(100);
        setDetailData(data || []); break;
      }
      case "ciclos_ativos": {
        const { data } = await supabase.from("ciclos").select("*, pacientes(nome)").eq("status", "ativo").order("created_at", { ascending: false }).limit(150);
        const ativos = (data || []).filter((c: any) => {
          if (getCycleClosureInfo(c).shouldClose) return false;
          const proxima = c.ultima_retirada
            ? startOfDay(addDays(parseLocalDateString(c.ultima_retirada), c.intervalo_dias + 1))
            : startOfDay(parseLocalDateString(c.data_inicio));
          return differenceInDays(hojeDate, proxima) < 60;
        });
        setDetailData(ativos.slice(0, 100)); break;
      }
      case "a_encerrar": {
        const { data } = await supabase.from("ciclos").select("*, pacientes(nome, cpf), receitas(tipo)").eq("status", "ativo");
        setDetailData((data || []).filter((c: any) => getCycleClosureInfo(c).shouldClose)); break;
      }
      case "receitas": {
        const { data } = await supabase.from("receitas").select("*, pacientes(nome)").order("created_at", { ascending: false }).limit(100);
        setDetailData(data || []); break;
      }
      case "disp_hoje": {
        const { data } = await supabase.from("dispensacoes").select("*, pacientes(nome)").gte("created_at", inicioHoje).lte("created_at", fimHoje).eq("cancelada", false).order("created_at", { ascending: false });
        setDetailData(data || []); break;
      }
      case "previstos": {
        const { data: ciclos } = await supabase.from("ciclos").select("*, pacientes(nome, cpf), receitas(tipo)").eq("status", "ativo");
        const prev = (ciclos || []).filter((c: any) => {
          if (getCycleClosureInfo(c).shouldClose) return false;
          const proxima = c.ultima_retirada
            ? startOfDay(addDays(parseLocalDateString(c.ultima_retirada), c.intervalo_dias + 1))
            : startOfDay(parseLocalDateString(c.data_inicio));
          return proxima.getTime() === hojeDate.getTime();
        });
        setDetailData(prev); break;
      }
      case "receitas_vencer": {
        const { data } = await supabase.from("receitas").select("*, pacientes(nome)").gte("validade_ate", hoje).lte("validade_ate", fimMes);
        setDetailData(data || []); break;
      }
      case "ciclos_atrasados": {
        const { data: ciclos } = await supabase.from("ciclos").select("*, pacientes(nome)").eq("status", "ativo");
        const atrasados = (ciclos || []).filter((c: any) => {
          if (getCycleClosureInfo(c).shouldClose) return false;
          const proxima = c.ultima_retirada
            ? startOfDay(addDays(parseLocalDateString(c.ultima_retirada), c.intervalo_dias + 1))
            : startOfDay(parseLocalDateString(c.data_inicio));
          const atrasoDias = differenceInDays(hojeDate, proxima);
          return atrasoDias > 0 && atrasoDias < 60;
        });
        setDetailData(atrasados); break;
      }
      case "pausados": {
        const { data: ciclos } = await supabase.from("ciclos").select("*, pacientes(nome, cpf), receitas(tipo)").eq("status", "ativo");
        const pausados = (ciclos || []).filter((c: any) => {
          if (getCycleClosureInfo(c).shouldClose) return false;
          const proxima = c.ultima_retirada
            ? startOfDay(addDays(parseLocalDateString(c.ultima_retirada), c.intervalo_dias + 1))
            : startOfDay(parseLocalDateString(c.data_inicio));
          return differenceInDays(hojeDate, proxima) >= 60;
        });
        setDetailData(pausados); break;
      }
      case "novos_mes": {
        const { data } = await supabase.from("pacientes").select("id, nome, cpf, created_at").gte("created_at", inicioMes).order("created_at", { ascending: false });
        setDetailData(data || []); break;
      }
    }
    setDetailLoading(false);
  };

  const handleSearch = async () => {
    const term = searchTerm.trim();
    if (!term) { setSearchResults([]); setSearchSubmitted(""); return; }
    setSearchLoading(true);
    setSearchSubmitted(term);
    const clean = term.replace(/\D/g, "");
    let query = supabase.from("pacientes").select("id, nome, cpf, ativo, telefone").order("nome").limit(30);
    if (clean.length >= 3) {
      query = query.ilike("cpf", `%${clean}%`);
    } else {
      query = query.ilike("nome", `%${term}%`);
    }
    const { data } = await query;
    setSearchResults(data || []);
    setSearchLoading(false);
  };

  const loadPacDetail = async (pacId: string) => {
    if (expandedId === pacId) { setExpandedId(null); setPacDetailData(null); return; }
    setExpandedId(pacId);
    setPacDetailData(null);
    const [cRes, rRes, dRes, docRes] = await Promise.all([
      supabase.from("ciclos").select("*").eq("paciente_id", pacId).order("created_at", { ascending: false }),
      supabase.from("receitas").select("*").eq("paciente_id", pacId).order("created_at", { ascending: false }),
      supabase.from("dispensacoes").select("*").eq("paciente_id", pacId).order("created_at", { ascending: false }),
      supabase.from("documentos").select("id, tipo, arquivo_url, status").eq("paciente_id", pacId).order("created_at", { ascending: false }),
    ]);
    setPacDetailData({
      ciclos: cRes.data || [], receitas: rRes.data || [],
      dispensacoes: dRes.data || [], documentos: docRes.data || [],
    });
  };

  const handleLogout = async () => { await signOut(); navigate("/login"); };

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(d) ? parseLocalDateString(d) : parseISO(d);
    return format(parsed, "dd/MM/yyyy", { locale: ptBR });
  };

  if (!hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#f0f2f5", color: NEON.red }}>
        <p className="text-lg">Acesso não autorizado</p>
      </div>
    );
  }

  return (
    <AppLayout title="Auditoria operacional">
      <ImageViewer url={imageUrl} onClose={() => setImageUrl(null)} />
      <div className="space-y-6">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={loadCounts}
            className="inline-flex items-center gap-2 rounded-2xl border border-border bg-white px-4 py-2.5 text-sm font-bold shadow-sm hover:bg-secondary transition-colors"
          >
            <Activity className="w-4 h-4" /> Atualizar painel
          </button>
        </div>
        {/* Stats */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <motion.div className="w-12 h-12 rounded-full" style={{ border: `2px solid transparent`, borderTopColor: NEON.cyan, borderRightColor: NEON.blue }}
              animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Pacientes" value={counts.pacientes} icon={Users} color={NEON.blue} sub={`${counts.ativos} ativos`} active={activeStatPanel === "pacientes"} onClick={() => loadStatDetail("pacientes")} />
              <StatCard label="Ciclos Ativos" value={counts.ciclosAtivos} icon={Activity} color={NEON.purple} sub={`${counts.ciclosTotal} total`} active={activeStatPanel === "ciclos_ativos"} onClick={() => loadStatDetail("ciclos_ativos")} />
              <StatCard label="A Encerrar" value={counts.ciclosAEncerrar} icon={Lock} color={NEON.red} sub="Próxima > validade" active={activeStatPanel === "a_encerrar"} onClick={() => loadStatDetail("a_encerrar")} />
              <StatCard label="Receitas" value={counts.receitas} icon={FileText} color={NEON.amber} active={activeStatPanel === "receitas"} onClick={() => loadStatDetail("receitas")} />
              <StatCard label="Dispensados Hoje" value={counts.dispHoje} icon={Package} color={NEON.cyan} sub={`${counts.dispTotal} total`} active={activeStatPanel === "disp_hoje"} onClick={() => loadStatDetail("disp_hoje")} />
              <StatCard label="Previstos Hoje" value={counts.previstos} icon={CalendarCheck} color={NEON.green} sub="Liberados para retirada" active={activeStatPanel === "previstos"} onClick={() => loadStatDetail("previstos")} />
              <StatCard label="Receitas a Vencer" value={counts.receitasAVencer} icon={AlertTriangle} color={NEON.red} sub="Vencem este mês" active={activeStatPanel === "receitas_vencer"} onClick={() => loadStatDetail("receitas_vencer")} />
              <StatCard label="Ciclos Atrasados" value={counts.ciclosAtrasados} icon={ClockAlert} color={NEON.magenta} sub="Retirada em atraso" active={activeStatPanel === "ciclos_atrasados"} onClick={() => loadStatDetail("ciclos_atrasados")} />
              <StatCard label="Pausados" value={counts.pausados} icon={Clock} color={NEON.amber} sub="Atraso acima de 60 dias" active={activeStatPanel === "pausados"} onClick={() => loadStatDetail("pausados")} />
              <StatCard label="Novos no Mês" value={counts.novosNoMes} icon={UserPlus} color={NEON.blue} sub="Pacientes cadastrados" active={activeStatPanel === "novos_mes"} onClick={() => loadStatDetail("novos_mes")} />
            </div>

            {/* Stat Detail Panel */}
            <AnimatePresence>
              {activeStatPanel && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <GlassCard neonColor={NEON.cyan} className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold uppercase tracking-wider" style={{ color: NEON.cyan }}>
                        {activeStatPanel === "pacientes" && "Todos os Pacientes"}
                        {activeStatPanel === "ciclos_ativos" && "Ciclos Ativos"}
                        {activeStatPanel === "a_encerrar" && "Ciclos a Encerrar"}
                        {activeStatPanel === "receitas" && "Todas as Receitas"}
                        {activeStatPanel === "disp_hoje" && "Dispensações Hoje"}
                        {activeStatPanel === "previstos" && "Previstos Hoje"}
                        {activeStatPanel === "receitas_vencer" && "Receitas a Vencer"}
                        {activeStatPanel === "ciclos_atrasados" && "Ciclos Atrasados"}
                        {activeStatPanel === "pausados" && "Pausados por Falta de Frequência"}
                        {activeStatPanel === "novos_mes" && "Novos Pacientes no Mês"}
                        {` (${detailData.length})`}
                      </h3>
                      <motion.button onClick={() => setActiveStatPanel(null)} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                        className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "hsla(220,20%,50%,0.1)", border: "1px solid hsla(220,20%,50%,0.2)" }}>
                        <X className="w-4 h-4" style={{ color: "hsla(220,20%,40%,0.8)" }} />
                      </motion.button>
                    </div>

                    {detailLoading ? (
                      <div className="flex justify-center py-8">
                        <motion.div className="w-8 h-8 rounded-full" style={{ border: `2px solid transparent`, borderTopColor: NEON.cyan }}
                          animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />
                      </div>
                    ) : detailData.length === 0 ? (
                      <p className="text-center py-4" style={{ color: "hsla(220,20%,65%,0.7)" }}>Nenhum registro encontrado</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 max-h-[500px] overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
                        {activeStatPanel === "pacientes" && detailData.map((p: any) => (
                          <div key={p.id} className="rounded-xl p-4 cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all" style={{ background: "hsla(210,40%,96%,0.8)", border: `1px solid ${NEON.blue.replace("1)", "0.2)")}` }}
                            onClick={() => navigate(`/pacientes/${p.id}`)}>
                            <p className="font-bold text-base">{p.nome}</p>
                            <p className="text-sm font-mono mt-1" style={{ color: "hsla(220,20%,40%,0.8)" }}>CPF: {p.cpf}</p>
                            {p.telefone && <p className="text-sm mt-0.5" style={{ color: "hsla(220,20%,40%,0.8)" }}>Tel: {p.telefone}</p>}
                            <span className="inline-block mt-2 text-xs px-2 py-1 rounded-full font-semibold" style={{ background: p.ativo ? NEON.green.replace("1)", "0.15)") : NEON.red.replace("1)", "0.15)"), color: p.ativo ? NEON.green : NEON.red }}>{p.ativo ? "Ativo" : "Inativo"}</span>
                          </div>
                        ))}

                        {activeStatPanel === "ciclos_ativos" && detailData.map((c: any) => (
                          <div key={c.id} className="rounded-xl p-4 cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all" style={{ background: "hsla(270,40%,96%,0.8)", border: `1px solid ${NEON.purple.replace("1)", "0.2)")}` }}
                            onClick={() => c.paciente_id && navigate(`/pacientes/${c.paciente_id}`)}>
                            <p className="font-bold">{c.pacientes?.nome || "—"}</p>
                            <div className="grid grid-cols-2 gap-2 mt-2 text-sm" style={{ color: "hsla(220,20%,30%,0.9)" }}>
                              <span>Início: <b>{formatDate(c.data_inicio)}</b></span>
                              <span>Fim: <b>{formatDate(c.data_fim)}</b></span>
                              <span>Dispensações: <b style={{ color: NEON.cyan }}>{c.total_dispensacoes}/{c.limite_maximo}</b></span>
                              <span>Intervalo: <b>{c.intervalo_dias + 1}d</b></span>
                            </div>
                          </div>
                        ))}

                        {activeStatPanel === "a_encerrar" && detailData.map((c: any) => {
                          const info = getCycleClosureInfo(c);
                          return (
                            <div key={c.id} className="rounded-xl p-4 cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all" style={{ background: "hsla(0,40%,97%,0.8)", border: `1px solid ${NEON.red.replace("1)", "0.2)")}` }}
                              onClick={() => c.paciente_id && navigate(`/pacientes/${c.paciente_id}`)}>
                              <p className="font-bold">{c.pacientes?.nome || "—"}</p>
                              <p className="text-sm font-mono mt-1" style={{ color: "hsla(220,20%,40%,0.8)" }}>CPF: {c.pacientes?.cpf}</p>
                              <div className="grid grid-cols-2 gap-2 mt-2 text-sm" style={{ color: "hsla(220,20%,30%,0.9)" }}>
                                <span>Próxima: <b style={{ color: NEON.red }}>{info.proximaRetirada ? formatDate(info.proximaRetirada) : "—"}</b></span>
                                <span>Validade: <b>{info.validade ? formatDate(info.validade) : "—"}</b></span>
                                <span>{c.receitas?.tipo === "fralda" ? "🩹 Fralda" : "💊 Medicamento"}</span>
                                <span>Retiradas: <b>{c.total_dispensacoes}/{c.limite_maximo}</b></span>
                              </div>
                            </div>
                          );
                        })}

                        {activeStatPanel === "receitas" && detailData.map((r: any) => (
                          <div key={r.id} className="rounded-xl p-4 cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all" style={{ background: "hsla(42,50%,96%,0.8)", border: `1px solid ${NEON.amber.replace("1)", "0.2)")}` }}
                            onClick={() => r.paciente_id && navigate(`/pacientes/${r.paciente_id}`)}>
                            <p className="font-bold">{r.pacientes?.nome || "—"}</p>
                            <span className="text-xs" style={{ color: NEON.amber }}>{r.tipo === "fralda" ? "🩹 Fralda" : "💊 Medicamento"}</span>
                            <div className="grid grid-cols-2 gap-2 mt-2 text-sm" style={{ color: "hsla(220,20%,30%,0.9)" }}>
                              <span>Emissão: <b>{formatDate(r.data_emissao)}</b></span>
                              <span>Validade: <b>{formatDate(r.validade_ate)}</b></span>
                            </div>
                          </div>
                        ))}

                        {activeStatPanel === "disp_hoje" && detailData.map((d: any) => (
                          <div key={d.id} className="rounded-xl p-4 cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all" style={{ background: "hsla(190,40%,96%,0.8)", border: `1px solid ${NEON.cyan.replace("1)", "0.2)")}` }}
                            onClick={() => d.paciente_id && navigate(`/pacientes/${d.paciente_id}`)}>
                            <p className="font-bold">{d.pacientes?.nome || "—"}</p>
                            <p className="text-sm font-mono mt-1" style={{ color: "hsla(220,20%,40%,0.8)" }}>{format(parseISO(d.created_at), "HH:mm")}</p>
                            <span className="text-xs mt-1 inline-block px-2 py-1 rounded" style={{ background: "hsla(210,50%,50%,0.15)", color: NEON.blue }}>{d.tipo_retirada === "paciente" ? "Paciente" : "Representante"}</span>
                          </div>
                        ))}

                        {activeStatPanel === "previstos" && detailData.map((c: any) => (
                          <div key={c.id} className="rounded-xl p-4 cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all" style={{ background: "hsla(150,40%,96%,0.8)", border: `1px solid ${NEON.green.replace("1)", "0.2)")}` }}
                            onClick={() => c.paciente_id && navigate(`/pacientes/${c.paciente_id}`)}>
                            <p className="font-bold">{c.pacientes?.nome || "—"}</p>
                            <p className="text-sm font-mono mt-1" style={{ color: "hsla(220,20%,40%,0.8)" }}>CPF: {c.pacientes?.cpf}</p>
                            <div className="grid grid-cols-2 gap-2 mt-2 text-sm" style={{ color: "hsla(220,20%,30%,0.9)" }}>
                              <span>{c.receitas?.tipo === "fralda" ? "🩹 Fralda" : "💊 Medicamento"}</span>
                              <span>Retiradas: <b style={{ color: NEON.cyan }}>{c.total_dispensacoes}/{c.limite_maximo}</b></span>
                            </div>
                          </div>
                        ))}

                        {activeStatPanel === "receitas_vencer" && detailData.map((r: any) => (
                          <div key={r.id} className="rounded-xl p-4 cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all" style={{ background: "hsla(0,40%,97%,0.8)", border: `1px solid ${NEON.red.replace("1)", "0.2)")}` }}
                            onClick={() => r.paciente_id && navigate(`/pacientes/${r.paciente_id}`)}>
                            <p className="font-bold">{r.pacientes?.nome || "—"}</p>
                            <div className="grid grid-cols-2 gap-2 mt-2 text-sm" style={{ color: "hsla(220,20%,30%,0.9)" }}>
                              <span>Validade: <b style={{ color: NEON.red }}>{formatDate(r.validade_ate)}</b></span>
                              <span>{r.tipo === "fralda" ? "🩹 Fralda" : "💊 Medicamento"}</span>
                            </div>
                          </div>
                        ))}

                        {activeStatPanel === "ciclos_atrasados" && detailData.map((c: any) => {
                          const diasAtraso = c.ultima_retirada
                            ? differenceInDays(startOfDay(new Date()), addDays(parseLocalDateString(c.ultima_retirada), c.intervalo_dias + 1))
                            : differenceInDays(startOfDay(new Date()), parseLocalDateString(c.data_inicio));
                          return (
                            <div key={c.id} className="rounded-xl p-4 cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all" style={{ background: "hsla(320,40%,96%,0.8)", border: `1px solid ${NEON.magenta.replace("1)", "0.2)")}` }}
                              onClick={() => c.paciente_id && navigate(`/pacientes/${c.paciente_id}`)}>
                              <p className="font-bold">{c.pacientes?.nome || "—"}</p>
                              <div className="grid grid-cols-2 gap-2 mt-2 text-sm" style={{ color: "hsla(220,20%,30%,0.9)" }}>
                                <span>Atraso: <b style={{ color: NEON.magenta }}>{diasAtraso} dias</b></span>
                                <span>Última: <b>{c.ultima_retirada ? formatDate(c.ultima_retirada) : "Nunca"}</b></span>
                                <span>Dispensações: <b>{c.total_dispensacoes}/{c.limite_maximo}</b></span>
                                <span>Intervalo: <b>{c.intervalo_dias + 1}d</b></span>
                              </div>
                            </div>
                          );
                        })}

                        {activeStatPanel === "pausados" && detailData.map((c: any) => {
                          const proxima = c.ultima_retirada
                            ? addDays(parseLocalDateString(c.ultima_retirada), c.intervalo_dias + 1)
                            : parseLocalDateString(c.data_inicio);
                          const diasAtraso = differenceInDays(startOfDay(new Date()), startOfDay(proxima));
                          return (
                            <div key={c.id} className="rounded-xl p-4 cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all" style={{ background: "hsla(42,50%,96%,0.8)", border: `1px solid ${NEON.amber.replace("1)", "0.2)")}` }}
                              onClick={() => c.paciente_id && navigate(`/pacientes/${c.paciente_id}`)}>
                              <p className="font-bold">{c.pacientes?.nome || "—"}</p>
                              <p className="text-sm font-mono mt-1" style={{ color: "hsla(220,20%,40%,0.8)" }}>CPF: {c.pacientes?.cpf || "—"}</p>
                              <div className="grid grid-cols-2 gap-2 mt-2 text-sm" style={{ color: "hsla(220,20%,30%,0.9)" }}>
                                <span>Atraso: <b style={{ color: NEON.amber }}>{diasAtraso} dias</b></span>
                                <span>Última: <b>{c.ultima_retirada ? formatDate(c.ultima_retirada) : "Nunca"}</b></span>
                                <span>Tipo: <b>{c.receitas?.tipo === "fralda" ? "Fralda" : "Medicamento"}</b></span>
                                <span>Retiradas: <b>{c.total_dispensacoes}/{c.limite_maximo}</b></span>
                              </div>
                            </div>
                          );
                        })}

                        {activeStatPanel === "novos_mes" && detailData.map((p: any) => (
                          <div key={p.id} className="rounded-xl p-4 cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all" style={{ background: "hsla(210,40%,96%,0.8)", border: `1px solid ${NEON.blue.replace("1)", "0.2)")}` }}
                            onClick={() => navigate(`/pacientes/${p.id}`)}>
                            <p className="font-bold">{p.nome}</p>
                            <p className="text-sm font-mono mt-1" style={{ color: "hsla(220,20%,40%,0.8)" }}>CPF: {p.cpf}</p>
                            <p className="text-xs mt-1" style={{ color: "hsla(220,20%,40%,0.6)" }}>Cadastro: {formatDate(p.created_at)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </GlassCard>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Search */}
            <GlassCard neonColor={NEON.blue} className="p-4">
              <div className="relative flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: NEON.blue.replace("1)", "0.6)") }} />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleSearch()}
                    placeholder="Buscar paciente por nome ou CPF..."
                    className="w-full pl-12 pr-4 py-4 rounded-xl text-base font-mono bg-transparent outline-none"
                    style={{ color: "hsla(220,25%,20%,1)", border: `1px solid ${NEON.blue.replace("1)", "0.2)")}`, background: "hsla(220,30%,95%,0.6)" }}
                  />
                </div>
                <motion.button onClick={handleSearch} className="px-6 py-4 rounded-xl font-semibold text-sm"
                  style={{ background: NEON.blue.replace("1)", "0.15)"), color: NEON.blue, border: `1px solid ${NEON.blue.replace("1)", "0.3)")}` }}
                  whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  Buscar
                </motion.button>
              </div>
            </GlassCard>

            {/* Search Results */}
            {searchLoading && (
              <div className="flex justify-center py-8">
                <motion.div className="w-8 h-8 rounded-full" style={{ border: `2px solid transparent`, borderTopColor: NEON.cyan }}
                  animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />
              </div>
            )}

            {searchSubmitted && !searchLoading && (
              <div className="space-y-3">
                {searchResults.length === 0 ? (
                  <GlassCard neonColor={NEON.blue} className="p-8 text-center">
                    <p className="text-base" style={{ color: "hsla(220,20%,65%,0.7)" }}>Nenhum paciente encontrado para "{searchSubmitted}"</p>
                  </GlassCard>
                ) : (
                  searchResults.map((pac: any) => {
                    const isExpanded = expandedId === pac.id;
                    return (
                      <GlassCard key={pac.id} neonColor={pac.ativo ? NEON.blue : NEON.red.replace("1)", "0.5)")} className="p-5 cursor-pointer"
                        onClick={() => loadPacDetail(pac.id)}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 flex-1 min-w-0">
                            <div className="shrink-0 w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold"
                              style={{ background: `linear-gradient(135deg, ${NEON.blue.replace("1)", "0.2)")}, ${NEON.purple.replace("1)", "0.2)")})`, border: `2px solid ${NEON.blue.replace("1)", "0.35)")}`, color: NEON.cyan, fontFamily: "var(--font-mono)" }}>
                              {pac.nome.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <h3 className="text-base font-bold truncate">{pac.nome}</h3>
                                {!pac.ativo && (
                                  <span className="text-xs px-2 py-0.5 rounded font-semibold" style={{ background: NEON.red.replace("1)", "0.15)"), color: NEON.red }}>Inativo</span>
                                )}
                              </div>
                              <p className="text-sm font-mono mt-0.5" style={{ color: "hsla(220,20%,40%,0.8)" }}>
                                CPF: {pac.cpf} {pac.telefone ? `• Tel: ${pac.telefone}` : ""}
                              </p>
                            </div>
                          </div>
                          <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.3 }}>
                            <ChevronDown className="w-5 h-5" style={{ color: NEON.blue.replace("1)", "0.5)") }} />
                          </motion.div>
                        </div>

                        {/* Expanded patient detail */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden"
                              onClick={e => e.stopPropagation()}>
                              {!pacDetailData ? (
                                <div className="flex justify-center py-6">
                                  <motion.div className="w-6 h-6 rounded-full" style={{ border: `2px solid transparent`, borderTopColor: NEON.cyan }}
                                    animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-4">
                                  {/* Ciclos */}
                                  <GlassCard neonColor={NEON.purple} className="p-5">
                                    <h4 className="text-base font-bold uppercase tracking-wider mb-4 flex items-center gap-2" style={{ color: NEON.purple }}>
                                      <Activity className="w-5 h-5" /> Ciclos ({pacDetailData.ciclos.length})
                                    </h4>
                                    {pacDetailData.ciclos.length === 0 ? (
                                      <p className="text-sm" style={{ color: "hsla(220,20%,65%,0.7)" }}>Nenhum ciclo</p>
                                    ) : (
                                      <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                                        {pacDetailData.ciclos.map((c: any) => {
                                          const receita = pacDetailData.receitas.find((r: any) => r.id === c.receita_id);
                                          return (
                                            <div key={c.id} className="rounded-xl p-4" style={{ background: "hsla(270,40%,96%,0.8)", border: `1px solid ${NEON.purple.replace("1)", "0.15)")}` }}>
                                              <div className="flex items-center justify-between mb-3">
                                                <span className="text-sm font-semibold" style={{ color: NEON.purple }}>
                                                  {receita?.tipo === "fralda" ? "🩹 Fralda" : "💊 Medicamento"}
                                                </span>
                                                <StatusBadge status={c.status} />
                                              </div>
                                              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm" style={{ color: "hsla(220,20%,30%,0.9)" }}>
                                                <span>Início: <b>{formatDate(c.data_inicio)}</b></span>
                                                <span>Fim: <b>{formatDate(c.data_fim)}</b></span>
                                                <span>Intervalo: <b>{c.intervalo_dias + 1} dias</b></span>
                                                <span>Limite: <b>{c.limite_maximo}</b></span>
                                                <span>Dispensações: <b style={{ color: NEON.cyan }}>{c.total_dispensacoes}/{c.limite_maximo}</b></span>
                                                <span>Última retirada: <b>{formatDate(c.ultima_retirada)}</b></span>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </GlassCard>

                                  {/* Receitas */}
                                  <GlassCard neonColor={NEON.amber} className="p-5">
                                    <h4 className="text-base font-bold uppercase tracking-wider mb-4 flex items-center gap-2" style={{ color: NEON.amber }}>
                                      <FileText className="w-5 h-5" /> Receitas ({pacDetailData.receitas.length})
                                    </h4>
                                    {pacDetailData.receitas.length === 0 ? (
                                      <p className="text-sm" style={{ color: "hsla(220,20%,65%,0.7)" }}>Nenhuma receita</p>
                                    ) : (
                                      <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                                        {pacDetailData.receitas.map((r: any) => (
                                          <div key={r.id} className="rounded-xl p-4" style={{ background: "hsla(42,50%,96%,0.8)", border: `1px solid ${NEON.amber.replace("1)", "0.15)")}` }}>
                                            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm" style={{ color: "hsla(220,20%,30%,0.9)" }}>
                                              <span>Emissão: <b>{formatDate(r.data_emissao)}</b></span>
                                              <span>Validade: <b>{formatDate(r.validade_ate)}</b></span>
                                                            </div>
                                            {r.arquivo_url && (
                                              <motion.button className="mt-3 text-sm flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold"
                                                style={{ background: NEON.cyan.replace("1)", "0.15)"), color: NEON.cyan, border: `1px solid ${NEON.cyan.replace("1)", "0.3)")}` }}
                                                onClick={() => setImageUrl(r.arquivo_url)} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                                                <Maximize2 className="w-4 h-4" /> Ver Receita
                                              </motion.button>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </GlassCard>

                                  {/* Dispensações */}
                                  <GlassCard neonColor={NEON.cyan} className="p-5">
                                    <h4 className="text-base font-bold uppercase tracking-wider mb-4 flex items-center gap-2" style={{ color: NEON.cyan }}>
                                      <Package className="w-5 h-5" /> Dispensações ({pacDetailData.dispensacoes.length})
                                    </h4>
                                    {pacDetailData.dispensacoes.length === 0 ? (
                                      <p className="text-sm" style={{ color: "hsla(220,20%,65%,0.7)" }}>Nenhuma dispensação</p>
                                    ) : (
                                      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                                        {pacDetailData.dispensacoes.map((d: any) => (
                                          <div key={d.id} className="rounded-xl p-4 flex items-center justify-between" style={{ background: "hsla(190,40%,96%,0.8)", border: `1px solid ${NEON.cyan.replace("1)", "0.15)")}` }}>
                                            <div className="text-sm">
                                              <span className="font-mono">{format(parseISO(d.created_at), "dd/MM/yyyy HH:mm")}</span>
                                              <span className="ml-3 px-2.5 py-1 rounded text-xs font-semibold" style={{ background: "hsla(210,50%,50%,0.15)", color: NEON.blue }}>
                                                {d.tipo_retirada === "paciente" ? "Paciente" : "Representante"}
                                              </span>
                                            </div>
                                            {d.cancelada && (
                                              <span className="text-xs px-3 py-1 rounded-full font-semibold" style={{ background: NEON.red.replace("1)", "0.15)"), color: NEON.red }}>Cancelada</span>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </GlassCard>

                                  {/* Documentos */}
                                  <GlassCard neonColor={NEON.green} className="p-5">
                                    <h4 className="text-base font-bold uppercase tracking-wider mb-4 flex items-center gap-2" style={{ color: NEON.green }}>
                                      <Eye className="w-5 h-5" /> Documentos ({pacDetailData.documentos.length})
                                    </h4>
                                    {pacDetailData.documentos.length === 0 ? (
                                      <p className="text-sm" style={{ color: "hsla(220,20%,65%,0.7)" }}>Nenhum documento</p>
                                    ) : (
                                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[300px] overflow-y-auto pr-1">
                                        {pacDetailData.documentos.map((doc: any) => (
                                          <motion.div key={doc.id} className="rounded-xl overflow-hidden cursor-pointer group relative"
                                            style={{ border: `1px solid ${NEON.green.replace("1)", "0.15)")}`, aspectRatio: "4/3" }}
                                            onClick={() => setImageUrl(doc.arquivo_url)} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                                            <img src={doc.arquivo_url} alt={doc.tipo} className="w-full h-full object-cover" loading="lazy" />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                                              <span className="text-xs text-white uppercase font-semibold">{doc.tipo}</span>
                                            </div>
                                          </motion.div>
                                        ))}
                                      </div>
                                    )}
                                  </GlassCard>
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </GlassCard>
                    );
                  })
                )}
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
