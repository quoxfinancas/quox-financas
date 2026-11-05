// Atualiza data.json com dados de fontes oficiais ou da curadoria:
//   - Banco Central (SGS): Selic meta (432), CDI anualizado (4389), IPCA 12 meses (13522)
//   - Tesouro Transparente (CSV): taxas dos títulos Tesouro Selic, IPCA+ e Prefixado
//   - B3 (Ibovespa) via brapi.dev: só roda se a variável BRAPI_TOKEN existir
//   - Ofertas de CDB/LCI/LCA: de OFERTAS_CSV_URL (planilha publicada) ou do arquivo ofertas.csv
// Cada fonte é independente: se uma falhar, o valor anterior é mantido.
// Requer Node 18 ou superior. Uso: node scripts/update.mjs

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { TARGETS, createCsvReader, inRange, isoFromBr, num, parseOfertas, lerCotacaoBrapi } from "./lib.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(RAIZ, "data.json");
const OFERTAS_LOCAL = path.join(RAIZ, "ofertas.csv");
const UA = "quox-financas-atualizador";
const CKAN = "https://www.tesourotransparente.gov.br/ckan/api/3/action/package_show?id=taxas-dos-titulos-ofertados-pelo-tesouro-direto";

const BCB = [
  { key: "selic", code: 432, min: 0, max: 40 },
  { key: "cdi", code: 4389, min: 0, max: 40 },
  { key: "ipca", code: 13522, min: -5, max: 40 },
];

async function get(url, ms = 30000, headers = {}) {
  let erro;
  for (let i = 1; i <= 3; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: AbortSignal.timeout(ms) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      erro = e;
      await new Promise((r) => setTimeout(r, i * 2000));
    }
  }
  throw new Error(`${url.split("?")[0]}: ${erro?.message ?? erro}`);
}

async function lerBanco() {
  const rates = {};
  let data = null;
  for (const s of BCB) {
    const res = await get(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${s.code}/dados/ultimos/1?formato=json`);
    const [ponto] = await res.json();
    const valor = num(ponto?.valor);
    if (!inRange(valor, s.min, s.max)) throw new Error(`Valor fora do esperado na série ${s.code}: ${ponto?.valor}`);
    rates[s.key] = valor;
    if (s.key === "selic") data = isoFromBr(ponto.data);
  }
  return { rates, source: ["bcb", data] };
}

async function lerTesouro() {
  const meta = await (await get(CKAN)).json();
  const recursos = meta?.result?.resources ?? [];
  const csv = recursos.find((r) => /csv/i.test(r.format ?? "") || /\.csv$/i.test(r.url ?? ""));
  const url = process.env.TESOURO_CSV_URL || csv?.url;
  if (!url) throw new Error("Não achei o CSV do Tesouro Transparente no catálogo.");

  const res = await get(url, 300000);
  const leitor = createCsvReader(TARGETS);
  const dec = new TextDecoder("latin1");
  let resto = "";
  for await (const pedaco of res.body) {
    const linhas = (resto + dec.decode(pedaco, { stream: true })).split("\n");
    resto = linhas.pop();
    for (const l of linhas) leitor.push(l);
  }
  leitor.push(resto);
  if (!leitor.headerFound()) throw new Error("Cabeçalho do CSV do Tesouro não reconhecido (o layout pode ter mudado).");

  const rates = {};
  let data = null;
  for (const t of TARGETS) {
    const r = leitor.result().get(t.key);
    if (!r) throw new Error(`Título não encontrado no CSV: ${t.tipo} ${t.ano}. Ele pode ter saído de oferta.`);
    if (!inRange(r.value, t.min, t.max)) throw new Error(`Taxa fora do esperado para ${t.tipo} ${t.ano}: ${r.value}`);
    rates[t.key] = r.value;
    if (!data || r.iso > data) data = r.iso;
  }
  return { rates, source: ["tesouro", data] };
}

async function lerB3() {
  const token = process.env.BRAPI_TOKEN;
  if (!token) {
    console.log("B3: BRAPI_TOKEN não configurado, etapa ignorada.");
    return null;
  }
  const res = await get("https://brapi.dev/api/quote/%5EBVSP", 30000, { Authorization: `Bearer ${token}` });
  const ibov = lerCotacaoBrapi(await res.json());
  if (!ibov) throw new Error("Resposta da brapi sem cotação do Ibovespa.");
  return { market: { ibov }, source: ["b3", new Date().toISOString().slice(0, 10)] };
}

async function lerOfertas() {
  const url = process.env.OFERTAS_CSV_URL;
  const texto = url ? await (await get(url)).text() : await readFile(OFERTAS_LOCAL, "utf8");
  const { ofertas, erros } = parseOfertas(texto);
  erros.forEach((e) => console.warn(`Ofertas: ${e}`));
  if (!ofertas.length && erros.length && /Cabeçalho/.test(erros[0])) throw new Error(erros[0]);
  return { ofertas };
}

async function main() {
  let atual = { updatedAt: null, sources: {}, rates: {} };
  try {
    atual = JSON.parse(await readFile(OUT, "utf8"));
  } catch {}
  atual.sources ??= {};
  atual.rates ??= {};

  let tentadas = 0;
  let falhas = 0;
  for (const [nome, fonte] of [
    ["Banco Central", lerBanco],
    ["Tesouro Transparente", lerTesouro],
    ["B3", lerB3],
    ["Ofertas de renda fixa", lerOfertas],
  ]) {
    try {
      const r = await fonte();
      if (!r) continue;
      tentadas++;
      if (r.rates) Object.assign(atual.rates, r.rates);
      if (r.market) atual.market = { ...(atual.market ?? {}), ...r.market };
      if (r.ofertas) atual.ofertas = r.ofertas;
      if (r.source) atual.sources[r.source[0]] = r.source[1];
      console.log(`OK ${nome}`);
    } catch (e) {
      tentadas++;
      falhas++;
      console.error(`FALHA ${nome}: ${e.message}. Mantendo os valores anteriores.`);
    }
  }

  if (tentadas > falhas) {
    atual.updatedAt = new Date().toISOString();
    await writeFile(OUT, JSON.stringify(atual, null, 2) + "\n");
    console.log("data.json atualizado.");
  }
  if (tentadas > 0 && falhas === tentadas) process.exitCode = 1;
}

main();
