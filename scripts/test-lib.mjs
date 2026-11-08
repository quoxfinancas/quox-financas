import { createRequire } from "module";
const L = createRequire(import.meta.url)("../assessor-lib.js");
let f = 0;
function eq(a, b, m) { if (JSON.stringify(a) !== JSON.stringify(b)) { f++; console.log("FALHA", m, "\n  obtido:", JSON.stringify(a), "\n  esperado:", JSON.stringify(b)); } }
// números e datas
eq(L.numero("1.234,56"), 1234.56, "num br"); eq(L.numero("-1234.56"), -1234.56, "num us"); eq(L.numero("R$ 1.234,56"), 1234.56, "num R$");
eq(L.numero("(123,45)"), -123.45, "parênteses"); eq(L.numero("123,45-"), -123.45, "menos no fim"); eq(L.numero("1.234"), 1234, "milhar"); eq(L.numero("12.5"), 12.5, "decimal ponto"); eq(L.numero("abc"), NaN, "texto");
eq(L.data("05/11/2026"), "2026-11-05", "data br"); eq(L.data("2026-11-05"), "2026-11-05", "data iso"); eq(L.data("20261105120000[-3:GMT]"), "2026-11-05", "data ofx"); eq(L.data("31/02/2026"), "", "data inválida"); eq(L.data("05/11/26"), "2026-11-05", "ano curto");
// OFX
const ofx = `OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>\n<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20261103120000[-3:GMT]\n<TRNAMT>-45.90\n<FITID>abc1\n<MEMO>COMPRA MERCADO XYZ\n</STMTTRN>\n<STMTTRN>\n<TRNTYPE>CREDIT\n<DTPOSTED>20261105\n<TRNAMT>3500.00\n<FITID>abc2\n<NAME>SALARIO EMPRESA\n</STMTTRN>\n</BANKTRANLIST></STMTRS></STMTRNRS></BANKMSGSRSV1></OFX>`;
const o = L.lerExtrato(ofx, "x.ofx");
eq(o.formato, "OFX", "formato ofx"); eq(o.rows.length, 2, "ofx 2 linhas"); eq(o.rows[0], { data: "2026-11-03", valor: -45.9, desc: "COMPRA MERCADO XYZ", fitid: "abc1" }, "ofx linha 1"); eq(o.rows[1].valor, 3500, "ofx linha 2");
// CSV banco BR (;)
const csv1 = `Extrato;;;\nData;Histórico;Valor\n03/11/2026;"PIX ENVIADO, JOAO";-120,00\n05/11/2026;SALARIO;3.500,00\n`;
const c1 = L.lerExtrato(csv1, "e.csv"); eq(c1.rows.length, 2, "csv1 linhas"); eq(c1.rows[0], { data: "2026-11-03", valor: -120, desc: "PIX ENVIADO, JOAO", fitid: "" }, "csv1 l1"); eq(c1.rows[1].valor, 3500, "csv1 l2"); eq(c1.invertir, false, "csv1 sem inverter");
// CSV Nubank cartão
const csv2 = `date,category,title,amount\n2026-11-02,restaurante,Ifood,45.90\n2026-11-03,,Pagamento recebido,-500.00\n`;
const c2 = L.lerExtrato(csv2, "n.csv"); eq(c2.rows.length, 2, "nubank linhas"); eq(c2.rows[0], { data: "2026-11-02", valor: 45.9, desc: "Ifood", fitid: "" }, "nubank l1"); eq(c2.invertir, true, "nubank inverte");
// CSV débito/crédito separados
const csv3 = `Data;Descrição;Débito;Crédito\n01/11/2026;Aluguel;1.500,00;\n02/11/2026;Salário;;3.000,00\n`;
const c3 = L.lerExtrato(csv3, "d.csv"); eq(c3.rows.map(r => r.valor), [-1500, 3000], "débito/crédito");
// CSV sem cabeçalho
const c4 = L.lerExtrato(`03/11/2026;Mercado;-50,00\n04/11/2026;Padaria;-12,50\n`, "s.csv"); eq(c4.rows.length, 2, "sem cabeçalho"); eq(c4.rows[1].desc, "Padaria", "sem cabeçalho desc");
eq(L.lerExtrato("lixo qualquer", "z.csv").rows.length, 0, "arquivo inválido");
// id estável
eq(L.idImport(o.rows[0]) === L.idImport({ ...o.rows[0] }), true, "id estável");
eq(L.idImport(o.rows[0]).length < 30, true, "id curto");
// faturas: fecha dia 10, vence dia 17
const car = { nome: "Nubank", fecha: 10, vence: 17, limite: 3000, pagas: [] };
const lan = [
  { tipo: "despesa", forma: "Crédito", banco: "Nubank", data: "2026-10-09", valor: 100 },
  { tipo: "despesa", forma: "Crédito", banco: "nubank", data: "2026-10-11", valor: 200 },
  { tipo: "despesa", forma: "Crédito", banco: "Nubank", data: "2026-11-05", valor: 50 },
  { tipo: "despesa", forma: "Pix", banco: "Nubank", data: "2026-11-05", valor: 999 },
  { tipo: "despesa", forma: "Crédito", banco: "Itaú", data: "2026-11-05", valor: 999 },
];
eq(L.faturaDaCompra("2026-10-10", 10), "2026-10", "fecha no dia"); eq(L.faturaDaCompra("2026-10-11", 10), "2026-11", "depois do fechamento"); eq(L.faturaDaCompra("2026-12-20", 10), "2027-01", "virada de ano");
const fs = L.faturas(car, lan, "2026-11-07");
eq(fs.map(x => [x.ym, x.total, x.fecha, x.vence, x.estado]), [["2026-10", 100, "2026-10-10", "2026-10-17", "vencida"], ["2026-11", 250, "2026-11-10", "2026-11-17", "aberta"]], "faturas");
eq(L.limiteUsado(fs), 350, "limite usado");
car.pagas = ["2026-10"]; eq(L.faturas(car, lan, "2026-11-07")[0].estado, "paga", "fatura paga"); eq(L.limiteUsado(L.faturas(car, lan, "2026-11-07")), 250, "limite após pagar");
eq(L.faturas({ nome: "X", fecha: 25, vence: 5 }, [{ tipo: "despesa", forma: "Crédito", banco: "X", data: "2026-11-20", valor: 10 }], "2026-11-26")[0].vence, "2026-12-05", "vencimento no mês seguinte");
eq(L.faturas({ nome: "X", fecha: 25, vence: 5 }, [{ tipo: "despesa", forma: "Crédito", banco: "X", data: "2026-11-20", valor: 10 }], "2026-11-26")[0].estado, "fechada", "fechada");
// metas
eq(L.porMes({ alvo: 1200, guardado: 0, prazo: "2027-05-07" }, "2026-11-07"), 200, "por mês");
eq(L.porMes({ alvo: 1000, guardado: 1000, prazo: "2027-05-07" }, "2026-11-07"), null, "meta atingida");
// parcelamento
eq(L.parcelar(100, 3, "2026-11-07", false).map(p => [p.data, p.valor]), [["2026-11-07", 33.33], ["2026-12-07", 33.33], ["2027-01-07", 33.34]], "100 em 3x");
eq(L.parcelar(100, 3, "2026-11-07", true).map(p => p.valor), [100, 100, 100], "3x de 100");
eq(L.parcelar(1200, 12, "2026-01-31", false).map(p => p.data).slice(0, 3), ["2026-01-31", "2026-02-28", "2026-03-31"], "dia 31 ajusta no fim do mês");
eq(Math.round(L.parcelar(1000, 7, "2026-11-07", false).reduce((s, p) => s + p.valor, 0) * 100) / 100, 1000, "soma fecha o total");
eq(L.infoParcela("pab12cd_2_10"), { g: "ab12cd", k: 2, n: 10 }, "info parcela"); eq(L.infoParcela("abc"), null, "não é parcela");
// parcelas nas faturas: compra dia 15, fecha 10 → 1ª parcela na fatura do mês seguinte
const par = L.parcelar(300, 3, "2026-11-15", false).map(p => ({ tipo: "despesa", forma: "Crédito", banco: "Nubank", data: p.data, valor: p.valor }));
const fp = L.faturas({ nome: "Nubank", fecha: 10, vence: 17, pagas: [] }, par, "2026-11-20");
eq(fp.map(f => [f.ym, f.total]), [["2026-12", 100], ["2027-01", 100], ["2027-02", 100]], "parcelas em faturas diferentes");
eq(L.limiteUsado(fp), 300, "limite compromete o total da compra");
// desafios e resumo semanal
const dl = (data, cat, valor, tipo = "despesa") => ({ tipo, cat, valor, data });
eq(L.addDias("2026-02-27", 3), "2026-03-02", "addDias");
let pd = L.progressoDesafio({ tipo: "sem", cat: "Lazer", dias: 7, ini: "2026-11-01" }, [dl("2026-11-02", "Mercado", 10)], "2026-11-03");
eq([pd.st, pd.dec, Math.round(pd.pct)], ["andamento", 3, 43], "sem: andamento");
eq(L.progressoDesafio({ tipo: "sem", cat: "Lazer", dias: 7, ini: "2026-11-01" }, [dl("2026-11-02", "Lazer", 10)], "2026-11-03").st, "perdido", "sem: perdido");
eq(L.progressoDesafio({ tipo: "sem", cat: "Lazer", dias: 7, ini: "2026-11-01" }, [], "2026-11-08").st, "ganho", "sem: ganho");
pd = L.progressoDesafio({ tipo: "teto", cat: "Lazer", alvo: 100, dias: 30, ini: "2026-11-01" }, [dl("2026-11-02", "Lazer", 60), dl("2026-11-04", "Lazer", 30)], "2026-11-10");
eq([pd.st, pd.gasto, Math.round(pd.pct)], ["andamento", 90, 90], "teto andamento");
eq(L.progressoDesafio({ tipo: "teto", cat: "Lazer", alvo: 100, dias: 30, ini: "2026-11-01" }, [dl("2026-11-02", "Lazer", 160)], "2026-11-10").st, "perdido", "teto estourado");
eq(L.progressoDesafio({ tipo: "teto", cat: "Lazer", alvo: 100, dias: 7, ini: "2026-11-01" }, [dl("2026-11-02", "Lazer", 60)], "2026-11-09").st, "ganho", "teto ganho");
pd = L.progressoDesafio({ tipo: "anotar", dias: 3, ini: "2026-11-01" }, [dl("2026-11-01", "X", 1), dl("2026-11-02", "X", 1)], "2026-11-03");
eq([pd.st, pd.feitos], ["andamento", 2], "anotar andamento (hoje ainda aberto)");
eq(L.progressoDesafio({ tipo: "anotar", dias: 3, ini: "2026-11-01" }, [dl("2026-11-01", "X", 1), dl("2026-11-03", "X", 1)], "2026-11-03").st, "perdido", "anotar: dia sem lançamento");
eq(L.progressoDesafio({ tipo: "anotar", dias: 3, ini: "2026-11-01" }, [dl("2026-11-01", "X", 1), dl("2026-11-02", "X", 1), dl("2026-11-03", "X", 1)], "2026-11-04").st, "ganho", "anotar ganho");
eq(L.progressoDesafio({ tipo: "sem", cat: "Lazer", dias: 7, ini: "2026-11-10" }, [], "2026-11-08").naoComecou, true, "ainda não começou");
const rs = L.resumoSemana([dl("2026-11-08", "Lazer", 50), dl("2026-11-05", "Mercado", 100), dl("2026-11-03", "Salário", 1000, "receita"), dl("2026-11-01", "Mercado", 100), dl("2026-10-25", "Mercado", 400)], "2026-11-08");
eq([rs.desp, rs.rec, rs.despAnt, rs.n, rs.dias, rs.top], [150, 1000, 100, 3, 3, ["Mercado", 100]], "resumo semana");
eq(Math.round(rs.delta), 50, "delta de despesas");
console.log(f ? f + " falha(s)" : "Lib: todos os testes passaram."); process.exit(f ? 1 : 0);
