import { formatDateBR } from "@/lib/format-utils";
import { calculateNextWithdrawalDate } from "@/lib/ciclo-utils";
import { categoriaLabelComEmoji } from "@/lib/categorias";
import { normalizeInitial, formatNumeroPasta } from "@/lib/pasta-numeracao";


export type PrintItem = { codigo?: string | null; nome: string; quantidade?: string | null };

export interface PrintDispensacaoData {
  pacienteNome: string;
  pacienteCpf?: string | null;
  dataDispensacao: string;
  dataCriacao?: string | null;
  intervaloDias: number;
  operadorNome?: string | null;
  tipoRetirada?: string | null;
  categoria?: string | null;
  pastaLetra?: string | null;
  pastaNumero?: number | null;
  itens: PrintItem[];
  numero?: number | null;
  totalCiclo?: number | null;
  quantidadeDisponivelAgora?: number | null;
  limiteInicial?: number | null;
  perdidasPorAtraso?: number | null;
}


export interface PrintListaDispensacaoRow {
  pacienteNome: string;
  pacienteCpf?: string | null;
  tipo: string;
  tipoRetirada: string;
  dataRetirada: string;
  proximaRetirada?: string | null;
  operadorNome?: string | null;
  dispensacao?: string | null;
}

export interface PrintCicloConferenciaData {
  pacienteNome: string;
  pacienteCpf?: string | null;
  tipo: string;
  dataInicio: string;
  dataFim: string;
  ultimaRetirada?: string | null;
  totalDispensacoes: number;
  limiteMaximo: number;
  motivoEncerramento?: string | null;
  encerradoEm?: string | null;
  dispensacoes: Array<{
    data: string;
    tipoRetirada: string;
    operador?: string | null;
    cancelada?: boolean;
  }>;
  checklist?: Array<{ label: string; ok?: boolean }>;
}

function escapeHtml(s: string): string {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function openPrintWindow(html: string, opts = "width=480,height=760") {
  const w = window.open("", "_blank", opts);
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
  }, 350);
  return true;
}

function cupomSection(d: PrintDispensacaoData) {
  const proxima = d.dataDispensacao ? calculateNextWithdrawalDate(d.dataDispensacao, d.intervaloDias) : null;
  const itensHtml = (d.itens || [])
    .map((it) => {
      const nome = escapeHtml(it.nome || "—");
      const qtd = escapeHtml(it.quantidade ? `x${it.quantidade}` : "");
      return `<div class="item"><div class="nome">${nome}</div><div class="qtd">${qtd}</div></div>`;
    })
    .join("");

  const disponibilidade = typeof d.quantidadeDisponivelAgora === "number"
    ? `<div class="meta-block">
        <div class="meta-title">Disponibilidade</div>
        <div class="meta-line"><span>Retirada atual</span><strong>${d.numero ?? "—"}${d.totalCiclo ? ` / ${d.totalCiclo}` : ""}</strong></div>
        ${typeof d.limiteInicial === "number" ? `<div class="meta-line"><span>Previstas no início</span><strong>${d.limiteInicial}</strong></div>` : ""}
        <div class="meta-line"><span>Disponíveis agora</span><strong>${Math.max(0, d.quantidadeDisponivelAgora)}</strong></div>
        ${typeof d.perdidasPorAtraso === "number" && d.perdidasPorAtraso > 0 ? `<div class="alert">Atrasos podem reduzir a quantidade final. Perda estimada: ${d.perdidasPorAtraso} retirada(s).</div>` : ""}
      </div>`
    : "";

  const letra = d.pastaLetra || normalizeInitial(d.pacienteNome);
  const pastaHtml = `<div class="pasta">
      <div class="letra">${escapeHtml(letra)}</div>
      ${typeof d.pastaNumero === "number" ? `<div class="num">Nº ${escapeHtml(formatNumeroPasta(d.pastaNumero))}</div>` : ""}
      ${d.categoria ? `<div class="cat">${escapeHtml(categoriaLabelComEmoji(d.categoria))}</div>` : ""}
    </div>`;

  return `<section class="receipt-page">
    ${pastaHtml}
    <div class="brand">
      <h1>SISTEMA</h1>
      <p>Comprovante de dispensação</p>
    </div>


    <div class="section">
      <div class="label">Paciente</div>
      <div>${escapeHtml(d.pacienteNome || "—")}</div>
      ${d.pacienteCpf ? `<div class="muted">CPF: ${escapeHtml(d.pacienteCpf)}</div>` : ""}
    </div>

    <div class="section">
      <div class="row"><span class="label">Retirada do dia</span><strong>${formatDateBR(d.dataDispensacao)}</strong></div>
      ${d.operadorNome ? `<div class="row"><span class="muted">Operador</span><strong>${escapeHtml(d.operadorNome)}</strong></div>` : ""}
      ${d.tipoRetirada ? `<div class="row"><span class="muted">Retirada</span><strong>${escapeHtml(d.tipoRetirada)}</strong></div>` : ""}
      ${d.dataCriacao && d.dataCriacao !== d.dataDispensacao ? `<div class="row"><span class="muted">Registro</span><strong>${formatDateBR(d.dataCriacao)}</strong></div>` : ""}
      ${typeof d.numero === "number" ? `<div class="row"><span class="muted">Dispensação</span><strong>${d.numero}${d.totalCiclo ? ` / ${d.totalCiclo}` : ""}</strong></div>` : ""}
    </div>

    ${proxima ? `<div class="next"><small>PRÓXIMA RETIRADA</small><strong>${formatDateBR(proxima)}</strong></div>` : ""}
    ${disponibilidade}
    ${itensHtml ? `<div class="section"><div class="label" style="margin-bottom:4px;">Itens registrados</div>${itensHtml}</div>` : ""}

    <div class="footer">Emitido em ${formatDateBR(new Date().toISOString().split("T")[0])}</div>
  </section>`;
}

