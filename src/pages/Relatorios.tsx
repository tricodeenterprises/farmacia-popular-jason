import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Archive, CalendarRange, CheckCircle2, FileText, Lock, PauseCircle, Pill, Printer, Search, Users, XCircle } from "lucide-react";
import { formatCpfMask, formatDateBR, getTodayStr } from "@/lib/format-utils";
import { calculateNextWithdrawalDate, getCycleClosureInfo, isCycleClosedCorrectly } from "@/lib/ciclo-utils";
import { categoriaLabel } from "@/lib/categorias";
import { useAuth } from "@/hooks/useAuth";

type ReportView = "ativos" | "pausados" | "inativos" | "a_encerrar" | "encerrados" | "medicamento";

type ReportRow = {
  id: string;
  pacienteId: string;
  nome: string;
  cpf: string;
  status: string;
  tipo?: string;
  detalhe?: string;
  data?: string | null;
  cicloId?: string;
  canClose?: boolean;
  closeInfo?: ReturnType<typeof getCycleClosureInfo>;
  verificavel?: boolean;
  sistemaOk?: boolean;
};

const VERIFIED_KEY = "ciclos_encerrados_verificados_v1";
function loadVerified(): Record<string, { by?: string; at: string }> {
  try { return JSON.parse(localStorage.getItem(VERIFIED_KEY) || "{}"); } catch { return {}; }
}
function saveVerified(v: Record<string, { by?: string; at: string }>) {
  try { localStorage.setItem(VERIFIED_KEY, JSON.stringify(v)); } catch {}
}

const viewOptions: Array<{ key: ReportView; label: string; icon: any }> = [
  { key: "ativos", label: "Clientes ativos", icon: CheckCircle2 },
  { key: "pausados", label: "Pausados", icon: PauseCircle },
  { key: "inativos", label: "Clientes inativos", icon: XCircle },
  { key: "a_encerrar", label: "A encerrar", icon: Lock },
  { key: "encerrados", label: "Ciclos encerrados", icon: Archive },
  { key: "medicamento", label: "Por medicamento", icon: Pill },
];

function toDate(dateStr: string | null | undefined) {
  if (!dateStr) return null;
  return new Date(`${dateStr.split("T")[0]}T00:00:00`);
}

function diffDays(from: Date, to: Date) {
  return Math.floor((from.getTime() - to.getTime()) / 86400000);
}

function normalizeText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function receitaText(receita: any) {
  return normalizeText(JSON.stringify(receita?.dados_extraidos || {}) + " " + (receita?.tipo || ""));
}

function getActiveCiclos(paciente: any) {
  return (paciente.ciclos || []).filter((c: any) => c.status === "ativo");
}

function getNextWithdrawal(ciclo: any) {
  if (!ciclo || ciclo.total_dispensacoes >= ciclo.limite_maximo) return null;
  if (ciclo.ultima_retirada) return calculateNextWithdrawalDate(ciclo.ultima_retirada, ciclo.intervalo_dias || 30);
  return ciclo.data_inicio;
}

function isPausedCycle(ciclo: any, today = new Date()) {
  const next = getNextWithdrawal(ciclo);
  const nextDate = toDate(next);
  if (!nextDate) return false;
  return diffDays(toDate(getTodayStr()) || today, nextDate) >= 60;
}

function pacienteIsPaused(paciente: any) {
  return paciente.ativo && getActiveCiclos(paciente).some((c: any) => isPausedCycle(c));
}

function tipoLabel(tipo?: string | null) {
  return categoriaLabel(tipo);
}

