/* QUOX - Assessor financeiro. Tudo roda no navegador; os dados ficam no localStorage deste aparelho. */
(function () {
  "use strict";
  var CFG = window.QUOX_CFG || {};
  var KEY = "quox-assessor-v1";
  var nuvem = !!(CFG.supabaseUrl && CFG.supabaseKey);
  var sb = null, user = null, snap = { lanc: {}, div: {}, chat: "[]" }, outbox = [], enviando = false, descartadas = 0, legadoDados = null;
  var PA = window.QuoxParser;
  var CATS_D = PA.CATS_D, CATS_R = PA.CATS_R, FORMAS = PA.FORMAS, BANCOS = PA.BANCOS;
  var TABS = ["chat", "resumo", "categorias", "extrato", "dividas", "relatorio", "lancar"];
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
  function vazio() { return { v: 1, lanc: [], dividas: [], chat: [] }; }
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
    return r;
  }
  function carregar() { try { var s = localStorage.getItem(KEY); return s ? limpar(JSON.parse(s)) : vazio(); } catch (x) { return vazio(); } }
  function salvar() {
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
    TABS.forEach(function (n) { $("t-" + n).hidden = n !== nome; });
    var marca = nome === "lancar" ? "chat" : nome;
    $("chat-form").addEventListener("submit", function (ev) { ev.preventDefault(); enviarChat($("chat-in").value); });
  $("chat-in").addEventListener("keydown", function (ev) { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); enviarChat($("chat-in").value); } });
  $("chat-manual").addEventListener("click", function () { setTab("lancar"); });
  $("ir-chat").addEventListener("click", function (ev) { ev.preventDefault(); setTab("chat"); });
  document.querySelectorAll("#cat-seg button").forEach(function (b) { b.addEventListener("click", function () { catTipo = b.getAttribute("data-tp"); renderCategorias(); }); });
  $("x-pag").addEventListener("change", renderExtrato);
  $("bancos-dl").innerHTML = BANCOS.map(function (b) { return '<option value="' + esc(b) + '">'; }).join("");
  $("l-forma").innerHTML = '<option value="">Não informado</option>' + FORMAS.map(function (f) { return '<option value="' + esc(f) + '">' + esc(f) + "</option>"; }).join("");
  document.querySelectorAll(".ap-tabs button").forEach(function (b) { if (b.getAttribute("data-tab") === marca) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    $("mes-nav").hidden = !(nome === "resumo" || nome === "categorias" || nome === "extrato" || nome === "relatorio");
    try { history.replaceState(null, "", "#" + nome); } catch (x) {}
    render();
    if (nome === "chat") rolarChat(); else window.scrollTo(0, 0);
  }
  function render() {
    $("mes-txt").textContent = mesLabel(mes);
    if (tabAtual === "chat") renderChat();
    else if (tabAtual === "resumo") renderResumo();
    else if (tabAtual === "categorias") renderCategorias();
    else if (tabAtual === "extrato") renderExtrato();
    else if (tabAtual === "dividas") renderDividas();
    else if (tabAtual === "relatorio") renderRelatorio();
    else if (tabAtual === "lancar") renderLancar();
  }
  function dicasHtml(lista, max) {
    return lista.slice(0, max || 99).map(function (i) { return '<div class="dica ' + i.n + '">' + esc(i.t) + "</div>"; }).join("");
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
    $("barras").innerHTML = barrasHtml(t);
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
  function itemLanc(l, acoes) {
    return '<div class="item"><div class="l"><b>' + esc(l.desc || l.cat) + "</b><small>" + esc(l.cat) + " · " + l.data.split("-").reverse().join("/") + (l.tipo === "despesa" && (l.forma || l.banco) ? " · " + esc(pagLabel(l)) : "") + "</small>" +
      (acoes ? '<div class="acs"><button class="mini-b" data-ed="' + esc(l.id) + '" type="button">Editar</button><button class="mini-b perigo" data-del="' + esc(l.id) + '" type="button">Excluir</button></div>' : "") +
      '</div><div class="v ' + (l.tipo === "receita" ? "pos" : "neg") + '">' + (l.tipo === "receita" ? "+" : "−") + R(l.valor) + "</div></div>";
  }
  function ligarAcoes(raiz) {
    raiz.querySelectorAll("[data-ed]").forEach(function (b) { b.addEventListener("click", function () { iniciarEdicao(b.getAttribute("data-ed")); }); });
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
    $("l-data").value = l.data; $("l-desc").value = l.desc; $("l-forma").value = l.forma || ""; $("l-banco").value = l.banco || "";
    $("f-titulo").textContent = "Editar lançamento"; $("l-salvar").textContent = "Salvar alterações"; $("l-cancel").hidden = false;
  }
  function fimEdicao() {
    editLanc = null; $("l-valor").value = ""; $("l-desc").value = ""; $("l-banco").value = ""; $("l-forma").value = ""; $("l-data").value = hoje();
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
  function mesReal() { return hoje().slice(0, 7); }
  function pushChat(de, t, id) { estado.chat.push({ de: de, t: t, id: id || "" }); if (estado.chat.length > 60) estado.chat = estado.chat.slice(-60); }
  function renderChat() {
    var box = $("chat-lista");
    if (!estado.chat.length) {
      box.innerHTML = '<div class="msg bot"><div class="bolha">' + esc("Oi! Eu sou o assessor da QUOX. " + MSG_AJUDA).replace(/\n/g, "<br>") + "</div></div>";
    } else {
      box.innerHTML = estado.chat.map(function (m) {
        var tem = m.id && estado.lanc.some(function (l) { return l.id === m.id; });
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
  function rolarChat() { setTimeout(function () { var f = $("chat-form"); if (f && f.scrollIntoView) f.scrollIntoView({ block: "end" }); }, 30); }
  function desfazerChat(id) {
    estado.lanc = estado.lanc.filter(function (l) { return l.id !== id; });
    estado.chat.forEach(function (m) { if (m.id === id) m.id = ""; });
    pushChat("bot", "Pronto, desfiz esse lançamento."); salvar(); renderChat(); rolarChat();
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
    estado.lanc.push(l);
    var nota = "";
    if (r.formaSuposta) nota += "\nVi um banco e considerei cartão de crédito. Se foi débito ou Pix, toque em Editar.";
    if (r.semCategoria) nota += "\nNão reconheci a categoria e coloquei em Outros. Toque em Editar para mudar.";
    if (r.dataErro) nota += "\nNão entendi a data, então usei hoje.";
    if (r.tipo === "despesa" && !r.forma && !r.banco) nota += "\nSe quiser registrar o cartão ou banco, escreva junto, por exemplo: \"no cartão Nubank\".";
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
  function enviarChat(texto) {
    texto = String(texto || "").trim(); if (!texto) return;
    var n = PA.sem(texto), temNum = /\d/.test(n), resp = "", id = "";
    pushChat("eu", texto.slice(0, 500));
    if (/^(ajuda|help|\?|como funciona|o que voce faz)/.test(n)) resp = MSG_AJUDA;
    else if (/^(desfazer|desfaz|apagar o ultimo|cancelar o ultimo|errei)/.test(n)) {
      var ult = null; for (var i = estado.chat.length - 1; i >= 0; i--) { var m = estado.chat[i]; if (m.id && estado.lanc.some(function (l) { return l.id === m.id; })) { ult = m.id; break; } }
      if (ult) { $("chat-in").value = ""; desfazerChat(ult); return; } resp = "Não tenho um lançamento recente do chat para desfazer. Você também pode excluir na aba Extrato.";
    }
    else if (/^(limpar (a )?conversa|apagar (a )?conversa)/.test(n)) { estado.chat = []; salvar(); $("chat-in").value = ""; renderChat(); return; }
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
        return '<div class="item"><div class="l"><b>' + esc(d.nome) + "</b><small>" + pct(d.juros) + " ao mês · parcela mínima " + R(d.parcela) + '</small><div class="acs"><button class="mini-b" data-ded="' + esc(d.id) + '" type="button">Editar</button><button class="mini-b perigo" data-ddel="' + esc(d.id) + '" type="button">Excluir</button></div></div><div class="v neg">' + R(d.saldo) + "</div></div>";
      }).join("");
      $("d-lista").querySelectorAll("[data-ded]").forEach(function (b) { b.addEventListener("click", function () { editarDivida(b.getAttribute("data-ded")); }); });
      $("d-lista").querySelectorAll("[data-ddel]").forEach(function (b) { duplo(b, "Confirmar?", function () { estado.dividas = estado.dividas.filter(function (x) { return x.id !== b.getAttribute("data-ddel"); }); salvar(); render(); }); });
    }
    $("d-plano").hidden = !ds.length;
    if (ds.length) renderPlano();
  }
  function renderPlano() {
    var extra = parseBR($("p-extra").value); if (!isFinite(extra) || extra < 0) extra = 0;
    var est = $("p-met").value, ds = estado.dividas;
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
  function renderRelatorio() {
    var t = totais(mes), pr = totais(addMes(mes, -1)), cs = catsOrdenadas(t);
    var h = '<div class="rel-h"><h2>Relatório de ' + esc(mesLabel(mes)) + "</h2></div>";
    if (!t.n) { $("rel").innerHTML = h + '<p class="vazio">Sem lançamentos neste mês.</p>'; return; }
    h += '<table class="tabela"><tr><th>Receitas</th><td>' + R(t.rec) + '</td></tr><tr><th>Despesas</th><td>' + R(t.desp) + "</td></tr><tr><th>Saldo do mês</th><td><strong>" + R(t.saldo) + "</strong></td></tr><tr><th>Taxa de poupança</th><td>" + (t.taxa == null ? "–" : pct(t.taxa)) + "</td></tr></table>";
    if (cs.length) {
      h += "<h3>Despesas por categoria</h3><table class=\"tabela\"><tr><th>Categoria</th><th>Valor</th><th>% do total</th><th>Mês anterior</th></tr>" + cs.map(function (c) {
        var a = pr.porCat[c[0]] || 0, v = a > 0 ? (c[1] > a ? "▲ " : c[1] < a ? "▼ " : "= ") + pct(((c[1] - a) / a) * 100).replace("-", "") : "–";
        return "<tr><td>" + esc(c[0]) + "</td><td>" + R(c[1]) + "</td><td>" + pct((c[1] / t.desp) * 100) + "</td><td>" + v + "</td></tr>";
      }).join("") + "</table>";
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
    var reg = { id: editLanc || uid(), tipo: tipo, valor: Math.round(v * 100) / 100, cat: $("l-cat").value, data: data, desc: $("l-desc").value.trim().slice(0, 80), forma: $("l-forma").value, banco: $("l-banco").value.trim().slice(0, 30) };
    if (editLanc) estado.lanc = estado.lanc.map(function (x) { return x.id === editLanc ? reg : x; }); else estado.lanc.push(reg);
    var foraDoMes = data.slice(0, 7) !== mes;
    var tinhaEdicao = !!editLanc;
    salvar(); fimEdicao();
    toast(tinhaEdicao ? "Alterações salvas" : "Lançamento salvo" + (foraDoMes ? " em " + mesLabel(data.slice(0, 7)) : ""));
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
  function baixar(nome, tipo, txt) {
    var b = new Blob([txt], { type: tipo }), u = URL.createObjectURL(b), a = document.createElement("a");
    a.href = u; a.download = nome; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(u); }, 2000);
  }
  function csvCel(s) { s = String(s); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }
  function exportarCsv() {
    var l = ordenar(estado.lanc.filter(function (x) { return x.data.slice(0, 7) === mes; })).reverse();
    var linhas = ["Data;Tipo;Categoria;Descrição;Forma de pagamento;Banco ou cartão;Valor"].concat(l.map(function (x) {
      return [x.data, x.tipo, csvCel(x.cat), csvCel(x.desc), csvCel(x.forma || ""), csvCel(x.banco || ""), (x.tipo === "despesa" ? "-" : "") + x.valor.toFixed(2).replace(".", ",")].join(";");
    }));
    baixar("quox-lancamentos-" + mes + ".csv", "text/csv;charset=utf-8", "﻿" + linhas.join("\r\n"));
    $("b-msg").textContent = "Arquivo CSV gerado com os lançamentos de " + mesLabel(mes) + ".";
  }
  function backup() {
    baixar("quox-backup-" + hoje() + ".json", "application/json", JSON.stringify(estado));
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
    var s = { lanc: {}, div: {}, chat: JSON.stringify(e.chat) };
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
    var op = lote[0], tabela = op.k === "lanc" ? "lancamentos" : op.k === "div" ? "dividas" : "assessor_chat";
    if (op.k === "chat") return sb.from(tabela).upsert({ user_id: user.id, msgs: estado.chat, atualizado_em: new Date().toISOString() }, { onConflict: "user_id" });
    if (op.a === "del") return sb.from(tabela).delete().in("id", lote.map(function (o) { return o.id; }));
    return sb.from(tabela).upsert(lote.map(function (o) { return o.row; }), { onConflict: "user_id,id" });
  }
  function passo() {
    if (!outbox.length) return Promise.resolve(true);
    var op = outbox[0], n = 1;
    if (op.k !== "chat") while (n < outbox.length && n < 100 && outbox[n].k === op.k && outbox[n].a === op.a) n++;
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
      sb.from("assessor_chat").select("msgs").maybeSingle()
    ]).then(function (v) {
      if (outbox.length || enviando) return;
      var chat = v[2] && v[2].data && Array.isArray(v[2].data.msgs) ? v[2].data.msgs : [];
      estado = limpar({
        lanc: v[0].map(function (r) { return { id: r.id, tipo: r.tipo, valor: +r.valor, cat: r.cat, data: r.data, desc: r.descr, forma: r.forma, banco: r.banco }; }),
        dividas: v[1].map(function (r) { return { id: r.id, nome: r.nome, saldo: +r.saldo, juros: +r.juros, parcela: +r.parcela }; }),
        chat: chat
      });
      snap = snapshotDe(estado); guardarCache(); statusSync(); render();
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
  function iniciarUI() {
    var h0 = (location.hash || "").slice(1);
    setTab(TABS.indexOf(h0) >= 0 ? h0 : "chat");
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

  /* ---------- eventos ---------- */
  document.querySelectorAll(".ap-tabs button").forEach(function (b) { b.addEventListener("click", function () { setTab(b.getAttribute("data-tab")); }); });
  $("mes-ant").addEventListener("click", function () { mes = addMes(mes, -1); render(); });
  $("mes-prox").addEventListener("click", function () { mes = addMes(mes, 1); render(); });
  document.querySelectorAll('input[name="tipo"]').forEach(function (r) { r.addEventListener("change", function () { preencherCats(tipoSel()); }); });
  $("f-lanc").addEventListener("submit", submitLanc);
  $("l-cancel").addEventListener("click", function () { fimEdicao(); });
  $("f-div").addEventListener("submit", submitDiv);
  $("d-cancel").addEventListener("click", fimEdicaoDiv);
  $("x-tipo").addEventListener("change", renderExtrato);
  $("x-busca").addEventListener("input", renderExtrato);
  $("p-extra").addEventListener("input", renderPlano);
  $("p-met").addEventListener("change", renderPlano);
  $("b-print").addEventListener("click", function () { window.print(); });
  $("b-csv").addEventListener("click", exportarCsv);
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
  document.addEventListener("visibilitychange", function () { if (!document.hidden && nuvem && user) sincronizarTudo(); });
  window.addEventListener("online", function () { if (nuvem && user) sincronizarTudo(); });
  setInterval(function () { if (nuvem && user && outbox.length) descarregar(); }, 30000);

  /* instalar como app */
  var adiado = null;
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); adiado = e; $("instalar").hidden = false; });
  $("instalar").addEventListener("click", function () { if (!adiado) return; adiado.prompt(); adiado = null; $("instalar").hidden = true; });
  window.addEventListener("appinstalled", function () { $("instalar").hidden = true; toast("Aplicativo instalado"); });
  var ua = navigator.userAgent || "", ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios && !navigator.standalone) $("ios-dica").hidden = false;

  window.addEventListener("hashchange", function () { var h = (location.hash || "").slice(1); if (TABS.indexOf(h) >= 0 && h !== tabAtual) setTab(h); });
  if (nuvem) iniciarNuvem(); else { document.body.classList.add("ap-ok"); iniciarUI(); }
})();
