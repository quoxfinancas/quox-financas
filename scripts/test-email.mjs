import * as M from "../supabase/functions/resumo-semanal/resumo.js";
let f = 0; const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { f++; console.log("FALHOU:", m, JSON.stringify(a), "!=", JSON.stringify(b)); } };
const l = (data, cat, valor, tipo = "despesa") => ({ tipo, cat, valor, data });
eq(M.hojeSP(new Date("2026-11-09T01:30:00Z")), "2026-11-08", "hoje em Brasília (22:30 do dia 8)");
eq(M.diaDaSemana("2026-11-08"), 0, "8/11/2026 é domingo");
const lanc = [l("2026-11-08", "Lazer", "50.00"), l("2026-11-05", "Mercado", 100), l("2026-11-03", "Salário", 1000, "receita"), l("2026-11-01", "Mercado", 100)];
const r = M.resumoSemana(lanc, "2026-11-08");
eq([r.desp, r.rec, r.despAnt, r.n, r.top], [150, 1000, 100, 3, ["Mercado", 100]], "resumo");
const m = M.montarEmail(r, { nome: "<b>Ana Silva", linkCancelar: "https://x/c?t=1", site: "https://quoxfinancas.com.br" });
eq(m.html.includes("Olá, &lt;b&gt;Ana!"), true, "nome escapado"); eq(m.html.includes("<b>Ana"), false, "sem HTML injetado");
eq(m.html.includes("Parar de receber este e-mail"), true, "link de cancelar"); eq(m.texto.includes("https://x/c?t=1"), true, "texto com link");
eq(m.assunto.replace(/\s/g, " ").includes("R$ 150,00"), true, "assunto com valor");
// processar com dependências falsas
const enviados = [], marcados = [];
const base = { hoje: "2026-11-08", site: "https://quoxfinancas.com.br",
  prefs: [{ user_id: "a", token: "ta" }, { user_id: "b", token: "tb" }, { user_id: "c", token: "tc" }, { user_id: "d", token: "td" }],
  buscarUsuario: async (id) => id === "c" ? null : { email: id + "@x.com", nome: "Pessoa " + id },
  buscarLanc: async (id) => id === "a" ? lanc : [],
  enviar: async (x) => { if (x.para === "d@x.com") throw new Error("Resend 429"); enviados.push(x.para); },
  marcar: async (id) => marcados.push(id) };
base.buscarLanc = async (id) => (id === "a" || id === "d") ? lanc : [];
const out = await M.processar(base);
eq(out.enviados, 1, "1 enviado"); eq(out.pulados, 2, "sem dados e sem usuário são pulados"); eq(out.erros, 1, "1 erro"); eq(enviados, ["a@x.com"], "só a recebeu");
eq(marcados.sort(), ["a", "b", "c"], "d (erro) não é marcado, para tentar de novo"); eq(out.detalhes[0].includes("429"), true, "detalhe do erro");
console.log(f ? f + " falha(s)" : "E-mail: todos os testes passaram."); process.exit(f ? 1 : 0);
