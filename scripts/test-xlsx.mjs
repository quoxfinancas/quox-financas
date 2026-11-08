import { createRequire } from "module"; import fs from "fs";
const require = createRequire(import.meta.url); const X = require("../assessor-xlsx.js"), L = require("../assessor-lib.js");
const lanc = [{ id: "a1", tipo: "receita", valor: 5000, cat: "Salário", data: "2026-11-01", desc: "Salário", forma: "", banco: "" },
  { id: "a2", tipo: "despesa", valor: 800.5, cat: "Alimentação", data: "2026-11-03", desc: "Mercado =1+1", forma: "Pix", banco: "" }];
L.parcelar(300, 3, "2026-11-05", false).forEach(p => lanc.push({ id: "pabc1234_" + p.k + "_3", tipo: "despesa", valor: p.valor, cat: "Vestuário", data: p.data, desc: "Tênis & cia (" + p.k + "/3)", forma: "Crédito", banco: "Nubank" }));
const buf = X.gerar(X.planilhasQuox(lanc, { hoje: "2026-11-07" }));
fs.writeFileSync(process.argv[2], buf); console.log("ok", buf.length);
