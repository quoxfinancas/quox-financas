// Funções puras usadas pelo update.mjs (e testadas em test.mjs).

// Títulos do Tesouro que o app mostra. Quando um vencimento sair de oferta,
// troque o ano aqui e o nome do título no index.html.
export const TARGETS = [
  { key: "spSel", tipo: "tesouro selic", ano: 2031, min: -1, max: 2 },
  { key: "ipcaReal", tipo: "tesouro ipca+", ano: 2032, min: 0, max: 15 },
  { key: "pre", tipo: "tesouro prefixado", ano: 2032, min: 3, max: 30 },
];

export const norm = (s) =>
  String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

// "13,75" -> 13.75 | "13.75" -> 13.75 | "1.234,5" -> 1234.5
export function num(s) {
  let t = String(s).trim();
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

// "05/11/2026" -> "2026-11-05"
export function isoFromBr(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s).trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

// Lê o CSV do Tesouro Transparente linha a linha, guardando só a taxa de compra
// mais recente de cada título-alvo. O arquivo tem centenas de MB, por isso não
// é carregado inteiro na memória.
export function createCsvReader(targets = TARGETS) {
  let cols = null;
  const best = new Map();
  return {
    push(line) {
      if (!line) return;
      const parts = line.replace(/\r$/, "").split(";");
      if (!cols) {
        const h = parts.map(norm);
        const iTipo = h.findIndex((x) => x.startsWith("tipo"));
        const iVenc = h.findIndex((x) => x.startsWith("data vencimento"));
        const iBase = h.findIndex((x) => x.startsWith("data base"));
        const iTaxa = h.findIndex((x) => x.startsWith("taxa compra"));
        if ([iTipo, iVenc, iBase, iTaxa].every((i) => i >= 0)) cols = { iTipo, iVenc, iBase, iTaxa };
        return;
      }
      const tipo = norm(parts[cols.iTipo] ?? "");
      const alvo = targets.find((t) => t.tipo === tipo);
      if (!alvo) return;
      const venc = isoFromBr(parts[cols.iVenc] ?? "");
      if (!venc || Number(venc.slice(0, 4)) !== alvo.ano) return;
      const base = isoFromBr(parts[cols.iBase] ?? "");
      const taxa = num(parts[cols.iTaxa] ?? "");
      if (!base || taxa === null) return;
      const atual = best.get(alvo.key);
      if (!atual || base > atual.iso) best.set(alvo.key, { iso: base, value: taxa });
    },
    result: () => best,
    headerFound: () => cols !== null,
  };
}

export function inRange(value, min, max) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

// ---------- Ofertas de CDB, LCI e LCA (planilha de curadoria) ----------
// Não fazemos raspagem de site das corretoras: elas não oferecem API pública
// e os termos de uso costumam proibir a coleta automática. Em vez disso, a
// equipe registra as ofertas numa planilha (ofertas.csv ou Google Sheets
// publicada como CSV) e este código valida e publica no app.

export const INSTITUICOES = ["XP", "Rico", "Clear"];
export const TIPOS = ["CDB", "LCI", "LCA"];
export const INDEXADORES = ["cdi", "pre", "ipca"];

function splitCsvLine(line, delim) {
  const out = [];
  let cur = "";
  let aspas = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (aspas) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') aspas = false;
      else cur += c;
    } else if (c === '"') aspas = true;
    else if (c === delim) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const fmt = (n) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export function parseOfertas(texto) {
  const linhas = String(texto).replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const erros = [];
  const ofertas = [];
  if (!linhas.length) return { ofertas, erros };
  const delim = (linhas[0].match(/;/g) || []).length >= (linhas[0].match(/,/g) || []).length ? ";" : ",";
  const cab = splitCsvLine(linhas[0], delim).map(norm);
  const ix = (nome) => cab.indexOf(nome);
  const col = { inst: ix("instituicao"), tipo: ix("tipo"), emis: ix("emissor"), indx: ix("indexador"), taxa: ix("taxa"), prazo: ix("prazo_meses"), liq: ix("liquidez"), dt: ix("atualizado_em") };
  if (["inst", "tipo", "emis", "indx", "taxa", "prazo"].some((k) => col[k] < 0)) {
    erros.push("Cabeçalho inválido. Use: instituicao;tipo;emissor;indexador;taxa;prazo_meses;liquidez;atualizado_em");
    return { ofertas, erros };
  }
  linhas.slice(1).forEach((linha, i) => {
    const p = splitCsvLine(linha, delim);
    const n = i + 2;
    const inst = INSTITUICOES.find((x) => norm(x) === norm(p[col.inst] ?? ""));
    const tipo = TIPOS.find((x) => x === (p[col.tipo] ?? "").toUpperCase());
    const idx = norm(p[col.indx] ?? "");
    const taxa = num(p[col.taxa] ?? "");
    const prazo = parseInt(p[col.prazo] ?? "", 10);
    const emissor = (p[col.emis] ?? "").slice(0, 60);
    const data = col.dt >= 0 ? (p[col.dt] ?? "") : "";
    const dataIso = /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : isoFromBr(data);
    if (!inst) return erros.push(`Linha ${n}: instituição deve ser ${INSTITUICOES.join(", ")}.`);
    if (!tipo) return erros.push(`Linha ${n}: tipo deve ser ${TIPOS.join(", ")}.`);
    if (!INDEXADORES.includes(idx)) return erros.push(`Linha ${n}: indexador deve ser ${INDEXADORES.join(", ")}.`);
    if (!emissor) return erros.push(`Linha ${n}: emissor vazio.`);
    if (taxa === null || taxa <= 0 || taxa > (idx === "cdi" ? 200 : 40)) return erros.push(`Linha ${n}: taxa fora do esperado.`);
    if (!Number.isFinite(prazo) || prazo < 1 || prazo > 600) return erros.push(`Linha ${n}: prazo_meses inválido.`);
    const taxaTxt = idx === "cdi" ? `${fmt(taxa)}% do CDI` : idx === "ipca" ? `IPCA + ${fmt(taxa)}%` : `${fmt(taxa)}% a.a.`;
    ofertas.push({
      instituicao: inst,
      tipo,
      emissor,
      taxa: taxaTxt,
      prazo: prazo === 1 ? "1 mês" : `${prazo} meses`,
      liquidez: (p[col.liq] ?? "").slice(0, 40),
      atualizado_em: dataIso || null,
    });
  });
  return { ofertas, erros };
}

// ---------- B3 via brapi.dev ----------
export function lerCotacaoBrapi(json) {
  const r = json?.results?.[0];
  const pontos = Number(r?.regularMarketPrice);
  if (!Number.isFinite(pontos) || pontos <= 0) return null;
  const v = Number(r?.regularMarketChangePercent);
  const t = r?.regularMarketTime ? new Date(r.regularMarketTime) : null;
  const hora = t && !isNaN(t)
    ? t.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })
    : null;
  return { pontos, varDia: Number.isFinite(v) ? v : null, hora };
}
