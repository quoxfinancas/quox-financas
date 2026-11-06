/* QUOX - Assessor financeiro. Tudo roda no navegador; os dados ficam no localStorage deste aparelho. */
(function () {
  "use strict";
  var CFG = window.QUOX_CFG || {};
  var KEY = "quox-assessor-v1";
  var CATS_D = ["Moradia", "Alimentação", "Transporte", "Saúde", "Educação", "Lazer", "Cartão e dívidas", "Assinaturas", "Compras", "Impostos e taxas", "Outros"];
  var CATS_R = ["Salário", "Renda extra", "Investimentos", "Outros"];
  var MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  var $ = function (id) { return document.getElementById(id); };
  var estado = carregar();
  var mes = hoje().slice(0, 7);
  var editLanc = null, editDiv = null, tabAtual = "resumo", toastT = null;

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
  function vazio() { return { v: 1, lanc: [], dividas: [] }; }
  function limpar(o) {
    var r = vazio();
    if (!o || typeof o !== "object") return r;
    (Array.isArray(o.lanc) ? o.lanc : []).forEach(function (l) {
      if (!l || (l.tipo !== "receita" && l.tipo !== "despesa")) return;
      var v = +l.valor; if (!isFinite(v) || v <= 0 || v > 1e12) return;
      if (!dataValida(String(l.data))) return;
      r.lanc.push({ id: String(l.id || uid()).slice(0, 30), tipo: l.tipo, valor: Math.round(v * 100) / 100, cat: String(l.cat || "Outros").slice(0, 40), data: l.data, desc: String(l.desc || "").slice(0, 80) });
    });
    (Array.isArray(o.dividas) ? o.dividas : []).forEach(function (d) {
      if (!d) return;
      var s = +d.saldo, j = +d.juros, p = +d.parcela || 0;
      if (!isFinite(s) || s <= 0 || !isFinite(j) || j < 0 || j > 100 || !isFinite(p) || p < 0) return;
      r.dividas.push({ id: String(d.id || uid()).slice(0, 30), nome: String(d.nome || "Dívida").slice(0, 40), saldo: s, juros: j, parcela: p });
    });
    return r;
  }
  function carregar() { try { var s = localStorage.getItem(KEY); return s ? limpar(JSON.parse(s)) : vazio(); } catch (x) { return vazio(); } }
  function salvar() {
    try { localStorage.setItem(KEY, JSON.stringify(estado)); $("erro-salvar").hidden = true; }
    catch (x) { $("erro-salvar").hidden = false; }
  }

  /* ---------- cálculos ---------- */
  function totais(ym) {
    var t = { rec: 0, desp: 0, n: 0, porCat: {} };
    estado.lanc.forEach(function (l) {
      if (l.data.slice(0, 7) !== ym) return;
      t.n++;
      if (l.tipo === "receita") t.rec += l.valor; else { t.desp += l.valor; t.porCat[l.cat] = (t.porCat[l.cat] || 0) + l.valor; }
    });
    t.saldo = t.rec - t.desp;
    t.taxa = t.rec > 0 ? (t.saldo / t.rec) * 100 : null;
    return t;
  }
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
    tabAtual = nome;
    ["resumo", "lancar", "extrato", "dividas", "relatorio"].forEach(function (n) { $("t-" + n).hidden = n !== nome; });
    document.querySelectorAll(".ap-tabs button").forEach(function (b) { if (b.getAttribute("data-tab") === nome) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    $("mes-nav").hidden = !(nome === "resumo" || nome === "extrato" || nome === "relatorio");
    try { history.replaceState(null, "", "#" + nome); } catch (x) {}
    render();
    window.scrollTo(0, 0);
  }
  function render() {
    $("mes-txt").textContent = mesLabel(mes);
    if (tabAtual === "resumo") renderResumo();
    else if (tabAtual === "lancar") renderLancar();
    else if (tabAtual === "extrato") renderExtrato();
    else if (tabAtual === "dividas") renderDividas();
    else if (tabAtual === "relatorio") renderRelatorio();
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
    return '<div class="item"><div class="l"><b>' + esc(l.desc || l.cat) + "</b><small>" + esc(l.cat) + " · " + l.data.split("-").reverse().join("/") + "</small>" +
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
    $("l-data").value = l.data; $("l-desc").value = l.desc;
    $("f-titulo").textContent = "Editar lançamento"; $("l-salvar").textContent = "Salvar alterações"; $("l-cancel").hidden = false;
  }
  function fimEdicao() {
    editLanc = null; $("l-valor").value = ""; $("l-desc").value = ""; $("l-data").value = hoje();
    $("f-titulo").textContent = "Novo lançamento"; $("l-salvar").textContent = "Salvar"; $("l-cancel").hidden = true; $("l-erro").textContent = "";
  }
  function excluirLanc(id) { estado.lanc = estado.lanc.filter(function (x) { return x.id !== id; }); salvar(); toast("Lançamento excluído"); render(); }
  function renderExtrato() {
    var tp = $("x-tipo").value, q = $("x-busca").value.trim().toLowerCase();
    var l = ordenar(estado.lanc.filter(function (x) {
      return x.data.slice(0, 7) === mes && (!tp || x.tipo === tp) && (!q || (x.desc + " " + x.cat).toLowerCase().indexOf(q) >= 0);
    }));
    if (!l.length) { $("x-lista").innerHTML = '<p class="vazio">Nenhum lançamento encontrado neste mês.</p>'; return; }
    var h = "", dia = "";
    l.forEach(function (x) { if (x.data !== dia) { dia = x.data; h += '<div class="dia">' + diaLabel(dia) + "</div>"; } h += itemLanc(x, true); });
    $("x-lista").innerHTML = h; ligarAcoes($("x-lista"));
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
    var reg = { id: editLanc || uid(), tipo: tipo, valor: Math.round(v * 100) / 100, cat: $("l-cat").value, data: data, desc: $("l-desc").value.trim().slice(0, 80) };
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
    var linhas = ["Data;Tipo;Categoria;Descrição;Valor"].concat(l.map(function (x) {
      return [x.data, x.tipo, csvCel(x.cat), csvCel(x.desc), (x.tipo === "despesa" ? "-" : "") + x.valor.toFixed(2).replace(".", ",")].join(";");
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
  duplo($("b-apagar"), "Clique de novo para apagar tudo", function () { estado = vazio(); salvar(); fimEdicao(); fimEdicaoDiv(); $("b-msg").textContent = "Todos os dados foram apagados deste aparelho."; render(); });
  if (CFG.iaUrl) { $("ia-box").hidden = false; $("ia-btn").addEventListener("click", pedirIA); }

  /* instalar como app */
  var adiado = null;
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); adiado = e; $("instalar").hidden = false; });
  $("instalar").addEventListener("click", function () { if (!adiado) return; adiado.prompt(); adiado = null; $("instalar").hidden = true; });
  window.addEventListener("appinstalled", function () { $("instalar").hidden = true; toast("Aplicativo instalado"); });
  var ua = navigator.userAgent || "", ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios && !navigator.standalone) $("ios-dica").hidden = false;

  var h0 = (location.hash || "").slice(1);
  setTab(["resumo", "lancar", "extrato", "dividas", "relatorio"].indexOf(h0) >= 0 ? h0 : "resumo");
})();
