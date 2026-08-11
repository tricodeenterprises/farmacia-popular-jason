import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarClock, Check, Clock3, MessageCircle, Send, UserRound, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { calculateNextWithdrawalDate, getTodayLocalDateStr, compareDateStr, calculateRemainingPossible } from "@/lib/ciclo-utils";
import { formatDateBR } from "@/lib/format-utils";
import { buildWhatsAppUrl, hasUsableWhatsAppPhone } from "@/lib/whatsapp-utils";

type Tipo = "previa" | "hoje" | "atraso";

interface Item {
  key: string;
  cicloId: string;
  pacienteNome: string;
  telefone: string;
  proximaRetirada: string;
  ultimaRetiradaRef: string | null;
  tipo: Tipo;
  diasAtraso?: number;
  mensagem: string;
  podeEnviar: boolean;
  motivoBloqueio?: string;
  atrasoCount?: number;
  ultimaRetiradaReceita?: boolean;
}

const STORAGE_KEY = "wa_dashboard_fab_v1";
const MAX_ATRASO_SENDS = 4;
const ATRASO_INTERVAL_DAYS = 10;

type Tracking = Record<string, {
  ultimaRetiradaRef: string | null;
  previaSentAt?: string;   // ISO date for the specific proximaRetirada
  hojeSentAt?: string;     // YYYY-MM-DD
  atrasoSends: string[];   // ISO datetimes, resets when ultimaRetiradaRef changes
}>;

function loadTracking(): Tracking {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveTracking(t: Tracking) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
}

function daysDiff(a: string, b: string) {
  const da = new Date(`${a}T00:00:00`).getTime();
  const db = new Date(`${b}T00:00:00`).getTime();
  return Math.round((da - db) / 86400000);
}

const WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

function weekdayName(dateStr: string) {
  return WEEKDAYS[new Date(`${dateStr}T00:00:00`).getDay()];
}

function buildMessage(nome: string, tipo: Tipo, proxima: string, diasAtraso?: number, proximoNumero?: number, ultimaRetiradaReceita?: boolean): string {
  const primeiro = (nome || "").trim().split(" ")[0] || "cliente";
  const today = getTodayLocalDateStr();
  const avisoUltima = ultimaRetiradaReceita
    ? "\n\n*Atenção:* esta é a *última retirada* prevista para a receita atual. Após esta retirada, será necessário apresentar uma *nova receita* para dar continuidade ao tratamento."
    : "";

  if (tipo === "previa") {
    const d = daysDiff(proxima, today);
    const isDomingo = new Date(`${proxima}T00:00:00`).getDay() === 0;
    const quando = d === 1 ? `amanhã, ${formatDateBR(proxima)}` : `${weekdayName(proxima)}, ${formatDateBR(proxima)}`;
    const linhas = [
      `Prezado(a) Senhor(a), *${primeiro}*.`,
      "",
      `Informamos que sua próxima retirada está prevista para *${quando}*.`,
    ];
    if (isDomingo) {
      linhas.push("Como não funcionamos aos domingos, pedimos a gentileza de comparecer no *próximo dia útil*.");
    } else {
      linhas.push("Aguardamos sua presença.");
    }
    return linhas.join("\n") + avisoUltima;
  }
  if (tipo === "hoje") {
    return [
      `Prezado(a) Senhor(a), *${primeiro}*.`,
      "",
      `Sua retirada já está disponível *hoje, ${formatDateBR(proxima)}*.`,
      "Tenha um ótimo dia!",
    ].join("\n") + avisoUltima;
  }
  const isUltimo = proximoNumero === MAX_ATRASO_SENDS;
  const linhas = [
    `Prezado(a) Senhor(a), *${primeiro}*.`,
    "",
    `Sua retirada está disponível desde *${formatDateBR(proxima)}*${diasAtraso ? ` (${diasAtraso} dia${diasAtraso > 1 ? "s" : ""} de atraso)` : ""}.`,
  ];
  if (isUltimo) {
    linhas.push(
      "",
      "Este é o *último aviso*: caso não haja retirada, o ciclo será encerrado e será necessário apresentar nova receita para reabertura.",
    );
  } else {
    linhas.push("Assim que possível, venha para dar continuidade ao seu tratamento.");
  }
  return linhas.join("\n") + avisoUltima;
}

