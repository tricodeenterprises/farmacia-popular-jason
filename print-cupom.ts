import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CalendarDays, Filter, MessageCircle, Printer, Search, UserRound, X } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { motion } from "framer-motion";
import { formatCpfMask, formatDateBR, getTodayStr } from "@/lib/format-utils";
import { calculateNextWithdrawalDate } from "@/lib/ciclo-utils";
import { printDispensacaoCupom, printDispensacoesEmLote, printListaDispensacoes, type PrintDispensacaoData, type PrintListaDispensacaoRow } from "@/lib/print-cupom";

function formatTimeBR(d: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function addDays(dateStr: string, delta: number) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function monthStart(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`; }
function monthEnd(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function previousMonthRange() {
  const d = new Date();
  const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return { inicio: monthStart(prev), fim: monthEnd(prev) };
}

function buildClientMessage(args: { nome: string; dataRetirada: string; proximaRetirada: string | null; validadeAte: string | null; ultimaPossivel: boolean }) {
  const primeiroNome = args.nome.split(" ")[0];
  return [
    `Olá, ${primeiroNome}.`,
    "",
    "Sua dispensação foi registrada no Sistema.",
    `Retirada: ${formatDateBR(args.dataRetirada)}`,
    args.proximaRetirada ? `Próxima retirada: ${formatDateBR(args.proximaRetirada)}` : null,
    args.ultimaPossivel && args.validadeAte ? `Atenção: esta é a última retirada possível com a receita atual, válida até ${formatDateBR(args.validadeAte)}.` : null,
    args.ultimaPossivel ? "Para continuar, será necessário renovar a receita." : null,
    "",
  ].filter(Boolean).join("\n");
}

type TipoFiltro = "todos" | "medicamento" | "fralda";
type RetiradaFiltro = "todos" | "proprio" | "representante";

export default function Dispensacoes() {
  const today = getTodayStr();
  const [dataInicio, setDataInicio] = useState(today);
  const [dataFim, setDataFim] = useState(today);
  const [search, setSearch] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>("todos");
  const [retiradaFiltro, setRetiradaFiltro] = useState<RetiradaFiltro>("todos");
  const [dispensacoes, setDispensacoes] = useState<any[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [printingBatch, setPrintingBatch] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const applyRange = (inicio: string, fim: string) => { setDataInicio(inicio); setDataFim(fim); };
  const quickFilters = [
    { label: "Hoje", run: () => applyRange(today, today) },
    { label: "Ontem", run: () => applyRange(addDays(today, -1), addDays(today, -1)) },
    { label: "7 dias", run: () => applyRange(addDays(today, -6), today) },
    { label: "Este mês", run: () => applyRange(monthStart(), monthEnd()) },
    { label: "Mês passado", run: () => { const r = previousMonthRange(); applyRange(r.inicio, r.fim); } },
  ];

  const fetchDispensacoes = async () => {
    setLoading(true);
    const startDate = new Date(`${dataInicio}T00:00:00`);
    const endDate = new Date(`${dataFim}T23:59:59.999`);
    const inicioIso = startDate.toISOString();
    const fimIso = endDate.toISOString();

    const [{ data, error }, profilesRes] = await Promise.all([
      supabase
        .from("dispensacoes")
        .select("*, pacientes(nome, cpf, telefone), ciclos(intervalo_dias, limite_maximo, total_dispensacoes, data_fim, receitas(tipo, validade_ate))")
        .eq("cancelada", false)
        .or(`and(data_dispensacao_real.gte.${dataInicio},data_dispensacao_real.lte.${dataFim}),and(data_dispensacao_real.is.null,created_at.gte.${inicioIso},created_at.lte.${fimIso})`)
        .order("data_dispensacao_real", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true }),
      supabase.from("profiles").select("id, nome"),
    ]);

    if (error) {
      toast.error("Erro ao buscar comprovantes.");
      setDispensacoes([]);
    } else setDispensacoes(data || []);

    const map: Record<string, string> = {};
    (profilesRes.data || []).forEach((item: any) => { map[item.id] = item.nome; });
    setProfileMap(map);
    setLoading(false);
  };

  useEffect(() => { fetchDispensacoes(); }, []);

  const filtered = useMemo(() => {
    return [...dispensacoes]
      .filter((item) => {
        const tipo = item.ciclos?.receitas?.tipo === "fralda" ? "fralda" : "medicamento";
        if (tipoFiltro !== "todos" && tipo !== tipoFiltro) return false;
        if (retiradaFiltro !== "todos" && item.tipo_retirada !== retiradaFiltro) return false;
        if (search.trim()) {
          const q = search.toLowerCase().trim();
          const cpf = String(item.pacientes?.cpf || "");
          const nome = String(item.pacientes?.nome || "").toLowerCase();
          if (!nome.includes(q) && !cpf.includes(q.replace(/\D/g, ""))) return false;
        }
        return true;
      })
      .sort((a, b) => String(a.pacientes?.nome || "").localeCompare(String(b.pacientes?.nome || ""), "pt-BR"));
  }, [dispensacoes, tipoFiltro, retiradaFiltro, search]);

  const prepareCupomData = async (disp: any) => {
    const { data: docs } = await supabase
      .from("documentos")
      .select("id, created_at, dados_extraidos")
      .eq("paciente_id", disp.paciente_id)
      .eq("ciclo_id", disp.ciclo_id)
      .eq("tipo", "cupom_fiscal");

    let itens: { codigo?: string | null; nome: string; quantidade?: string | null }[] = [];
    let numero: number | null = null;
    if (docs?.length) {
      const dispTs = new Date(disp.created_at).getTime();
      const alvo = [...docs].sort((a: any, b: any) => Math.abs(new Date(a.created_at).getTime() - dispTs) - Math.abs(new Date(b.created_at).getTime() - dispTs))[0];
      const dados = (alvo?.dados_extraidos as any) || {};
      numero = typeof dados.dispensacao_numero === "number" ? dados.dispensacao_numero : null;
      if (Array.isArray(dados.itens)) itens = dados.itens.map((it: any) => typeof it === "string" ? { nome: it } : { codigo: it.codigo ?? null, nome: String(it.nome ?? "—"), quantidade: it.quantidade != null ? String(it.quantidade) : null });
    }
    return { itens, numero };
  };

  const toPrintData = async (disp: any): Promise<PrintDispensacaoData> => {
    const { itens, numero } = await prepareCupomData(disp);
    const ciclo = disp.ciclos;
    const tipo = ciclo?.receitas?.tipo === "fralda" ? "fralda" : "medicamento";
    const limiteTotal = Number(ciclo?.limite_maximo || 0);
    const fallbackNumero = Number(ciclo?.total_dispensacoes || 0) || null;
    const retiradaNumero = numero ?? fallbackNumero;
    const disponivelAgora = retiradaNumero && limiteTotal ? Math.max(0, limiteTotal - retiradaNumero) : null;
    const limiteInicial = tipo === "fralda" ? 18 : 6;
    const perdidasPorAtraso = limiteTotal > 0 ? Math.max(0, limiteInicial - limiteTotal) : null;
    return {
      pacienteNome: disp.pacientes?.nome || "—",
      pacienteCpf: disp.pacientes?.cpf ? formatCpfMask(disp.pacientes.cpf) : null,
      dataDispensacao: disp.data_dispensacao_real || disp.created_at?.split("T")[0],
      dataCriacao: disp.created_at?.split("T")[0] || null,
      intervaloDias: ciclo?.intervalo_dias || 30,
      operadorNome: profileMap[disp.registrada_por] || profileMap[disp.operador_id] || null,
      tipoRetirada: disp.tipo_retirada === "representante" ? "Representante" : "Próprio paciente",
      itens,
      numero: retiradaNumero,
      totalCiclo: limiteTotal || null,
      quantidadeDisponivelAgora: disponivelAgora,
      limiteInicial,
      perdidasPorAtraso,
    };
  };

  const handlePrint = async (disp: any) => {
    try {
      const ok = printDispensacaoCupom(await toPrintData(disp));
      if (!ok) toast.error("Permita pop-ups para imprimir.");
    } catch (error: any) { toast.error(error?.message || "Erro ao gerar comprovante."); }
  };

  const handlePrintBatch = async () => {
    if (filtered.length === 0) { toast.error("Nenhum comprovante filtrado."); return; }
    setPrintingBatch(true);
    try {
      const list = await Promise.all(filtered.map(toPrintData));
      const ok = printDispensacoesEmLote(list);
      if (!ok) toast.error("Permita pop-ups para imprimir em lote.");
    } finally { setPrintingBatch(false); }
  };

  const handlePrintList = () => {
    const rows: PrintListaDispensacaoRow[] = filtered.map((disp) => {
      const dataRetirada = disp.data_dispensacao_real || disp.created_at?.split("T")[0];
      return {
        pacienteNome: disp.pacientes?.nome || "—",
        pacienteCpf: disp.pacientes?.cpf ? formatCpfMask(disp.pacientes.cpf) : "",
        tipo: disp.ciclos?.receitas?.tipo === "fralda" ? "Fralda" : "Medicamento",
        tipoRetirada: disp.tipo_retirada === "representante" ? "Representante" : "Próprio",
        dataRetirada,
        proximaRetirada: dataRetirada ? calculateNextWithdrawalDate(dataRetirada, disp.ciclos?.intervalo_dias || 30) : null,
        operadorNome: profileMap[disp.registrada_por] || profileMap[disp.operador_id] || "—",
        dispensacao: disp.ciclos?.limite_maximo ? `${disp.ciclos?.total_dispensacoes || "—"}/${disp.ciclos.limite_maximo}` : null,
      };
    });
    const ok = printListaDispensacoes(rows, `${formatDateBR(dataInicio)} a ${formatDateBR(dataFim)}`);
    if (!ok) toast.error("Permita pop-ups para imprimir a lista.");
  };

  const handleWhatsApp = (disp: any) => {
    const telefone = disp.pacientes?.telefone;
    if (!telefone) { toast.error("Cliente sem telefone cadastrado."); return; }
    const dataRetirada = disp.data_dispensacao_real || disp.created_at?.split("T")[0];
    const proxima = dataRetirada ? calculateNextWithdrawalDate(dataRetirada, disp.ciclos?.intervalo_dias || 30) : null;
    const limiteTotal = Number(disp.ciclos?.limite_maximo || 0);
    const numeroAtual = Number(disp.ciclos?.total_dispensacoes || 0);
    const mensagem = buildClientMessage({ nome: disp.pacientes?.nome || "Cliente", dataRetirada, proximaRetirada: proxima, validadeAte: disp.ciclos?.receitas?.validade_ate || disp.ciclos?.data_fim || null, ultimaPossivel: limiteTotal > 0 && numeroAtual >= limiteTotal });
    window.open(`https://api.whatsapp.com/send?phone=55${String(telefone).replace(/\D/g, "")}&text=${encodeURIComponent(mensagem)}`, "_blank");
  };

  const activeFilterCount = [tipoFiltro !== "todos", retiradaFiltro !== "todos", !!search.trim()].filter(Boolean).length;
  const totalMedicamento = filtered.filter((item) => item.ciclos?.receitas?.tipo !== "fralda").length;
  const totalFralda = filtered.filter((item) => item.ciclos?.receitas?.tipo === "fralda").length;

  return (
    <AppLayout title="Comprovantes">
      <div className="page-wrap">
        <section className="hero-compact rounded-2xl p-3 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Período</p>
              <h2 className="mt-1 text-xl font-black leading-tight">{formatDateBR(dataInicio)} a {formatDateBR(dataFim)}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{filtered.length} comprovante(s) • {totalMedicamento} med. • {totalFralda} fralda(s)</p>
            </div>
            <Button onClick={() => setFiltersOpen(true)} variant="outline" className="rounded-xl shrink-0 relative">
              <Filter className="h-4 w-4 mr-2" /> Filtros
              {activeFilterCount > 0 && <span className="ml-2 rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-white">{activeFilterCount}</span>}
            </Button>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto hide-scrollbar pb-1">
            {quickFilters.map((item) => <Button key={item.label} size="sm" variant="secondary" className="rounded-full shrink-0" onClick={() => { item.run(); setTimeout(fetchDispensacoes, 0); }}>{item.label}</Button>)}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button onClick={handlePrintList} disabled={filtered.length === 0} variant="outline" className="rounded-xl h-11"><Printer className="h-4 w-4 mr-2" /> Lista</Button>
            <Button onClick={handlePrintBatch} disabled={filtered.length === 0 || printingBatch} className="rounded-xl h-11 action-primary"><Printer className="h-4 w-4 mr-2" /> Todos</Button>
          </div>
        </section>

        <section className="surface-panel rounded-2xl p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-black leading-tight">Clientes dispensados</h3>
              <p className="text-xs text-muted-foreground">Ordem alfabética</p>
            </div>
            <Badge variant="outline" className="rounded-full">{filtered.length}</Badge>
          </div>

          {loading ? <div className="py-14 text-center text-muted-foreground">Carregando...</div> : filtered.length === 0 ? (
            <div className="py-14 text-center text-muted-foreground">Nenhuma dispensação encontrada.</div>
          ) : (
            <div className="space-y-2">
              {filtered.map((disp, idx) => {
                const tipo = disp.ciclos?.receitas?.tipo === "fralda" ? "Fralda" : "Medicamento";
                const dataRetirada = disp.data_dispensacao_real || disp.created_at?.split("T")[0];
                const proxima = dataRetirada ? calculateNextWithdrawalDate(dataRetirada, disp.ciclos?.intervalo_dias || 30) : null;
                return (
                  <motion.article key={disp.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.012 }} className="list-card pressable">
                    <div className="flex gap-3">
                      <div className="h-11 w-11 rounded-xl bg-muted flex items-center justify-center shrink-0"><UserRound className="h-5 w-5 text-primary" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h4 className="truncate font-black leading-tight">{disp.pacientes?.nome || "—"}</h4>
                            <p className="text-xs text-muted-foreground">CPF: {disp.pacientes?.cpf ? formatCpfMask(disp.pacientes.cpf) : "—"}</p>
                          </div>
                          <Badge variant="secondary" className="rounded-full shrink-0">{tipo}</Badge>
                        </div>

                        <div className="mt-2 rounded-xl bg-muted/65 p-2 text-sm">
                          <div className="flex justify-between gap-2"><span className="text-muted-foreground">Retirada</span><strong>{formatDateBR(dataRetirada)} · {formatTimeBR(disp.created_at)}</strong></div>
                          <div className="flex justify-between gap-2 mt-1"><span className="text-muted-foreground">Próxima</span><strong className="text-primary">{proxima ? formatDateBR(proxima) : "—"}</strong></div>
                          <div className="flex justify-between gap-2 mt-1"><span className="text-muted-foreground">Uso</span><strong>{disp.ciclos?.total_dispensacoes || "—"}/{disp.ciclos?.limite_maximo || "—"}</strong></div>
                        </div>

                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <Button onClick={() => handlePrint(disp)} className="rounded-xl h-10 action-primary"><Printer className="h-4 w-4 mr-2" /> Imprimir</Button>
                          <Button onClick={() => handleWhatsApp(disp)} variant="outline" className="rounded-xl h-10 text-primary border-primary/30"><MessageCircle className="h-4 w-4 mr-2" /> WhatsApp</Button>
                        </div>
                      </div>
                    </div>
                  </motion.article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="rounded-2xl p-4 max-w-md">
          <DialogHeader><DialogTitle>Filtros</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div><label className="mini-label mb-1 block">Início</label><Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="rounded-xl h-11" /></div>
              <div><label className="mini-label mb-1 block">Fim</label><Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="rounded-xl h-11" /></div>
            </div>
            <div><label className="mini-label mb-1 block">Buscar</label><div className="relative"><Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome ou CPF" className="rounded-xl h-11 pl-9" /></div></div>
            <div className="flex gap-2 flex-wrap">
              {(["todos", "medicamento", "fralda"] as TipoFiltro[]).map((item) => <Button key={item} size="sm" variant={tipoFiltro === item ? "default" : "outline"} className="rounded-full" onClick={() => setTipoFiltro(item)}>{item === "todos" ? "Todos" : item === "fralda" ? "Fralda" : "Medicamento"}</Button>)}
            </div>
            <div className="flex gap-2 flex-wrap">
              {(["todos", "proprio", "representante"] as RetiradaFiltro[]).map((item) => <Button key={item} size="sm" variant={retiradaFiltro === item ? "default" : "outline"} className="rounded-full" onClick={() => setRetiradaFiltro(item)}>{item === "todos" ? "Qualquer retirada" : item === "proprio" ? "Próprio" : "Representante"}</Button>)}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="rounded-xl" onClick={() => { setSearch(""); setTipoFiltro("todos"); setRetiradaFiltro("todos"); }}><X className="h-4 w-4 mr-2" /> Limpar</Button>
              <Button className="rounded-xl action-primary" onClick={() => { setFiltersOpen(false); fetchDispensacoes(); }}><CalendarDays className="h-4 w-4 mr-2" /> Aplicar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
