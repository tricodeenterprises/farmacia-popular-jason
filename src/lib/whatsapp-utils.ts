import { formatDateBR } from "@/lib/format-utils";

export function cleanPhoneDigits(telefone?: string | null): string {
  return (telefone || "").replace(/\D/g, "");
}

export function hasUsableWhatsAppPhone(telefone?: string | null): boolean {
  return cleanPhoneDigits(telefone).length >= 10;
}

export function buildWhatsAppUrl(telefone: string, message: string): string {
  const phone = `55${cleanPhoneDigits(telefone)}`;
  return `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
}

export function buildDispensacaoWhatsAppMessage(params: {
  pacienteNome: string;
  dataDispensacao: string;
  proximaRetirada?: string | null;
  operadorNome?: string | null;
  tipoRetirada?: string | null;
  numero?: number | null;
  limiteAtual?: number | null;
  limiteInicial?: number | null;
  retiradasRestantes?: number | null;
  retiradasPerdidas?: number | null;
}): string {
  const primeiroNome = (params.pacienteNome || "").trim().split(" ")[0] || "cliente";
  const linhas: string[] = [
    `Prezado(a) Senhor(a), *${primeiroNome}*.`,
    "",
    "🏥 *Farmácia Cantagalo*",
    "",
    "Segue o comprovante da sua dispensação:",
    `📅 Retirada: *${formatDateBR(params.dataDispensacao)}*`,
  ];

  if (params.proximaRetirada) {
    linhas.push(`➡️ Próxima retirada: *${formatDateBR(params.proximaRetirada)}*`);
  }

  if (params.numero != null && params.limiteAtual != null) {
    linhas.push(`📊 Retiradas: *${params.numero}/${params.limiteAtual}*`);
  }

  if (params.retiradasRestantes != null) {
    linhas.push(`✅ Disponíveis agora: *${params.retiradasRestantes}*`);
  }

  if (params.limiteInicial != null && params.limiteAtual != null && params.limiteInicial !== params.limiteAtual) {
    linhas.push(`ℹ️ Previstas inicialmente: *${params.limiteInicial}*`);
  }

  if (params.retiradasPerdidas != null && params.retiradasPerdidas > 0) {
    linhas.push(`⚠️ Atrasos reduziram *${params.retiradasPerdidas}* retirada(s) possível(is).`);
  }

  if (params.operadorNome) {
    linhas.push(`👤 Operador: ${params.operadorNome}`);
  }

  if (params.tipoRetirada) {
    linhas.push(`📌 Tipo de retirada: ${params.tipoRetirada}`);
  }

  linhas.push("", "Qualquer dúvida, estamos à disposição.");

  return linhas.join("\n");
}