function escapeHtml(value: string) {
  return String(value || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function printRows(title: string, rows: ReportRow[]) {
  const body = rows
    .map((row, index) => `<tr><td>${index + 1}</td><td><strong>${escapeHtml(row.nome)}</strong><br><span>${escapeHtml(formatCpfMask(row.cpf))}</span></td><td>${escapeHtml(row.status)}</td><td>${escapeHtml(row.tipo || "—")}</td><td>${escapeHtml(row.detalhe || "—")}</td></tr>`)
    .join("");

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    @page { size: A4 portrait; margin: 10mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111827; }
    h1 { margin: 0; font-size: 22px; }
    .meta { margin: 4px 0 16px; color: #475569; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { background: #ecfdf5; color: #064e3b; text-align: left; }
    th, td { border: 1px solid #cbd5e1; padding: 6px; vertical-align: top; }
    tr:nth-child(even) td { background: #f8fafc; }
    span { color: #64748b; font-size: 10px; }
  </style></head><body><h1>Sistema — ${escapeHtml(title)}</h1><div class="meta">Total: ${rows.length} · Emitido em ${formatDateBR(getTodayStr())}</div><table><thead><tr><th>#</th><th>Cliente</th><th>Status</th><th>Tipo</th><th>Detalhe</th></tr></thead><tbody>${body}</tbody></table></body></html>`;

  const w = window.open("", "_blank", "width=900,height=720");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  setTimeout(() => {
    try {
      w.focus();
      w.print();
    } catch {
      /* noop */
    }
  }, 300);
  return true;
}

export default function Relatorios() {
  const { user, isMaster, effectiveRole } = useAuth();
  const canCloseCycles = isMaster || effectiveRole === "chefe";
  const today = getTodayStr();
  const [view, setView] = useState<ReportView>("ativos");
  const [search, setSearch] = useState("");
  const [medicamento, setMedicamento] = useState("");
  const [dataInicio, setDataInicio] = useState(today.slice(0, 8) + "01");
  const [dataFim, setDataFim] = useState(today);
  const [pacientes, setPacientes] = useState<any[]>([]);
  const [ciclosEncerrados, setCiclosEncerrados] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [closingCycleId, setClosingCycleId] = useState<string | null>(null);
  const [verified, setVerified] = useState<Record<string, { by?: string; at: string }>>(() => loadVerified());

  const toggleVerified = (cicloId: string) => {
    setVerified((prev) => {
      const next = { ...prev };
      if (next[cicloId]) {
        delete next[cicloId];
        toast.success("Verificação removida.");
      } else {
        next[cicloId] = { by: user?.id, at: new Date().toISOString() };
        toast.success("Marcado como verificado.");
      }
      saveVerified(next);
      return next;
    });
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const startISO = new Date(`${dataInicio}T00:00:00`).toISOString();
      const endISO = new Date(`${dataFim}T23:59:59.999`).toISOString();
      const [pacientesRes, encerradosRes] = await Promise.all([
        supabase
          .from("pacientes")
          .select("id,nome,cpf,telefone,ativo,created_at,ciclos(id,status,data_inicio,data_fim,intervalo_dias,limite_maximo,total_dispensacoes,ultima_retirada,encerrado_em,motivo_encerramento,receitas(tipo,dados_extraidos,validade_ate))")
          .order("nome", { ascending: true }),
        supabase
          .from("ciclos")
          .select("id,paciente_id,status,data_inicio,data_fim,ultima_retirada,total_dispensacoes,limite_maximo,encerrado_em,motivo_encerramento,receitas(tipo,dados_extraidos,validade_ate),pacientes(nome,cpf)")
          .neq("status", "ativo")
          .gte("encerrado_em", startISO)
          .lte("encerrado_em", endISO)
          .order("encerrado_em", { ascending: false }),
      ]);
      if (pacientesRes.error) throw pacientesRes.error;
      if (encerradosRes.error) throw encerradosRes.error;
      setPacientes(pacientesRes.data || []);
      setCiclosEncerrados(encerradosRes.data || []);
    } catch (error: any) {
      toast.error(error?.message || "Erro ao carregar relatórios.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo<ReportRow[]>(() => {
    const q = normalizeText(search.trim());
    const cpfQ = search.replace(/\D/g, "");
    const medQ = normalizeText(medicamento.trim());

    const matchSearch = (row: ReportRow) => {
      if (!q && !cpfQ) return true;
      return normalizeText(row.nome).includes(q) || (!!cpfQ && row.cpf.includes(cpfQ));
    };

    let result: ReportRow[] = [];

    if (view === "ativos") {
      result = pacientes
        .filter((p) => p.ativo && !pacienteIsPaused(p))
        .map((p) => {
          const ciclo = getActiveCiclos(p)[0];
          const next = getNextWithdrawal(ciclo);
          return {
            id: p.id,
            pacienteId: p.id,
            nome: p.nome,
            cpf: p.cpf,
            status: "Ativo",
            tipo: ciclo ? tipoLabel(ciclo.receitas?.tipo) : "Sem ciclo ativo",
            detalhe: next ? `Próxima retirada: ${formatDateBR(next)}` : "Sem retirada prevista",
          };
        });
    }

    if (view === "pausados") {
      result = pacientes
        .filter((p) => pacienteIsPaused(p))
        .map((p) => {
          const ciclo = getActiveCiclos(p).find((c: any) => isPausedCycle(c));
          const next = getNextWithdrawal(ciclo);
          return {
            id: p.id,
            pacienteId: p.id,
            nome: p.nome,
            cpf: p.cpf,
            status: "Pausado por falta de frequência",
            tipo: ciclo ? tipoLabel(ciclo.receitas?.tipo) : "—",
            detalhe: next ? `Atraso de ${diffDays(toDate(today)!, toDate(next)!)} dias desde ${formatDateBR(next)}` : "Sem referência",
          };
        });
    }

    if (view === "inativos") {
      result = pacientes
        .filter((p) => !p.ativo)
        .map((p) => ({ id: p.id, pacienteId: p.id, nome: p.nome, cpf: p.cpf, status: "Inativo", tipo: "—", detalhe: "Cliente desativado" }));
    }

    if (view === "a_encerrar") {
      result = pacientes
        .flatMap((p) => getActiveCiclos(p).map((c: any) => ({ paciente: p, ciclo: c, info: getCycleClosureInfo(c) })))
        .filter((item) => item.info.shouldClose)
        .map(({ paciente: p, ciclo: c, info }) => ({
          id: c.id,
          pacienteId: p.id,
          cicloId: c.id,
          nome: p.nome,
          cpf: p.cpf,
          status: "Encerramento necessário",
          tipo: tipoLabel(c.receitas?.tipo),
          detalhe: info.proximaUltrapassaValidade
            ? `Próxima ${formatDateBR(info.proximaRetirada || "")} > validade ${formatDateBR(info.validade || c.data_fim)}`
            : "Limite de retiradas atingido",
          canClose: true,
          closeInfo: info,
        }));
    }

    if (view === "encerrados") {
      result = ciclosEncerrados.map((c) => {
        const sistemaOk = isCycleClosedCorrectly(c);
        const isVerified = !!verified[c.id];
        return {
          id: c.id,
          cicloId: c.id,
          pacienteId: c.paciente_id,
          nome: c.pacientes?.nome || "—",
          cpf: c.pacientes?.cpf || "",
          status: isVerified
            ? "Verificado manualmente"
            : sistemaOk
              ? "Encerrado (aguardando verificação)"
              : "Encerrado: verificar",
          tipo: tipoLabel(c.receitas?.tipo),
          detalhe: c.encerrado_em
            ? `${formatDateBR(c.encerrado_em.split("T")[0])} · ${getCycleClosureInfo({ ...c, status: "ativo" }).label}`
            : "Sem data de encerramento",
          data: c.encerrado_em,
          verificavel: true,
          sistemaOk,
        };
      });
    }

    if (view === "medicamento") {
      result = pacientes
        .filter((p) => {
          if (!medQ) return false;
          return (p.ciclos || []).some((c: any) => receitaText(c.receitas).includes(medQ));
        })
        .map((p) => {
          const ciclo = (p.ciclos || []).find((c: any) => medQ && receitaText(c.receitas).includes(medQ));
          return {
            id: `${p.id}-${ciclo?.id || "med"}`,
            pacienteId: p.id,
            nome: p.nome,
            cpf: p.cpf,
            status: p.ativo ? (pacienteIsPaused(p) ? "Pausado" : "Ativo") : "Inativo",
            tipo: ciclo ? tipoLabel(ciclo.receitas?.tipo) : "Medicamento",
            detalhe: ciclo?.receitas?.validade_ate ? `Receita até ${formatDateBR(ciclo.receitas.validade_ate)}` : "Encontrado na receita/OCR",
          };
        });
    }

    return result.filter(matchSearch).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [pacientes, ciclosEncerrados, search, medicamento, view, today, verified]);

  const counts = useMemo(() => {
    const pausados = pacientes.filter((p) => pacienteIsPaused(p)).length;
    const aEncerrar = pacientes.reduce((total, p) => total + getActiveCiclos(p).filter((c: any) => getCycleClosureInfo(c).shouldClose).length, 0);
    return {
      ativos: pacientes.filter((p) => p.ativo && !pacienteIsPaused(p)).length,
      pausados,
      inativos: pacientes.filter((p) => !p.ativo).length,
      aEncerrar,
      encerrados: ciclosEncerrados.length,
    };
  }, [pacientes, ciclosEncerrados]);

  const currentTitle = viewOptions.find((item) => item.key === view)?.label || "Relatório";

  const handleCloseCycle = async (row: ReportRow) => {
    if (!row.cicloId || !canCloseCycles) return;
    const ok = window.confirm(`Encerrar manualmente o ciclo de ${row.nome}?\n\n${row.detalhe || ""}`);
    if (!ok) return;
    setClosingCycleId(row.cicloId);
    const info = row.closeInfo;
    const { error } = await supabase.from("ciclos").update({
      status: "encerrado",
      motivo_encerramento: info?.motivo || "manual",
      encerrado_em: new Date().toISOString(),
      encerrado_por: user?.id,
    }).eq("id", row.cicloId);
    if (error) {
      toast.error("Erro ao encerrar ciclo.");
      setClosingCycleId(null);
      return;
    }
    await supabase.from("logs").insert([{
      user_id: user?.id,
      acao: "encerrar_ciclo_relatorio",
      detalhes: {
        ciclo_id: row.cicloId,
        paciente_id: row.pacienteId,
        motivo_sistema: info?.motivo || "manual",
        proxima_retirada: info?.proximaRetirada,
        validade: info?.validade,
      } as any,
    }]);
    toast.success("Ciclo encerrado manualmente.");
    setClosingCycleId(null);
    await fetchData();
    setView("encerrados");
  };

  const handlePrint = () => {
    const ok = printRows(currentTitle, rows);
    if (!ok) toast.error("Permita pop-ups para imprimir o relatório.");
  };

  return (
    <AppLayout title="Relatórios">
      <div className="space-y-4">
        <section className="hero-card rounded-[2rem] p-4 sm:p-6 relative overflow-hidden">
          <div className="absolute inset-0 grid-pattern opacity-40 pointer-events-none" />
          <div className="relative z-10 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-2">
              <div className="section-chip"><FileText className="w-3.5 h-3.5" /> Relatórios operacionais</div>
              <h2 className="text-2xl sm:text-4xl font-black leading-tight">Clientes, ciclos e medicamentos</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 w-full xl:max-w-xl">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente ou CPF" className="h-12 rounded-2xl pl-10 bg-white" />
              </div>
              <Button onClick={handlePrint} disabled={rows.length === 0} className="h-12 rounded-2xl">
                <Printer className="w-4 h-4 mr-2" /> Imprimir
              </Button>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 lg:grid-cols-5 gap-2">
          {viewOptions.map((item) => {
            const Icon = item.icon;
            const active = view === item.key;
            return (
              <Button key={item.key} variant={active ? "default" : "outline"} onClick={() => setView(item.key)} className="h-12 rounded-2xl justify-start">
                <Icon className="w-4 h-4 mr-2" /> {item.label}
              </Button>
            );
          })}
        </section>

        <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Card className="metric-card border-0"><CardContent className="p-0"><p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Ativos</p><p className="text-3xl font-black mt-2">{counts.ativos}</p></CardContent></Card>
          <Card className="metric-card border-0"><CardContent className="p-0"><p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Pausados</p><p className="text-3xl font-black mt-2">{counts.pausados}</p></CardContent></Card>
          <Card className="metric-card border-0"><CardContent className="p-0"><p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Inativos</p><p className="text-3xl font-black mt-2">{counts.inativos}</p></CardContent></Card>
          <Card className="metric-card border-0"><CardContent className="p-0"><p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">A encerrar</p><p className="text-3xl font-black mt-2">{counts.aEncerrar}</p></CardContent></Card>
          <Card className="metric-card border-0"><CardContent className="p-0"><p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Encerrados</p><p className="text-3xl font-black mt-2">{counts.encerrados}</p></CardContent></Card>
        </section>

        {view === "a_encerrar" && (
          <section className="surface-panel rounded-[1.6rem] p-3 sm:p-4 text-sm text-muted-foreground">
            Este relatório lista ciclos ativos cuja próxima retirada calculada ultrapassa a validade da receita. Eles não são encerrados automaticamente; o encerramento deve ser confirmado manualmente.
          </section>
        )}

        {view === "encerrados" && (
          <section className="surface-panel rounded-[1.6rem] p-3 sm:p-4">
            <div className="grid grid-cols-1 sm:grid-cols-[180px_180px_auto] gap-3 items-end">
              <div><label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground block mb-1.5">Início</label><Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="h-12 rounded-2xl bg-white" /></div>
              <div><label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground block mb-1.5">Fim</label><Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="h-12 rounded-2xl bg-white" /></div>
              <Button onClick={fetchData} disabled={loading} className="h-12 rounded-2xl"><CalendarRange className="w-4 h-4 mr-2" /> Atualizar período</Button>
            </div>
          </section>
        )}

        {view === "medicamento" && (
          <section className="surface-panel rounded-[1.6rem] p-3 sm:p-4">
            <div className="relative">
              <Pill className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={medicamento} onChange={(e) => setMedicamento(e.target.value)} placeholder="Digite o medicamento. Ex.: espironolactona, hidroclorotiazida" className="h-12 rounded-2xl pl-10 bg-white" />
            </div>
          </section>
        )}

        <section className="surface-panel rounded-[1.6rem] p-3 sm:p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-sm font-bold">{currentTitle}</p>
            <Badge className="rounded-full status-info"><Users className="w-3.5 h-3.5 mr-1" /> {rows.length}</Badge>
          </div>

          {loading ? (
            <div className="py-16 text-center text-muted-foreground">Carregando relatório...</div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center">
              <FileText className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="font-semibold">Nenhum resultado encontrado.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {rows.map((row) => (
                <div key={row.id} role="button" tabIndex={0} onClick={() => (window.location.href = `/pacientes/${row.pacienteId}`)} onKeyDown={(event) => { if (event.key === "Enter") window.location.href = `/pacientes/${row.pacienteId}`; }} className="text-left rounded-[1.25rem] border border-border/70 bg-white p-3 shadow-sm hover:shadow-md transition-all cursor-pointer">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-sm truncate">{row.nome}</p>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">{formatCpfMask(row.cpf)}</p>
                    </div>
                    <Badge variant="outline" className="rounded-full shrink-0">{row.tipo || "—"}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                    <span>{row.status}</span>
                    {row.detalhe && <span>• {row.detalhe}</span>}
                  </div>
                  {view === "encerrados" && row.verificavel && row.cicloId && (
                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={verified[row.cicloId] ? "default" : "outline"}
                        className="h-9 rounded-xl"
                        onClick={(event) => { event.stopPropagation(); toggleVerified(row.cicloId!); }}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-1.5" />
                        {verified[row.cicloId] ? "Verificado" : "Marcar como verificado"}
                      </Button>
                      {row.sistemaOk === false && !verified[row.cicloId] && (
                        <Badge variant="outline" className="rounded-full text-[10px]">Sistema sugere revisão</Badge>
                      )}
                    </div>
                  )}
                  {view === "a_encerrar" && row.canClose && canCloseCycles && (
                    <div className="mt-3">
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        className="h-9 rounded-xl"
                        disabled={closingCycleId === row.cicloId}
                        onClick={(event) => { event.stopPropagation(); handleCloseCycle(row); }}
                      >
                        {closingCycleId === row.cicloId ? "Encerrando..." : "Encerrar manualmente"}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
