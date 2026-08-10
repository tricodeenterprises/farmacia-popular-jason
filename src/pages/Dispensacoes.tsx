import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  CalendarDays,
  FileStack,
  FileText,
  Filter,
  MessageCircle,
  Printer,
  Search,
  Sparkles,
  UserRound,
} from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { motion } from "framer-motion";
import { formatCpfMask, formatDateBR, getTodayStr } from "@/lib/format-utils";
import { calculateNextWithdrawalDate } from "@/lib/ciclo-utils";
import {
  CATEGORIAS,
  CATEGORY_CONFIG,
  capMaximoFor,
  categoriaLabel,
  normalizeCategoria,
  type CategoriaDispensacao,
} from "@/lib/categorias";
import { fetchPastaNumeracao, normalizeInitial } from "@/lib/pasta-numeracao";

import {
  printDispensacaoCupom,
  printDispensacoesEmLote,
  printListaDispensacoes,
  type PrintDispensacaoData,
  type PrintListaDispensacaoRow,
} from "@/lib/print-cupom";

function formatTimeBR(d: string | null) {
  if (!d) return "";
  const date = new Date(d);
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function buildClientMessage(args: {
  nome: string;
  dataRetirada: string;
  proximaRetirada: string | null;
  validadeAte: string | null;
  ultimaPossivel: boolean;
}) {
  const primeiroNome = args.nome.split(" ")[0];
  return [
    `Prezado(a) Senhor(a), ${primeiroNome}.`,
    "",
    "Sua dispensação foi registrada na Farmácia Cantagalo.",
    `Retirada: ${formatDateBR(args.dataRetirada)}`,
    args.proximaRetirada ? `Próxima retirada: ${formatDateBR(args.proximaRetirada)}` : null,
    args.ultimaPossivel && args.validadeAte
      ? `Atenção: esta é a última retirada possível com a receita atual, válida até ${formatDateBR(args.validadeAte)}.`
      : null,
    args.ultimaPossivel ? "Para continuar, será necessário renovar a receita." : null,
    "",
    "Farmácia Cantagalo",
  ]
    .filter(Boolean)
    .join("\n");
}

export default function Dispensacoes() {
  const today = getTodayStr();
  const [dataInicio, setDataInicio] = useState(today);
  const [dataFim, setDataFim] = useState(today);
  const [search, setSearch] = useState("");
  const [dispensacoes, setDispensacoes] = useState<any[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [printingBatch, setPrintingBatch] = useState(false);
  const [pastaMap, setPastaMap] = useState<Record<string, { letra: string; numero: number }>>({});

  useEffect(() => {
    fetchPastaNumeracao().then((lista) => {
      const map: Record<string, { letra: string; numero: number }> = {};
      lista.forEach((p) => { map[p.pacienteId] = { letra: p.letra, numero: p.numero }; });
      setPastaMap(map);
    });
  }, []);


  const fetchDispensacoes = async () => {
    setLoading(true);
    const startISO = new Date(`${dataInicio}T00:00:00`).toISOString();
    const endISO = new Date(`${dataFim}T23:59:59.999`).toISOString();

    const [{ data, error }, profilesRes] = await Promise.all([
      supabase
        .from("dispensacoes")
        .select("*, pacientes(nome, cpf, telefone), ciclos(intervalo_dias, limite_maximo, total_dispensacoes, data_fim, receitas(tipo, validade_ate))")
        .eq("cancelada", false)
        .or(`and(data_dispensacao_real.gte.${dataInicio},data_dispensacao_real.lte.${dataFim}),and(data_dispensacao_real.is.null,created_at.gte.${startISO},created_at.lte.${endISO})`)
        .order("data_dispensacao_real", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true }),
      supabase.from("profiles").select("id, nome"),
    ]);

    if (error) {
      toast.error("Erro ao buscar comprovantes.");
      setDispensacoes([]);
    } else {
      setDispensacoes(data || []);
    }

    const map: Record<string, string> = {};
    (profilesRes.data || []).forEach((item: any) => {
      map[item.id] = item.nome;
    });
    setProfileMap(map);
    setLoading(false);
  };

  useEffect(() => {
    fetchDispensacoes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataInicio, dataFim]);

  const lista = useMemo(() => {
    const base = [...dispensacoes]
      .filter((item) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase().trim();
        const cpfQ = q.replace(/\D/g, "");
        const nome = item.pacientes?.nome?.toLowerCase?.() || "";
        const cpf = item.pacientes?.cpf || "";
        return nome.startsWith(q) || (!!cpfQ && cpf.includes(cpfQ));
      })
      .sort((a, b) => {
        const nomeA = a.pacientes?.nome || "";
        const nomeB = b.pacientes?.nome || "";
        return nomeA.localeCompare(nomeB, "pt-BR");
      });
    return base;
  }, [dispensacoes, search]);

  const totaisPorCategoria = useMemo(() => {
    const base: Record<CategoriaDispensacao, number> = { medicamento: 0, fralda: 0, alendronato: 0, absorvente: 0 };
    for (const item of lista) base[normalizeCategoria(item.ciclos?.receitas?.tipo)] += 1;
    return base;
  }, [lista]);

  const periodoLabel = `${formatDateBR(dataInicio)} a ${formatDateBR(dataFim)}`;

  const prepareCupomData = async (disp: any) => {
    const { data: docs } = await supabase
      .from("documentos")
      .select("id, created_at, dados_extraidos")
      .eq("paciente_id", disp.paciente_id)
      .eq("ciclo_id", disp.ciclo_id)
      .eq("tipo", "cupom_fiscal");

    let itens: { codigo?: string | null; nome: string; quantidade?: string | null }[] = [];
    let numero = null as number | null;

    if (docs?.length) {
      const dispTs = new Date(disp.created_at).getTime();
      const escolhidos = [...docs].sort(
        (a: any, b: any) => Math.abs(new Date(a.created_at).getTime() - dispTs) - Math.abs(new Date(b.created_at).getTime() - dispTs),
      );
      const alvo = escolhidos.find((doc: any) => Array.isArray((doc.dados_extraidos as any)?.itens)) || escolhidos[0];
      const dados = (alvo?.dados_extraidos as any) || {};
      numero = typeof dados.dispensacao_numero === "number" ? dados.dispensacao_numero : null;
      if (Array.isArray(dados.itens)) {
        itens = dados.itens.map((it: any) =>
          typeof it === "string"
            ? { nome: it }
            : {
                codigo: it.codigo ?? null,
                nome: String(it.nome ?? "—"),
                quantidade: it.quantidade != null ? String(it.quantidade) : null,
              },
        );
      }
    }

    return { itens, numero };
  };

  const buildPrintData = async (disp: any): Promise<PrintDispensacaoData> => {
    const { itens, numero } = await prepareCupomData(disp);
    const ciclo = disp.ciclos;
    const tipo = normalizeCategoria(ciclo?.receitas?.tipo);
    const limiteTotal = Number(ciclo?.limite_maximo || 0);
    const retiradaNumero = numero ?? null;
    const disponivelAgora = retiradaNumero && limiteTotal ? Math.max(0, limiteTotal - retiradaNumero) : null;
    const limiteInicial = capMaximoFor(tipo);
    const perdidasPorAtraso = limiteTotal > 0 ? Math.max(0, limiteInicial - limiteTotal) : null;
    const pasta = pastaMap[disp.paciente_id];

    return {
      pacienteNome: disp.pacientes?.nome || "—",
      pacienteCpf: disp.pacientes?.cpf ? formatCpfMask(disp.pacientes.cpf) : null,
      dataDispensacao: disp.data_dispensacao_real || disp.created_at?.split("T")[0],
      dataCriacao: disp.created_at?.split("T")[0] || null,
      intervaloDias: ciclo?.intervalo_dias || 30,
      operadorNome: profileMap[disp.registrada_por] || null,
      tipoRetirada: disp.tipo_retirada === "representante" ? "Representante" : "Próprio paciente",
      categoria: tipo,
      pastaLetra: pasta?.letra || normalizeInitial(disp.pacientes?.nome),
      pastaNumero: pasta?.numero ?? null,
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
      const ok = printDispensacaoCupom(await buildPrintData(disp));
      if (!ok) toast.error("Permita pop-ups para imprimir o comprovante.");
    } catch (error: any) {
      toast.error(error?.message || "Erro ao gerar comprovante.");
    }
  };

  const handlePrintList = () => {
    const rows: PrintListaDispensacaoRow[] = lista.map((disp) => {
      const dataRetirada = disp.data_dispensacao_real || disp.created_at?.split("T")[0];
      const proxima = dataRetirada ? calculateNextWithdrawalDate(dataRetirada, disp.ciclos?.intervalo_dias || 30) : null;
      return {
        pacienteNome: disp.pacientes?.nome || "—",
        pacienteCpf: disp.pacientes?.cpf ? formatCpfMask(disp.pacientes.cpf) : "",
        tipo: categoriaLabel(disp.ciclos?.receitas?.tipo),
        tipoRetirada: disp.tipo_retirada === "representante" ? "Representante" : "Próprio",
        dataRetirada,
        proximaRetirada: proxima,
        operadorNome: profileMap[disp.registrada_por] || "—",
      };
    });
    const ok = printListaDispensacoes(rows, periodoLabel);
    if (!ok) toast.error("Permita pop-ups para imprimir a lista.");
  };

  const handlePrintBatch = async () => {
    if (lista.length === 0) return;
    if (lista.length > 80 && !window.confirm(`Você vai gerar ${lista.length} comprovantes em uma única impressão. Continuar?`)) return;
    setPrintingBatch(true);
    try {
      const data = [] as PrintDispensacaoData[];
      for (const item of lista) data.push(await buildPrintData(item));
      const ok = printDispensacoesEmLote(data);
      if (!ok) toast.error("Permita pop-ups para imprimir em lote.");
    } catch (error: any) {
      toast.error(error?.message || "Erro ao gerar comprovantes em lote.");
    } finally {
      setPrintingBatch(false);
    }
  };

  const handleWhatsApp = (disp: any) => {
    const telefone = disp.pacientes?.telefone;
    if (!telefone) {
      toast.error("Cliente sem telefone cadastrado.");
      return;
    }

    const ciclo = disp.ciclos;
    const dataRetirada = disp.data_dispensacao_real || disp.created_at?.split("T")[0];
    const proxima = dataRetirada ? calculateNextWithdrawalDate(dataRetirada, ciclo?.intervalo_dias || 30) : null;
    const limiteTotal = Number(ciclo?.limite_maximo || 0);
    const numeroAtual = Number(ciclo?.total_dispensacoes || 0);
    const ultimaPossivel = limiteTotal > 0 && numeroAtual >= limiteTotal;

    const mensagem = buildClientMessage({
      nome: disp.pacientes?.nome || "Cliente",
      dataRetirada,
      proximaRetirada: proxima,
      validadeAte: ciclo?.receitas?.validade_ate || ciclo?.data_fim || null,
      ultimaPossivel,
    });

    const phone = `55${String(telefone).replace(/\D/g, "")}`;
    window.open(`https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(mensagem)}`, "_blank");
  };

  return (
    <AppLayout title="Comprovantes e conferência">
      <div className="max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-6 space-y-4">
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="hero-card rounded-[2rem] p-4 sm:p-6 overflow-hidden relative">
          <div className="absolute inset-0 grid-pattern opacity-50 pointer-events-none" />
          <motion.div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-primary/20 blur-3xl" animate={{ scale: [1, 1.12, 1], opacity: [0.45, 0.7, 0.45] }} transition={{ duration: 5, repeat: Infinity }} />
          <div className="relative z-10 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-2">
              <div className="section-chip"><Sparkles className="w-3.5 h-3.5" /> Conferência e impressão</div>
              <h2 className="text-2xl sm:text-4xl font-black leading-tight">Comprovantes por período</h2>
              <p className="text-sm text-muted-foreground max-w-2xl">
                Filtre de 01 a 30, por semana ou por mês. Imprima uma lista administrativa ou gere todos os comprovantes individuais em uma única janela.
              </p>
            </div>

            <div className="w-full xl:max-w-3xl space-y-3">
              <div className="grid grid-cols-2 lg:grid-cols-[160px_160px_1fr_120px] gap-3">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground block mb-1.5">Início</label>
                  <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="h-12 rounded-2xl bg-white" />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground block mb-1.5">Fim</label>
                  <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="h-12 rounded-2xl bg-white" />
                </div>
                <div className="col-span-2 lg:col-span-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground block mb-1.5">Buscar</label>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome ou CPF" className="h-12 rounded-2xl pl-10 bg-white" />
                  </div>
                </div>
                <Button onClick={fetchDispensacoes} disabled={loading} className="h-12 rounded-2xl text-sm font-semibold mt-auto">
                  {loading ? "Buscando..." : "Atualizar"}
                </Button>
              </div>
            </div>
          </div>
        </motion.section>

        <section className="surface-panel rounded-[1.6rem] p-3 sm:p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Button onClick={handlePrintList} disabled={lista.length === 0} variant="outline" className="rounded-2xl h-11">
              <Printer className="w-4 h-4 mr-2" /> Imprimir lista
            </Button>
            <Button onClick={handlePrintBatch} disabled={lista.length === 0 || printingBatch} className="rounded-2xl h-11">
              <FileStack className="w-4 h-4 mr-2" /> {printingBatch ? "Gerando..." : "Imprimir comprovantes"}
            </Button>
            <Button onClick={() => window.location.href = "/relatorios"} variant="secondary" className="rounded-2xl h-11">
              <FileText className="w-4 h-4 mr-2" /> Relatórios
            </Button>
          </div>
        </section>

        <section className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <Card className="metric-card border-0"><CardContent className="p-0"><p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Total</p><p className="text-3xl font-black mt-2">{lista.length}</p><p className="text-sm text-muted-foreground mt-1">no filtro</p></CardContent></Card>
          {CATEGORIAS.map((cat) => (
            <Card key={cat} className="metric-card border-0">
              <CardContent className="p-0">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{CATEGORY_CONFIG[cat].labelPlural}</p>
                <p className="text-3xl font-black mt-2" style={{ color: CATEGORY_CONFIG[cat].color }}>{totaisPorCategoria[cat]}</p>
                <p className="text-sm text-muted-foreground mt-1">retiradas</p>
              </CardContent>
            </Card>
          ))}
          <Card className="metric-card border-0 col-span-2 lg:col-span-1"><CardContent className="p-0"><p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Período</p><p className="text-lg font-black mt-2">{periodoLabel}</p><p className="text-sm text-muted-foreground mt-1">intervalo ativo</p></CardContent></Card>
        </section>


        <section className="surface-panel rounded-[1.6rem] p-3 sm:p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-sm font-bold">Clientes dispensados</p>
            </div>
            <Badge className="rounded-full status-info"><Filter className="w-3.5 h-3.5 mr-1" /> {lista.length}</Badge>
          </div>

          {loading ? (
            <div className="py-16 text-center text-muted-foreground">Carregando comprovantes...</div>
          ) : lista.length === 0 ? (
            <div className="py-16 text-center">
              <FileText className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="font-semibold">Nenhuma dispensação encontrada.</p>
              <p className="text-sm text-muted-foreground mt-1">Altere o período ou a busca.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {lista.map((disp, idx) => {
                const tipo = categoriaLabel(disp.ciclos?.receitas?.tipo);
                const dataRetirada = disp.data_dispensacao_real || disp.created_at?.split("T")[0];
                const proxima = dataRetirada ? calculateNextWithdrawalDate(dataRetirada, disp.ciclos?.intervalo_dias || 30) : null;
                return (
                  <motion.div
                    key={disp.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.015 }}
                    className="rounded-[1.4rem] border border-border/70 bg-white p-4 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-3">
                          <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center shrink-0">
                            <UserRound className="w-5 h-5 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-bold text-base truncate">{disp.pacientes?.nome || "—"}</p>
                              <Badge variant="outline" className="rounded-full">{tipo}</Badge>
                              <Badge variant="secondary" className="rounded-full">{disp.tipo_retirada === "representante" ? "Representante" : "Próprio"}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">CPF: {disp.pacientes?.cpf ? formatCpfMask(disp.pacientes.cpf) : "—"}</p>
                            <div className="mt-3 grid grid-cols-2 lg:grid-cols-5 gap-2 text-sm">
                              <div className="rounded-2xl bg-secondary/60 p-2.5"><p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Retirada</p><p className="font-bold mt-1">{formatDateBR(dataRetirada)}</p></div>
                              <div className="rounded-2xl bg-secondary/60 p-2.5"><p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Horário</p><p className="font-bold mt-1">{formatTimeBR(disp.created_at) || "—"}</p></div>
                              <div className="rounded-2xl bg-secondary/60 p-2.5 col-span-2 lg:col-span-1"><p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Próxima</p><p className="font-bold mt-1 text-primary">{proxima ? formatDateBR(proxima) : "—"}</p></div>
                              <div className="rounded-2xl bg-secondary/60 p-2.5 col-span-2 lg:col-span-1"><p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Operador</p><p className="font-bold mt-1 truncate">{profileMap[disp.registrada_por] || "—"}</p></div>
                              <div className="rounded-2xl bg-secondary/60 p-2.5 col-span-2 lg:col-span-1"><p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Uso</p><p className="font-bold mt-1">{disp.ciclos?.total_dispensacoes ?? "—"}/{disp.ciclos?.limite_maximo ?? "—"}</p></div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 lg:w-[260px]">
                        <Button onClick={() => handlePrint(disp)} className="h-12 rounded-2xl text-sm font-semibold"><Printer className="w-4 h-4 mr-2" /> Imprimir</Button>
                        <Button onClick={() => handleWhatsApp(disp)} variant="outline" className="h-12 rounded-2xl text-sm font-semibold border-primary/30 text-primary hover:bg-primary/5"><MessageCircle className="w-4 h-4 mr-2" /> WhatsApp</Button>
                        <Button variant="ghost" className="col-span-2 h-11 rounded-2xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary" onClick={() => (window.location.href = `/pacientes/${disp.paciente_id}`)}>
                          <CalendarDays className="w-4 h-4 mr-2" /> Abrir paciente
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
