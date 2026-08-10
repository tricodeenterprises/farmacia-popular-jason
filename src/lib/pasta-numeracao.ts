import { supabase } from "@/integrations/supabase/client";

/**
 * Numeração da "pasta popular": cada paciente com pelo menos um ciclo ativo
 * recebe um número sequencial dentro da letra inicial do seu nome.
 *
 * A numeração é derivada do estado atual dos ciclos ativos (ordenada pelo nome),
 * portanto nunca fica com buracos e um paciente com dois ciclos ativos mantém
 * um único número.
 */

export interface PastaNumero {
  letra: string;
  numero: number;
  formatado: string; // "01"
}

export interface PastaPessoa extends PastaNumero {
  pacienteId: string;
  nome: string;
}

export function normalizeInitial(nome?: string | null): string {
  const clean = String(nome || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  const match = clean.match(/[A-Za-z0-9]/);
  return match ? match[0].toUpperCase() : "#";
}

export function formatNumeroPasta(numero: number): string {
  return String(Math.max(1, numero)).padStart(2, "0");
}

function ordenarPt(a: string, b: string) {
  return a.localeCompare(b, "pt-BR", { sensitivity: "base" });
}

/** Recebe a lista de pacientes com ciclo ativo e devolve a numeração de cada um. */
export function computePastaNumeracao(pacientes: Array<{ id: string; nome: string }>): PastaPessoa[] {
  const unicos = new Map<string, { id: string; nome: string }>();
  for (const p of pacientes) {
    if (p?.id && !unicos.has(p.id)) unicos.set(p.id, { id: p.id, nome: p.nome || "" });
  }

  const porLetra = new Map<string, Array<{ id: string; nome: string }>>();
  for (const p of unicos.values()) {
    const letra = normalizeInitial(p.nome);
    if (!porLetra.has(letra)) porLetra.set(letra, []);
    porLetra.get(letra)!.push(p);
  }

  const resultado: PastaPessoa[] = [];
  for (const [letra, lista] of porLetra) {
    lista.sort((a, b) => ordenarPt(a.nome, b.nome));
    lista.forEach((p, idx) => {
      resultado.push({
        pacienteId: p.id,
        nome: p.nome,
        letra,
        numero: idx + 1,
        formatado: formatNumeroPasta(idx + 1),
      });
    });
  }
  return resultado;
}

/** Busca no banco todos os pacientes com ciclo ativo e calcula a numeração. */
export async function fetchPastaNumeracao(): Promise<PastaPessoa[]> {
  const { data, error } = await supabase
    .from("ciclos")
    .select("paciente_id, pacientes(id, nome)")
    .eq("status", "ativo");
  if (error || !data) return [];
  const pacientes = (data as any[])
    .map((c) => ({ id: c.pacientes?.id || c.paciente_id, nome: c.pacientes?.nome || "" }))
    .filter((p) => !!p.id);
  return computePastaNumeracao(pacientes);
}

/** Numeração de um paciente específico (null se não tiver ciclo ativo). */
export async function fetchPastaNumeroPaciente(pacienteId: string, nomeFallback?: string): Promise<PastaNumero | null> {
  const todos = await fetchPastaNumeracao();
  const found = todos.find((p) => p.pacienteId === pacienteId);
  if (found) return { letra: found.letra, numero: found.numero, formatado: found.formatado };
  if (nomeFallback) {
    const letra = normalizeInitial(nomeFallback);
    const proximo = todos.filter((p) => p.letra === letra).length + 1;
    return { letra, numero: proximo, formatado: formatNumeroPasta(proximo) };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Notificação de reimpressão da pasta (5 dias) — persistida localmente.
// ---------------------------------------------------------------------------

const REPRINT_KEY = "pasta_reprint_notifications_v1";
const REPRINT_TTL_DAYS = 5;

export interface ReprintNotification {
  letra: string;
  motivo: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  pessoas: number;
  completedAt?: string | null;
  completedBy?: string | null;
}

function readReprints(): ReprintNotification[] {
  try {
    const raw = localStorage.getItem(REPRINT_KEY);
    const list: ReprintNotification[] = raw ? JSON.parse(raw) : [];
    const now = Date.now();
    return list.filter((n) => !n.completedAt && new Date(n.expiresAt).getTime() > now);
  } catch {
    return [];
  }
}

function writeReprints(list: ReprintNotification[]) {
  try {
    localStorage.setItem(REPRINT_KEY, JSON.stringify(list));
  } catch {
    /* noop */
  }
}

export function listReprintNotifications(): ReprintNotification[] {
  return readReprints().sort((a, b) => a.letra.localeCompare(b.letra));
}

/** Cria/atualiza (sem duplicar) a notificação de reimpressão de uma letra. */
export function upsertReprintNotification(letra: string, pessoas: number, motivo: string) {
  const list = readReprints();
  const now = new Date();
  const expires = new Date(now.getTime() + REPRINT_TTL_DAYS * 86400000);
  const existing = list.find((n) => n.letra === letra);
  if (existing) {
    existing.pessoas = pessoas;
    existing.motivo = motivo;
    existing.updatedAt = now.toISOString();
    existing.expiresAt = expires.toISOString();
  } else {
    list.push({
      letra,
      motivo,
      pessoas,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: expires.toISOString(),
    });
  }
  writeReprints(list);
}

export function completeReprintNotification(letra: string, userId?: string | null) {
  const list = readReprints().filter((n) => n.letra !== letra);
  writeReprints(list);
  return { letra, completedBy: userId || null, completedAt: new Date().toISOString() };
}

/**
 * Detecta mudança de numeração de uma letra após o encerramento do último
 * ciclo ativo de um paciente e registra a notificação de reimpressão.
 */
export async function checkPastaReorganizacao(nomePacienteEncerrado: string) {
  const letra = normalizeInitial(nomePacienteEncerrado);
  const todos = await fetchPastaNumeracao();
  const daLetra = todos.filter((p) => p.letra === letra);
  if (daLetra.length === 0) return null;
  upsertReprintNotification(letra, daLetra.length, "reorganizacao_por_encerramento");
  return { letra, pessoas: daLetra.length };
}