export default function DashboardWhatsAppFAB() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<Item | null>(null);
  const [awaitingConfirm, setAwaitingConfirm] = useState<string | null>(null);
  const [tab, setTab] = useState<Tipo>("hoje");
  const [tracking, setTracking] = useState<Tracking>(() => loadTracking());

  const persist = (t: Tracking) => {
    setTracking(t);
    saveTracking(t);
  };

  const load = async () => {
    setLoading(true);
    const today = getTodayLocalDateStr();
    const { data } = await supabase
      .from("ciclos")
      .select("id, intervalo_dias, ultima_retirada, data_inicio, data_fim, total_dispensacoes, limite_maximo, receitas!ciclos_receita_id_fkey(validade_ate), pacientes!ciclos_paciente_id_fkey(nome, telefone)")
      .eq("status", "ativo");

    const t = loadTracking();
    let dirty = false;
    const next: Item[] = [];

    (data || []).forEach((c: any) => {
      const paciente = c.pacientes;
      if (!paciente?.telefone || !hasUsableWhatsAppPhone(paciente.telefone)) return;
      const base = c.ultima_retirada || c.data_inicio;
      if (!base) return;
      const proxima = calculateNextWithdrawalDate(base, c.intervalo_dias || 30);
      const diff = daysDiff(proxima, today);

      // Skip pacientes que não podem mais retirar:
      // 1) Receita vencida: próxima retirada ultrapassa validade
      // 2) Limite de retiradas do ciclo já atingido
      const validade = (c.receitas?.validade_ate || c.data_fim) as string | null;
      const totalDisp = Number(c.total_dispensacoes || 0);
      const limite = Number(c.limite_maximo || 0);
      if (validade && compareDateStr(proxima, validade) > 0) return;
      if (limite > 0 && totalDisp >= limite) return;

      // Última retirada possível nesta receita?
      let ultimaRetiradaReceita = false;
      if (limite > 0 && totalDisp + 1 >= limite) ultimaRetiradaReceita = true;
      if (!ultimaRetiradaReceita && validade) {
        const remaining = calculateRemainingPossible({
          dataBase: proxima,
          dataFim: validade,
          intervaloDias: c.intervalo_dias || 30,
        });
        if (remaining <= 1) ultimaRetiradaReceita = true;
      }

      let tipo: Tipo | null = null;
      if (diff === 3) tipo = "previa";
      else if (diff === 0) tipo = "hoje";
      else if (diff < 0) tipo = "atraso";
      if (!tipo) return;

      // Reset atraso count if new dispensacao happened
      const rec = t[c.id] || { ultimaRetiradaRef: null, atrasoSends: [] };
      if (rec.ultimaRetiradaRef !== (c.ultima_retirada || null)) {
        rec.ultimaRetiradaRef = c.ultima_retirada || null;
        rec.atrasoSends = [];
        rec.previaSentAt = undefined;
        rec.hojeSentAt = undefined;
        t[c.id] = rec;
        dirty = true;
      }

      let podeEnviar = true;
      let motivo: string | undefined;

      if (tipo === "previa") {
        if (rec.previaSentAt === proxima) return;
      } else if (tipo === "hoje") {
        if (rec.hojeSentAt === today) return;
      } else {
        const count = rec.atrasoSends.length;
        if (count >= MAX_ATRASO_SENDS) return;
        const last = rec.atrasoSends[count - 1];
        if (last) {
          const lastDate = last.slice(0, 10);
          const since = daysDiff(today, lastDate);
          if (since < ATRASO_INTERVAL_DAYS) return;
        }
      }

      const diasAtraso = tipo === "atraso" ? Math.abs(diff) : undefined;
      const proximoNumero = tipo === "atraso" ? rec.atrasoSends.length + 1 : undefined;
      next.push({
        key: `${tipo}-${c.id}`,
        cicloId: c.id,
        pacienteNome: paciente.nome,
        telefone: paciente.telefone,
        proximaRetirada: proxima,
        ultimaRetiradaRef: c.ultima_retirada || null,
        tipo,
        diasAtraso,
        mensagem: buildMessage(paciente.nome, tipo, proxima, diasAtraso, proximoNumero, ultimaRetiradaReceita),
        podeEnviar,
        motivoBloqueio: motivo,
        atrasoCount: tipo === "atraso" ? rec.atrasoSends.length : undefined,
        ultimaRetiradaReceita,
      });
    });

    if (dirty) saveTracking(t);
    setTracking(t);
    next.sort((a, b) => a.pacienteNome.localeCompare(b.pacienteNome, "pt-BR"));
    setItems(next);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const counts = useMemo(() => ({
    hoje: items.filter(i => i.tipo === "hoje").length,
    previa: items.filter(i => i.tipo === "previa").length,
    atraso: items.filter(i => i.tipo === "atraso").length,
  }), [items]);

  const badgeTotal = counts.hoje + counts.previa + counts.atraso;
  const visible = items.filter(i => i.tipo === tab);

  const confirmSent = (item: Item) => {
    const t = loadTracking();
    const rec = t[item.cicloId] || { ultimaRetiradaRef: item.ultimaRetiradaRef, atrasoSends: [] };
    if (item.tipo === "previa") rec.previaSentAt = item.proximaRetirada;
    else if (item.tipo === "hoje") rec.hojeSentAt = getTodayLocalDateStr();
    else rec.atrasoSends = [...(rec.atrasoSends || []), new Date().toISOString()];
    rec.ultimaRetiradaRef = item.ultimaRetiradaRef;
    t[item.cicloId] = rec;
    persist(t);
    setSelected(null);
    setAwaitingConfirm(null);
    toast.success("Envio registrado.");
    load();
  };

  return (
    <>
      <motion.button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 md:bottom-6 z-40 w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg"
        style={{ background: "linear-gradient(135deg, hsl(159 64% 37%), hsl(174 72% 31%))" }}
        whileTap={{ scale: 0.92 }}
        animate={{ y: [0, -2, 0] }}
        transition={{ repeat: Infinity, duration: 2.4 }}
        aria-label="Central de avisos WhatsApp"
      >
        <MessageCircle className="w-6 h-6" />
        {badgeTotal > 0 && !open && (
          <span className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1 rounded-full bg-destructive text-white text-[11px] font-bold flex items-center justify-center">
            {Math.min(badgeTotal, 99)}
          </span>
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 80 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 80 }}
              className="fixed inset-x-0 bottom-0 z-50 max-h-[86vh] bg-background rounded-t-[1.8rem] overflow-hidden flex flex-col"
            >
              <div className="px-4 py-4 border-b border-border/70 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-secondary flex items-center justify-center">
                    <MessageCircle className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-base font-bold">Avisos por WhatsApp</p>
                    <p className="text-xs text-muted-foreground">Mensagens profissionais de aviso — não são cobranças.</p>
                  </div>
                </div>
                <button onClick={() => setOpen(false)} className="w-9 h-9 rounded-2xl bg-secondary flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 border-b border-border/60 grid grid-cols-3 gap-2">
                {([
                  { id: "hoje" as Tipo, label: "Hoje", count: counts.hoje, icon: CalendarClock },
                  { id: "previa" as Tipo, label: "Em 3 dias", count: counts.previa, icon: Clock3 },
                  { id: "atraso" as Tipo, label: "Atrasados", count: counts.atraso, icon: AlertTriangle },
                ]).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`rounded-2xl px-3 py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5 ${tab === t.id ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}
                  >
                    <t.icon className="w-4 h-4" />
                    {t.label} {t.count > 0 && <span className="text-xs opacity-90">({t.count})</span>}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {loading ? (
                  <div className="py-16 text-center text-muted-foreground">Carregando...</div>
                ) : visible.length === 0 ? (
                  <div className="py-16 text-center">
                    <Check className="w-10 h-10 mx-auto text-primary/50 mb-3" />
                    <p className="font-semibold">Nenhum aviso nesta categoria.</p>
                  </div>
                ) : (
                  visible.map((item) => (
                    <div key={item.key} className="rounded-[1.4rem] border border-border/70 bg-card p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <div className="w-11 h-11 rounded-2xl bg-secondary flex items-center justify-center shrink-0">
                            <UserRound className="w-5 h-5 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold truncate">{item.pacienteNome}</p>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {item.tipo === "hoje" && <Badge className="rounded-full">Hoje · {formatDateBR(item.proximaRetirada)}</Badge>}
                              {item.tipo === "previa" && <Badge variant="outline" className="rounded-full">{weekdayName(item.proximaRetirada)} · {formatDateBR(item.proximaRetirada)}</Badge>}
                              {item.tipo === "atraso" && (
                                <>
                                  <Badge variant="destructive" className="rounded-full">Atraso {item.diasAtraso}d</Badge>
                                  <Badge variant="outline" className="rounded-full text-xs">Aviso {(item.atrasoCount ?? 0) + 1}/{MAX_ATRASO_SENDS}{(item.atrasoCount ?? 0) + 1 === MAX_ATRASO_SENDS ? " · último" : ""}</Badge>
                                </>
                              )}
                              {item.ultimaRetiradaReceita && (
                                <Badge variant="outline" className="rounded-full text-xs border-amber-400 text-amber-700 bg-amber-50">Última retirada da receita</Badge>
                              )}
                            </div>
                            {item.motivoBloqueio && (
                              <p className="text-[11px] text-muted-foreground mt-1.5">{item.motivoBloqueio}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 shrink-0">
                          <Button
                            className="rounded-2xl"
                            disabled={!item.podeEnviar}
                            onClick={() => { setSelected(item); setAwaitingConfirm(null); }}
                          >
                            <Send className="w-4 h-4 mr-2" />
                            Enviar
                          </Button>
                          <Button
                            variant="outline"
                            className="rounded-2xl"
                            onClick={() => confirmSent(item)}
                          >
                            <Check className="w-4 h-4 mr-2" />
                            Já enviei
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <Dialog open={!!selected} onOpenChange={(v) => { if (!v) { setSelected(null); setAwaitingConfirm(null); } }}>
        <DialogContent className="max-w-md rounded-[1.6rem]">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-primary" />
                  {selected.pacienteNome}
                </DialogTitle>
                <DialogDescription>
                  {selected.tipo === "previa" && "Aviso antecipado (3 dias antes da retirada)."}
                  {selected.tipo === "hoje" && "Aviso de retirada disponível hoje."}
                  {selected.tipo === "atraso" && "Aviso de retirada em atraso."}
                </DialogDescription>
              </DialogHeader>

              <div className="rounded-2xl bg-secondary/60 p-4 border border-border/70 text-sm whitespace-pre-wrap leading-relaxed">
                {selected.mensagem}
              </div>

              {awaitingConfirm === selected.key ? (
                <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 space-y-3">
                  <p className="text-sm text-amber-900">Confirme que o WhatsApp foi aberto e a mensagem enviada.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button className="rounded-2xl" onClick={() => confirmSent(selected)}>Confirmar envio</Button>
                    <Button variant="outline" className="rounded-2xl" onClick={() => setAwaitingConfirm(null)}>Cancelar</Button>
                  </div>
                </div>
              ) : (
                <Button
                  className="w-full rounded-2xl"
                  onClick={() => {
                    window.open(buildWhatsAppUrl(selected.telefone, selected.mensagem), "_blank");
                    setAwaitingConfirm(selected.key);
                  }}
                >
                  <Send className="w-4 h-4 mr-2" />
                  Abrir WhatsApp
                </Button>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
