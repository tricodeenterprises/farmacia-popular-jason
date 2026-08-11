import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  CalendarClock,
  Check,
  MessageCircle,
  Phone,
  Send,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { calculateNextWithdrawalDate } from "@/lib/ciclo-utils";
import { formatCpfMask, formatDateBR } from "@/lib/format-utils";

interface AlertItem {
  id: string;
  pacienteId: string;
  pacienteNome: string;
  telefone: string;
  cpf?: string;
  cicloId: string;
  tipo: "medicamento" | "fralda";
  proximaRetirada: string;
  validadeAte: string | null;
  ultimaPossivel: boolean;
  usaRepresentante: boolean;
  mensagem: string;
}

interface SemTelefone {
  id: string;
  nome: string;
  cpf: string;
}

type Tab = "avisos" | "semTelefone";

function buildWhatsAppUrl(telefone: string, message: string) {
  const phone = `55${telefone.replace(/\D/g, "")}`;
  return `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
}

function buildReminderMessage(alert: Omit<AlertItem, "mensagem">) {
  const primeiroNome = alert.pacienteNome.split(" ")[0];
  return [
    `Prezado(a) Senhor(a), ${primeiroNome}.`,
    "",
    `Sua próxima retirada de ${alert.tipo === "fralda" ? "fralda" : "medicamento"} estará liberada amanhã, ${formatDateBR(alert.proximaRetirada)}.`,
    alert.ultimaPossivel && alert.validadeAte
      ? `Atenção: esta será a última retirada possível com a receita atual, que vence em ${formatDateBR(alert.validadeAte)}.`
      : null,
    alert.ultimaPossivel ? "Depois desta retirada, será necessário renovar a receita." : null,
    alert.usaRepresentante ? "Se a retirada for por representante, leve a procuração e o documento do representante." : null,
    "",
  ]
    .filter(Boolean)
    .join("\n");
}

function daysBetween(dateA: Date, dateB: Date) {
  const a = new Date(dateA.getFullYear(), dateA.getMonth(), dateA.getDate()).getTime();
  const b = new Date(dateB.getFullYear(), dateB.getMonth(), dateB.getDate()).getTime();
  return Math.round((a - b) / (1000 * 60 * 60 * 24));
}

export default function WhatsAppNotificationCenter() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("avisos");
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [semTelefone, setSemTelefone] = useState<SemTelefone[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<AlertItem | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPhone, setEditPhone] = useState("");
  const [openedTemplateId, setOpenedTemplateId] = useState<string | null>(null);
  const [sentMessages, setSentMessages] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("whatsapp_sent_messages");
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      if (parsed.date === new Date().toISOString().split("T")[0]) {
        return new Set(parsed.ids || []);
      }
    } catch {
      // noop
    }
    return new Set();
  });

  const persistSent = (ids: Set<string>) => {
    localStorage.setItem(
      "whatsapp_sent_messages",
      JSON.stringify({ date: new Date().toISOString().split("T")[0], ids: Array.from(ids) }),
    );
  };

  const markSent = (id: string) => {
    setSentMessages((prev) => {
      const next = new Set(prev);
      next.add(id);
      persistSent(next);
      return next;
    });
    setOpenedTemplateId(null);
    setSelectedAlert(null);
    toast.success("Mensagem confirmada como enviada.");
  };

  const loadData = async () => {
    setLoading(true);
    const today = new Date();

    const [ciclosRes, pacientesSemTelefoneRes, dispensacoesRes] = await Promise.all([
      supabase
        .from("ciclos")
        .select("id, paciente_id, intervalo_dias, limite_maximo, total_dispensacoes, ultima_retirada, data_inicio, data_fim, pacientes!ciclos_paciente_id_fkey(id, nome, telefone, cpf), receitas!ciclos_receita_id_fkey(tipo, validade_ate)")
        .eq("status", "ativo"),
      supabase.from("pacientes").select("id, nome, cpf").eq("ativo", true).is("telefone", null).order("nome"),
      supabase.from("dispensacoes").select("ciclo_id, tipo_retirada").eq("cancelada", false),
    ]);

    const representativeMap = new Map<string, boolean>();
    (dispensacoesRes.data || []).forEach((item: any) => {
      if (item.tipo_retirada === "representante") representativeMap.set(item.ciclo_id, true);
    });

    const nextAlerts: AlertItem[] = [];
    (ciclosRes.data || []).forEach((ciclo: any) => {
      const paciente = ciclo.pacientes;
      if (!paciente?.telefone) return;

      const baseDate = ciclo.ultima_retirada || ciclo.data_inicio;
      if (!baseDate) return;

      const proxima = calculateNextWithdrawalDate(baseDate, ciclo.intervalo_dias || 30);
      const daysUntil = daysBetween(new Date(`${proxima}T00:00:00`), today);
      if (daysUntil !== 1) return;

      const limite = Number(ciclo.limite_maximo || 0);
      const total = Number(ciclo.total_dispensacoes || 0);
      const restanteDepois = Math.max(0, limite - (total + 1));
      const alertaBase = {
        id: `amanha-${ciclo.id}`,
        pacienteId: paciente.id,
        pacienteNome: paciente.nome,
        telefone: paciente.telefone,
        cpf: paciente.cpf,
        cicloId: ciclo.id,
        tipo: ciclo.receitas?.tipo === "fralda" ? "fralda" : "medicamento",
        proximaRetirada: proxima,
        validadeAte: ciclo.receitas?.validade_ate || ciclo.data_fim || null,
        ultimaPossivel: restanteDepois === 0,
        usaRepresentante: representativeMap.get(ciclo.id) || false,
      } as Omit<AlertItem, "mensagem">;

      nextAlerts.push({
        ...alertaBase,
        mensagem: buildReminderMessage(alertaBase),
      });
    });

    setAlerts(nextAlerts);
    setSemTelefone((pacientesSemTelefoneRes.data || []) as SemTelefone[]);
    setLoading(false);
  };

  useEffect(() => {
    if (open) loadData();
  }, [open]);

  const visibleAlerts = useMemo(
    () => alerts.filter((item) => !sentMessages.has(item.id)).sort((a, b) => a.pacienteNome.localeCompare(b.pacienteNome, "pt-BR")),
    [alerts, sentMessages],
  );

  const savePhone = async (paciente: SemTelefone) => {
    const clean = editPhone.replace(/\D/g, "");
    if (clean.length < 10) {
      toast.error("Telefone inválido.");
      return;
    }
    const { error } = await supabase.from("pacientes").update({ telefone: clean }).eq("id", paciente.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Telefone salvo.");
    setEditingId(null);
    setEditPhone("");
    await loadData();
  };

  return (
    <>
      <motion.button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 md:bottom-6 z-50 w-14 h-14 rounded-full flex items-center justify-center text-white floating-action"
        style={{ background: "linear-gradient(135deg, hsl(159 64% 37%), hsl(174 72% 31%))" }}
        whileTap={{ scale: 0.92 }}
        animate={{ y: [0, -2, 0] }}
        transition={{ repeat: Infinity, duration: 2.4 }}
        aria-label="Central de WhatsApp"
      >
        <MessageCircle className="w-6 h-6" />
        {(visibleAlerts.length > 0 || semTelefone.length > 0) && !open && (
          <span className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1 rounded-full bg-destructive text-white text-[11px] font-bold flex items-center justify-center">
            {Math.min(visibleAlerts.length + semTelefone.length, 99)}
          </span>
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 80 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 80 }}
              className="fixed inset-x-0 bottom-0 z-50 max-h-[86vh] rounded-t-[1.8rem] surface-panel overflow-hidden flex flex-col"
            >
              <div className="px-4 py-4 border-b border-border/70 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-secondary flex items-center justify-center">
                    <MessageCircle className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-base font-bold">Central de mensagens</p>
                    <p className="text-xs text-muted-foreground">Somente avisos de retirada para amanhã. Sem mensagem duplicada de vencimento.</p>
                  </div>
                </div>
                <button onClick={() => setOpen(false)} className="w-9 h-9 rounded-2xl bg-secondary flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 border-b border-border/60 flex gap-2">
                <button
                  onClick={() => setTab("avisos")}
                  className={`flex-1 rounded-2xl px-4 py-2.5 text-sm font-semibold ${tab === "avisos" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}
                >
                  Avisos {visibleAlerts.length > 0 && <span className="ml-1 text-xs">({visibleAlerts.length})</span>}
                </button>
                <button
                  onClick={() => setTab("semTelefone")}
                  className={`flex-1 rounded-2xl px-4 py-2.5 text-sm font-semibold ${tab === "semTelefone" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}
                >
                  Sem telefone {semTelefone.length > 0 && <span className="ml-1 text-xs">({semTelefone.length})</span>}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {loading ? (
                  <div className="py-16 text-center text-muted-foreground">Carregando...</div>
                ) : tab === "avisos" ? (
                  visibleAlerts.length === 0 ? (
                    <div className="py-16 text-center">
                      <Check className="w-10 h-10 mx-auto text-primary/50 mb-3" />
                      <p className="font-semibold">Nenhum aviso pendente.</p>
                      <p className="text-sm text-muted-foreground mt-1">As mensagens somem depois da confirmação manual de envio.</p>
                    </div>
                  ) : (
                    visibleAlerts.map((alert) => (
                      <div key={alert.id} className="rounded-[1.4rem] border border-border/70 bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div className="w-11 h-11 rounded-2xl bg-secondary flex items-center justify-center shrink-0">
                              <UserRound className="w-5 h-5 text-primary" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-bold truncate">{alert.pacienteNome}</p>
                                <Badge variant="outline" className="rounded-full">{alert.tipo === "fralda" ? "Fralda" : "Medicamento"}</Badge>
                                {alert.ultimaPossivel && <Badge className="rounded-full status-proximo">Última retirada</Badge>}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">CPF: {alert.cpf ? formatCpfMask(alert.cpf) : "—"}</p>
                              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                                <div className="rounded-2xl bg-secondary/60 p-2.5">
                                  <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Próxima retirada</p>
                                  <p className="font-bold mt-1 text-primary">{formatDateBR(alert.proximaRetirada)}</p>
                                </div>
                                <div className="rounded-2xl bg-secondary/60 p-2.5">
                                  <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Receita</p>
                                  <p className="font-bold mt-1">{alert.validadeAte ? formatDateBR(alert.validadeAte) : "—"}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                          <Button className="rounded-2xl shrink-0" onClick={() => { setSelectedAlert(alert); setOpenedTemplateId(null); }}>
                            <Send className="w-4 h-4 mr-2" />
                            Enviar
                          </Button>
                        </div>
                      </div>
                    ))
                  )
                ) : semTelefone.length === 0 ? (
                  <div className="py-16 text-center">
                    <Check className="w-10 h-10 mx-auto text-primary/50 mb-3" />
                    <p className="font-semibold">Todos os clientes têm telefone.</p>
                  </div>
                ) : (
                  semTelefone.map((paciente) => (
                    <div key={paciente.id} className="rounded-[1.4rem] border border-border/70 bg-white p-4 shadow-sm">
                      {editingId === paciente.id ? (
                        <div className="space-y-3">
                          <div>
                            <p className="font-bold">{paciente.nome}</p>
                            <p className="text-xs text-muted-foreground">CPF: {formatCpfMask(paciente.cpf)}</p>
                          </div>
                          <Input
                            value={editPhone}
                            onChange={(e) => setEditPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                            placeholder="11999999999"
                            className="h-11 rounded-2xl"
                          />
                          <div className="flex gap-2">
                            <Button onClick={() => savePhone(paciente)} className="flex-1 rounded-2xl">Salvar</Button>
                            <Button variant="outline" onClick={() => { setEditingId(null); setEditPhone(""); }} className="flex-1 rounded-2xl">Cancelar</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <button className="font-bold text-left truncate hover:underline" onClick={() => { setOpen(false); navigate(`/pacientes/${paciente.id}`); }}>{paciente.nome}</button>
                            <p className="text-xs text-muted-foreground">CPF: {formatCpfMask(paciente.cpf)}</p>
                          </div>
                          <Button variant="outline" className="rounded-2xl" onClick={() => { setEditingId(paciente.id); setEditPhone(""); }}>
                            <Phone className="w-4 h-4 mr-2" />
                            Adicionar
                          </Button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <Dialog open={!!selectedAlert} onOpenChange={(value) => { if (!value) { setSelectedAlert(null); setOpenedTemplateId(null); } }}>
        <DialogContent className="max-w-md rounded-[1.6rem]">
          {selectedAlert && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CalendarClock className="w-5 h-5 text-primary" />
                  Mensagem para {selectedAlert.pacienteNome}
                </DialogTitle>
                <DialogDescription>
                  O texto abaixo já combina a retirada de amanhã com o aviso de última receita quando necessário.
                </DialogDescription>
              </DialogHeader>

              <div className="rounded-2xl bg-secondary/60 p-4 border border-border/70 text-sm whitespace-pre-wrap leading-relaxed">
                {selectedAlert.mensagem}
              </div>

              {openedTemplateId === selectedAlert.id ? (
                <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 space-y-3">
                  <div className="flex items-start gap-2 text-amber-800">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <p className="text-sm font-medium">Confirme somente depois de verificar se a conversa foi aberta corretamente no WhatsApp.</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <Button className="rounded-2xl" onClick={() => markSent(selectedAlert.id)}>
                      Confirmar envio
                    </Button>
                    <Button variant="outline" className="rounded-2xl" onClick={() => { setOpenedTemplateId(null); toast.error("Marcado como número inválido ou sem WhatsApp."); }}>
                      Número inválido
                    </Button>
                    <Button variant="ghost" className="rounded-2xl" onClick={() => setOpenedTemplateId(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  className="w-full rounded-2xl"
                  onClick={() => {
                    window.open(buildWhatsAppUrl(selectedAlert.telefone, selectedAlert.mensagem), "_blank");
                    setOpenedTemplateId(selectedAlert.id);
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