function receiptCss() {
  return `<style>
    @page { size: 80mm auto; margin: 3mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111827; }
    body { width: 74mm; padding: 2mm 0 4mm; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.35; }
    .receipt-page { page-break-after: always; }
    .receipt-page:last-child { page-break-after: auto; }
    .brand { text-align: center; border: 1.5px solid #111827; border-radius: 10px; padding: 8px 6px; margin-bottom: 8px; background: linear-gradient(180deg, #f8fafc, #eef2f7); }
    .brand h1 { margin: 0; font-size: 16px; letter-spacing: 0.04em; }
    .brand p { margin: 4px 0 0; font-size: 11px; font-weight: 700; }
    .pasta { text-align: center; border: 3px solid #000; border-radius: 12px; padding: 4px 6px 8px; margin-bottom: 8px; background: #fff; }
    .pasta .letra { font-size: 72px; line-height: 1; font-weight: 900; color: #000; letter-spacing: 0.02em; }
    .pasta .num { font-size: 26px; font-weight: 900; color: #000; margin-top: 2px; }
    .pasta .cat { font-size: 12px; font-weight: 800; color: #000; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.08em; }

    .section { border: 1px solid #d7dee8; border-radius: 10px; padding: 8px; margin-bottom: 8px; }
    .row { display: flex; justify-content: space-between; gap: 8px; margin: 3px 0; }
    .muted { color: #475569; }
    .label { font-weight: 700; }
    .meta-block { border: 1.5px dashed #cbd5e1; border-radius: 10px; padding: 8px; margin-top: 8px; }
    .meta-title { text-align: center; font-size: 12px; font-weight: 800; margin-bottom: 6px; }
    .meta-line { display: flex; justify-content: space-between; gap: 8px; margin: 3px 0; }
    .next { margin: 10px 0 8px; border: 2px solid #0f766e; border-radius: 14px; background: #ecfdf5; text-align: center; padding: 10px 8px; }
    .next small { display: block; font-size: 11px; font-weight: 800; letter-spacing: 0.08em; color: #0f766e; }
    .next strong { display: block; font-size: 25px; margin-top: 4px; color: #064e3b; }
    .item { display: flex; justify-content: space-between; gap: 8px; padding: 3px 0; border-bottom: 1px dotted #cbd5e1; }
    .item:last-child { border-bottom: none; }
    .nome { flex: 1; word-break: break-word; }
    .qtd { white-space: nowrap; font-weight: 700; }
    .alert { margin-top: 6px; padding: 6px 8px; border-radius: 8px; background: #fef3c7; color: #92400e; font-size: 11px; font-weight: 700; }
    .footer { text-align: center; font-size: 10px; color: #64748b; margin-top: 8px; }
  </style>`;
}

export function printDispensacaoCupom(d: PrintDispensacaoData) {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" /><title>Comprovante</title>${receiptCss()}</head><body>${cupomSection(d)}</body></html>`;
  return openPrintWindow(html, "width=420,height=720");
}

export function printDispensacoesEmLote(list: PrintDispensacaoData[]) {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" /><title>Comprovantes em lote</title>${receiptCss()}</head><body>${list.map(cupomSection).join("")}</body></html>`;
  return openPrintWindow(html, "width=480,height=760");
}

