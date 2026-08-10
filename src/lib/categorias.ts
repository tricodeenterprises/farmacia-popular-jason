// Configuração centralizada das categorias de dispensação.
// Regra de intervalo: o sistema calcula a próxima retirada como intervalo_dias + 1.
// Por isso "storedIntervalDays" é sempre effectiveIntervalDays - 1.

export type CategoriaDispensacao = "medicamento" | "fralda" | "alendronato" | "absorvente";

export interface CategoriaConfig {
  key: CategoriaDispensacao;
  label: string;
  labelPlural: string;
  emoji: string;
  icon: string;
  /** dias reais entre uma retirada e a próxima */
  effectiveIntervalDays: number;
  /** valor gravado em ciclos.intervalo_dias (effective - 1) */
  storedIntervalDays: number;
  /** validade padrão da receita em dias (null = usa regra atual do fluxo) */
  validityDays: number | null;
  /** teto absoluto de retiradas no ciclo */
  capMaximo: number;
  /** o intervalo pode ser ajustado nas configurações administrativas? */
  intervaloConfiguravel: boolean;
  // estilos (tokens/tailwind)
  color: string;
  cardClass: string;
  badgeClass: string;
  dotClass: string;
}

export const CATEGORY_CONFIG: Record<CategoriaDispensacao, CategoriaConfig> = {
  medicamento: {
    key: "medicamento",
    label: "Medicamento",
    labelPlural: "Medicamentos",
    emoji: "💊",
    icon: "Pill",
    effectiveIntervalDays: 30,
    storedIntervalDays: 29,
    validityDays: null,
    capMaximo: 6,
    intervaloConfiguravel: false,
    color: "#1d4ed8",
    cardClass: "border-blue-500/60 bg-blue-50",
    badgeClass: "bg-blue-600 text-white border-blue-700",
    dotClass: "bg-blue-600",
  },
  fralda: {
    key: "fralda",
    label: "Fralda",
    labelPlural: "Fraldas",
    emoji: "🧷",
    icon: "Baby",
    effectiveIntervalDays: 11,
    storedIntervalDays: 10,
    validityDays: null,
    capMaximo: 18,
    intervaloConfiguravel: true,
    color: "#7c3aed",
    cardClass: "border-violet-500/60 bg-violet-50",
    badgeClass: "bg-violet-600 text-white border-violet-700",
    dotClass: "bg-violet-600",
  },
  alendronato: {
    key: "alendronato",
    label: "Alendronato",
    labelPlural: "Alendronato",
    emoji: "🦴",
    icon: "Bone",
    effectiveIntervalDays: 28,
    storedIntervalDays: 27,
    validityDays: 180,
    capMaximo: 7,
    intervaloConfiguravel: false,
    color: "#ea580c",
    cardClass: "border-orange-500/60 bg-orange-50",
    badgeClass: "bg-orange-600 text-white border-orange-700",
    dotClass: "bg-orange-600",
  },
  absorvente: {
    key: "absorvente",
    label: "Absorvente",
    labelPlural: "Absorventes",
    emoji: "🌸",
    icon: "Flower2",
    effectiveIntervalDays: 56,
    storedIntervalDays: 55,
    validityDays: 180,
    capMaximo: 4,
    intervaloConfiguravel: false,
    color: "#db2777",
    cardClass: "border-pink-500/60 bg-pink-50",
    badgeClass: "bg-pink-600 text-white border-pink-700",
    dotClass: "bg-pink-600",
  },
};

export const CATEGORIAS: CategoriaDispensacao[] = ["medicamento", "fralda", "alendronato", "absorvente"];

/** Normaliza qualquer valor vindo do banco para uma categoria conhecida (fallback: medicamento). */
export function normalizeCategoria(tipo?: string | null): CategoriaDispensacao {
  const t = String(tipo || "").trim().toLowerCase();
  if (t === "fralda" || t === "fraldas") return "fralda";
  if (t === "alendronato") return "alendronato";
  if (t === "absorvente" || t === "absorventes") return "absorvente";
  return "medicamento";
}

export function getCategoria(tipo?: string | null): CategoriaConfig {
  return CATEGORY_CONFIG[normalizeCategoria(tipo)];
}

export function categoriaLabel(tipo?: string | null): string {
  return getCategoria(tipo).label;
}

export function categoriaLabelComEmoji(tipo?: string | null): string {
  const c = getCategoria(tipo);
  return `${c.emoji} ${c.label}`;
}

/** intervalo_dias que deve ser gravado no banco para a categoria. */
export function storedIntervalFor(tipo?: string | null, fraldaOverride?: number | null): number {
  const c = getCategoria(tipo);
  if (c.key === "fralda" && typeof fraldaOverride === "number" && fraldaOverride > 0) return fraldaOverride;
  return c.storedIntervalDays;
}

export function capMaximoFor(tipo?: string | null): number {
  return getCategoria(tipo).capMaximo;
}

/** Validade padrão (em dias) a partir da emissão, quando a categoria define uma. */
export function validityDaysFor(tipo?: string | null): number | null {
  return getCategoria(tipo).validityDays;
}
