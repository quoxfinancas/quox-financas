// Testes simples do parser. Uso: node scripts/test.mjs
import assert from "node:assert/strict";
import { createCsvReader, isoFromBr, num, inRange } from "./lib.mjs";

assert.equal(num("13,75"), 13.75);
assert.equal(num("13.75"), 13.75);
assert.equal(num("1.234,5"), 1234.5);
assert.equal(num("abc"), null);
assert.equal(isoFromBr("05/11/2026"), "2026-11-05");
assert.equal(isoFromBr("2026-11-05"), null);
assert.ok(inRange(13.7, 0, 40));
assert.ok(!inRange(NaN, 0, 40));

const csv = [
  "Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha;PU Base Manha",
  "Tesouro Selic;01/03/2031;27/10/2026;0,1044;0,1444;20.110,80;20.100,00;20.109,00",
  "Tesouro Selic;01/03/2031;28/10/2026;0,1034;0,1434;20.101,00;20.100,00;20.109,00",
  "Tesouro Selic;01/03/2031;26/10/2026;0,0900;0,1;20.000,00;20.000,00;20.000,00",
  "Tesouro Selic;01/03/2029;28/10/2026;0,0500;0,1;1,00;1,00;1,00",
  "Tesouro IPCA+;15/08/2032;28/10/2026;7,93;8,03;3.075,57;3.070,00;3.070,00",
  "Tesouro IPCA+ com Juros Semestrais;15/08/2032;28/10/2026;6,10;6,2;4.000,00;4.000,00;4.000,00",
  "Tesouro Prefixado;01/01/2032;28/10/2026;15,32;15,42;479,26;478,00;478,00",
  "Tesouro Prefixado com Juros Semestrais;01/01/2037;28/10/2026;15,23;15,3;780,26;780,00;780,00",
];
const r = createCsvReader();
for (const l of csv) r.push(l + "\r");
const out = r.result();
assert.ok(r.headerFound());
assert.deepEqual(out.get("spSel"), { iso: "2026-10-28", value: 0.1034 });
assert.deepEqual(out.get("ipcaReal"), { iso: "2026-10-28", value: 7.93 });
assert.deepEqual(out.get("pre"), { iso: "2026-10-28", value: 15.32 });

const vazio = createCsvReader();
vazio.push("coluna;outra");
assert.ok(!vazio.headerFound());

console.log("Todos os testes passaram.");

// ---- ofertas e B3 ----
import { parseOfertas, lerCotacaoBrapi } from "./lib.mjs";
const of = parseOfertas([
  "instituicao;tipo;emissor;indexador;taxa;prazo_meses;liquidez;atualizado_em",
  "XP;CDB;Banco Exemplo;cdi;112,5;24;No vencimento;05/11/2026",
  "Rico;LCI;Banco Exemplo;cdi;93;12;;2026-11-05",
  "Clear;CDB;Banco Exemplo;ipca;7,2;36;No vencimento;05/11/2026",
  "Outra;CDB;Banco Exemplo;cdi;100;12;;05/11/2026",
  "XP;CDB;Banco Exemplo;cdi;999;12;;05/11/2026",
].join("\n"));
assert.equal(of.ofertas.length, 3);
assert.equal(of.erros.length, 2);
assert.equal(of.ofertas[0].taxa, "112,5% do CDI");
assert.equal(of.ofertas[0].atualizado_em, "2026-11-05");
assert.equal(of.ofertas[2].taxa, "IPCA + 7,2%");
const csvVirgula = parseOfertas('instituicao,tipo,emissor,indexador,taxa,prazo_meses,liquidez,atualizado_em\nXP,LCA,"Banco, Exemplo",cdi,"91,5",12,,05/11/2026');
assert.equal(csvVirgula.ofertas[0].emissor, "Banco, Exemplo");
assert.equal(csvVirgula.ofertas[0].taxa, "91,5% do CDI");
assert.equal(parseOfertas("a;b;c").erros.length, 1);
assert.equal(parseOfertas("instituicao;tipo;emissor;indexador;taxa;prazo_meses;liquidez;atualizado_em\n").ofertas.length, 0);

const q = lerCotacaoBrapi({ results: [{ regularMarketPrice: 140500.5, regularMarketChangePercent: -0.42, regularMarketTime: "2026-11-05T19:10:00.000Z" }] });
assert.equal(q.pontos, 140500.5);
assert.equal(q.varDia, -0.42);
assert.match(q.hora, /^\d{2}:\d{2}$/);
assert.equal(lerCotacaoBrapi({ results: [] }), null);
console.log("Testes de ofertas e B3 passaram.");
