/* QUOX - Assessor financeiro. Tudo roda no navegador; os dados ficam no localStorage deste aparelho. */
(function () {
  "use strict";
  var CFG = window.QUOX_CFG || {};
  var KEY = "quox-assessor-v1";
  var nuvem = !!(CFG.supabaseUrl && CFG.supabaseKey);
  var sb = null, user = null, snap = { lanc: {}, div: {}, chat: "[]", extra: "" }, outbox = [], enviando = false, descartadas = 0, legadoDados = null;
  var PA = window.QuoxParser;
  var CATS_D = PA.CATS_D, CATS_R = PA.CATS_R, FORMAS = PA.FORMAS, BANCOS = PA.BANCOS;
  var TABS = ["chat", "resumo", "categorias", "extrato", "planejar", "cartoes", "mais", "metas", "importar", "familia", "dividas", "desafios", "atalhos", "relatorio", "lancar"];
  var MAIS = ["categorias", "dividas", "desafios", "atalhos", "metas", "importar", "familia"];
  window.QuoxTabs = window.QuoxTabs || {};
  var MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  var $ = function (id) { return document.getElementById(id); };
  var estado = nuvem ? vazio() : carregar();
  var mes = hoje().slice(0, 7);
  var editLanc = null, editDiv = null, tabAtual = "chat", toastT = null, catAberta = {}, catTipo = "despesa";

  /* ---------- utilidades ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function hoje() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  var moedaFmt = null;
  try { moedaFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }); } catch (x) {}
  function R(v) { v = Math.round((v + Number.EPSILON) * 100) / 100; return moedaFmt ? moedaFmt.format(v) : "R$ " + v.toFixed(2).replace(".", ","); }
  function pct(v) { return (Math.round(v * 10) / 10).toString().replace(".", ",") + "%"; }
  /* "1.234,56" -> 1234.56 ; "12,5" -> 12.5 ; "1234.56" -> 1234.56 ; "1.234" -> 1234 */
  function parseBR(s) {
    s = String(s == null ? "" : s).replace(/R\$|\s/g, "");
    if (!s) return NaN;
    if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    return /^\d+(\.\d+)?$/.test(s) ? parseFloat(s) : NaN;
  }
  function mesLabel(ym) { var p = ym.split("-"); return MESES[+p[1] - 1] + " de " + p[0]; }
  function mesCurto(ym) { var p = ym.split("-"); return MESES[+p[1] - 1].slice(0, 3); }
  function addMes(ym, d) { var p = ym.split("-"), t = +p[0] * 12 + (+p[1] - 1) + d; return Math.floor(t / 12) + "-" + pad((t % 12) + 1); }
  function diaLabel(iso) { var p = iso.split("-"); var d = new Date(+p[0], +p[1] - 1, +p[2]); return ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][d.getDay()] + ", " + p[2] + "/" + p[1]; }
  function dataValida(s) { if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; var p = s.split("-"), d = new Date(+p[0], +p[1] - 1, +p[2]); return d.getFullYear() === +p[0] && d.getMonth() === +p[1] - 1 && d.getDate() === +p[2]; }
  function toast(msg) {
    var t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT);
    toastT = setTimeout(function () { t.hidden = true; }, 2600);
  }
  /* botão de confirmação em dois cliques (sem janelas do navegador) */
  function duplo(btn, textoConfirma, fn) {
    var original = btn.textContent, esperando = false, t;
    btn.addEventListener("click", function (ev) {
      if (!esperando) { esperando = true; btn.textContent = textoConfirma; t = setTimeout(function () { esperando = false; btn.textContent = original; }, 4000); return; }
      clearTimeout(t); esperando = false; btn.textContent = original; fn(ev);
    });
  }

  /* ---------- armazenamento ---------- */
  function vazio() { return { v: 1, lanc: [], dividas: [], chat: [], orc: {}, rec: [], contas: [], cartoes: [], metas: [], desafios: [] }; }
  function limpar(o) {
    var r = vazio();
    if (!o || typeof o !== "object") return r;
    (Array.isArray(o.lanc) ? o.lanc : []).forEach(function (l) {
      if (!l || (l.tipo !== "receita" && l.tipo !== "despesa")) return;
      var v = +l.valor; if (!isFinite(v) || v <= 0 || v > 1e12) return;
      if (!dataValida(String(l.data))) return;
      r.lanc.push({ id: String(l.id || uid()).slice(0, 30), tipo: l.tipo, valor: Math.round(v * 100) / 100, cat: String(l.cat || "Outros").slice(0, 40), data: l.data, desc: String(l.desc || "").slice(0, 80), forma: String(l.forma || "").slice(0, 20), banco: String(l.banco || "").slice(0, 30) });
    });
    (Array.isArray(o.dividas) ? o.dividas : []).forEach(function (d) {
      if (!d) return;
      var s = +d.saldo, j = +d.juros, p = +d.parcela || 0;
      if (!isFinite(s) || s <= 0 || !isFinite(j) || j < 0 || j > 100 || !isFinite(p) || p < 0) return;
      r.dividas.push({ id: String(d.id || uid()).slice(0, 30), nome: String(d.nome || "Dívida").slice(0, 40), saldo: s, juros: j, parcela: p });
    });
    (Array.isArray(o.chat) ? o.chat : []).slice(-60).forEach(function (m) {
      if (!m || (m.de !== "eu" && m.de !== "bot")) return;
      r.chat.push({ de: m.de, t: String(m.t || "").slice(0, 500), id: m.id ? String(m.id).slice(0, 30) : "" });
    });
    if (o.orc && typeof o.orc === "object") Object.keys(o.orc).slice(0, 40).forEach(function (c) { var v = +o.orc[c]; if (isFinite(v) && v > 0 && v < 1e12) r.orc[String(c).slice(0, 40)] = Math.round(v * 100) / 100; });
    (Array.isArray(o.rec) ? o.rec : []).slice(0, 100).forEach(function (x) {
      if (!x || (x.tipo !== "receita" && x.tipo !== "despesa")) return;
      var v = +x.valor, d = Math.round(+x.dia); if (!isFinite(v) || v <= 0 || v > 1e12 || !(d >= 1 && d <= 31) || !/^\d{4}-\d{2}$/.test(String(x.ult))) return;
      r.rec.push({ id: String(x.id || uid()).slice(0, 14), tipo: x.tipo, valor: Math.round(v * 100) / 100, cat: String(x.cat || "Outros").slice(0, 40), desc: String(x.desc || "").slice(0, 80), dia: d, ult: x.ult });
    });
    (Array.isArray(o.contas) ? o.contas : []).slice(0, 300).forEach(function (x) {
      if (!x) return; var v = +x.valor; if (!isFinite(v) || v <= 0 || v > 1e12 || !dataValida(String(x.venc))) return;
      r.contas.push({ id: String(x.id || uid()).slice(0, 14), nome: String(x.nome || "Conta").slice(0, 40), valor: Math.round(v * 100) / 100, venc: x.venc, cat: String(x.cat || "Outros").slice(0, 40), repete: !!x.repete, dia: Math.min(31, Math.max(1, Math.round(+x.dia) || +String(x.venc).slice(8))), pago: !!x.pago, pagoEm: dataValida(String(x.pagoEm)) ? x.pagoEm : "", prox: x.prox ? String(x.prox).slice(0, 14) : "" });
    });
    (Array.isArray(o.cartoes) ? o.cartoes : []).slice(0, 20).forEach(function (x) {
      if (!x) return; var lim = +x.limite || 0, f = Math.round(+x.fecha), v = Math.round(+x.vence);
      if (!(f >= 1 && f <= 31) || !(v >= 1 && v <= 31) || !isFinite(lim) || lim < 0) return;
      r.cartoes.push({ id: String(x.id || uid()).slice(0, 14), nome: String(x.nome || "Cartão").slice(0, 30), limite: Math.round(lim * 100) / 100, fecha: f, vence: v, pagas: (Array.isArray(x.pagas) ? x.pagas : []).filter(function (p) { return /^\d{4}-\d{2}$/.test(String(p)); }).slice(-12) });
    });
    (Array.isArray(o.metas) ? o.metas : []).slice(0, 30).forEach(function (x) {
      if (!x) return; var al = +x.alvo, g = +x.guardado || 0; if (!isFinite(al) || al <= 0 || al > 1e12 || !isFinite(g) || g < 0) return;
      r.metas.push({ id: String(x.id || uid()).slice(0, 14), nome: String(x.nome || "Meta").slice(0, 40), alvo: Math.round(al * 100) / 100, guardado: Math.round(g * 100) / 100, prazo: dataValida(String(x.prazo)) ? x.prazo : "",
        hist: (Array.isArray(x.hist) ? x.hist : []).filter(function (h) { return h && dataValida(String(h.d)) && isFinite(+h.v); }).slice(-30).map(function (h) { return { d: h.d, v: Math.round(+h.v * 100) / 100 }; }) });
    });
    (Array.isArray(o.desafios) ? o.desafios : []).slice(0, 40).forEach(function (x) {
      if (!x || ["sem", "teto", "anotar"].indexOf(x.tipo) < 0 || !dataValida(String(x.ini))) return;
      var dias = Math.round(+x.dias), alvo = +x.alvo || 0;
      if (!(dias >= 1 && dias <= 90)) return;
      if (x.tipo !== "anotar" && CATS_D.indexOf(x.cat) < 0) return;
      if (x.tipo === "teto" && !(alvo > 0 && alvo < 1e9)) return;
      r.desafios.push({ id: String(x.id || uid()).slice(0, 14), tipo: x.tipo, cat: x.tipo === "anotar" ? "" : x.cat, alvo: x.tipo === "teto" ? Math.round(alvo * 100) / 100 : 0, dias: dias, ini: x.ini, visto: x.visto === 1 ? 1 : 0 });
    });
    return r;
  }
  function carregar() { try { var s = localStorage.getItem(KEY); return s ? limpar(JSON.parse(s)) : vazio(); } catch (x) { return vazio(); } }
  function salvar() {
    renderAvisos();
    if (nuvem && user) difusao();
    guardarCache();
    if (nuvem && user) descarregar();
  }

  /* ---------- cálculos ---------- */
  function totais(ym) {
    var t = { rec: 0, desp: 0, n: 0, porCat: {}, porPag: {}, credito: 0 };
    estado.lanc.forEach(function (l) {
      if (l.data.slice(0, 7) !== ym) return;
      t.n++;
      if (l.tipo === "receita") t.rec += l.valor; else { t.desp += l.valor; t.porCat[l.cat] = (t.porCat[l.cat] || 0) + l.valor; var pg = pagLabel(l); t.porPag[pg] = (t.porPag[pg] || 0) + l.valor; if (l.forma === "Crédito") t.credito += l.valor; }
    });
    t.saldo = t.rec - t.desp;
    t.taxa = t.rec > 0 ? (t.saldo / t.rec) * 100 : null;
    return t;
  }
  function pagLabel(l) {
    if (!l.forma && !l.banco) return "Não informado";
    return (l.forma || "Conta") + (l.banco ? " · " + l.banco : "");
  }
  function pagsOrdenadas(t) { return Object.keys(t.porPag).map(function (k) { return [k, t.porPag[k]]; }).sort(function (a, b) { return b[1] - a[1]; }); }
  function catsOrdenadas(t) { return Object.keys(t.porCat).map(function (k) { return [k, t.porCat[k]]; }).sort(function (a, b) { return b[1] - a[1]; }); }

  function insights(ym) {
    var t = totais(ym), pr = totais(addMes(ym, -1)), o = [];
    function add(n, x) { o.push({ n: n, t: x }); }
    if (!t.n) add("info", "Ainda não há lançamentos neste mês. Registre o que entra e o que sai por alguns dias e o assessor passa a analisar os seus números.");
    else {
      if (t.rec === 0) add("atencao", "Você lançou gastos, mas nenhuma receita neste mês. Lance o que recebeu para ver o saldo e a taxa de poupança.");
      else if (t.saldo < 0) add("alerta", "Você gastou " + R(-t.saldo) + " a mais do que recebeu neste mês. Gastar mais do que ganha é o caminho mais rápido para o cartão e o cheque especial. Veja abaixo onde dá para cortar.");
      else if (t.taxa < 5) add("atencao", "Você guardou só " + pct(t.taxa) + " da renda. Uma meta realista é começar com 5% a 10% e subir aos poucos, separando o valor assim que o dinheiro entra.");
      else if (t.taxa < 20) add("ok", "Você guardou " + pct(t.taxa) + " da renda. Está no caminho: uma referência comum é chegar perto de 20% quando possível.");
      else add("bom", "Excelente: você guardou " + pct(t.taxa) + " da renda neste mês. Confira se esse dinheiro está na reserva de emergência ou em aplicações adequadas ao seu objetivo.");
      var cs = catsOrdenadas(t);
      if (t.desp > 0 && cs.length > 1 && cs[0][1] / t.desp > 0.35)
        add("atencao", "A categoria " + cs[0][0] + " concentra " + pct((cs[0][1] / t.desp) * 100) + " das suas despesas. Vale ver se há o que renegociar ou reduzir ali.");
      if (t.rec > 0) {
        var mor = t.porCat["Moradia"] || 0;
        if (mor / t.rec > 0.3) add("atencao", "A moradia consome " + pct((mor / t.rec) * 100) + " da sua renda. A referência comum é até 30%; acima disso sobra pouco para o resto.");
        var div = t.porCat["Cartão e dívidas"] || 0;
        if (div / t.rec >= 0.15) add("alerta", "Cartão e dívidas levam " + pct((div / t.rec) * 100) + " da renda. Priorize quitar as mais caras, usando o plano da aba Dívidas.");
        var des = (t.porCat["Lazer"] || 0) + (t.porCat["Compras"] || 0) + (t.porCat["Assinaturas"] || 0);
        if (des / t.rec > 0.3) add("atencao", "Lazer, compras e assinaturas somam " + pct((des / t.rec) * 100) + " da renda. Um corte pequeno aqui costuma ser o mais fácil de fazer.");
      }
      if (t.desp > 0 && t.credito / t.desp > 0.5 && t.credito >= 200) add("info", "Mais da metade das suas despesas (" + pct((t.credito / t.desp) * 100) + ", " + R(t.credito) + ") foi no cartão de crédito. Acompanhe a fatura durante o mês para ela não surpreender no vencimento.");
      if ((t.porCat["Assinaturas"] || 0) > 0) add("info", "Você tem " + R(t.porCat["Assinaturas"]) + " em assinaturas. Confira se usa todas; cancelar uma que não usa é dinheiro de volta todo mês.");
      if (pr.desp > 0) {
        Object.keys(t.porCat).forEach(function (k) {
          var a = pr.porCat[k] || 0, b = t.porCat[k];
          if (a > 0 && b > a * 1.3 && b - a >= 100) add("info", k + " subiu " + pct(((b - a) / a) * 100) + " em relação ao mês anterior (" + R(a) + " para " + R(b) + ").");
        });
      }
    }
    if (estado.dividas.length) {
      var jur = 0, pior = null;
      estado.dividas.forEach(function (d) { jur += d.saldo * d.juros / 100; if (!pior || d.juros > pior.juros) pior = d; });
      add(jur > 0 ? "atencao" : "info", "Suas dívidas cadastradas geram cerca de " + R(jur) + " de juros por mês. A mais cara é " + pior.nome + ", com " + pct(pior.juros) + " ao mês.");
    }
    if (t.n && !estado.metas.some(function (m) { return /reserva|emerg/i.test(m.nome); }) && t.rec > 0 && t.saldo >= 0)
      add("info", "Você ainda não tem uma meta de reserva de emergência. Ela evita que um imprevisto vire dívida; crie uma na aba Metas, com a sugestão automática.");
    o.forEach(function (i) {
      var x = i.t;
      i.a = /dívidas|juros por mês|Cartão e dívidas/.test(x) ? ["artigo-como-sair-das-dividas.html", "Como sair das dívidas: um plano em 7 passos"]
        : /cartão de crédito/.test(x) ? ["artigo-cartao-de-credito.html", "Cartão de crédito sem armadilhas"]
        : /reserva de emergência/.test(x) && !/Excelente/.test(x) ? ["artigo-reserva-de-emergencia.html", "Reserva de emergência: quanto guardar"]
        : /Excelente|aplicações/.test(x) ? ["artigo-como-comecar-a-investir.html", "Como começar a investir com pouco dinheiro"]
        : /a mais do que recebeu|guardou só|nenhuma receita|moradia|concentra|assinaturas|Lazer, compras/.test(x) ? ["artigo-orcamento-simples.html", "Orçamento que funciona, sem planilha complicada"] : null;
    });
    var ordem = { alerta: 0, atencao: 1, ok: 2, bom: 2, info: 3 };
    o.sort(function (a, b) { return ordem[a.n] - ordem[b.n]; });
    return o;
  }

  /* Simula o pagamento das dívidas mês a mês. est: "av" (maior juros primeiro) ou "bn" (menor saldo primeiro). */
  function simular(ds, extra, est) {
    var d = ds.map(function (x) { return { nome: x.nome, saldo: x.saldo, i: x.juros / 100, parc: x.parcela }; });
    var orcamento = d.reduce(function (s, x) { return s + x.parc; }, 0) + extra;
    var meses = 0, juros = 0, ordem = [], MAX = 600;
    while (d.some(function (x) { return x.saldo > 0.005; }) && meses < MAX) {
      meses++;
      d.forEach(function (x) { if (x.saldo > 0.005) { var j = x.saldo * x.i; x.saldo += j; juros += j; } });
      var resto = orcamento;
      d.forEach(function (x) { if (x.saldo > 0.005) { var p = Math.min(x.parc, x.saldo, resto); x.saldo -= p; resto -= p; } });
      var ativos = d.filter(function (x) { return x.saldo > 0.005; });
      ativos.sort(function (a, b) { return est === "bn" ? a.saldo - b.saldo : b.i - a.i || a.saldo - b.saldo; });
      ativos.forEach(function (x) { if (resto > 0) { var p = Math.min(resto, x.saldo); x.saldo -= p; resto -= p; } });
      d.forEach(function (x) { if (x.saldo <= 0.005 && !x.quitou) { x.quitou = meses; x.saldo = 0; ordem.push({ nome: x.nome, mes: meses }); } });
    }
    return { meses: meses, juros: juros, ordem: ordem, quitou: !d.some(function (x) { return x.saldo > 0.005; }), orcamento: orcamento };
  }
  function tempo(m) { var a = Math.floor(m / 12), r = m % 12, p = []; if (a) p.push(a + (a === 1 ? " ano" : " anos")); if (r) p.push(r + (r === 1 ? " mês" : " meses")); return p.join(" e ") || "0 meses"; }

  /* ---------- telas ---------- */
  function setTab(nome) {
    if (TABS.indexOf(nome) < 0) nome = "chat";
    tabAtual = nome;
    $("ap").setAttribute("data-tab", nome);
    document.body.classList.toggle("ap-chat", nome === "chat");
    TABS.forEach(function (n) { $("t-" + n).hidden = n !== nome; });
    var marca = nome === "lancar" ? "chat" : MAIS.indexOf(nome) >= 0 ? "mais" : nome;
  document.querySelectorAll(".ap-tabs button").forEach(function (b) { if (b.getAttribute("data-tab") === marca) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    $("mes-nav").hidden = !(nome === "resumo" || nome === "planejar" || nome === "familia" || nome === "categorias" || nome === "extrato" || nome === "relatorio");
    try { history.replaceState(null, "", "#" + nome); } catch (x) {}
    render();
    ajustarChat();
    if (nome === "chat") rolarChat(); else window.scrollTo(0, 0);
  }
  function render() {
    $("mes-txt").textContent = mesLabel(mes);
    renderAvisos();
    if (tabAtual === "chat") renderChat();
    else if (tabAtual === "resumo") renderResumo();
    else if (tabAtual === "categorias") renderCategorias();
    else if (tabAtual === "extrato") renderExtrato();
    else if (tabAtual === "planejar") renderPlanejar();
    else if (window.QuoxTabs[tabAtual]) window.QuoxTabs[tabAtual]();
    else if (tabAtual === "dividas") renderDividas();
    else if (tabAtual === "relatorio") renderRelatorio();
    else if (tabAtual === "lancar") renderLancar();
  }
  function dicasHtml(lista, max) {
    return lista.slice(0, max || 99).map(function (i) { return '<div class="dica ' + i.n + '">' + esc(i.t) + (i.a ? ' <a class="dica-link" href="' + i.a[0] + '">Ler: ' + esc(i.a[1]) + " &rsaquo;</a>" : "") + "</div>"; }).join("");
  }
  function barrasHtml(t) {
    var cs = catsOrdenadas(t);
    if (!cs.length) return '<p class="vazio">Sem despesas neste mês.</p>';
    return cs.map(function (c) {
      var p = (c[1] / t.desp) * 100;
      return '<div class="barra"><div class="t"><span>' + esc(c[0]) + "</span><span>" + R(c[1]) + " · " + pct(p) + '</span></div><div class="trilho"><span class="fill" style="width:' + Math.max(2, p) + '%"></span></div></div>';
    }).join("");
  }
  function renderResumo() {
    var t = totais(mes);
    $("k-rec").textContent = R(t.rec); $("k-desp").textContent = R(t.desp);
    var s = $("k-saldo"); s.textContent = R(t.saldo); s.className = t.saldo < 0 ? "neg" : t.saldo > 0 ? "pos" : "";
    $("k-taxa").textContent = t.taxa == null ? "–" : pct(t.taxa);
    $("dicas").innerHTML = dicasHtml(insights(mes), 3) + '<p class="leg">Dicas automáticas, baseadas nos seus lançamentos. Veja todas na aba Relatório.</p>';
    if (window.QuoxTabs.semana) window.QuoxTabs.semana();
    $("barras").innerHTML = barrasHtml(t);
    var ob = orcBarras(false); $("orc-painel").hidden = !ob; $("orc-resumo").innerHTML = ob;
    var ps = pagsOrdenadas(t);
    $("pags").innerHTML = !ps.length ? '<p class="vazio">Sem despesas neste mês.</p>' : ps.map(function (c) {
      var p = (c[1] / t.desp) * 100;
      return '<div class="barra"><div class="t"><span>' + esc(c[0]) + "</span><span>" + R(c[1]) + " · " + pct(p) + '</span></div><div class="trilho"><span class="fill alt" style="width:' + Math.max(2, p) + '%"></span></div></div>';
    }).join("") + '<p class="leg">Em "Crédito", o total é o que você já gastou no cartão neste mês, e não necessariamente o valor da fatura.</p>';
    var ms = [], i, max = 1;
    for (i = 5; i >= 0; i--) { var m = addMes(mes, -i), x = totais(m); ms.push({ m: m, r: x.rec, d: x.desp }); max = Math.max(max, x.rec, x.desp); }
    $("hist").innerHTML = '<div class="hist">' + ms.map(function (x) {
      return '<div class="col"><div class="par"><span class="b r" style="height:' + (x.r / max) * 100 + '%" title="Receitas ' + R(x.r) + '"></span><span class="b d" style="height:' + (x.d / max) * 100 + '%" title="Despesas ' + R(x.d) + '"></span></div>' + mesCurto(x.m) + "</div>";
    }).join("") + '</div><p class="leg"><span class="pos">■</span> receitas &nbsp; <span class="neg">■</span> despesas</p>';
  }
  function tipoSel() { var r = document.querySelector('input[name="tipo"]:checked'); return r ? r.value : "despesa"; }
  function preencherCats(tipo, sel) {
    var cats = tipo === "receita" ? CATS_R : CATS_D;
    $("l-cat").innerHTML = cats.map(function (c) { return '<option value="' + esc(c) + '"' + (c === sel ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("");
  }
  function criarParcelas(base, n, ehParcela) {
    var g = Math.random().toString(36).slice(2, 9), nome = (base.desc || base.cat).slice(0, 60);
    return window.QuoxLib.parcelar(base.valor, n, base.data, ehParcela).map(function (p) {
      return { id: "p" + g + "_" + p.k + "_" + p.n, tipo: "despesa", valor: p.valor, cat: base.cat, data: p.data, desc: nome + " (" + p.k + "/" + p.n + ")", forma: base.forma || "Crédito", banco: base.banco || "" };
    });
  }
  function excluirParcelas(id) {
    var i = window.QuoxLib.infoParcela(id); if (!i) return excluirLanc(id);
    var antes = estado.lanc.length;
    estado.lanc = estado.lanc.filter(function (x) { var j = window.QuoxLib.infoParcela(x.id); return !(j && j.g === i.g); });
    salvar(); toast((antes - estado.lanc.length) + " parcelas excluídas"); render();
  }
  function itemLanc(l, acoes) {
    return '<div class="item"><div class="l"><b>' + esc(l.desc || l.cat) + "</b><small>" + esc(l.cat) + " · " + l.data.split("-").reverse().join("/") + (l.tipo === "despesa" && (l.forma || l.banco) ? " · " + esc(pagLabel(l)) : "") + "</small>" +
      (acoes ? '<div class="acs"><button class="mini-b" data-ed="' + esc(l.id) + '" type="button">Editar</button><button class="mini-b perigo" data-del="' + esc(l.id) + '" type="button">Excluir</button>' + (window.QuoxLib.infoParcela(l.id) ? '<button class="mini-b perigo" data-delp="' + esc(l.id) + '" type="button">Excluir todas as parcelas</button>' : "") + '</div>' : "") +
      '</div><div class="v ' + (l.tipo === "receita" ? "pos" : "neg") + '">' + (l.tipo === "receita" ? "+" : "−") + R(l.valor) + "</div></div>";
  }
  function ligarAcoes(raiz) {
    raiz.querySelectorAll("[data-ed]").forEach(function (b) { b.addEventListener("click", function () { iniciarEdicao(b.getAttribute("data-ed")); }); });
    raiz.querySelectorAll("[data-delp]").forEach(function (b) { duplo(b, "Confirmar?", function () { excluirParcelas(b.getAttribute("data-delp")); }); });
    raiz.querySelectorAll("[data-del]").forEach(function (b) { duplo(b, "Confirmar?", function () { excluirLanc(b.getAttribute("data-del")); }); });
  }
  function ordenar(lista) { return lista.slice().sort(function (a, b) { return a.data < b.data ? 1 : a.data > b.data ? -1 : 0; }); }
  function renderLancar() {
    if (!editLanc) {
      if (!$("l-data").value) $("l-data").value = hoje();
      if (!$("l-cat").options.length) preencherCats(tipoSel());
    }
    var ult = ordenar(estado.lanc).slice(0, 6);
    $("l-ultimos").innerHTML = ult.length ? ult.map(function (l) { return itemLanc(l, true); }).join("") : '<p class="vazio">Nada lançado ainda.</p>';
    ligarAcoes($("l-ultimos"));
  }
  function iniciarEdicao(id) {
    var l = estado.lanc.filter(function (x) { return x.id === id; })[0]; if (!l) return;
    editLanc = id;
    setTab("lancar");
    document.querySelector('input[name="tipo"][value="' + l.tipo + '"]').checked = true;
    preencherCats(l.tipo, l.cat);
    $("l-valor").value = String(l.valor).replace(".", ",");
    $("l-parc-box").hidden = true;
    $("l-data").value = l.data; $("l-desc").value = l.desc; $("l-forma").value = l.forma || ""; $("l-banco").value = l.banco || "";
    $("f-titulo").textContent = "Editar lançamento"; $("l-salvar").textContent = "Salvar alterações"; $("l-cancel").hidden = false;
  }
  function fimEdicao() {
    editLanc = null; $("l-parc-box").hidden = false; $("l-parc").value = "1"; $("l-parc-cada").checked = false; $("l-valor").value = ""; $("l-desc").value = ""; $("l-banco").value = ""; $("l-forma").value = ""; $("l-data").value = hoje();
    $("f-titulo").textContent = "Novo lançamento"; $("l-salvar").textContent = "Salvar"; $("l-cancel").hidden = true; $("l-erro").textContent = "";
  }
  function excluirLanc(id) { estado.lanc = estado.lanc.filter(function (x) { return x.id !== id; }); salvar(); toast("Lançamento excluído"); render(); }
  function renderExtrato() {
    var tp = $("x-tipo").value, q = $("x-busca").value.trim().toLowerCase(), pgSel = $("x-pag").value;
    var labels = {};
    estado.lanc.forEach(function (x) { if (x.data.slice(0, 7) === mes && x.tipo === "despesa") labels[pagLabel(x)] = 1; });
    var opts = '<option value="">Todos</option>' + Object.keys(labels).sort().map(function (k) { return '<option value="' + esc(k) + '"' + (k === pgSel ? " selected" : "") + ">" + esc(k) + "</option>"; }).join("");
    if ($("x-pag").innerHTML !== opts) $("x-pag").innerHTML = opts;
    pgSel = $("x-pag").value;
    var l = ordenar(estado.lanc.filter(function (x) {
      return x.data.slice(0, 7) === mes && (!tp || x.tipo === tp) && (!pgSel || (x.tipo === "despesa" && pagLabel(x) === pgSel)) && (!q || (x.desc + " " + x.cat + " " + pagLabel(x)).toLowerCase().indexOf(q) >= 0);
    }));
    if (!l.length) { $("x-lista").innerHTML = '<p class="vazio">Nenhum lançamento encontrado neste mês.</p>'; return; }
    var h = "", dia = "";
    l.forEach(function (x) { if (x.data !== dia) { dia = x.data; h += '<div class="dia">' + diaLabel(dia) + "</div>"; } h += itemLanc(x, true); });
    $("x-lista").innerHTML = h; ligarAcoes($("x-lista"));
  }


  /* ---------- categorias ---------- */
  function renderCategorias() {
    var t = totais(mes), tp = catTipo, total = tp === "receita" ? t.rec : t.desp, grupos = {};
    estado.lanc.forEach(function (l) { if (l.data.slice(0, 7) === mes && l.tipo === tp) (grupos[l.cat] = grupos[l.cat] || []).push(l); });
    var ks = Object.keys(grupos).map(function (k) { return [k, grupos[k].reduce(function (s, x) { return s + x.valor; }, 0), grupos[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
    document.querySelectorAll("#cat-seg button").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-tp") === tp ? "true" : "false"); });
    if (!ks.length) { $("cat-lista").innerHTML = '<p class="vazio">Nada em ' + (tp === "receita" ? "receitas" : "despesas") + " neste mês. Use o Chat para lançar, por exemplo: gastei 30 no mercado no cartão Nubank.</p>"; return; }
    $("cat-lista").innerHTML = '<p class="sub">Total em ' + esc(mesLabel(mes)) + ": <strong>" + R(total) + "</strong>. Toque numa categoria para ver os lançamentos.</p>" + ks.map(function (k) {
      var p = (k[1] / total) * 100, aberta = catAberta[tp + k[0]] ? " open" : "";
      return '<details class="cat"' + aberta + ' data-k="' + esc(tp + k[0]) + '"><summary><span class="cn">' + esc(k[0]) + '</span><span class="cv">' + R(k[1]) + " · " + pct(p) + '</span></summary><div class="trilho"><span class="fill" style="width:' + Math.max(2, p) + '%"></span></div>' +
        ordenar(k[2]).map(function (l) { return itemLanc(l, true); }).join("") + "</details>";
    }).join("");
    $("cat-lista").querySelectorAll("details.cat").forEach(function (d) { d.addEventListener("toggle", function () { catAberta[d.getAttribute("data-k")] = d.open; }); });
    ligarAcoes($("cat-lista"));
  }

  /* ---------- chat ---------- */
  var MSG_AJUDA = "Escreva o gasto do seu jeito, e eu lanço na categoria certa. Exemplos:\n• gastei 30 no mercado no cartão Nubank\n• uber 18,50 no pix ontem\n• recebi 3500 de salário no Itaú\n• paguei 120 de luz no débito\n\nPara lançar vários de uma vez, escreva um por linha. Também entendo: \"resumo\", \"cartões\", \"quanto gastei com farmácia\" e \"desfazer\".";
  MSG_AJUDA += "\n\nTambém entendo:\n• conta de luz 150 vence dia 10\n• limite alimentação 800\n• contas (ver o que vence)\n• orçamento (ver os limites)\n• paguei a luz (dar baixa na conta)\n• ou toque no microfone e fale o gasto";
  function mesReal() { return hoje().slice(0, 7); }
  function pushChat(de, t, id) { estado.chat.push({ de: de, t: t, id: id || "" }); if (estado.chat.length > 60) estado.chat = estado.chat.slice(-60); }
  function renderChat() {
    var box = $("chat-lista");
    if (!estado.chat.length) {
      box.innerHTML = '<div class="msg bot"><div class="bolha">' + esc("Oi! Eu sou o assessor da QUOX. " + MSG_AJUDA).replace(/\n/g, "<br>") + "</div></div>";
    } else {
      var ultComId = -1; estado.chat.forEach(function (m, i) { if (m.id && estado.lanc.some(function (l) { return l.id === m.id; })) ultComId = i; });
      box.innerHTML = estado.chat.map(function (m, i) {
        var tem = i === ultComId;
        return '<div class="msg ' + m.de + '"><div class="bolha">' + esc(m.t).replace(/\n/g, "<br>") + "</div>" +
          (tem ? '<div class="acs"><button class="mini-b" type="button" data-cedit="' + esc(m.id) + '">Editar</button><button class="mini-b perigo" type="button" data-cundo="' + esc(m.id) + '">Desfazer</button></div>' : "") + "</div>";
      }).join("");
      box.querySelectorAll("[data-cedit]").forEach(function (b) { b.addEventListener("click", function () { iniciarEdicao(b.getAttribute("data-cedit")); }); });
      box.querySelectorAll("[data-cundo]").forEach(function (b) { b.addEventListener("click", function () { desfazerChat(b.getAttribute("data-cundo")); }); });
    }
    var ex = ["gastei 30 no mercado no cartão Nubank", "uber 18,50 no pix ontem", "recebi 3500 de salário", "resumo"];
    $("chat-sug").innerHTML = ex.map(function (e) { return '<button type="button" class="chip" data-ex="' + esc(e) + '">' + esc(e) + "</button>"; }).join("");
    $("chat-sug").querySelectorAll("[data-ex]").forEach(function (b) { b.addEventListener("click", function () { $("chat-in").value = b.getAttribute("data-ex"); $("chat-in").focus(); }); });
  }
  /* Chat em tela cheia: a lista rola por dentro e a caixa de texto fica sempre visível (inclusive com o teclado do iPhone aberto). */
  function ajustarChat() {
    var t = $("t-chat"); if (!t) return;
    if (t.hidden) { t.style.height = ""; return; }
    var vv = window.visualViewport, h = vv ? vv.height : window.innerHeight, off = vv ? vv.offsetTop : 0;
    window.__maxH = Math.max(window.__maxH || 0, window.innerHeight, h);
    document.body.classList.toggle("kb", h < window.__maxH - 150 && document.activeElement === $("chat-in"));
    var tabs = document.querySelector(".ap-tabs"), th = document.body.classList.contains("kb") || !tabs ? 0 : tabs.offsetHeight;
    var top = t.getBoundingClientRect().top - off;
    t.style.height = Math.max(240, Math.round(h - top - th - 6)) + "px";
  }
  function rolarChat() { setTimeout(function () { ajustarChat(); var b = $("chat-lista"); if (b) b.scrollTop = b.scrollHeight; }, 30); }
  (function () {
    var vv = window.visualViewport, ch = function () { ajustarChat(); };
    window.addEventListener("resize", ch); window.addEventListener("orientationchange", function () { setTimeout(function () { ch(); rolarChat(); }, 250); });
    if (vv) { vv.addEventListener("resize", function () { ch(); rolarChat(); }); vv.addEventListener("scroll", ch); }
    if (window.ResizeObserver) { var ro = new ResizeObserver(ch); ["avisos", "legado", "ios-dica", "priv"].forEach(function (i) { var e = $(i); if (e) ro.observe(e); }); var tp = document.querySelector(".ap-top"); if (tp) ro.observe(tp); }
    var ci = $("chat-in"); if (!ci) return;
    function cresce() { ci.style.height = "auto"; ci.style.height = Math.min(120, ci.scrollHeight) + "px"; }
    ci.addEventListener("input", cresce);
    ci.addEventListener("focus", function () { setTimeout(function () { window.scrollTo(0, 0); ajustarChat(); rolarChat(); }, 300); });
    ci.addEventListener("blur", function () { setTimeout(ajustarChat, 100); });
    $("pedido-ok").addEventListener("click", function () { var t = pedido.l; pedido.l = ""; $("pedido-bar").hidden = true; setTab("chat"); enviarChat(t); });
  $("pedido-no").addEventListener("click", function () { pedido.l = ""; $("pedido-bar").hidden = true; });
  $("chat-form").addEventListener("submit", function () { setTimeout(cresce, 0); });
  })();
  function desfazerChat(id) {
    var ip = window.QuoxLib.infoParcela(id);
    estado.lanc = estado.lanc.filter(function (l) { var j = ip && window.QuoxLib.infoParcela(l.id); return ip ? !(j && j.g === ip.g) : l.id !== id; });
    estado.chat.forEach(function (m) { if (m.id === id) m.id = ""; });
    pushChat("bot", ip ? "Pronto, desfiz a compra e as " + ip.n + " parcelas." : "Pronto, desfiz esse lançamento."); salvar(); renderChat(); rolarChat();
  }
  function descreverLanc(l) {
    var pg = l.tipo === "despesa" && (l.forma || l.banco) ? " · " + pagLabel(l) : "";
    var dia = l.data === hoje() ? "hoje" : l.data.split("-").reverse().join("/");
    return (l.tipo === "receita" ? "Receita de " : "Despesa de ") + R(l.valor) + " em " + l.cat + (l.desc && l.desc.toLowerCase() !== l.cat.toLowerCase() ? " (" + l.desc + ")" : "") + pg + ", " + dia + ".";
  }
  function lancarDoChat(frase) {
    var r = PA.interpretar(frase, new Date());
    if (!r.ok) return { texto: r.erro === "sem-valor" ? "Não achei o valor em \"" + frase + "\". Inclua o número, por exemplo: gastei 30 no mercado no cartão Nubank." : "Não consegui entender essa frase.", id: "" };
    var l = { id: uid(), tipo: r.tipo, valor: r.valor, cat: r.cat, data: r.data, desc: r.desc.slice(0, 80), forma: r.forma, banco: r.banco };
    var antesOrc = gastoCat(l.cat, l.data.slice(0, 7)), ps = null;
    if (r.parcelas > 1 && r.tipo === "despesa") { ps = criarParcelas(l, r.parcelas, r.valorEhParcela); l = ps[0]; ps.forEach(function (p) { estado.lanc.push(p); }); }
    else estado.lanc.push(l);
    var nota = "";
    var ao = avisoOrc(l, antesOrc); if (ao) nota += "\n" + ao;
    if (r.formaSuposta) nota += "\nVi um banco e considerei cartão de crédito. Se foi débito ou Pix, toque em Editar.";
    if (r.semCategoria) nota += "\nNão reconheci a categoria e coloquei em Outros. Toque em Editar para mudar.";
    if (r.dataErro) nota += "\nNão entendi a data, então usei hoje.";
    if (r.tipo === "despesa" && !r.forma && !r.banco) nota += "\nSe quiser registrar o cartão ou banco, escreva junto, por exemplo: \"no cartão Nubank\".";
    if (ps) {
      var tot = ps.reduce(function (t, p) { return t + p.valor; }, 0);
      return { texto: "Anotei a compra parcelada! " + R(tot) + " em " + ps.length + "x de " + R(ps[0].valor) + " em " + l.cat + (r.banco ? " · " + r.banco : "") + ". A 1ª parcela entra em " + l.data.split("-").reverse().join("/") + " e a última em " + ps[ps.length - 1].data.split("-").reverse().join("/") + ". Para desfazer tudo, escreva \"desfazer\"." + nota, id: l.id };
    }
    return { texto: "Anotei! " + descreverLanc(l) + nota, id: l.id };
  }
  function respostaResumo() {
    var m = mesReal(), t = totais(m), cs = catsOrdenadas(t).slice(0, 3);
    if (!t.n) return "Ainda não há lançamentos em " + mesLabel(m) + ". Que tal começar? Ex.: gastei 30 no mercado no cartão Nubank.";
    return "Em " + mesLabel(m) + ": receitas " + R(t.rec) + ", despesas " + R(t.desp) + ", saldo " + R(t.saldo) + (t.taxa != null ? " (" + pct(t.taxa) + " poupado)" : "") + "." +
      (cs.length ? "\nMaiores categorias: " + cs.map(function (c) { return c[0] + " " + R(c[1]); }).join(", ") + "." : "") + "\nVeja os detalhes nas abas Resumo e Categorias.";
  }
  function respostaCartoes() {
    var m = mesReal(), t = totais(m), ps = pagsOrdenadas(t);
    if (!ps.length) return "Ainda não há despesas em " + mesLabel(m) + ".";
    return "Despesas de " + mesLabel(m) + " por forma de pagamento:\n" + ps.map(function (c) { return "• " + c[0] + ": " + R(c[1]); }).join("\n");
  }
  function respostaCategoria(cat) {
    var m = mesReal(), t = totais(m), v = t.porCat[cat] || 0, n = estado.lanc.filter(function (l) { return l.tipo === "despesa" && l.cat === cat && l.data.slice(0, 7) === m; }).length;
    return v ? "Em " + mesLabel(m) + " você gastou " + R(v) + " em " + cat + " (" + n + (n === 1 ? " lançamento" : " lançamentos") + ")." + (t.desp ? " Isso é " + pct((v / t.desp) * 100) + " das despesas." : "") : "Você ainda não tem gastos em " + cat + " em " + mesLabel(m) + ".";
  }
  function chatExtras(texto, n, temNum) {
    var hs = (window.QuoxApp && window.QuoxApp.chat) || [];
    for (var i = 0; i < hs.length; i++) { var r = hs[i](texto, n, temNum); if (r != null) return r; }
    return null;
  }
  function enviarChat(texto) {
    texto = String(texto || "").trim(); if (!texto) return;
    var n = PA.sem(texto), temNum = /\d/.test(n), resp = "", id = "", extraResp = null;
    pushChat("eu", texto.slice(0, 500));
    if (/^(ajuda|help|\?|como funciona|o que voce faz)/.test(n)) resp = MSG_AJUDA;
    else if (/^(desfazer|desfaz|apagar o ultimo|cancelar o ultimo|errei)/.test(n)) {
      var ult = null; for (var i = estado.chat.length - 1; i >= 0; i--) { var m = estado.chat[i]; if (m.id && estado.lanc.some(function (l) { return l.id === m.id; })) { ult = m.id; break; } }
      if (ult) { $("chat-in").value = ""; desfazerChat(ult); return; } resp = "Não tenho um lançamento recente do chat para desfazer. Você também pode excluir na aba Extrato.";
    }
    else if (/^(limpar (a )?conversa|apagar (a )?conversa)/.test(n)) { estado.chat = []; salvar(); $("chat-in").value = ""; renderChat(); return; }
    else if ((extraResp = chatExtras(texto, n, temNum)) !== null) resp = extraResp;
    else if (PA.ehConta(texto)) { resp = PA.dividir(texto).map(adicionarContaChat).join("\n\n"); }
    else if (temNum && PA.ehLimite(texto)) {
      var lm = PA.interpretarLimite(texto);
      resp = lm.ok ? definirLimiteChat(lm) : "Para definir um limite, diga a categoria e o valor. Exemplo: limite alimentação 800.";
    }
    else if (!temNum && /(^|\s)(contas|vencimentos?|a pagar|o que vence|proximas contas)(\s|$)/.test(n)) resp = respostaContas();
    else if (!temNum && /(orcamento|limites?)/.test(n)) resp = respostaOrcamento();
    else if (!temNum && /^(paguei|pago|quitei|ja paguei)\b/.test(n) && contaPorTexto(n)) resp = pagarConta(contaPorTexto(n).id, true);
    else if (!temNum && /quanto/.test(n) && PA.categoriaCitada(texto)) resp = respostaCategoria(PA.categoriaCitada(texto));
    else if (!temNum && /(cartao|cartoes|fatura|banco|nubank|itau|bradesco|santander|inter\b)/.test(n)) resp = respostaCartoes();
    else if (!temNum && /(resumo|saldo|quanto (eu )?(gastei|gastamos|recebi)|como estou|extrato)/.test(n)) resp = respostaResumo();
    else if (temNum) {
      var frases = PA.dividir(texto), partes = [], ids = [];
      frases.forEach(function (f) { var x = lancarDoChat(f); partes.push(x.texto); if (x.id) ids.push(x.id); });
      resp = partes.join("\n\n"); id = ids.length === 1 ? ids[0] : "";
    }
    else resp = "Não entendi. " + MSG_AJUDA;
    pushChat("bot", resp, id); salvar(); $("chat-in").value = ""; renderChat(); rolarChat();
  }

  /* dívidas */
  function renderDividas() {
    var ds = estado.dividas;
    if (!ds.length) $("d-lista").innerHTML = '<p class="vazio">Nenhuma dívida cadastrada. Quando você cadastra, o assessor calcula quanto tempo leva para quitar e quanto você paga de juros.</p>';
    else {
      var tot = ds.reduce(function (s, x) { return s + x.saldo; }, 0), jur = ds.reduce(function (s, x) { return s + x.saldo * x.juros / 100; }, 0);
      $("d-lista").innerHTML = '<p class="sub">Total devido: <strong>' + R(tot) + "</strong> · juros por mês: <strong>" + R(jur) + "</strong></p>" + ds.map(function (d) {
        return '<div class="item"><div class="l"><b>' + esc(d.nome) + "</b><small>" + pct(d.juros) + " ao mês · parcela mínima " + R(d.parcela) + '</small><div class="acs"><button class="mini-b" data-ded="' + esc(d.id) + '" type="button">Editar</button><button class="mini-b perigo" data-ddel="' + esc(d.id) + '" type="button">Excluir</button></div></div><div class="v ' + (d.saldo > 0 ? "neg" : "pos") + '">' + (d.saldo > 0 ? R(d.saldo) : "Quitada ✓") + "</div></div>" + (d.saldo > 0 ? '<div class="pagar-d"><input data-dpv="' + esc(d.id) + '" inputmode="decimal" autocomplete="off" placeholder="Valor pago (R$)" aria-label="Valor pago em ' + esc(d.nome) + '"><button class="mini-b" data-dpay="' + esc(d.id) + '" type="button">Registrar pagamento</button></div>' : "");
      }).join("");
      $("d-lista").querySelectorAll("[data-dpay]").forEach(function (b) { b.addEventListener("click", function () { pagarDivida(b.getAttribute("data-dpay")); }); });
      $("d-lista").querySelectorAll("[data-ded]").forEach(function (b) { b.addEventListener("click", function () { editarDivida(b.getAttribute("data-ded")); }); });
      $("d-lista").querySelectorAll("[data-ddel]").forEach(function (b) { duplo(b, "Confirmar?", function () { estado.dividas = estado.dividas.filter(function (x) { return x.id !== b.getAttribute("data-ddel"); }); salvar(); render(); }); });
    }
    $("d-plano").hidden = !ds.length;
    if (ds.length) renderPlano();
  }
  function pagarDivida(id) {
    var d = estado.dividas.filter(function (x) { return x.id === id; })[0], inp = document.querySelector('[data-dpv="' + id + '"]'); if (!d || !inp) return;
    var v = parseBR(inp.value); if (!isFinite(v) || v <= 0) { toast("Informe o valor que você pagou."); return; }
    v = Math.min(Math.round(v * 100) / 100, d.saldo);
    d.saldo = Math.round((d.saldo - v) * 100) / 100;
    estado.lanc.push({ id: uid(), tipo: "despesa", valor: v, cat: "Cartão e dívidas", data: hoje(), desc: ("Pagamento: " + d.nome).slice(0, 80), forma: "", banco: "" });
    salvar(); toast(d.saldo <= 0 ? "Dívida quitada! Parabéns, um passo enorme." : "Pagamento registrado. Falta " + R(d.saldo) + ".");
    render();
  }
  function renderPlano() {
    var extra = parseBR($("p-extra").value); if (!isFinite(extra) || extra < 0) extra = 0;
    var est = $("p-met").value, ds = estado.dividas.filter(function (x) { return x.saldo > 0; });
    if (!ds.length) { $("p-res").innerHTML = '<div class="dica bom">Todas as suas dívidas cadastradas estão quitadas. 🎉</div>'; return; }
    var base = simular(ds, 0, est), com = simular(ds, extra, est);
    var h = "";
    if (!base.quitou && !com.quitou) h += '<div class="dica alerta">Com esses valores a dívida não é quitada: as parcelas não cobrem os juros. Aumente o dinheiro extra, renegocie as taxas ou procure trocar por uma dívida mais barata.</div>';
    else {
      h += '<div class="resultado"><p><strong>Só com as parcelas mínimas:</strong> ' + (base.quitou ? "quita em " + tempo(base.meses) + ", pagando " + R(base.juros) + " de juros." : "não quita (a dívida cresce ou fica parada).") + "</p>";
      if (extra > 0) h += "<p><strong>Com " + R(extra) + " extras por mês:</strong> " + (com.quitou ? "quita em " + tempo(com.meses) + ", pagando " + R(com.juros) + " de juros." : "ainda não quita.") + "</p>";
      if (extra > 0 && com.quitou && base.quitou) h += "<p>Economia estimada: <strong>" + R(base.juros - com.juros) + "</strong> de juros e <strong>" + tempo(base.meses - com.meses) + "</strong> a menos.</p>";
      h += "</div>";
      var alvo = com.quitou ? com : base;
      if (alvo.ordem.length) h += '<p class="sub" style="margin-top:10px">Ordem de quitação' + (extra > 0 && com.quitou ? " (com o extra)" : "") + ":</p><ol>" + alvo.ordem.map(function (o) { return "<li>" + esc(o.nome) + " — em " + tempo(o.mes) + "</li>"; }).join("") + "</ol>";
    }
    var av = simular(ds, extra, "av"), bn = simular(ds, extra, "bn");
    if (av.quitou && bn.quitou && ds.length > 1) h += '<div class="resultado"><p class="sub"><strong>Comparando os métodos' + (extra > 0 ? " (com " + R(extra) + " extras)" : "") + ':</strong></p><p>Avalanche: ' + tempo(av.meses) + ", " + R(av.juros) + ' de juros.<br>Bola de neve: ' + tempo(bn.meses) + ", " + R(bn.juros) + " de juros.</p><p>" + (Math.abs(av.juros - bn.juros) < 1 ? "Os dois dão praticamente o mesmo resultado; escolha o que mais motiva você." : av.juros < bn.juros ? "A avalanche economiza " + R(bn.juros - av.juros) + ", mas a bola de neve quita a primeira dívida mais cedo e ajuda a manter a motivação." : "Na sua situação, a bola de neve é igual ou melhor.") + "</p></div>";
    h += '<p class="leg">Projeção simples: considera juros fixos e que você paga o mesmo orçamento todo mês, passando para as próximas dívidas as parcelas que forem sendo quitadas. Não inclui multas nem tarifas.</p>';
    $("p-res").innerHTML = h;
  }
  function editarDivida(id) {
    var d = estado.dividas.filter(function (x) { return x.id === id; })[0]; if (!d) return;
    editDiv = id; $("d-nome").value = d.nome; $("d-saldo").value = String(d.saldo).replace(".", ","); $("d-juros").value = String(d.juros).replace(".", ","); $("d-parc").value = String(d.parcela).replace(".", ",");
    $("d-titulo").textContent = "Editar dívida"; $("d-cancel").hidden = false; $("d-nome").focus();
  }
  function fimEdicaoDiv() { editDiv = null; ["d-nome", "d-saldo", "d-juros", "d-parc"].forEach(function (i) { $(i).value = ""; }); $("d-titulo").textContent = "Minhas dívidas"; $("d-cancel").hidden = true; $("d-erro").textContent = ""; }

  /* relatório */
  /* gráfico de pizza (rosca) por categoria e resumo de cada uma */
  var PAL = ["#0b6b80", "#e07a1f", "#6a4fb3", "#2e9e5b", "#d1495b", "#d9a400", "#3d7ea6", "#8c5e58", "#00a6a6", "#b5179e", "#7a8b99", "#a88b3d", "#4c956c", "#9d6b53"];
  function corCat(cat) { var i = CATS_D.indexOf(cat); return PAL[(i < 0 ? CATS_D.length : i) % PAL.length]; }
  function donutHtml(t) {
    var cs = catsOrdenadas(t), r = 64, c = 2 * Math.PI * r, acc = 0, seg = "";
    cs.forEach(function (x) {
      var len = (x[1] / t.desp) * c;
      seg += '<circle cx="100" cy="100" r="' + r + '" fill="none" stroke="' + corCat(x[0]) + '" stroke-width="38" stroke-dasharray="' + len.toFixed(2) + " " + (c - len).toFixed(2) + '" stroke-dashoffset="' + (-acc).toFixed(2) + '" transform="rotate(-90 100 100)"><title>' + esc(x[0]) + ": " + R(x[1]) + " (" + pct((x[1] / t.desp) * 100) + ")</title></circle>";
      acc += len;
    });
    var desc = cs.map(function (x) { return x[0] + " " + pct((x[1] / t.desp) * 100); }).join(", ");
    return '<div class="donut"><svg viewBox="0 0 200 200" role="img" aria-label="Gráfico de pizza das despesas por categoria: ' + esc(desc) + '"><circle cx="100" cy="100" r="' + r + '" fill="none" stroke="#e3edf0" stroke-width="38"/>' + seg +
      '<text x="100" y="94" text-anchor="middle" class="d-l">Despesas</text><text x="100" y="114" text-anchor="middle" class="d-v">' + esc(R(t.desp)) + "</text></svg>" +
      '<ul class="d-leg">' + cs.map(function (x) { return '<li><i style="background:' + corCat(x[0]) + '"></i><span>' + esc(x[0]) + "</span><b>" + pct((x[1] / t.desp) * 100) + "</b></li>"; }).join("") + "</ul></div>";
  }
  function resumoCategorias(t, pr) {
    return catsOrdenadas(t).map(function (x) {
      var cat = x[0], ls = estado.lanc.filter(function (l) { return l.tipo === "despesa" && l.cat === cat && l.data.slice(0, 7) === mes; }), g = {};
      ls.forEach(function (l) { var k = (l.desc || l.cat).trim().toLowerCase(); g[k] = g[k] || { n: l.desc || l.cat, v: 0, q: 0 }; g[k].v += l.valor; g[k].q++; });
      var top = Object.keys(g).map(function (k) { return g[k]; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 3);
      var maior = ls.slice().sort(function (a, b) { return b.valor - a.valor; })[0], ant = pr.porCat[cat] || 0;
      var cmp = ant > 0 ? " Em relação ao mês anterior: " + (x[1] > ant ? "alta de " : x[1] < ant ? "queda de " : "igual, ") + (x[1] === ant ? "" : pct(Math.abs((x[1] - ant) / ant) * 100)) + "." : "";
      var txt = ls.length + (ls.length === 1 ? " lançamento" : " lançamentos") + ", média de " + R(x[1] / ls.length) + ". " + (top.length > 1 || top[0].q > 1 ? "Principais: " + top.map(function (i) { return esc(i.n) + " (" + R(i.v) + ")"; }).join(", ") + ". " : "") +
        "Maior gasto: " + esc(maior.desc || maior.cat) + ", " + R(maior.valor) + " em " + maior.data.split("-").reverse().slice(0, 2).join("/") + "." + cmp;
      return '<div class="cat-res"><div class="cr-h"><i style="background:' + corCat(cat) + '"></i><b>' + esc(cat) + "</b><span>" + R(x[1]) + " · " + pct((x[1] / t.desp) * 100) + "</span></div><p>" + txt + "</p></div>";
    }).join("");
  }
  function renderRelatorio() {
    var t = totais(mes), pr = totais(addMes(mes, -1)), cs = catsOrdenadas(t);
    var h = '<div class="rel-h"><h2>Relatório de ' + esc(mesLabel(mes)) + "</h2></div>";
    if (!t.n) { $("rel").innerHTML = h + '<p class="vazio">Sem lançamentos neste mês.</p>'; return; }
    h += '<table class="tabela"><tr><th>Receitas</th><td>' + R(t.rec) + '</td></tr><tr><th>Despesas</th><td>' + R(t.desp) + "</td></tr><tr><th>Saldo do mês</th><td><strong>" + R(t.saldo) + "</strong></td></tr><tr><th>Taxa de poupança</th><td>" + (t.taxa == null ? "–" : pct(t.taxa)) + "</td></tr></table>";
    if (cs.length) {
      h += "<h3>Despesas por categoria</h3>" + donutHtml(t) + resumoCategorias(t, pr);
      var maiores = estado.lanc.filter(function (l) { return l.tipo === "despesa" && l.data.slice(0, 7) === mes; }).sort(function (a, b) { return b.valor - a.valor; }).slice(0, 5);
      h += "<h3>Maiores gastos</h3>" + maiores.map(function (l) { return itemLanc(l, false); }).join("");
    }
    h += "<h3>Análise do assessor</h3>" + dicasHtml(insights(mes));
    h += '<p class="leg">Relatório educativo gerado a partir dos seus próprios lançamentos. Não é consultoria financeira.</p>';
    $("rel").innerHTML = h;
  }

  /* ---------- ações ---------- */
  function submitLanc(ev) {
    ev.preventDefault();
    var v = parseBR($("l-valor").value), data = $("l-data").value, tipo = tipoSel(), err = $("l-erro");
    if (!isFinite(v) || v <= 0) { err.textContent = "Informe um valor maior que zero, por exemplo 49,90."; $("l-valor").focus(); return; }
    if (!dataValida(data)) { err.textContent = "Escolha uma data válida."; return; }
    err.textContent = "";
    var np = Math.round(+String($("l-parc").value).replace(",", ".")) || 1;
    if (!editLanc && tipo === "despesa" && np > 1) {
      if (np > 48) { err.textContent = "O máximo é 48 parcelas."; return; }
      var base = { valor: Math.round(v * 100) / 100, cat: $("l-cat").value, data: data, desc: $("l-desc").value.trim().slice(0, 60), forma: $("l-forma").value || "Crédito", banco: $("l-banco").value.trim().slice(0, 30) };
      var psf = criarParcelas(base, np, $("l-parc-cada").checked), antesP = gastoCat(base.cat, data.slice(0, 7));
      psf.forEach(function (p) { estado.lanc.push(p); });
      var avP = avisoOrc(psf[0], antesP);
      salvar(); fimEdicao(); toast("Compra parcelada salva em " + np + "x" + (avP ? ". " + avP : "")); renderLancar(); return;
    }
    var reg = { id: editLanc || uid(), tipo: tipo, valor: Math.round(v * 100) / 100, cat: $("l-cat").value, data: data, desc: $("l-desc").value.trim().slice(0, 80), forma: $("l-forma").value, banco: $("l-banco").value.trim().slice(0, 30) };
    var antesOrc = gastoCat(reg.cat, reg.data.slice(0, 7)), avOrc = "";
    if (editLanc) estado.lanc = estado.lanc.map(function (x) { return x.id === editLanc ? reg : x; }); else { estado.lanc.push(reg); avOrc = avisoOrc(reg, antesOrc); }
    var foraDoMes = data.slice(0, 7) !== mes;
    var tinhaEdicao = !!editLanc;
    salvar(); fimEdicao();
    toast(tinhaEdicao ? "Alterações salvas" : "Lançamento salvo" + (foraDoMes ? " em " + mesLabel(data.slice(0, 7)) : "") + (avOrc ? ". " + avOrc : ""));
    renderLancar();
  }
  function submitDiv(ev) {
    ev.preventDefault();
    var nome = $("d-nome").value.trim() || "Dívida", s = parseBR($("d-saldo").value), j = parseBR($("d-juros").value), p = parseBR($("d-parc").value), err = $("d-erro");
    if (!isFinite(s) || s <= 0) { err.textContent = "Informe o saldo devedor."; return; }
    if (!isFinite(j) || j < 0 || j > 100) { err.textContent = "Informe os juros ao mês em porcentagem (por exemplo 12). Se não tiver, use 0."; return; }
    if (!isFinite(p)) p = 0;
    var d = { id: editDiv || uid(), nome: nome.slice(0, 40), saldo: s, juros: j, parcela: p };
    if (editDiv) estado.dividas = estado.dividas.map(function (x) { return x.id === editDiv ? d : x; }); else estado.dividas.push(d);
    salvar(); fimEdicaoDiv(); render(); toast("Dívida salva");
  }
  function exportarXlsx(tudo) {
    var l = estado.lanc.filter(function (x) { return tudo === true || x.data.slice(0, 7) === mes; });
    if (!l.length) { $("b-msg").textContent = "Não há lançamentos para exportar nesse período."; return; }
    if (!window.QuoxXlsx) { $("b-msg").textContent = "Não consegui carregar o gerador de planilha. Recarregue a página."; return; }
    salvarArquivo("quox-financas-" + (tudo === true ? "completo" : mes) + ".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", window.QuoxXlsx.gerar(window.QuoxXlsx.planilhasQuox(l, { hoje: hoje() })));
    $("b-msg").textContent = "Planilha Excel gerada com 4 abas: lançamentos, resumo mensal, gastos por categoria e parcelas futuras (com fórmulas).";
  }
  function salvarArquivo(nome, tipo, txt) {
    var b = new Blob([txt], { type: tipo }), u = URL.createObjectURL(b), a = document.createElement("a");
    a.href = u; a.download = nome; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(u); }, 2000);
  }
  function csvCel(s) { s = String(s); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }
  function exportarCsv(tudo) {
    var l = ordenar(estado.lanc.filter(function (x) { return tudo === true || x.data.slice(0, 7) === mes; })).reverse();
    var linhas = ["Data;Tipo;Categoria;Descrição;Forma de pagamento;Banco ou cartão;Valor"].concat(l.map(function (x) {
      return [x.data, x.tipo, csvCel(x.cat), csvCel(x.desc), csvCel(x.forma || ""), csvCel(x.banco || ""), (x.tipo === "despesa" ? "-" : "") + x.valor.toFixed(2).replace(".", ",")].join(";");
    }));
    salvarArquivo("quox-lancamentos-" + (tudo === true ? "todos" : mes) + ".csv", "text/csv;charset=utf-8", "﻿" + linhas.join("\r\n"));
    $("b-msg").textContent = "Arquivo CSV gerado com " + (tudo === true ? "todos os lançamentos" : "os lançamentos de " + mesLabel(mes)) + ". Abre direto no Excel e no Google Planilhas.";
  }
  function backup() {
    salvarArquivo("quox-backup-" + hoje() + ".json", "application/json", JSON.stringify(estado));
    $("b-msg").textContent = "Backup gerado. Guarde o arquivo em um lugar seguro (nuvem ou e-mail para você mesmo).";
  }
  function restaurar(ev) {
    var f = ev.target.files && ev.target.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var novo = limpar(JSON.parse(String(r.result)));
        if (!novo.lanc.length && !novo.dividas.length) { $("b-msg").textContent = "O arquivo não tem lançamentos nem dívidas válidos."; return; }
        estado = novo; salvar(); $("b-msg").textContent = "Backup restaurado: " + novo.lanc.length + " lançamentos e " + novo.dividas.length + " dívidas."; render();
      } catch (x) { $("b-msg").textContent = "Não consegui ler esse arquivo. Use um backup gerado por este aplicativo."; }
      ev.target.value = "";
    };
    r.readAsText(f);
  }

  /* IA opcional (função no Supabase; veja README). Só envia totais, sem descrições. */
  function carregarSupabase(cb) {
    if (window.supabase) return cb();
    var s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"; s.onload = cb; s.onerror = function () { cb(); };
    document.head.appendChild(s);
  }
  function pegarToken(cb) {
    if (sb) { sb.auth.getSession().then(function (r) { cb(r && r.data && r.data.session ? r.data.session.access_token : null); }, function () { cb(null); }); return; }
    if (!CFG.supabaseUrl || !CFG.supabaseKey) return cb(null);
    carregarSupabase(function () {
      if (!window.supabase) return cb(null);
      try { window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey).auth.getSession().then(function (r) { cb(r && r.data && r.data.session ? r.data.session.access_token : null); }, function () { cb(null); }); } catch (x) { cb(null); }
    });
  }
  function pedirIA() {
    var out = $("ia-out"), btn = $("ia-btn"), t = totais(mes), p = totais(addMes(mes, -1));
    btn.disabled = true; out.textContent = "Gerando análise…";
    pegarToken(function (token) {
      if (!token) { btn.disabled = false; out.innerHTML = 'Para usar a análise com IA, <a href="simulador.html">entre na sua conta no Simulador</a> e volte aqui.'; return; }
      var corpo = { mes: mes, receitas: t.rec, despesas: t.desp, porCategoria: t.porCat, mesAnterior: { receitas: p.rec, despesas: p.desp, porCategoria: p.porCat },
        dividas: estado.dividas.map(function (d) { return { saldo: d.saldo, jurosMensalPct: d.juros, parcela: d.parcela }; }) };
      fetch(CFG.iaUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, apikey: CFG.supabaseKey }, body: JSON.stringify(corpo) })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j && j.erro || "erro"); return j; }); })
        .then(function (j) { out.textContent = j.texto || "Sem resposta."; })
        .catch(function () { out.textContent = "Não consegui gerar a análise agora. Tente novamente mais tarde."; })
        .then(function () { btn.disabled = false; });
    });
  }

  /* ---------- nuvem (Supabase): login obrigatório e sincronização ---------- */
  function chave() { return nuvem ? KEY + ":" + (user ? user.id : "anon") : KEY; }
  function lerCache() {
    try { var s = localStorage.getItem(chave()); if (!s) return null; var j = JSON.parse(s); return { e: limpar(j.e), o: Array.isArray(j.o) ? j.o.slice(0, 5000) : [] }; } catch (x) { return null; }
  }
  function guardarCache() {
    try { localStorage.setItem(chave(), JSON.stringify(nuvem ? { v: 2, e: estado, o: outbox } : estado)); $("erro-salvar").hidden = true; }
    catch (x) { $("erro-salvar").hidden = false; }
  }
  function snapshotDe(e) {
    var s = { lanc: {}, div: {}, chat: JSON.stringify(e.chat), extra: JSON.stringify([e.orc, e.rec, e.contas, e.cartoes, e.metas, e.desafios]) };
    e.lanc.forEach(function (l) { s.lanc[l.id] = JSON.stringify(l); });
    e.dividas.forEach(function (d) { s.div[d.id] = JSON.stringify(d); });
    return s;
  }
  function linhaLanc(l) { return { user_id: user.id, id: l.id, tipo: l.tipo, valor: l.valor, cat: l.cat, data: l.data, descr: l.desc, forma: l.forma, banco: l.banco }; }
  function linhaDiv(d) { return { user_id: user.id, id: d.id, nome: d.nome, saldo: d.saldo, juros: d.juros, parcela: d.parcela }; }
  function enfileirar(op) { outbox = outbox.filter(function (o) { return !(o.k === op.k && o.id === op.id); }); outbox.push(op); }
  function difusao() {
    var novo = snapshotDe(estado);
    estado.lanc.forEach(function (l) { if (snap.lanc[l.id] !== novo.lanc[l.id]) enfileirar({ k: "lanc", a: "up", id: l.id, row: linhaLanc(l) }); });
    Object.keys(snap.lanc).forEach(function (id) { if (!(id in novo.lanc)) enfileirar({ k: "lanc", a: "del", id: id }); });
    estado.dividas.forEach(function (d) { if (snap.div[d.id] !== novo.div[d.id]) enfileirar({ k: "div", a: "up", id: d.id, row: linhaDiv(d) }); });
    Object.keys(snap.div).forEach(function (id) { if (!(id in novo.div)) enfileirar({ k: "div", a: "del", id: id }); });
    if (snap.chat !== novo.chat) enfileirar({ k: "chat", a: "up", id: "chat" });
    if (snap.extra !== novo.extra) enfileirar({ k: "extra", a: "up", id: "extra" });
    snap = novo;
  }
  function statusSync(modo) {
    var t = "";
    if (nuvem && user) t = modo === "sync" ? "Sincronizando…" : outbox.length ? "Salvo no aparelho · " + outbox.length + (outbox.length === 1 ? " alteração pendente" : " alterações pendentes") : "Sincronizado ✓";
    $("sync").textContent = t;
  }
  function erroRede(r) {
    var m = String((r && r.error && r.error.message) || "").toLowerCase(), st = r && r.status;
    return /fetch|network|load failed|timeout|failed to/.test(m) || st === 0 || st === 401 || st === 429 || st >= 500;
  }
  function requisicao(lote) {
    var op = lote[0], tabela = op.k === "lanc" ? "lancamentos" : op.k === "div" ? "dividas" : op.k === "extra" ? "assessor_extra" : "assessor_chat";
    if (op.k === "extra") return sb.from(tabela).upsert({ user_id: user.id, dados: { orc: estado.orc, rec: estado.rec, contas: estado.contas, cartoes: estado.cartoes, metas: estado.metas, desafios: estado.desafios }, atualizado_em: new Date().toISOString() }, { onConflict: "user_id" });
    if (op.k === "chat") return sb.from(tabela).upsert({ user_id: user.id, msgs: estado.chat, atualizado_em: new Date().toISOString() }, { onConflict: "user_id" });
    if (op.a === "del") return sb.from(tabela).delete().in("id", lote.map(function (o) { return o.id; }));
    return sb.from(tabela).upsert(lote.map(function (o) { return o.row; }), { onConflict: "user_id,id" });
  }
  function passo() {
    if (!outbox.length) return Promise.resolve(true);
    var op = outbox[0], n = 1;
    if (op.k !== "chat" && op.k !== "extra") while (n < outbox.length && n < 100 && outbox[n].k === op.k && outbox[n].a === op.a) n++;
    var lote = outbox.slice(0, n);
    return Promise.resolve(requisicao(lote)).then(function (r) {
      if (r && r.error) { if (erroRede(r)) return false; descartadas++; }
      outbox = outbox.filter(function (o) { return lote.indexOf(o) < 0; });
      guardarCache();
      return passo();
    }, function () { return false; });
  }
  function descarregar() {
    if (!sb || !user || enviando) return Promise.resolve();
    if (!outbox.length) { statusSync(); return Promise.resolve(); }
    enviando = true; statusSync("sync");
    return passo().then(function (ok) {
      enviando = false; guardarCache(); statusSync();
      if (ok && outbox.length) return descarregar();
    });
  }
  function pagina(tabela, colunas) {
    var todas = [], de = 0, tam = 1000;
    function prox() {
      return sb.from(tabela).select(colunas).order("id").range(de, de + tam - 1).then(function (r) {
        if (r.error) throw r.error;
        var d = r.data || []; todas = todas.concat(d);
        if (d.length === tam && todas.length < 20000) { de += tam; return prox(); }
        return todas;
      });
    }
    return prox();
  }
  function baixar() {
    if (!sb || !user) return Promise.resolve();
    return Promise.all([
      pagina("lancamentos", "id,tipo,valor,cat,data,descr,forma,banco"),
      pagina("dividas", "id,nome,saldo,juros,parcela"),
      sb.from("assessor_chat").select("msgs").maybeSingle(),
      Promise.resolve(sb.from("assessor_extra").select("dados").maybeSingle()).then(function (r) { return r; }, function () { return { data: null }; })
    ]).then(function (v) {
      if (outbox.length || enviando) return;
      var chat = v[2] && v[2].data && Array.isArray(v[2].data.msgs) ? v[2].data.msgs : [];
      var ex = v[3] && !v[3].error && v[3].data && v[3].data.dados && typeof v[3].data.dados === "object" ? v[3].data.dados : null;
      estado = limpar({
        lanc: v[0].map(function (r) { return { id: r.id, tipo: r.tipo, valor: +r.valor, cat: r.cat, data: r.data, desc: r.descr, forma: r.forma, banco: r.banco }; }),
        dividas: v[1].map(function (r) { return { id: r.id, nome: r.nome, saldo: +r.saldo, juros: +r.juros, parcela: +r.parcela }; }),
        chat: chat,
        orc: ex ? ex.orc : estado.orc, rec: ex ? ex.rec : estado.rec, contas: ex ? ex.contas : estado.contas, cartoes: ex ? ex.cartoes : estado.cartoes, metas: ex ? ex.metas : estado.metas, desafios: ex ? ex.desafios : estado.desafios
      });
      snap = snapshotDe(estado);
      if (!ex && (Object.keys(estado.orc).length || estado.rec.length || estado.contas.length || estado.cartoes.length || estado.metas.length || estado.desafios.length)) enfileirar({ k: "extra", a: "up", id: "extra" });
      gerarRecorrentes(); guardarCache(); statusSync(); render(); descarregar();
    }).catch(function () { statusSync(); });
  }
  function sincronizarTudo() { return descarregar().then(function () { if (!outbox.length) return baixar(); }); }

  function modo(gate) { document.body.classList.toggle("ap-gate", gate); document.body.classList.toggle("ap-ok", !gate); }
  function mostrarLogin() { modo(true); $("gate").hidden = false; $("gate-wait").hidden = true; $("gate-box").hidden = false; }
  function saudacao(u) {
    var meta = u.user_metadata || {}, fallback = meta.nome || meta.full_name || meta.name || u.email || "";
    $("ola").textContent = fallback ? "Olá, " + String(fallback).split(" ")[0] : "";
    if (!sb) return;
    sb.from("perfis").select("nome").eq("id", u.id).maybeSingle().then(function (r) {
      var n = r && r.data && r.data.nome; if (n) $("ola").textContent = "Olá, " + String(n).split(" ")[0];
    }, function () {});
  }
  function verLegado() {
    try {
      var s = localStorage.getItem(KEY); if (!s) return;
      var l = limpar(JSON.parse(s)); if (!l.lanc.length && !l.dividas.length) { localStorage.removeItem(KEY); return; }
      $("legado-txt").textContent = "Encontramos " + l.lanc.length + (l.lanc.length === 1 ? " lançamento" : " lançamentos") + " e " + l.dividas.length + (l.dividas.length === 1 ? " dívida" : " dívidas") + " salvos neste aparelho, de antes do login. Quer enviar para a sua conta?";
      $("legado").hidden = false; legadoDados = l;
    } catch (x) {}
  }
  /* Link de atalho: assessor.html?l=gastei 30 no mercado (ou ?aba=resumo). Lido uma vez e tirado do endereço; o lançamento só acontece depois que você confirma. */
  var pedido = (function () {
    var o = { l: "", aba: "", foco: false };
    try {
      var q = new URLSearchParams(location.search);
      o.l = String(q.get("l") || q.get("t") || "").replace(/\s+/g, " ").trim().slice(0, 500);
      o.aba = String(q.get("aba") || ""); o.foco = q.get("foco") === "1";
      if (q.has("l") || q.has("t") || q.has("u") || q.has("aba") || q.has("foco")) history.replaceState(null, "", location.pathname + location.hash);
    } catch (x) {}
    return o;
  })();
  function mostrarPedido() {
    var bar = $("pedido-bar"); if (!bar || !pedido.l) return;
    $("pedido-txt").textContent = pedido.l; bar.hidden = false;
  }
  function iniciarUI() {
    gerarRecorrentes();
    var h0 = (location.hash || "").slice(1), alvo = TABS.indexOf(pedido.aba) >= 0 ? pedido.aba : TABS.indexOf(h0) >= 0 ? h0 : "chat";
    if (pedido.l) alvo = "chat";
    setTab(alvo);
    mostrarPedido();
    if (pedido.foco && alvo === "chat" && $("chat-in")) setTimeout(function () { $("chat-in").focus(); }, 300);
    pedido.aba = ""; pedido.foco = false;
  }
  function entrou(u) {
    if (user && user.id === u.id) return;
    user = u; modo(false); $("gate").hidden = true;
    var c = lerCache(); estado = c ? c.e : vazio(); outbox = c ? c.o : []; snap = snapshotDe(estado);
    $("priv").querySelector("summary").innerHTML = "<strong>Seus dados ficam salvos na sua conta</strong> (toque para ler mais)";
    $("priv").querySelector("p").textContent = "Os lançamentos, as dívidas e o histórico do chat são guardados com segurança na sua conta e sincronizados entre os seus aparelhos. Só você os vê. Uma cópia fica no aparelho para funcionar sem internet. Ferramenta educativa, não é consultoria financeira.";
    $("sair").hidden = false; saudacao(u); verLegado(); statusSync(); iniciarUI();
    sincronizarTudo();
  }
  function saiu() {
    user = null; estado = vazio(); outbox = []; snap = snapshotDe(estado);
    $("sair").hidden = true; $("ola").textContent = ""; $("sync").textContent = ""; $("legado").hidden = true;
    mostrarLogin();
  }
  function sairDaConta() {
    descarregar().then(function () {
      if (outbox.length) toast("Há alterações que ainda não sincronizaram. Elas ficam guardadas neste aparelho.");
      else { try { localStorage.removeItem(chave()); } catch (x) {} }
      return sb ? sb.auth.signOut() : null;
    }).then(function () { if (!sb) saiu(); }, function () { saiu(); });
  }
  function usuarioEmCache() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (/^sb-.*-auth-token$/.test(k)) { var j = JSON.parse(localStorage.getItem(k)); var u = j && (j.user || (j.currentSession && j.currentSession.user)); if (u && u.id) return u; }
      }
    } catch (x) {}
    return null;
  }
  function msgAuth(e) {
    var m = String((e && e.message) || e || "").toLowerCase();
    if (m.indexOf("invalid login") >= 0) return "E-mail ou senha incorretos.";
    if (m.indexOf("not confirmed") >= 0) return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
    if (m.indexOf("rate limit") >= 0 || m.indexOf("too many") >= 0) return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
    if (m.indexOf("fetch") >= 0 || m.indexOf("network") >= 0) return "Sem conexão. Verifique a internet e tente de novo.";
    return "Não foi possível entrar. Tente novamente.";
  }
  function marcarVoltar() { try { localStorage.setItem("quox-voltar", "assessor.html@" + Date.now()); } catch (x) {} }
  function baseSite() { return location.origin + location.pathname.replace(/[^\/]*$/, ""); }
  function iniciarNuvem() {
    $("gate").hidden = false; modo(true);
    carregarSupabase(function () {
      if (!window.supabase) {
        var u = usuarioEmCache();
        if (u && lerCacheDe(u)) { entrou(u); } else { $("gate-wait").textContent = "Sem conexão. Conecte-se à internet para entrar."; }
        return;
      }
      sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
      sb.auth.onAuthStateChange(function (ev, session) {
        if (ev === "SIGNED_OUT") { setTimeout(saiu, 0); return; }
        if (ev === "TOKEN_REFRESHED" || ev === "PASSWORD_RECOVERY") return;
        if (session && session.user) setTimeout(function () { entrou(session.user); }, 0);
      });
      sb.auth.getSession().then(function (r) {
        var s = r && r.data && r.data.session;
        if (s) entrou(s.user); else if (!user) mostrarLogin();
      }, function () { if (!user) mostrarLogin(); });
    });
  }
  function lerCacheDe(u) { try { return !!localStorage.getItem(KEY + ":" + u.id); } catch (x) { return false; } }


  /* ---------- Fase 1: orçamento, contas a pagar, recorrentes e voz ---------- */
  function mesDia(ym, dia) { var u = new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate(); return ym + "-" + pad(Math.min(dia, u)); }
  function diasEntre(a, b) { var pa = a.split("-"), pb = b.split("-"); return Math.round((Date.UTC(+pb[0], +pb[1] - 1, +pb[2]) - Date.UTC(+pa[0], +pa[1] - 1, +pa[2])) / 86400000); }
  function dmy(iso) { return iso.split("-").reverse().join("/"); }
  function gastoCat(cat, ym) { var s = 0; estado.lanc.forEach(function (l) { if (l.tipo === "despesa" && l.cat === cat && l.data.slice(0, 7) === ym) s += l.valor; }); return s; }
  function avisoOrc(l, antes) {
    if (l.tipo !== "despesa") return "";
    var lim = estado.orc[l.cat]; if (!lim) return "";
    var ym = l.data.slice(0, 7), dep = gastoCat(l.cat, ym), a = antes / lim * 100, d = dep / lim * 100;
    if (d >= 100 && a < 100) return "Limite estourado em " + l.cat + ": " + R(dep) + " de " + R(lim) + " em " + mesLabel(ym) + ".";
    if (d >= 80 && a < 80) return "Atenção: " + l.cat + " já está em " + pct(d) + " do limite (" + R(dep) + " de " + R(lim) + ").";
    return "";
  }
  function orcBarras(acoes) {
    var cats = Object.keys(estado.orc).sort(); if (!cats.length) return "";
    return cats.map(function (c) {
      var lim = estado.orc[c], g = gastoCat(c, mes), p = g / lim * 100, cl = p >= 100 ? "over" : p >= 80 ? "warn" : "ok";
      return '<div class="barra"><div class="t"><span>' + esc(c) + "</span><span>" + R(g) + " de " + R(lim) + " · " + pct(p) + '</span></div><div class="trilho"><span class="fill ' + cl + '" style="width:' + Math.min(100, Math.max(2, p)) + '%"></span></div>' +
        (acoes ? '<div class="acs"><button class="mini-b" type="button" data-oed="' + esc(c) + '">Editar</button><button class="mini-b perigo" type="button" data-odel="' + esc(c) + '">Remover</button></div>' : "") + "</div>";
    }).join("");
  }
  function statusConta(c) {
    var d = diasEntre(hoje(), c.venc);
    if (d < 0) return { t: "Atrasada há " + (-d) + (d === -1 ? " dia" : " dias"), cl: "over" };
    if (d === 0) return { t: "Vence hoje", cl: "warn" };
    if (d === 1) return { t: "Vence amanhã", cl: "warn" };
    return { t: "Vence em " + d + " dias", cl: d <= 3 ? "warn" : "ok" };
  }
  function pendentes() { return estado.contas.filter(function (c) { return !c.pago; }).sort(function (a, b) { return a.venc < b.venc ? -1 : a.venc > b.venc ? 1 : 0; }); }
  function itemConta(c) {
    var s = statusConta(c);
    return '<div class="item"><div class="l"><b>' + esc(c.nome) + "</b><small>" + dmy(c.venc) + (c.repete ? " · todo mês" : "") + '</small><span class="st ' + s.cl + '">' + esc(s.t) + '</span><div class="acs"><button class="mini-b" type="button" data-cpagar="' + esc(c.id) + '">Marcar como paga</button><button class="mini-b perigo" type="button" data-cdel="' + esc(c.id) + '">Excluir</button></div></div><div class="v neg">' + R(c.valor) + "</div></div>";
  }
  function renderPlanejar() {
    $("o-cat").innerHTML = CATS_D.filter(function (c) { return c !== "Outros"; }).concat(["Outros"]).map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + "</option>"; }).join("");
    $("r-cat").innerHTML = (recTipo() === "receita" ? CATS_R : CATS_D).map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + "</option>"; }).join("");
    $("o-lista").innerHTML = orcBarras(true) || '<p class="vazio">Nenhum limite definido. Escolha uma categoria e um valor mensal, e eu aviso quando você chegar a 80% e a 100%.</p>';
    $("o-lista").querySelectorAll("[data-oed]").forEach(function (b) { b.addEventListener("click", function () { var c = b.getAttribute("data-oed"); $("o-cat").value = c; $("o-valor").value = String(estado.orc[c]).replace(".", ","); $("o-valor").focus(); }); });
    $("o-lista").querySelectorAll("[data-odel]").forEach(function (b) { duplo(b, "Confirmar?", function () { delete estado.orc[b.getAttribute("data-odel")]; salvar(); render(); }); });
    var pend = pendentes(), pagas = estado.contas.filter(function (c) { return c.pago; }).sort(function (a, b) { return a.pagoEm < b.pagoEm ? 1 : -1; }).slice(0, 5);
    $("c-lista").innerHTML = pend.length ? pend.map(itemConta).join("") : '<p class="vazio">Nenhuma conta a pagar. Cadastre aqui ou escreva no chat, por exemplo: conta de luz 150 vence dia 10.</p>';
    $("c-pagas").innerHTML = pagas.length ? '<details class="cat"><summary><span class="cn">Pagas recentemente</span></summary>' + pagas.map(function (c) {
      return '<div class="item"><div class="l"><b>' + esc(c.nome) + "</b><small>Paga em " + dmy(c.pagoEm) + '</small><div class="acs"><button class="mini-b" type="button" data-cdesf="' + esc(c.id) + '">Desfazer pagamento</button></div></div><div class="v">' + R(c.valor) + "</div></div>";
    }).join("") + "</details>" : "";
    $("c-lista").querySelectorAll("[data-cpagar]").forEach(function (b) { b.addEventListener("click", function () { pagarConta(b.getAttribute("data-cpagar")); }); });
    $("c-lista").querySelectorAll("[data-cdel]").forEach(function (b) { duplo(b, "Confirmar?", function () { estado.contas = estado.contas.filter(function (x) { return x.id !== b.getAttribute("data-cdel"); }); salvar(); render(); }); });
    $("c-pagas").querySelectorAll("[data-cdesf]").forEach(function (b) { b.addEventListener("click", function () { desfazerPagamento(b.getAttribute("data-cdesf")); }); });
    $("r-lista").innerHTML = estado.rec.length ? estado.rec.map(function (r) {
      return '<div class="item"><div class="l"><b>' + esc(r.desc || r.cat) + "</b><small>" + esc(r.cat) + " · todo dia " + r.dia + '</small><div class="acs"><button class="mini-b perigo" type="button" data-rdel="' + esc(r.id) + '">Excluir</button></div></div><div class="v ' + (r.tipo === "receita" ? "pos" : "neg") + '">' + (r.tipo === "receita" ? "+" : "−") + R(r.valor) + "</div></div>";
    }).join("") : '<p class="vazio">Nenhum lançamento automático. Cadastre salário, aluguel, assinaturas e outros valores que se repetem todo mês.</p>';
    $("r-lista").querySelectorAll("[data-rdel]").forEach(function (b) { duplo(b, "Confirmar?", function () { estado.rec = estado.rec.filter(function (x) { return x.id !== b.getAttribute("data-rdel"); }); salvar(); render(); toast("Excluído. Os lançamentos já criados continuam no extrato."); }); });
  }
  function recTipo() { var r = document.querySelector('input[name="r-tipo"]:checked'); return r ? r.value : "despesa"; }
  function pagarConta(id, doChat) {
    var c = estado.contas.filter(function (x) { return x.id === id; })[0]; if (!c || c.pago) return "Essa conta já está paga.";
    var l = { id: "c" + c.id, tipo: "despesa", valor: c.valor, cat: c.cat || "Outros", data: hoje(), desc: c.nome.slice(0, 80), forma: "", banco: "" };
    var antes = gastoCat(l.cat, l.data.slice(0, 7));
    estado.lanc = estado.lanc.filter(function (x) { return x.id !== l.id; }); estado.lanc.push(l);
    c.pago = true; c.pagoEm = hoje();
    if (c.repete) {
      var p = c.venc.split("-"), prox = mesDia(addMes(p[0] + "-" + p[1], 1), c.dia || +p[2]), nova = { id: uid(), nome: c.nome, valor: c.valor, venc: prox, cat: c.cat, repete: true, dia: c.dia || +p[2], pago: false, pagoEm: "", prox: "" };
      estado.contas.push(nova); c.prox = nova.id;
    }
    var pagas = estado.contas.filter(function (x) { return x.pago; }).sort(function (a, b) { return a.pagoEm < b.pagoEm ? 1 : -1; });
    pagas.slice(20).forEach(function (x) { estado.contas = estado.contas.filter(function (y) { return y !== x; }); });
    var av = avisoOrc(l, antes), txt = "Dei baixa em " + c.nome + " (" + R(c.valor) + ") e lancei nas despesas." + (c.repete ? " A próxima vence em " + dmy(estado.contas[estado.contas.length - 1].venc) + "." : "") + (av ? "\n" + av : "");
    salvar(); render();
    if (!doChat) toast(txt.split("\n")[0]);
    return txt;
  }
  function desfazerPagamento(id) {
    var c = estado.contas.filter(function (x) { return x.id === id; })[0]; if (!c) return;
    estado.lanc = estado.lanc.filter(function (x) { return x.id !== "c" + c.id; });
    if (c.prox) estado.contas = estado.contas.filter(function (x) { return !(x.id === c.prox && !x.pago); });
    c.pago = false; c.pagoEm = ""; c.prox = "";
    salvar(); render(); toast("Pagamento desfeito");
  }
  function contaPorTexto(n) {
    var tk = n.split(/[^a-z0-9]+/), ach = null, mx = 0;
    pendentes().forEach(function (c) {
      var ws = PA.sem(c.nome).split(/[^a-z0-9]+/).filter(function (w) { return w.length >= 3 && ["conta", "contas", "pagar", "dos", "das", "para"].indexOf(w) < 0; });
      var k = ws.filter(function (w) { return tk.indexOf(w) >= 0; }).length;
      if (k > mx) { mx = k; ach = c; }
    });
    return ach;
  }
  function novaConta(nome, valor, venc, cat, repete) {
    var c = { id: uid(), nome: nome.slice(0, 40), valor: valor, venc: venc, cat: cat || "Outros", repete: !!repete, dia: +venc.slice(8), pago: false, pagoEm: "", prox: "" };
    estado.contas.push(c); return c;
  }
  function adicionarContaChat(frase) {
    var r = PA.interpretarConta(frase, new Date());
    if (!r.ok) return r.erro === "sem-data" ? "Entendi o valor " + R(r.valor) + ", mas faltou o vencimento. Escreva assim: conta de luz " + String(r.valor).replace(".", ",") + " vence dia 10." : "Não consegui entender essa conta. Exemplo: conta de luz 150 vence dia 10.";
    var c = novaConta(r.nome, r.valor, r.venc, r.cat, r.repete);
    return "Conta anotada: " + c.nome + ", " + R(c.valor) + ", vence em " + dmy(c.venc) + (c.repete ? " (todo mês)" : "") + ". Vou avisar aqui no topo quando estiver perto. Para dar baixa, escreva \"paguei " + c.nome.toLowerCase() + "\".";
  }
  function definirLimiteChat(r) {
    estado.orc[r.cat] = r.valor;
    var g = gastoCat(r.cat, mesReal());
    return "Limite de " + r.cat + " definido em " + R(r.valor) + " por mês. Neste mês você já gastou " + R(g) + " (" + pct(g / r.valor * 100) + "). Aviso quando chegar a 80% e a 100%.";
  }
  function respostaContas() {
    var p = pendentes(); if (!p.length) return "Você não tem contas a pagar cadastradas. Exemplo: conta de luz 150 vence dia 10.";
    return "Contas a pagar:\n" + p.slice(0, 8).map(function (c) { return "• " + c.nome + ": " + R(c.valor) + ", " + statusConta(c).t.toLowerCase() + " (" + dmy(c.venc) + ")"; }).join("\n") + (p.length > 8 ? "\n… e mais " + (p.length - 8) + " na aba Planejar." : "");
  }
  function respostaOrcamento() {
    var cs = Object.keys(estado.orc).sort(); if (!cs.length) return "Você ainda não definiu limites. Exemplo: limite alimentação 800.";
    var m = mesReal();
    return "Seus limites em " + mesLabel(m) + ":\n" + cs.map(function (c) { var g = gastoCat(c, m); return "• " + c + ": " + R(g) + " de " + R(estado.orc[c]) + " (" + pct(g / estado.orc[c] * 100) + ")"; }).join("\n");
  }
  function renderAvisos() {
    var el = $("avisos"); if (!el) return;
    var at = 0, hj = 0, pr = 0, partes = [];
    pendentes().forEach(function (c) { var d = diasEntre(hoje(), c.venc); if (d < 0) at++; else if (d === 0) hj++; else if (d <= 3) pr++; });
    if (at) partes.push(at + (at === 1 ? " conta atrasada" : " contas atrasadas"));
    if (hj) partes.push(hj + (hj === 1 ? " conta vence hoje" : " contas vencem hoje"));
    if (pr) partes.push(pr + (pr === 1 ? " conta vence" : " contas vencem") + " em até 3 dias");
    var exA = window.QuoxApp && window.QuoxApp.avisosExtra ? window.QuoxApp.avisosExtra() : []; exA.forEach(function (x) { partes.push(x); });
    var m = mesReal(), estouro = Object.keys(estado.orc).filter(function (c) { return gastoCat(c, m) >= estado.orc[c]; });
    if (estouro.length) partes.push("limite estourado: " + estouro.slice(0, 2).join(", ") + (estouro.length > 2 ? " e mais " + (estouro.length - 2) : ""));
    if (!partes.length) { el.hidden = true; el.innerHTML = ""; return; }
    el.hidden = false; el.className = "avisos" + (at || estouro.length ? " over" : "");
    el.innerHTML = "<span><b>Atenção:</b> " + esc(partes.join(" · ")) + '</span><button class="link-b" type="button" id="av-ver">Ver</button>';
    $("av-ver").addEventListener("click", function () { setTab("planejar"); });
  }
  function gerarRecorrentes() {
    var h = hoje(), ym = h.slice(0, 7), mudou = false;
    estado.rec.forEach(function (r) {
      var m = addMes(r.ult, 1), n = 0;
      while (m <= ym && n < 12) {
        var data = mesDia(m, r.dia); if (data > h) break;
        var id = "r" + r.id + "_" + m;
        if (!estado.lanc.some(function (x) { return x.id === id; })) estado.lanc.push({ id: id, tipo: r.tipo, valor: r.valor, cat: r.cat, data: data, desc: r.desc, forma: "", banco: "" });
        r.ult = m; mudou = true; m = addMes(m, 1); n++;
      }
    });
    if (mudou) { if (typeof salvarSeguro === "function") salvarSeguro(); }
  }
  function salvarSeguro() { if (nuvem && !user) return; salvar(); }
  function submitConta(ev) {
    ev.preventDefault();
    var nome = $("c-nome").value.trim() || "Conta", v = parseBR($("c-valor").value), d = $("c-venc").value, er = $("c-erro");
    if (!isFinite(v) || v <= 0) { er.textContent = "Informe o valor da conta."; return; }
    if (!dataValida(d)) { er.textContent = "Escolha a data de vencimento."; return; }
    er.textContent = "";
    novaConta(nome, Math.round(v * 100) / 100, d, $("c-cat").value, $("c-rep").checked);
    $("c-nome").value = ""; $("c-valor").value = ""; $("c-venc").value = ""; $("c-rep").checked = false;
    salvar(); render(); toast("Conta cadastrada");
  }
  function submitOrc(ev) {
    ev.preventDefault();
    var v = parseBR($("o-valor").value), er = $("o-erro");
    if (!isFinite(v) || v <= 0) { er.textContent = "Informe o limite mensal em reais."; return; }
    er.textContent = ""; estado.orc[$("o-cat").value] = Math.round(v * 100) / 100; $("o-valor").value = "";
    salvar(); render(); toast("Limite salvo");
  }
  function submitRec(ev) {
    ev.preventDefault();
    var v = parseBR($("r-valor").value), dia = Math.round(+$("r-dia").value), er = $("r-erro");
    if (!isFinite(v) || v <= 0) { er.textContent = "Informe o valor."; return; }
    if (!(dia >= 1 && dia <= 31)) { er.textContent = "Informe o dia do mês (1 a 31)."; return; }
    er.textContent = "";
    var inicio = $("r-prox").checked ? addMes(mesReal(), 1) : mesReal();
    estado.rec.push({ id: uid().slice(0, 12), tipo: recTipo(), valor: Math.round(v * 100) / 100, cat: $("r-cat").value, desc: $("r-desc").value.trim().slice(0, 80), dia: dia, ult: addMes(inicio, -1) });
    $("r-valor").value = ""; $("r-desc").value = ""; $("r-dia").value = ""; $("r-prox").checked = false;
    gerarRecorrentes(); salvar(); render(); toast("Lançamento automático cadastrado");
  }
  /* voz: usa o reconhecimento de fala do navegador */
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition, ouvindo = null, PH_CHAT = "";
  function iniciarVoz() {
    var b = $("chat-mic"); if (!b) return;
    if (!SR) { b.hidden = true; return; }
    PH_CHAT = $("chat-in").placeholder;
    b.addEventListener("click", function () {
      if (ouvindo) { ouvindo.stop(); return; }
      var r = new SR(), fim = "";
      r.lang = "pt-BR"; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
      r.onstart = function () { ouvindo = r; b.classList.add("gravando"); b.setAttribute("aria-pressed", "true"); $("chat-in").placeholder = "Ouvindo… fale o gasto"; };
      r.onresult = function (ev) { var t = ""; for (var i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript; $("chat-in").value = t; if (ev.results[ev.results.length - 1].isFinal) fim = t; };
      r.onerror = function (ev) {
        if (ev.error === "not-allowed" || ev.error === "service-not-allowed") toast("Permita o uso do microfone para falar os gastos.");
        else if (ev.error === "no-speech") toast("Não ouvi nada. Toque no microfone e tente de novo.");
        else if (ev.error === "network") toast("Sem internet para reconhecer a voz.");
      };
      r.onend = function () { ouvindo = null; b.classList.remove("gravando"); b.setAttribute("aria-pressed", "false"); $("chat-in").placeholder = PH_CHAT; if (fim.trim()) enviarChat(fim); };
      try { r.start(); } catch (x) { ouvindo = null; }
    });
  }

  /* ---------- eventos ---------- */
  document.querySelectorAll(".ap-tabs button").forEach(function (b) { b.addEventListener("click", function () { setTab(b.getAttribute("data-tab")); }); });
  $("mes-ant").addEventListener("click", function () { mes = addMes(mes, -1); render(); });
  $("mes-prox").addEventListener("click", function () { mes = addMes(mes, 1); render(); });
  document.querySelectorAll('input[name="tipo"]').forEach(function (r) { r.addEventListener("change", function () { preencherCats(tipoSel()); }); });
  $("f-lanc").addEventListener("submit", submitLanc);
  $("l-cancel").addEventListener("click", function () { fimEdicao(); });
  $("chat-form").addEventListener("submit", function (ev) { ev.preventDefault(); enviarChat($("chat-in").value); });
  $("chat-in").addEventListener("keydown", function (ev) { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); enviarChat($("chat-in").value); } });
  $("chat-manual").addEventListener("click", function () { setTab("lancar"); });
  $("ir-chat").addEventListener("click", function (ev) { ev.preventDefault(); setTab("chat"); });
  document.querySelectorAll("#cat-seg button").forEach(function (b) { b.addEventListener("click", function () { catTipo = b.getAttribute("data-tp"); renderCategorias(); }); });
  $("x-pag").addEventListener("change", renderExtrato);
  $("bancos-dl").innerHTML = BANCOS.map(function (b) { return '<option value="' + esc(b) + '">'; }).join("");
  $("l-forma").innerHTML = '<option value="">Não informado</option>' + FORMAS.map(function (f) { return '<option value="' + esc(f) + '">' + esc(f) + "</option>"; }).join("");
  $("f-div").addEventListener("submit", submitDiv);
  $("f-conta").addEventListener("submit", submitConta);
  $("f-orc").addEventListener("submit", submitOrc);
  $("f-rec").addEventListener("submit", submitRec);
  document.querySelectorAll('input[name="r-tipo"]').forEach(function (r) { r.addEventListener("change", renderPlanejar); });
  $("c-cat").innerHTML = CATS_D.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + "</option>"; }).join("");
  iniciarVoz();
  $("d-cancel").addEventListener("click", fimEdicaoDiv);
  $("x-tipo").addEventListener("change", renderExtrato);
  $("x-busca").addEventListener("input", renderExtrato);
  $("p-extra").addEventListener("input", renderPlano);
  $("p-met").addEventListener("change", renderPlano);
  $("b-print").addEventListener("click", function () { window.print(); });
  $("b-xlsx").addEventListener("click", function () { exportarXlsx(false); });
  $("b-xlsx-tudo").addEventListener("click", function () { exportarXlsx(true); });
  $("b-csv").addEventListener("click", function () { exportarCsv(false); });
  $("b-csv-tudo").addEventListener("click", function () { exportarCsv(true); });
  $("b-backup").addEventListener("click", backup);
  $("b-restaurar").addEventListener("change", restaurar);
  duplo($("b-apagar"), "Clique de novo para apagar tudo", function () { estado = vazio(); salvar(); fimEdicao(); fimEdicaoDiv(); $("b-msg").textContent = nuvem ? "Todos os dados foram apagados da sua conta." : "Todos os dados foram apagados deste aparelho."; render(); });
  if (CFG.iaUrl) { $("ia-box").hidden = false; $("ia-btn").addEventListener("click", pedirIA); }

  $("g-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var em = $("g-email").value.trim(), se = $("g-senha").value, er = $("g-erro");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em) || !se) { er.textContent = "Informe e-mail e senha."; return; }
    if (!sb) { er.textContent = "Sem conexão. Tente de novo."; return; }
    er.textContent = "Entrando…";
    sb.auth.signInWithPassword({ email: em, password: se }).then(function (r) {
      if (r.error) { er.textContent = msgAuth(r.error); return; }
      er.textContent = ""; $("g-senha").value = "";
      if (r.data && r.data.session) entrou(r.data.session.user);
    }, function (x) { er.textContent = msgAuth(x); });
  });
  $("g-google").addEventListener("click", function () {
    if (!sb) return;
    marcarVoltar();
    sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: baseSite(), skipBrowserRedirect: true } }).then(function (r) {
      var er = $("g-erro");
      if (r && r.error) { er.textContent = msgAuth(r.error); return; }
      var u = r && r.data && r.data.url;
      if (!u) { er.textContent = "Não foi possível iniciar o login."; return; }
      if (u.indexOf("apikey=") < 0) u += (u.indexOf("?") < 0 ? "?" : "&") + "apikey=" + encodeURIComponent(CFG.supabaseKey);
      location.href = u;
    }, function (x) { $("g-erro").textContent = msgAuth(x); });
  });
  document.querySelectorAll("[data-voltar]").forEach(function (a) { a.addEventListener("click", marcarVoltar); });
  $("sair").addEventListener("click", sairDaConta);
  $("leg-imp").addEventListener("click", function () {
    var l = legadoDados; if (!l) return;
    var ids = {};
    estado.lanc.forEach(function (x) { ids[x.id] = 1; });
    l.lanc.forEach(function (x) { if (!ids[x.id]) estado.lanc.push(x); });
    var idd = {}; estado.dividas.forEach(function (x) { idd[x.id] = 1; });
    l.dividas.forEach(function (x) { if (!idd[x.id]) estado.dividas.push(x); });
    salvar(); try { localStorage.removeItem(KEY); } catch (x) {}
    $("legado").hidden = true; legadoDados = null; toast("Dados enviados para a sua conta"); render();
  });
  duplo($("leg-desc"), "Confirmar descarte?", function () { try { localStorage.removeItem(KEY); } catch (x) {} $("legado").hidden = true; legadoDados = null; });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) { gerarRecorrentes(); render(); } if (!document.hidden && nuvem && user) sincronizarTudo(); });
  window.addEventListener("online", function () { if (nuvem && user) sincronizarTudo(); });
  setInterval(function () { if (nuvem && user && outbox.length) descarregar(); }, 30000);

  /* instalar como app */
  var adiado = null;
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); adiado = e; $("instalar").hidden = false; });
  $("instalar").addEventListener("click", function () { if (!adiado) return; adiado.prompt(); adiado = null; $("instalar").hidden = true; });
  window.addEventListener("appinstalled", function () { $("instalar").hidden = true; toast("Aplicativo instalado"); });
  var ua = navigator.userAgent || "", ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var iosVisto = false; try { iosVisto = localStorage.getItem("quox-ios-dica") === "1"; } catch (x) {}
  if (ios && !navigator.standalone && !iosVisto) $("ios-dica").hidden = false;
  $("ios-fechar").addEventListener("click", function () { $("ios-dica").hidden = true; try { localStorage.setItem("quox-ios-dica", "1"); } catch (x) {} });

  window.addEventListener("hashchange", function () { var h = (location.hash || "").slice(1); if (TABS.indexOf(h) >= 0 && h !== tabAtual) setTab(h); });
  window.QuoxApp = Object.assign(window.QuoxApp || {}, {
    estado: function () { return estado; }, salvar: salvar, render: render, setTab: setTab, mes: function () { return mes; },
    user: function () { return user; }, sb: function () { return sb; }, nuvem: nuvem, enviarChat: enviarChat, pushChat: pushChat,
    R: R, pct: pct, esc: esc, uid: uid, hoje: hoje, addMes: addMes, mesLabel: mesLabel, parseBR: parseBR, toast: toast, duplo: duplo,
    insights: insights, itemLanc: itemLanc, ligarAcoes: ligarAcoes, dataValida: dataValida, catsOrdenadas: catsOrdenadas, totais: totais, corCat: corCat,
    chat: (window.QuoxApp && window.QuoxApp.chat) || [], avisosExtra: window.QuoxApp && window.QuoxApp.avisosExtra
  });
  if (nuvem) iniciarNuvem(); else { document.body.classList.add("ap-ok"); iniciarUI(); }
})();