export function printListaDispensacoes(rows: PrintListaDispensacaoRow[], periodo: string) {
  const rowsHtml = rows.map((row, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td><strong>${escapeHtml(row.pacienteNome)}</strong><br/><span>${escapeHtml(row.pacienteCpf || "")}</span></td>
      <td>${escapeHtml(row.tipo)}</td>
      <td>${formatDateBR(row.dataRetirada)}</td>
      <td>${row.proximaRetirada ? formatDateBR(row.proximaRetirada) : "—"}</td>
      <td>${escapeHtml(row.tipoRetirada)}</td>
      <td>${escapeHtml(row.operadorNome || "—")}</td>
    </tr>`).join("");

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" />
  <title>Lista de dispensações</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111827; }
    h1 { margin: 0; font-size: 22px; }
    .meta { margin: 4px 0 16px; color: #475569; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { background: #ecfdf5; color: #064e3b; text-align: left; }
    th, td { border: 1px solid #cbd5e1; padding: 6px; vertical-align: top; }
    tr:nth-child(even) td { background: #f8fafc; }
    span { color: #64748b; font-size: 10px; }
  </style></head><body>
    <h1>Lista de dispensações</h1>
    <div class="meta">Período: ${escapeHtml(periodo)} · Total: ${rows.length} · Emitido em ${formatDateBR(new Date().toISOString().split("T")[0])}</div>
    <table>
      <thead><tr><th>#</th><th>Paciente</th><th>Tipo</th><th>Retirada</th><th>Próxima</th><th>Modo</th><th>Operador</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </body></html>`;
  return openPrintWindow(html, "width=900,height=720");
}

export function printConferenciaCiclo(ciclo: PrintCicloConferenciaData) {
  const checklist = (ciclo.checklist || []).map((item) => `
    <div class="check"><span>${item.ok ? "☑" : "☐"}</span> ${escapeHtml(item.label)}</div>`).join("");
  const disps = ciclo.dispensacoes.map((d, idx) => `
    <tr><td>${idx + 1}</td><td>${formatDateBR(d.data)}</td><td>${escapeHtml(d.tipoRetirada)}</td><td>${escapeHtml(d.operador || "—")}</td><td>${d.cancelada ? "Cancelada" : "OK"}</td></tr>`).join("");

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" />
  <title>Conferência do pacote</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111827; }
    h1 { margin: 0; font-size: 22px; }
    .meta { color: #475569; margin: 4px 0 16px; font-size: 12px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
    .box { border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px; }
    .label { color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
    .value { font-weight: 700; margin-top: 3px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; }
    th { background: #ecfdf5; color: #064e3b; }
    .check { font-size: 14px; margin: 6px 0; }
  </style></head><body>
    <h1>Conferência de pacote de receita</h1>
    <div class="meta">Sistema · Emitido em ${formatDateBR(new Date().toISOString().split("T")[0])}</div>
    <div class="grid">
      <div class="box"><div class="label">Paciente</div><div class="value">${escapeHtml(ciclo.pacienteNome)}</div><div>${escapeHtml(ciclo.pacienteCpf || "")}</div></div>
      <div class="box"><div class="label">Tipo</div><div class="value">${escapeHtml(ciclo.tipo)}</div></div>
      <div class="box"><div class="label">Ciclo</div><div class="value">${formatDateBR(ciclo.dataInicio)} até ${formatDateBR(ciclo.dataFim)}</div></div>
      <div class="box"><div class="label">Retiradas</div><div class="value">${ciclo.totalDispensacoes} / ${ciclo.limiteMaximo}</div></div>
      <div class="box"><div class="label">Última retirada</div><div class="value">${ciclo.ultimaRetirada ? formatDateBR(ciclo.ultimaRetirada) : "—"}</div></div>
      <div class="box"><div class="label">Encerramento</div><div class="value">${ciclo.encerradoEm ? formatDateBR(ciclo.encerradoEm.split("T")[0]) : "—"}</div><div>${escapeHtml(ciclo.motivoEncerramento || "—")}</div></div>
    </div>
    <div class="box"><div class="label">Checklist do pacote</div>${checklist || "—"}</div>
    <h2>Dispensações</h2>
    <table><thead><tr><th>#</th><th>Data</th><th>Retirada</th><th>Operador</th><th>Status</th></tr></thead><tbody>${disps || ""}</tbody></table>
  </body></html>`;
  return openPrintWindow(html, "width=900,height=720");
}
