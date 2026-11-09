/* QUOX - Valuation: motor de cálculo (puro, sem tela). Funciona no navegador (window.QuoxVal) e no Node (testes).
   ATENÇÃO: os múltiplos abaixo são FAIXAS INDICATIVAS para pequenas e médias empresas brasileiras, não dados de mercado em tempo real.
   Revise com frequência. Para ajustar, edite SETORES. [min, central, máx] */
(function (root) {
  var SETORES = {
    servicos:   { nome: "Serviços em geral",            ebitda: [3, 4.5, 6],   receita: [0.5, 0.8, 1.2] },
    comercio:   { nome: "Comércio / varejo",            ebitda: [3, 4, 5.5],   receita: [0.2, 0.4, 0.6] },
    industria:  { nome: "Indústria",                    ebitda: [4, 5.5, 7],   receita: [0.5, 0.7, 1.0] },
    tecnologia: { nome: "Tecnologia / software",        ebitda: [5, 7, 10],    receita: [1.5, 2.5, 4] },
    saude:      { nome: "Saúde e bem-estar",            ebitda: [5, 6.5, 9],   receita: [0.8, 1.2, 2] },
    alimentacao:{ nome: "Alimentação (bares, restaurantes)", ebitda: [3, 4, 5], receita: [0.4, 0.6, 0.9] },
    educacao:   { nome: "Educação",                     ebitda: [4, 5, 7],     receita: [0.7, 1.0, 1.5] },
    construcao: { nome: "Construção e imobiliário",     ebitda: [3, 4, 5.5],   receita: [0.3, 0.5, 0.8] },
    agro:       { nome: "Agronegócio",                  ebitda: [3.5, 4.5, 6], receita: [0.6, 0.9, 1.3] },
    logistica:  { nome: "Transporte e logística",       ebitda: [3.5, 4.5, 6], receita: [0.4, 0.6, 0.9] },
    ecommerce:  { nome: "E-commerce",                   ebitda: [4, 5.5, 8],   receita: [0.5, 0.9, 1.5] },
    outros:     { nome: "Outros",                       ebitda: [3, 4.5, 6],   receita: [0.4, 0.7, 1.0] }
  };
  var n = function (x) { x = Number(x); return isFinite(x) ? x : 0; };
  var clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  var lerp = function (r, p) { return r[0] + (r[2] - r[0]) * p; };

  /* "1.234,56" -> 1234.56 */
  function parseBR(s) {
    if (typeof s === "number") return s;
    s = String(s == null ? "" : s).replace(/[R$\s%]/g, "");
    if (!s) return 0;
    if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    var v = parseFloat(s);
    return isFinite(v) ? v : 0;
  }

  /* Posição (0 a 1) dentro da faixa do setor, de acordo com a qualidade da empresa. */
  function posicao(d) {
    var p = 0.5, f = [], rec = n(d.receita), eb = n(d.ebitda), cres = n(d.crescimento);
    var mg = rec > 0 ? eb / rec * 100 : 0;
    function add(v, txt) { p += v; f.push({ v: v, txt: txt }); }
    if (cres >= 20) add(0.12, "Crescimento forte (acima de 20% ao ano)"); else if (cres >= 8) add(0.05, "Crescimento saudável"); else if (cres < 0) add(-0.12, "Receita em queda"); else if (cres < 3) add(-0.04, "Crescimento baixo");
    if (mg >= 25) add(0.08, "Margem operacional alta"); else if (mg > 0 && mg < 8) add(-0.06, "Margem operacional baixa");
    var rc = n(d.recorrente);
    if (rc >= 60) add(0.1, "Boa parte da receita é recorrente"); else if (rc >= 30) add(0.04, "Alguma receita recorrente");
    var dd = n(d.dependenciaDono);
    if (dd === 2) add(-0.12, "Empresa depende muito do dono"); else if (dd === 0) add(0.06, "Operação funciona sem depender do dono");
    var an = n(d.anos);
    if (an >= 10) add(0.05, "Empresa estabelecida (10 anos ou mais)"); else if (an > 0 && an < 3) add(-0.08, "Empresa jovem (menos de 3 anos)");
    return { p: clamp(p, 0.05, 0.95), fatores: f };
  }

  /* Estimativa rápida (parte gratuita): múltiplos de EBITDA e de receita. */
  function estimativa(d) {
    var s = SETORES[d.setor] || SETORES.outros, rec = n(d.receita), eb = n(d.ebitda), dl = n(d.dividaLiquida);
    var ps = posicao(d), vals = [], i, k = [-0.2, 0, 0.2];
    for (i = 0; i < 3; i++) {
      var p = clamp(ps.p + k[i], 0, 1), vr = rec * lerp(s.receita, p), ve = eb * lerp(s.ebitda, p);
      var ev = eb > 0 ? 0.7 * ve + 0.3 * vr : 0.8 * vr;   // sem lucro operacional: só receita, com desconto
      vals.push(Math.max(0, ev));
    }
    var eq = vals.map(function (v) { return Math.max(0, v - dl); });
    return { ev: { min: vals[0], mid: vals[1], max: vals[2] }, equity: { min: eq[0], mid: eq[1], max: eq[2] }, fatores: ps.fatores, posicao: ps.p, setor: s.nome, semLucro: !(eb > 0) };
  }

  /* Fluxo de caixa descontado (DCF) em 5 anos. */
  function dcf(d) {
    var rec0 = n(d.receita), r = n(d.taxaDesconto) / 100, g = n(d.crescPerpetuo) / 100, aliq = n(d.aliquota) / 100;
    var cresc = (d.crescimentos && d.crescimentos.length ? d.crescimentos : [n(d.crescimento), n(d.crescimento), n(d.crescimento), n(d.crescimento), n(d.crescimento)]).map(function (x) { return n(x) / 100; });
    var mg = (d.margens && d.margens.length ? d.margens : [n(d.margemEbitda), n(d.margemEbitda), n(d.margemEbitda), n(d.margemEbitda), n(d.margemEbitda)]).map(function (x) { return n(x) / 100; });
    var dep = n(d.depreciacao) / 100, capex = n(d.capex) / 100, nwc = n(d.capitalGiro) / 100;
    if (!(r > g)) return { erro: "A taxa de desconto precisa ser maior que o crescimento na perpetuidade." };
    var anos = [], rec = rec0, pv = 0, i;
    for (i = 0; i < 5; i++) {
      var ant = rec; rec = ant * (1 + cresc[i] || 1);
      var ebitda = rec * mg[i], deprec = rec * dep, ebit = ebitda - deprec, imp = ebit > 0 ? ebit * aliq : 0;
      var fcf = ebit - imp + deprec - rec * capex - (rec - ant) * nwc;
      var vp = fcf / Math.pow(1 + r, i + 1); pv += vp;
      anos.push({ ano: i + 1, receita: rec, ebitda: ebitda, ebit: ebit, imposto: imp, capex: rec * capex, dNwc: (rec - ant) * nwc, fcf: fcf, vp: vp });
    }
    var fcfT = anos[4].fcf, tv = fcfT * (1 + g) / (r - g), pvTv = tv / Math.pow(1 + r, 5);
    var ev = pv + pvTv;
    return { anos: anos, pvFluxos: pv, tv: tv, pvTv: pvTv, ev: ev, pesoTv: ev > 0 ? pvTv / ev : 0 };
  }

  /* Tabela de sensibilidade: taxa de desconto x crescimento na perpetuidade. */
  function sensibilidade(d) {
    var dr = [-4, -2, 0, 2, 4], dg = [-1, -0.5, 0, 0.5, 1], lin = [];
    dr.forEach(function (a) {
      var row = { taxa: n(d.taxaDesconto) + a, valores: [] };
      dg.forEach(function (b) {
        var o = {}, k; for (k in d) o[k] = d[k];
        o.taxaDesconto = n(d.taxaDesconto) + a; o.crescPerpetuo = n(d.crescPerpetuo) + b;
        var x = dcf(o); row.valores.push(x.erro ? null : x.ev);
      });
      lin.push(row);
    });
    return { crescimentos: dg.map(function (b) { return n(d.crescPerpetuo) + b; }), linhas: lin };
  }

  /* Valor patrimonial ajustado (ativos - passivos, com ajustes informados). */
  function patrimonial(b) {
    var ativos = ["caixa", "contasReceber", "estoques", "imobilizado", "outrosAtivos"].reduce(function (s, k) { return s + n(b[k]); }, 0) + n(b.ajusteAtivos);
    var passivos = ["fornecedores", "dividasFinanceiras", "impostosPagar", "outrosPassivos"].reduce(function (s, k) { return s + n(b[k]); }, 0);
    return { ativos: ativos, passivos: passivos, pl: ativos - passivos };
  }

  /* Ajustes qualitativos sobre o valor (negativos descontam, positivos acrescentam). */
  function ajustes(q) {
    var l = [], t = 0;
    function a(v, txt) { l.push({ v: v, txt: txt }); t += v; }
    if (n(q.dependenciaDono) === 2) a(-0.1, "Forte dependência do dono"); else if (n(q.dependenciaDono) === 1) a(-0.04, "Alguma dependência do dono");
    if (n(q.concentracaoClientes) >= 40) a(-0.1, "Maior cliente representa 40% ou mais da receita"); else if (n(q.concentracaoClientes) >= 20) a(-0.04, "Maior cliente representa 20% a 40% da receita");
    if (q.informalidade === "sim") a(-0.08, "Parte das operações sem registro formal"); 
    if (q.contabilidadeOrganizada === "nao") a(-0.05, "Contabilidade e controles pouco organizados");
    if (n(q.recorrente) >= 60) a(0.05, "Receita majoritariamente recorrente");
    if (q.contratosLongos === "sim") a(0.03, "Contratos de longo prazo");
    if (q.marcaForte === "sim") a(0.03, "Marca ou carteira de clientes consolidada");
    if (q.processosJudiciais === "sim") a(-0.06, "Processos judiciais relevantes");
    t = clamp(t, -0.25, 0.1);
    return { lista: l, total: t };
  }

  /* Valuation completo (parte paga): combina DCF (55%) e múltiplos (45%), aplica ajustes qualitativos e usa o patrimônio ajustado como piso de referência. */
  function completo(d) {
    var dl = n(d.dividaFinanceira) - n(d.caixa);
    var est = estimativa({ setor: d.setor, receita: d.receita, ebitda: d.ebitda, dividaLiquida: dl, crescimento: d.crescimento, recorrente: d.recorrente, dependenciaDono: d.dependenciaDono, anos: d.anos });
    var fl = dcf(d), pat = patrimonial(d.balanco || {}), aj = ajustes(d);
    var metodos = [], pesos = { dcf: 0.55, mult: 0.45 };
    if (!fl.erro && fl.ev > 0) metodos.push({ id: "dcf", nome: "Fluxo de caixa descontado", ev: fl.ev, eq: Math.max(0, fl.ev - dl), peso: pesos.dcf });
    metodos.push({ id: "mult", nome: "Múltiplos de mercado", ev: est.ev.mid, eq: est.equity.mid, peso: pesos.mult });
    var ps = metodos.reduce(function (s, m) { return s + m.peso; }, 0);
    metodos.forEach(function (m) { m.pesoNorm = m.peso / ps; });
    var base = metodos.reduce(function (s, m) { return s + m.eq * m.pesoNorm; }, 0);
    var central = Math.max(0, base * (1 + aj.total));
    var piso = pat.pl > central;   // empresa que vale mais pelos bens do que pelo lucro: o patrimônio vira o piso
    if (piso) central = pat.pl;
    var eqs = metodos.map(function (m) { return m.eq; }), disp = central > 0 ? (Math.max.apply(null, eqs) - Math.min.apply(null, eqs)) / (2 * central) : 0;
    var spread = clamp(disp, 0.15, 0.4);
    return { dividaLiquida: dl, estimativa: est, dcf: fl, sensibilidade: fl.erro ? null : sensibilidade(d), patrimonial: pat, ajustes: aj, metodos: metodos, valorBase: base,
      piso: piso, central: central, min: central * (1 - spread), max: central * (1 + spread), spread: spread, valorEmpresaCentral: central + dl };
  }

  var API = { SETORES: SETORES, parseBR: parseBR, posicao: posicao, estimativa: estimativa, dcf: dcf, sensibilidade: sensibilidade, patrimonial: patrimonial, ajustes: ajustes, completo: completo };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.QuoxVal = API;
})(typeof window !== "undefined" ? window : this);
