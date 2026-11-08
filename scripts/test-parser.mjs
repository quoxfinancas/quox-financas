import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const P = require("../assessor-parser.js");
const hoje = new Date(2026, 10, 6); // 6/nov/2026
let falhas = 0;
function t(txt, esp) {
  const r = P.interpretar(txt, hoje);
  const erros = [];
  for (const k of Object.keys(esp)) if (r[k] !== esp[k]) erros.push(`${k}: esperado ${JSON.stringify(esp[k])}, veio ${JSON.stringify(r[k])}`);
  if (erros.length) { falhas++; console.log("FALHOU:", txt, "\n   ", erros.join("\n    "), "\n    ->", JSON.stringify(r)); }
}
t("gastei 30 no mercado no cartão Nubank", { ok: true, tipo: "despesa", valor: 30, cat: "Alimentação", forma: "Crédito", banco: "Nubank", data: "2026-11-06" });
t("Gastei R$ 30,00 no mercado, cartão nubank", { valor: 30, cat: "Alimentação", banco: "Nubank", forma: "Crédito" });
t("Recebi 3.500 de salário no Itaú", { tipo: "receita", valor: 3500, cat: "Salário", banco: "Itaú", forma: "" });
t("uber 18,50 no pix ontem", { cat: "Transporte", valor: 18.5, forma: "Pix", data: "2026-11-05" });
t("paguei 120 de luz no débito Santander", { cat: "Moradia", valor: 120, forma: "Débito", banco: "Santander" });
t("farmácia 45,90 cartão de crédito Inter", { cat: "Saúde", valor: 45.9, forma: "Crédito", banco: "Inter" });
t("paguei a fatura do cartão 1.250,40 no itau", { cat: "Cartão e dívidas", valor: 1250.4 });
t("netflix 55,90 no cartão c6", { cat: "Assinaturas", valor: 55.9, banco: "C6 Bank" });
t("comprei um tênis por 299 em 3x no cartão da Renner", { cat: "Compras", valor: 299, forma: "Crédito", banco: "Renner" });
t("gastei 2 mil na reforma", { valor: 2000, cat: "Moradia" });
t("recebi 800 de freela dia 3", { tipo: "receita", cat: "Renda extra", valor: 800, data: "2026-11-03" });
t("almoço 35 dinheiro", { cat: "Alimentação", forma: "Dinheiro", valor: 35 });
t("mercado livre 150 no cartão nubank", { cat: "Compras", valor: 150 });
t("gastei 25 no ifood", { cat: "Alimentação", valor: 25 });
t("internet 99,90 boleto", { cat: "Moradia", valor: 99.9, forma: "Boleto" });
t("gastei 50 na 99 hoje", { cat: "Transporte", valor: 50 });
t("gastei 12/10 no mercado 80", { valor: 80, data: "2026-10-12" });
t("gasolina R$ 200 no cartão do banco do brasil", { cat: "Transporte", valor: 200, banco: "Banco do Brasil" });
t("dentista 350 em 2x", { cat: "Saúde", valor: 350, forma: "Crédito" });
t("aluguel 1800", { cat: "Moradia", valor: 1800, forma: "" });
t("recebi aluguel 1200", { tipo: "receita", cat: "Renda extra", valor: 1200 });
t("coisa qualquer 10", { cat: "Outros", valor: 10, semCategoria: true });
t("gastei muito hoje", { ok: false });
t("pet shop 90 pix", { cat: "Pets", valor: 90, forma: "Pix" });
t("salão 120 cartão nubank", { cat: "Beleza e cuidados", valor: 120 });
t("internet 100 pix", { cat: "Moradia" });
t("Gastei 30 no Mercado no cartão Nubank  ", { cat: "Alimentação" });
if (P.dividir("a 10\nb 20; c 30").length !== 3) { falhas++; console.log("dividir falhou"); }
if (P.categoriaCitada("quanto gastei com farmácia") !== "Saúde") { falhas++; console.log("categoriaCitada falhou"); }
const H = new Date(2026, 10, 7);
const c1 = P.interpretarConta("conta de luz 150 vence dia 10", H);
if (!(c1.ok && c1.valor === 150 && c1.venc === "2026-11-10" && c1.cat === "Moradia")) { falhas++; console.log("conta 1 falhou", c1); }
const c2 = P.interpretarConta("internet 99,90 vence dia 5 todo mês", H);
if (!(c2.ok && c2.venc === "2026-12-05" && c2.repete)) { falhas++; console.log("conta 2 falhou", c2); }
if (P.interpretarConta("aluguel 1500 vence 15/11", H).venc !== "2026-11-15") { falhas++; console.log("conta 3 falhou"); }
if (P.interpretarConta("lembrar de pagar 80 de escola amanhã", H).venc !== "2026-11-08") { falhas++; console.log("conta 4 falhou"); }
if (P.interpretarConta("vence dia 31 cartão nubank 800", H).venc !== "2026-11-30") { falhas++; console.log("conta 5 falhou"); }
if (P.ehConta("gastei 30 no mercado")) { falhas++; console.log("ehConta falso positivo"); }
const l1 = P.interpretarLimite("limite alimentação 800");
if (!(l1.ok && l1.cat === "Alimentação" && l1.valor === 800)) { falhas++; console.log("limite 1 falhou", l1); }
if (P.interpretarLimite("limite do cartão 5000").ok) { falhas++; console.log("limite sem categoria deveria falhar"); }
console.log(falhas ? falhas + " falha(s)" : "Parser: todos os testes passaram.");
process.exit(falhas ? 1 : 0);
