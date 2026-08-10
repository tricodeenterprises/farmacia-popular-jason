import { capMaximoFor } from "@/lib/categorias";

const DAY_MS = 1000 * 60 * 60 * 24;

type TipoReceita = "medicamento" | "fralda" | "alendronato" | "absorvente" | string;


function toLocalDate(dateStr: string): Date {
  return new Date(`${dateStr.split("T")[0]}T00:00:00`);
}

function toDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function normalizeDateStr(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  return String(dateStr).split("T")[0] || null;
}

export function addDaysToDateStr(dateStr: string, days: number): string {
  const d = toLocalDate(dateStr);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

export function intervalDaysToEffective(intervaloDias: number): number {
  return intervaloDias + 1;
}

export function calculateNextWithdrawalDate(lastWithdrawal: string, intervalDays: number): string {
  return addDaysToDateStr(lastWithdrawal, intervalDaysToEffective(intervalDays));
}

export function getCycleValidityDate(ciclo: any): string | null {
  return normalizeDateStr(ciclo?.data_fim || ciclo?.receitas?.validade_ate);
}

export function getCycleNextWithdrawalDate(ciclo: any): string | null {
  if (!ciclo) return null;
  const total = Number(ciclo.total_dispensacoes || 0);
  const limite = Number(ciclo.limite_maximo || 0);
  if (limite > 0 && total >= limite) {
    const base = normalizeDateStr(ciclo.ultima_retirada || ciclo.data_inicio);
    return base ? calculateNextWithdrawalDate(base, Number(ciclo.intervalo_dias || 30)) : null;
  }
  const base = normalizeDateStr(ciclo.ultima_retirada || ciclo.data_inicio);
  return base ? calculateNextWithdrawalDate(base, Number(ciclo.intervalo_dias || 30)) : null;
}

export function compareDateStr(a: string | null | undefined, b: string | null | undefined): number {
  const da = normalizeDateStr(a);
  const db = normalizeDateStr(b);
  if (!da && !db) return 0;
  if (!da) return -1;
  if (!db) return 1;
  return toLocalDate(da).getTime() - toLocalDate(db).getTime();
}


export function getTodayLocalDateStr(): string {
  const d = new Date();
  return toDateStr(d);
}

export function isFutureDateStr(dateStr: string | null | undefined, todayStr = getTodayLocalDateStr()): boolean {
  const normalized = normalizeDateStr(dateStr);
  if (!normalized) return false;
  return compareDateStr(normalized, todayStr) > 0;
}

export function getDispensacaoDateStr(dispensacao: any): string | null {
  return normalizeDateStr(dispensacao?.data_dispensacao_real || dispensacao?.created_at);
}

export function buildCycleRecalculationFromDispensacoes(dispensacoes: any[], ciclo?: any) {
  const validas = (dispensacoes || [])
    .filter((d: any) => !d?.cancelada)
    .map((d: any) => ({ ...d, data_base: getDispensacaoDateStr(d) }))
    .filter((d: any) => !!d.data_base)
    .sort((a: any, b: any) => compareDateStr(a.data_base, b.data_base));

  const total = validas.length;
  const ultimaRetirada = total > 0 ? validas[total - 1].data_base : null;
  const primeiraRetirada = total > 0 ? validas[0].data_base : null;

  const updates: Record<string, any> = {
    total_dispensacoes: total,
    ultima_retirada: ultimaRetirada,
  };

  if (primeiraRetirada) {
    updates.data_inicio = primeiraRetirada;
  } else if (ciclo?.receitas?.data_emissao) {
    updates.data_inicio = normalizeDateStr(ciclo.receitas.data_emissao);
  }

  return { updates, total, ultimaRetirada, primeiraRetirada, dispensacoesValidas: validas };
}

export function getCycleClosureInfo(ciclo: any) {
  const validade = getCycleValidityDate(ciclo);
  const proximaRetirada = getCycleNextWithdrawalDate(ciclo);
  const total = Number(ciclo?.total_dispensacoes || 0);
  const limite = Number(ciclo?.limite_maximo || 0);
  const limiteAtingido = limite > 0 && total >= limite;
  const proximaUltrapassaValidade = !!proximaRetirada && !!validade && compareDateStr(proximaRetirada, validade) > 0;

  return {
    shouldClose: Boolean(ciclo && ciclo.status === "ativo" && (proximaUltrapassaValidade || limiteAtingido)),
    proximaRetirada,
    validade,
    limiteAtingido,
    proximaUltrapassaValidade,
    motivo: proximaUltrapassaValidade ? "proxima_retirada_apos_vencimento" : limiteAtingido ? "limite_atingido" : null,
    label: proximaUltrapassaValidade
      ? "Próxima retirada ultrapassa a validade"
      : limiteAtingido
        ? "Limite de retiradas atingido"
        : "Ciclo ainda vigente",
  };
}

export function isCycleClosedCorrectly(ciclo: any) {
  if (!ciclo || ciclo.status === "ativo") return false;
  const info = getCycleClosureInfo({ ...ciclo, status: "ativo" });
  const motivo = String(ciclo.motivo_encerramento || "");
  const isManual = motivo === "manual" || motivo === "substituido_por_nova_receita";
  return Boolean(ciclo.encerrado_em && (info.shouldClose || isManual));
}

export function calculateCycleLimit(params: {
  tipoReceita: TipoReceita;
  dataInicio: string;
  dataFim: string;
  ultimaRetirada?: string | null;
  primeiraRetirada?: string | null;
  intervaloDias: number;
}): number {
  const { tipoReceita, dataInicio, dataFim, primeiraRetirada, intervaloDias } = params;
  const capMaximo = capMaximoFor(tipoReceita);
  const baseDate = primeiraRetirada || dataInicio;

  const base = toLocalDate(baseDate);
  const validade = toLocalDate(dataFim);
  const diasAteValidade = Math.floor((validade.getTime() - base.getTime()) / DAY_MS);
  if (diasAteValidade < 0) return 0;

  const intervaloEfetivo = intervalDaysToEffective(intervaloDias);
  return Math.min(capMaximo, Math.max(1, Math.floor(diasAteValidade / intervaloEfetivo) + 1));
}

export function calculateRemainingPossible(params: {
  dataBase: string;
  dataFim: string;
  intervaloDias: number;
}): number {
  const base = toLocalDate(params.dataBase);
  const validade = toLocalDate(params.dataFim);
  const diasAteValidade = Math.floor((validade.getTime() - base.getTime()) / DAY_MS);
  if (diasAteValidade < 0) return 0;
  return Math.floor(diasAteValidade / intervalDaysToEffective(params.intervaloDias)) + 1;
}
