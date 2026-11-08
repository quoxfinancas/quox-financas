/* QUOX - Assessor: cartões de crédito, metas, importação de extrato e conta compartilhada. Usa a API que o assessor.js expõe em window.QuoxApp. */
(function () {
  "use strict";
  var A = window.QuoxApp, L = window.QuoxLib, PA = window.QuoxParser;
  if (!A || !L || !PA) return;
  var $ = function (id) { return document.getElementById(id); };
  var E = A.esc, R = A.R, pct = A.pct, est = A.estado;
  function dmy(iso) { return iso.split("-").reverse().join("/"); }
  function diasEntre(a, b) { var pa = a.split("-"), pb = b.split("-"); return Math.round((Date.UTC(+pb[0], +pb[1] - 1, +pb[2]) - Date.UTC(+pa[0], +pa[1] - 1, +pa[2])) / 86400000); }
  function ativo(tab) { return document.getElementById("t-" + tab) && !document.getElementById("t-" + tab).hidden; }

  /* ---------- menu Mais ---------- */
  document.querySelectorAll("[data-ir]").forEach(function (b) { b.addEventListener("click", function () { A.setTab(b.getAttribute("data-ir")); }); });

  /* ---------- cartões de crédito ---------- */
  var editCar = null;
  function faturasDe(c) { return L.faturas(c, est().lanc, A.hoje()); }
  function renderCartoes() {
    var cs = est().cartoes, hoje = A.hoje();
    var nomesLanc = {};
    est().lanc.forEach(function (l) { if (l.tipo === "despesa" && l.forma === "Crédito" && l.banco && !cs.some(function (c) { return L.mesmoCartao(l.banco, c.nome); })) nomesLanc[l.banco] = (nomesLanc[l.banco] || 0) + 1; });
    var sug = Object.keys(nomesLanc);
    $("car-sug").innerHTML = sug.length ? '<span class="leg" style="width:100%">Cartões que aparecem nos seus lançamentos:</span>' + sug.slice(0, 6).map(function (n) { return '<button type="button" class="chip" data-cn="' + E(n) + '">+ ' + E(n) + "</button>"; }).join("") : "";
    $("car-sug").querySelectorAll("[data-cn]").forEach(function (b) { b.addEventListener("click", function () { $("car-nome").value = b.getAttribute("data-cn"); $("car-fecha").focus(); }); });
    if (!cs.length) { $("car-lista").innerHTML = '<div class="painel"><p class="vazio">Nenhum cartão cadastrado ainda. Cadastre acima para ver a fatura aberta, a data de vencimento e o limite disponível.</p></div>'; return; }
    $("car-lista").innerHTML = cs.map(function (c) {
      var fs = faturasDe(c), aberta = fs.filter(function (f) { return f.estado === "aberta"; })[0], pend = fs.filter(function (f) { return f.estado === "fechada" || f.estado === "vencida"; }), usado = L.limiteUsado(fs);
      var h = '<div class="carto"><h3>' + E(c.nome) + "</h3>";
      h += '<div class="kv"><span>Fatura aberta' + (aberta ? " (fecha em " + dmy(aberta.fecha) + ")" : "") + "</span><b>" + R(aberta ? aberta.total : 0) + "</b></div>";
      if (aberta) h += '<div class="kv"><span>Vence em</span><span>' + dmy(aberta.vence) + "</span></div>";
      pend.forEach(function (f) {
        var d = diasEntre(hoje, f.vence), st = f.estado === "vencida" ? "vencida há " + (-d) + (d === -1 ? " dia" : " dias") : d === 0 ? "vence hoje" : "vence em " + d + (d === 1 ? " dia" : " dias");
        h += '<div class="kv"><span>Fatura fechada de ' + E(A.mesLabel(f.ym)) + " (" + st + ', ' + dmy(f.vence) + ')</span><b class="' + (f.estado === "vencida" ? "neg" : "") + '">' + R(f.total) + '</b></div><div class="acs" style="display:flex;gap:6px;margin:2px 0 6px"><button class="mini-b" type="button" data-cpaga="' + E(c.id) + "|" + f.ym + '">Marcar como paga</button></div>';
      });
      if (c.limite > 0) {
        var p = Math.min(100, usado / c.limite * 100), cl = p >= 100 ? "over" : p >= 80 ? "warn" : "ok";
        h += '<div class="barra" style="margin-top:8px"><div class="t"><span>Limite usado</span><span>' + R(usado) + " de " + R(c.limite) + " · " + pct(usado / c.limite * 100) + '</span></div><div class="trilho"><span class="fill ' + cl + '" style="width:' + Math.max(2, p) + '%"></span></div></div><div class="kv"><span>Disponível</span><b class="' + (c.limite - usado < 0 ? "neg" : "pos") + '">' + R(c.limite - usado) + "</b></div>";
      }
      if (aberta && aberta.itens.length) h += "<details><summary>Ver compras da fatura aberta (" + aberta.itens.length + ")</summary>" + aberta.itens.slice().sort(function (a, b) { return a.data < b.data ? 1 : -1; }).map(function (l) { return A.itemLanc(l, false); }).join("") + "</details>";
      var pagas = fs.filter(function (f) { return f.estado === "paga"; }).slice(-2);
      if (pagas.length) h += '<details><summary>Faturas pagas (' + pagas.length + ')</summary>' + pagas.map(function (f) { return '<div class="kv"><span>' + E(A.mesLabel(f.ym)) + " · " + R(f.total) + '</span><button class="mini-b" type="button" data-creab="' + E(c.id) + "|" + f.ym + '">Reabrir</button></div>'; }).join("") + "</details>";
      h += '<div class="acs" style="display:flex;gap:6px;margin-top:10px"><button class="mini-b" type="button" data-ced="' + E(c.id) + '">Editar</button><button class="mini-b perigo" type="button" data-cdelc="' + E(c.id) + '">Excluir</button></div></div>';
      return h;
    }).join("");
    var raiz = $("car-lista");
    raiz.querySelectorAll("[data-cpaga]").forEach(function (b) { b.addEventListener("click", function () { var p = b.getAttribute("data-cpaga").split("|"), c = est().cartoes.filter(function (x) { return x.id === p[0]; })[0]; if (c) { c.pagas = (c.pagas || []).concat([p[1]]).slice(-12); A.salvar(); A.render(); A.toast("Fatura marcada como paga"); } }); });
    raiz.querySelectorAll("[data-creab]").forEach(function (b) { b.addEventListener("click", function () { var p = b.getAttribute("data-creab").split("|"), c = est().cartoes.filter(function (x) { return x.id === p[0]; })[0]; if (c) { c.pagas = (c.pagas || []).filter(function (y) { return y !== p[1]; }); A.salvar(); A.render(); } }); });
    raiz.querySelectorAll("[data-ced]").forEach(function (b) { b.addEventListener("click", function () { var c = est().cartoes.filter(function (x) { return x.id === b.getAttribute("data-ced"); })[0]; if (!c) return; editCar = c.id; $("car-nome").value = c.nome; $("car-lim").value = String(c.limite).replace(".", ","); $("car-fecha").value = c.fecha; $("car-vence").value = c.vence; $("car-titulo").textContent = "Editar cartão"; $("car-cancel").hidden = false; window.scrollTo(0, 0); }); });
    raiz.querySelectorAll("[data-cdelc]").forEach(function (b) { A.duplo(b, "Confirmar?", function () { est().cartoes = est().cartoes.filter(function (x) { return x.id !== b.getAttribute("data-cdelc"); }); A.salvar(); A.render(); }); });
  }
  function fimEdCar() { editCar = null; ["car-nome", "car-lim", "car-fecha", "car-vence"].forEach(function (i) { $(i).value = ""; }); $("car-titulo").textContent = "Meus cartões de crédito"; $("car-cancel").hidden = true; $("car-erro").textContent = ""; }
  $("f-car").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var nome = $("car-nome").value.trim(), lim = A.parseBR($("car-lim").value), f = Math.round(+$("car-fecha").value), v = Math.round(+$("car-vence").value), er = $("car-erro");
    if (!nome) { er.textContent = "Informe o nome do cartão."; return; }
    if (!isFinite(lim)) lim = 0;
    if (lim < 0) { er.textContent = "O limite não pode ser negativo."; return; }
    if (!(f >= 1 && f <= 31) || !(v >= 1 && v <= 31)) { er.textContent = "Informe os dias de fechamento e de vencimento (1 a 31)."; return; }
    var dup = est().cartoes.some(function (c) { return c.id !== editCar && PA.sem(c.nome) === PA.sem(nome); });
    if (dup) { er.textContent = "Já existe um cartão com esse nome."; return; }
    er.textContent = "";
    if (editCar) { est().cartoes.forEach(function (c) { if (c.id === editCar) { c.nome = nome.slice(0, 30); c.limite = lim; c.fecha = f; c.vence = v; } }); }
    else est().cartoes.push({ id: A.uid().slice(0, 12), nome: nome.slice(0, 30), limite: lim, fecha: f, vence: v, pagas: [] });
    fimEdCar(); A.salvar(); A.render(); A.toast("Cartão salvo");
  });
  $("car-cancel").addEventListener("click", fimEdCar);
  window.QuoxTabs.cartoes = renderCartoes;
  function avisosFaturas() {
    var r = [], hoje = A.hoje();
    est().cartoes.forEach(function (c) { faturasDe(c).forEach(function (f) { if (f.estado === "fechada" || f.estado === "vencida") { var d = diasEntre(hoje, f.vence); if (d <= 3) r.push("fatura " + c.nome + (d < 0 ? " vencida" : d === 0 ? " vence hoje" : " vence em " + d + (d === 1 ? " dia" : " dias"))); } }); });
    return r.slice(0, 2);
  }
  A.avisosExtra = avisosFaturas;
  function respostaFatura() {
    var cs = est().cartoes; if (!cs.length) return "Cadastre seus cartões na aba Cartões (nome, fechamento e vencimento) e eu calculo a fatura e o limite disponível.";
    return cs.map(function (c) {
      var fs = faturasDe(c), ab = fs.filter(function (f) { return f.estado === "aberta"; })[0], pe = fs.filter(function (f) { return f.estado === "fechada" || f.estado === "vencida"; }), us = L.limiteUsado(fs);
      return c.nome + ": fatura aberta " + R(ab ? ab.total : 0) + (ab ? " (fecha em " + dmy(ab.fecha) + ")" : "") + (pe.length ? "; fechada " + R(pe.reduce(function (s, f) { return s + f.total; }, 0)) + " vence em " + dmy(pe[0].vence) : "") + (c.limite > 0 ? "; limite disponível " + R(c.limite - us) : "") + ".";
    }).join("\n");
  }
  A.chat.push(function (texto, n, temNum) {
    if (!temNum && /(fatura|limite disponivel|limite do cartao|quanto (falta|sobra|resta) .*cartao)/.test(n)) return respostaFatura();
    return null;
  });

  /* ---------- metas ---------- */
  function renderMetas() {
    var ms = est().metas, hoje = A.hoje();
    $("m-lista").innerHTML = ms.length ? ms.map(function (m) {
      var p = Math.min(100, m.guardado / m.alvo * 100), falta = Math.max(0, m.alvo - m.guardado), pm = L.porMes(m, hoje), feita = m.guardado >= m.alvo;
      return '<div class="carto"><h3>' + E(m.nome) + (feita ? " ✓" : "") + '</h3><div class="barra"><div class="t"><span>' + R(m.guardado) + " de " + R(m.alvo) + "</span><span>" + pct(p) + '</span></div><div class="trilho"><span class="fill ' + (feita ? "ok" : "") + '" style="width:' + Math.max(2, p) + '%"></span></div></div>' +
        (feita ? '<p class="sub" style="margin:8px 0 0">Meta atingida. Parabéns!</p>' : '<p class="sub" style="margin:8px 0 0">Faltam <strong>' + R(falta) + "</strong>" + (m.prazo ? " até " + dmy(m.prazo) + (pm ? ". Guardando " + R(pm) + " por mês você chega lá." : m.prazo <= hoje ? ". O prazo já passou." : "") : "") + "</p>") +
        '<div class="meta-in"><input inputmode="decimal" autocomplete="off" placeholder="Valor (R$)" aria-label="Valor" data-mv="' + E(m.id) + '"><button class="btn" type="button" data-mg="' + E(m.id) + '">Guardar</button><button class="btn sec" type="button" data-mr="' + E(m.id) + '">Retirar</button></div>' +
        '<div class="acs" style="display:flex;gap:6px;margin-top:8px"><button class="mini-b perigo" type="button" data-mdel="' + E(m.id) + '">Excluir</button></div></div>';
    }).join("") : '<div class="painel"><p class="vazio">Nenhuma meta ainda. Crie a primeira, por exemplo uma reserva de emergência.</p></div>';
    var raiz = $("m-lista");
    function mover(id, sinal) {
      var inp = raiz.querySelector('[data-mv="' + id + '"]'), v = A.parseBR(inp.value), m = est().metas.filter(function (x) { return x.id === id; })[0];
      if (!m || !isFinite(v) || v <= 0) { A.toast("Informe um valor maior que zero."); return; }
      aplicarAporte(m, sinal * v); A.salvar(); A.render();
    }
    raiz.querySelectorAll("[data-mg]").forEach(function (b) { b.addEventListener("click", function () { mover(b.getAttribute("data-mg"), 1); }); });
    raiz.querySelectorAll("[data-mr]").forEach(function (b) { b.addEventListener("click", function () { mover(b.getAttribute("data-mr"), -1); }); });
    raiz.querySelectorAll("[data-mdel]").forEach(function (b) { A.duplo(b, "Confirmar?", function () { est().metas = est().metas.filter(function (x) { return x.id !== b.getAttribute("data-mdel"); }); A.salvar(); A.render(); }); });
  }
  function aplicarAporte(m, v) {
    var antes = m.guardado;
    m.guardado = Math.max(0, Math.round((m.guardado + v) * 100) / 100);
    m.hist = (m.hist || []).concat([{ d: A.hoje(), v: Math.round((m.guardado - antes) * 100) / 100 }]).slice(-30);
    if (antes < m.alvo && m.guardado >= m.alvo) A.toast("Meta atingida: " + m.nome + "!");
  }
  $("f-meta").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var nome = $("m-nome").value.trim(), alvo = A.parseBR($("m-alvo").value), ja = A.parseBR($("m-ja").value), pz = $("m-prazo").value, er = $("m-erro");
    if (!nome) { er.textContent = "Dê um nome para a meta."; return; }
    if (!isFinite(alvo) || alvo <= 0) { er.textContent = "Informe quanto quer juntar."; return; }
    if (pz && !A.dataValida(pz)) { er.textContent = "Escolha uma data válida."; return; }
    er.textContent = "";
    est().metas.push({ id: A.uid().slice(0, 12), nome: nome.slice(0, 40), alvo: Math.round(alvo * 100) / 100, guardado: isFinite(ja) && ja > 0 ? Math.round(ja * 100) / 100 : 0, prazo: pz || "", hist: [] });
    ["m-nome", "m-alvo", "m-ja", "m-prazo"].forEach(function (i) { $(i).value = ""; });
    A.salvar(); A.render(); A.toast("Meta criada");
  });
  $("m-reserva").addEventListener("click", function () {
    var med = [], i;
    for (i = 1; i <= 3; i++) { var t = A.totais(A.addMes(A.hoje().slice(0, 7), -i)); if (t.desp > 0) med.push(t.desp); }
    if (!med.length) { var t0 = A.totais(A.hoje().slice(0, 7)); if (t0.desp > 0) med.push(t0.desp); }
    if (!med.length) { $("m-erro").textContent = "Lance alguns gastos primeiro, para eu calcular quanto você gasta por mês."; return; }
    var m = med.reduce(function (a, b) { return a + b; }, 0) / med.length;
    $("m-nome").value = "Reserva de emergência"; $("m-alvo").value = String(Math.round(m * 6)).replace(".", ","); $("m-erro").textContent = "Sugestão: 6 meses dos seus gastos médios (" + R(m) + " por mês). Ajuste se quiser e toque em Criar meta.";
  });
  window.QuoxTabs.metas = renderMetas;
  A.chat.push(function (texto, n, temNum) {
    var ms = est().metas;
    if (!temNum && /^(metas?|caixinhas?|minhas metas)$/.test(n.trim())) {
      if (!ms.length) return "Você ainda não tem metas. Crie na aba Metas (em Mais), por exemplo uma reserva de emergência.";
      return "Suas metas:\n" + ms.map(function (m) { return "• " + m.nome + ": " + R(m.guardado) + " de " + R(m.alvo) + " (" + pct(m.guardado / m.alvo * 100) + ")"; }).join("\n");
    }
    if (temNum && ms.length && /(^|\s)(guardei|guardar|poupei|reservei|depositei|juntei|coloquei)(\s|$)/.test(n)) {
      var r = PA.interpretar(texto, new Date()); if (!r.ok) return null;
      var tk = n.split(/[^a-z0-9]+/), ach = null, mx = 0;
      ms.forEach(function (m) { var ws = PA.sem(m.nome).split(/[^a-z0-9]+/).filter(function (w) { return w.length >= 3 && ["meta", "para", "dos", "das", "com"].indexOf(w) < 0; }); var k = ws.filter(function (w) { return tk.indexOf(w) >= 0; }).length; if (k > mx) { mx = k; ach = m; } });
      if (!ach) return ms.length === 1 ? (aplicarAporte(ms[0], r.valor), ms[0].nome && "Guardei " + R(r.valor) + " em " + ms[0].nome + ". Agora são " + R(ms[0].guardado) + " de " + R(ms[0].alvo) + " (" + pct(ms[0].guardado / ms[0].alvo * 100) + ").") : "Em qual meta? Suas metas: " + ms.map(function (m) { return m.nome; }).join(", ") + ". Exemplo: guardei 200 na " + ms[0].nome.toLowerCase() + ".";
      aplicarAporte(ach, r.valor);
      return "Guardei " + R(r.valor) + " em " + ach.nome + ". Agora são " + R(ach.guardado) + " de " + R(ach.alvo) + " (" + pct(ach.guardado / ach.alvo * 100) + ").";
    }
    return null;
  });

  /* ---------- importar extrato ---------- */
  var imp = { rows: [], marc: {}, cats: {}, nome: "" };
  $("i-forma").innerHTML = '<option value="">Não informado</option>' + PA.FORMAS.map(function (f) { return '<option value="' + E(f) + '">' + E(f) + "</option>"; }).join("");
  function tipoDe(r) { var v = $("i-inv").checked ? -r.valor : r.valor; return v < 0 ? "despesa" : "receita"; }
  function prepararLinhas() {
    var vis = {};
    imp.rows.forEach(function (r) {
      var k = r.data + "|" + r.valor.toFixed(2) + "|" + PA.sem(r.desc) + "|" + (r.fitid || ""); vis[k] = (vis[k] || 0) + 1; r.seq = vis[k] - 1;
      r.id = L.idImport(r, r.seq);
    });
  }
  function ehRepetido(r) {
    var tp = tipoDe(r), v = Math.abs(r.valor);
    return est().lanc.some(function (x) { return x.id === r.id || (x.data === r.data && x.tipo === tp && Math.abs(x.valor - v) < 0.005); });
  }
  function renderPrevia(zerar) {
    var box = $("i-prev");
    if (!imp.rows.length) { box.hidden = true; box.innerHTML = ""; return; }
    prepararLinhas();
    var nd = 0, nr = 0, nrep = 0;
    imp.rows.forEach(function (r) {
      var tp = tipoDe(r); if (tp === "despesa") nd++; else nr++;
      r.tp = tp; r.rep = ehRepetido(r);
      if (zerar || imp.marc[r.id] === undefined) imp.marc[r.id] = !r.rep;
      if (zerar || !imp.cats[r.id] || imp.cats[r.id].tp !== tp) imp.cats[r.id] = { tp: tp, cat: PA.classificar(r.desc, tp) };
      if (r.rep) nrep++;
    });
    var h = "<h2>Conferir antes de importar</h2><p class=\"sub\">" + imp.rows.length + " lançamentos em " + E(imp.nome) + ": " + nd + " despesas e " + nr + " receitas." + (nrep ? " " + nrep + " parecem já existir e vieram desmarcados." : "") + " Confira se as despesas e as receitas estão certas. Se estiverem trocadas, marque \"Inverter sinais\" acima.</p>";
    h += '<div class="linha" style="margin-bottom:6px"><button class="mini-b" type="button" id="i-todos">Marcar todos</button><button class="mini-b" type="button" id="i-nenhum">Desmarcar todos</button></div>';
    h += imp.rows.map(function (r, i) {
      var cats = r.tp === "receita" ? PA.CATS_R : PA.CATS_D, cur = imp.cats[r.id].cat;
      return '<div class="imp-l' + (r.rep ? " dup" : "") + '"><input type="checkbox" data-ik="' + i + '"' + (imp.marc[r.id] ? " checked" : "") + ' aria-label="Importar"><div><span class="d">' + dmy(r.data) + "</span> " + E(r.desc || "(sem descrição)") + (r.rep ? '<span class="tag">já existe?</span>' : "") + ' <b class="' + (r.tp === "receita" ? "pos" : "neg") + '" style="float:right">' + (r.tp === "receita" ? "+" : "−") + R(Math.abs(r.valor)) + '</b></div><select data-ic="' + i + '" aria-label="Categoria">' + cats.map(function (c) { return '<option value="' + E(c) + '"' + (c === cur ? " selected" : "") + ">" + E(c) + "</option>"; }).join("") + "</select></div>";
    }).join("");
    h += '<div class="linha"><button class="btn" type="button" id="i-ok"></button><button class="btn sec" type="button" id="i-cancela">Cancelar</button></div>';
    box.innerHTML = h; box.hidden = false;
    function conta() { var n = imp.rows.filter(function (r) { return imp.marc[r.id]; }).length; $("i-ok").textContent = "Importar " + n + (n === 1 ? " lançamento" : " lançamentos"); $("i-ok").disabled = !n; }
    conta();
    box.querySelectorAll("[data-ik]").forEach(function (c) { c.addEventListener("change", function () { imp.marc[imp.rows[+c.getAttribute("data-ik")].id] = c.checked; conta(); }); });
    box.querySelectorAll("[data-ic]").forEach(function (s) { s.addEventListener("change", function () { imp.cats[imp.rows[+s.getAttribute("data-ic")].id].cat = s.value; }); });
    $("i-todos").addEventListener("click", function () { imp.rows.forEach(function (r) { imp.marc[r.id] = true; }); renderPrevia(false); });
    $("i-nenhum").addEventListener("click", function () { imp.rows.forEach(function (r) { imp.marc[r.id] = false; }); renderPrevia(false); });
    $("i-cancela").addEventListener("click", function () { imp = { rows: [], marc: {}, cats: {}, nome: "" }; $("i-arq").value = ""; renderPrevia(); $("i-msg").textContent = ""; });
    $("i-ok").addEventListener("click", function () {
      var forma = $("i-forma").value, banco = $("i-banco").value.trim().slice(0, 30), novos = 0, ids = {};
      est().lanc.forEach(function (x) { ids[x.id] = 1; });
      imp.rows.forEach(function (r) {
        if (!imp.marc[r.id] || ids[r.id]) return;
        var tp = r.tp, v = Math.round(Math.abs(r.valor) * 100) / 100; if (!(v > 0)) return;
        est().lanc.push({ id: r.id, tipo: tp, valor: v, cat: imp.cats[r.id].cat, data: r.data, desc: (r.desc || imp.cats[r.id].cat).slice(0, 80), forma: tp === "despesa" ? forma : "", banco: tp === "despesa" ? banco : "" });
        novos++;
      });
      A.salvar(); imp = { rows: [], marc: {}, cats: {}, nome: "" }; $("i-arq").value = ""; renderPrevia();
      $("i-msg").textContent = novos + (novos === 1 ? " lançamento importado." : " lançamentos importados.") + " Veja no Extrato.";
      A.render(); A.toast("Importação concluída");
    });
  }
  function decodificar(buf) {
    try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch (x) { try { return new TextDecoder("windows-1252").decode(buf); } catch (y) { return new TextDecoder().decode(buf); } }
  }
  $("i-arq").addEventListener("change", function () {
    var f = $("i-arq").files && $("i-arq").files[0]; if (!f) return;
    if (f.size > 3 * 1024 * 1024) { $("i-msg").textContent = "Arquivo muito grande (limite de 3 MB)."; return; }
    $("i-msg").textContent = "Lendo o arquivo…";
    f.arrayBuffer().then(function (buf) {
      var r = L.lerExtrato(decodificar(buf), f.name);
      if (!r.rows.length) { imp = { rows: [], marc: {}, cats: {}, nome: "" }; renderPrevia(); $("i-msg").textContent = (r.avisos[0] || "Não encontrei lançamentos neste arquivo.") + " Tente o formato OFX."; return; }
      imp = { rows: r.rows.slice(0, 1000), marc: {}, cats: {}, nome: f.name };
      $("i-inv").checked = !!r.invertir;
      $("i-msg").textContent = (r.avisos.join(" ") + (r.rows.length > 1000 ? " O arquivo tem mais de 1000 lançamentos: mostrei os primeiros 1000." : "")).trim();
      renderPrevia(true);
    }, function () { $("i-msg").textContent = "Não consegui ler o arquivo."; });
  });
  $("i-inv").addEventListener("change", function () { if (imp.rows.length) renderPrevia(true); });

  /* ---------- conta compartilhada ---------- */
  var G = { estado: "novo", grupo: null, membros: [], lancs: [], codigo: "", ym: "", erro: "" };
  function meuNome() { var u = A.user(), m = (u && u.user_metadata) || {}; var n = String(m.nome || m.full_name || m.name || (u && u.email ? u.email.split("@")[0] : "Eu")).trim(); return n.slice(0, 40) || "Eu"; }
  function msgErroGrupo(e) {
    var m = String((e && e.message) || e || "");
    if (/ja_em_grupo/.test(m)) return "Você já participa de um grupo.";
    if (/codigo_invalido/.test(m)) return "Código não encontrado. Confira com quem criou o grupo.";
    if (/grupo_cheio/.test(m)) return "Esse grupo já tem 6 pessoas.";
    if (/relation .* does not exist|schema cache|404/.test(m)) return "A conta compartilhada ainda não foi ativada no banco de dados (falta rodar o arquivo schema-fase2.sql no Supabase).";
    if (/fetch|network|load failed/i.test(m)) return "Sem conexão. A conta compartilhada precisa de internet.";
    return "Não foi possível concluir. Tente de novo.";
  }
  function carregarGrupo(ym) {
    var sb = A.sb(); if (!A.nuvem || !sb || !A.user()) { G.estado = "semconta"; return Promise.resolve(); }
    G.estado = "carregando"; G.erro = "";
    return Promise.resolve(sb.from("grupo_membros").select("grupo_id,user_id,nome").limit(10)).then(function (r) {
      if (r.error) throw r.error;
      var ms = r.data || [];
      if (!ms.length) { G.estado = "semgrupo"; G.grupo = null; G.membros = []; G.lancs = []; return; }
      var gid = ms[0].grupo_id; G.membros = ms;
      return Promise.all([
        sb.from("grupos").select("id,nome").eq("id", gid).maybeSingle(),
        sb.rpc("codigo_do_grupo", { p_grupo: gid }),
        sb.from("lancamentos_grupo").select("id,user_id,tipo,valor,cat,data,descr").eq("grupo_id", gid).gte("data", ym + "-01").lt("data", A.addMes(ym, 1) + "-01").order("data", { ascending: false }).limit(500)
      ]).then(function (v) {
        if (v[2].error) throw v[2].error;
        G.grupo = (v[0].data) || { id: gid, nome: "Grupo" }; G.codigo = v[1].data || ""; G.lancs = v[2].data || []; G.ym = ym; G.estado = "grupo";
      });
    }).catch(function (e) { G.estado = "erro"; G.erro = msgErroGrupo(e); });
  }
  function nomeMembro(uid) { var m = G.membros.filter(function (x) { return x.user_id === uid; })[0]; return m ? m.nome : "Alguém"; }
  function acerto(lancs) {
    var n = G.membros.length, desp = lancs.filter(function (l) { return l.tipo === "despesa"; }), total = desp.reduce(function (s, l) { return s + +l.valor; }, 0), pago = {};
    G.membros.forEach(function (m) { pago[m.user_id] = 0; });
    desp.forEach(function (l) { pago[l.user_id] = (pago[l.user_id] || 0) + +l.valor; });
    var parte = n ? total / n : 0, cred = [], dev = [], out = [];
    G.membros.forEach(function (m) { var s = Math.round((pago[m.user_id] - parte) * 100) / 100; if (s > 0.009) cred.push({ id: m.user_id, v: s }); else if (s < -0.009) dev.push({ id: m.user_id, v: -s }); });
    cred.sort(function (a, b) { return b.v - a.v; }); dev.sort(function (a, b) { return b.v - a.v; });
    while (cred.length && dev.length) { var x = Math.min(cred[0].v, dev[0].v); out.push({ de: dev[0].id, para: cred[0].id, v: Math.round(x * 100) / 100 }); cred[0].v -= x; dev[0].v -= x; if (cred[0].v < 0.01) cred.shift(); if (dev[0].v < 0.01) dev.shift(); }
    return { total: total, pago: pago, parte: parte, transf: out };
  }
  function textoAcerto() {
    var a = acerto(G.lancs); if (!a.transf.length) return "Em " + A.mesLabel(G.ym) + " não há acerto a fazer" + (a.total ? ": cada um já pagou a sua parte (" + R(a.parte) + ")." : ".");
    return "Acerto de " + A.mesLabel(G.ym) + " (dividindo igualmente " + R(a.total) + "):\n" + a.transf.map(function (t) { return "• " + nomeMembro(t.de) + " paga " + R(t.v) + " para " + nomeMembro(t.para); }).join("\n");
  }
  function renderFamilia() {
    var box = $("fam"), ym = A.mes();
    if (G.estado === "novo" || (G.estado === "grupo" && G.ym !== ym) || G.estado === "erro-recarregar") { box.innerHTML = '<div class="painel"><p class="vazio">Carregando…</p></div>'; carregarGrupo(ym).then(function () { if (ativo("familia")) renderFamilia(); }); return; }
    if (G.estado === "carregando") { box.innerHTML = '<div class="painel"><p class="vazio">Carregando…</p></div>'; return; }
    if (G.estado === "semconta") { box.innerHTML = '<div class="painel"><h2>Conta compartilhada</h2><p class="vazio">Para dividir os gastos com outra pessoa, é preciso entrar na sua conta QUOX.</p></div>'; return; }
    if (G.estado === "erro") { box.innerHTML = '<div class="painel"><h2>Conta compartilhada</h2><p class="erro-t">' + E(G.erro) + '</p><button class="btn sec" type="button" id="fm-retry">Tentar de novo</button></div>'; $("fm-retry").addEventListener("click", function () { G.estado = "novo"; renderFamilia(); }); return; }
    if (G.estado === "semgrupo") {
      box.innerHTML = '<div class="painel"><h2>Conta compartilhada</h2><p class="sub">Para casal, família ou amigos que dividem gastos. Cada pessoa usa a própria conta e todos veem os lançamentos compartilhados do grupo. Seus lançamentos pessoais continuam só seus.</p>' +
        '<form id="fm-criar" novalidate><h3 style="margin:8px 0 0">Criar um grupo</h3><label>Nome do grupo<input id="fm-nome" maxlength="40" autocomplete="off" placeholder="Ex.: Casa, Família Silva"></label><div class="linha"><button class="btn" type="submit">Criar grupo</button></div></form>' +
        '<form id="fm-entrar" novalidate style="margin-top:16px"><h3 style="margin:8px 0 0">Entrar com um código</h3><label>Código do convite<input id="fm-cod" maxlength="12" autocomplete="off" placeholder="Ex.: 8574BC09" style="text-transform:uppercase"></label><div class="linha"><button class="btn sec" type="submit">Entrar no grupo</button></div></form><p class="erro-t" id="fm-erro" role="alert"></p></div>';
      $("fm-criar").addEventListener("submit", function (ev) { ev.preventDefault(); var n = $("fm-nome").value.trim(); if (!n) { $("fm-erro").textContent = "Dê um nome ao grupo."; return; } acaoGrupo("criar_grupo", { p_nome: n, p_meu_nome: meuNome() }); });
      $("fm-entrar").addEventListener("submit", function (ev) { ev.preventDefault(); var c = $("fm-cod").value.trim(); if (c.length < 4) { $("fm-erro").textContent = "Informe o código do convite."; return; } acaoGrupo("entrar_no_grupo", { p_codigo: c, p_meu_nome: meuNome() }); });
      return;
    }
    var a = acerto(G.lancs), eu = A.user().id, desp = G.lancs.filter(function (l) { return l.tipo === "despesa"; }), porCat = {};
    desp.forEach(function (l) { porCat[l.cat] = (porCat[l.cat] || 0) + +l.valor; });
    var cats = Object.keys(porCat).map(function (k) { return [k, porCat[k]]; }).sort(function (x, y) { return y[1] - x[1]; });
    var h = '<div class="painel"><h2>' + E(G.grupo.nome) + '</h2><div class="fam-top">' + G.membros.map(function (m) { return '<span class="chip">' + E(m.nome) + (m.user_id === eu ? " (você)" : "") + "</span>"; }).join("") + "</div>" +
      '<p class="sub" style="margin:8px 0 4px">Código do convite (passe para quem vai participar, até 6 pessoas):</p><div class="cod">' + E(G.codigo) + '</div><div class="linha"><button class="btn sec" type="button" id="fm-conv">Compartilhar convite</button><button class="btn sec" type="button" id="fm-att">Atualizar</button></div></div>';
    h += '<form class="painel" id="fm-form" novalidate><h2>Novo lançamento do grupo</h2><div class="seg" role="radiogroup" aria-label="Tipo"><label><input type="radio" name="fm-tipo" value="despesa" checked><span>Despesa</span></label><label><input type="radio" name="fm-tipo" value="receita"><span>Receita</span></label></div>' +
      '<div class="grid2"><label>Valor (R$)<input id="fm-valor" inputmode="decimal" autocomplete="off" placeholder="0,00"></label><label>Data<input id="fm-data" type="date" value="' + A.hoje() + '"></label></div>' +
      '<label>Categoria<select id="fm-cat">' + PA.CATS_D.map(function (c) { return "<option>" + E(c) + "</option>"; }).join("") + '</select></label><label>Descrição<input id="fm-desc" maxlength="80" autocomplete="off" placeholder="Ex.: Mercado, aluguel"></label><p class="erro-t" id="fm-erro" role="alert"></p><div class="linha"><button class="btn" type="submit">Lançar para o grupo</button></div><p class="leg">Dica: no chat, escreva "casa: gastei 80 no mercado" para lançar direto no grupo.</p></form>';
    h += '<div class="painel"><h2>' + E(A.mesLabel(G.ym)) + '</h2><div class="kpis"><div class="kpi"><span>Despesas do grupo</span><b class="neg">' + R(a.total) + '</b></div><div class="kpi"><span>Parte de cada um</span><b>' + R(a.parte) + "</b></div></div>" +
      "<h3>Quem pagou</h3>" + G.membros.map(function (m) { return '<div class="kv" style="display:flex;justify-content:space-between;padding:3px 0"><span>' + E(m.nome) + '</span><b>' + R(a.pago[m.user_id] || 0) + "</b></div>"; }).join("") +
      "<h3>Acerto de contas</h3>" + (a.transf.length ? a.transf.map(function (t) { return '<div class="dica">' + E(nomeMembro(t.de)) + " paga <strong>" + R(t.v) + "</strong> para " + E(nomeMembro(t.para)) + "</div>"; }).join("") + '<p class="leg">Considera a divisão igual das despesas entre todos do grupo.</p>' : '<p class="vazio">' + (a.total ? "Tudo certo, ninguém deve nada." : "Sem despesas neste mês.") + "</p>") +
      (cats.length ? "<h3>Por categoria</h3>" + cats.map(function (c) { return '<div class="barra"><div class="t"><span>' + E(c[0]) + "</span><span>" + R(c[1]) + " · " + pct(c[1] / a.total * 100) + '</span></div><div class="trilho"><span class="fill" style="width:' + Math.max(2, c[1] / a.total * 100) + '%"></span></div></div>'; }).join("") : "") + "</div>";
    h += '<div class="painel"><h2>Lançamentos do grupo</h2>' + (G.lancs.length ? G.lancs.map(function (l) {
      return '<div class="item"><div class="l"><b>' + E(l.descr || l.cat) + "</b><small>" + E(l.cat) + " · " + dmy(l.data) + " · " + E(nomeMembro(l.user_id)) + "</small>" + (l.user_id === eu ? '<div class="acs"><button class="mini-b perigo" type="button" data-gdel="' + E(l.id) + '">Excluir</button></div>' : "") + '</div><div class="v ' + (l.tipo === "receita" ? "pos" : "neg") + '">' + (l.tipo === "receita" ? "+" : "−") + R(+l.valor) + "</div></div>";
    }).join("") : '<p class="vazio">Nenhum lançamento neste mês.</p>') + "</div>";
    h += '<div class="painel"><button class="btn sec perigo" type="button" id="fm-sair">Sair do grupo</button><p class="leg">Ao sair, seus lançamentos do grupo continuam lá para os outros. Se o grupo ficar sem ninguém, ele é apagado.</p></div>';
    box.innerHTML = h;
    $("fm-att").addEventListener("click", function () { G.estado = "novo"; renderFamilia(); });
    $("fm-conv").addEventListener("click", function () {
      var url = location.origin + location.pathname.replace(/[^\/]*$/, "") + "assessor.html#familia", txt = "Entre no grupo \"" + G.grupo.nome + "\" no QUOX - Finanças. Código do convite: " + G.codigo + "\nAbra " + url + ", vá em Mais > Conta compartilhada e digite o código.";
      if (navigator.share) navigator.share({ title: "QUOX - Finanças", text: txt }).catch(function () {});
      else if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { A.toast("Convite copiado"); }, function () { A.toast("Não consegui copiar. Passe o código manualmente."); });
      else A.toast("Passe o código manualmente: " + G.codigo);
    });
    $("fm-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var v = A.parseBR($("fm-valor").value), d = $("fm-data").value, tp = (document.querySelector('input[name="fm-tipo"]:checked') || {}).value || "despesa";
      if (!isFinite(v) || v <= 0) { $("fm-erro").textContent = "Informe um valor maior que zero."; return; }
      if (!A.dataValida(d)) { $("fm-erro").textContent = "Escolha uma data válida."; return; }
      $("fm-erro").textContent = "";
      inserirNoGrupo({ tipo: tp, valor: Math.round(v * 100) / 100, cat: tp === "receita" ? "Outros" : $("fm-cat").value, data: d, descr: $("fm-desc").value.trim().slice(0, 80) }).then(function (ok) { if (ok) { A.toast("Lançado no grupo"); G.estado = "novo"; renderFamilia(); } else $("fm-erro").textContent = G.erro || "Não foi possível lançar. Tente de novo."; });
    });
    box.querySelectorAll("[data-gdel]").forEach(function (b) { A.duplo(b, "Confirmar?", function () { A.sb().from("lancamentos_grupo").delete().eq("grupo_id", G.grupo.id).eq("id", b.getAttribute("data-gdel")).then(function () { G.estado = "novo"; renderFamilia(); }); }); });
    A.duplo($("fm-sair"), "Clique de novo para sair", function () { A.sb().rpc("sair_do_grupo").then(function (r) { if (r && r.error) { A.toast(msgErroGrupo(r.error)); return; } G = { estado: "semgrupo", grupo: null, membros: [], lancs: [], codigo: "", ym: "", erro: "" }; renderFamilia(); A.toast("Você saiu do grupo"); }); });
  }
  function acaoGrupo(fn, args) {
    $("fm-erro").textContent = "Aguarde…";
    Promise.resolve(A.sb().rpc(fn, args)).then(function (r) { if (r && r.error) { $("fm-erro").textContent = msgErroGrupo(r.error); return; } G.estado = "novo"; renderFamilia(); }, function (e) { $("fm-erro").textContent = msgErroGrupo(e); });
  }
  function inserirNoGrupo(l) {
    var sb = A.sb(); if (!sb || !G.grupo) { G.erro = "Você não está em um grupo."; return Promise.resolve(false); }
    var row = { grupo_id: G.grupo.id, id: A.uid(), user_id: A.user().id, tipo: l.tipo, valor: l.valor, cat: l.cat, data: l.data, descr: l.descr, forma: "", banco: "" };
    return Promise.resolve(sb.from("lancamentos_grupo").insert(row)).then(function (r) { if (r && r.error) { G.erro = msgErroGrupo(r.error); return false; } return true; }, function (e) { G.erro = msgErroGrupo(e); return false; });
  }
  window.QuoxTabs.familia = renderFamilia;
  /* chat: "casa: gastei 80 no mercado" lança no grupo; "acerto" mostra quem deve */
  A.chat.push(function (texto, n, temNum) {
    var m = texto.match(/^\s*(fam[ií]lia|casal|grupo|casa|compartilhad[oa])\s*[:\-,]\s*([\s\S]+)$/i);
    if (m) {
      var r = PA.interpretar(m[2], new Date()); if (!r.ok) return "Não achei o valor. Exemplo: casa: gastei 80 no mercado.";
      var ym0 = A.hoje().slice(0, 7);
      (G.estado === "grupo" ? Promise.resolve() : carregarGrupo(ym0)).then(function () {
        if (G.estado !== "grupo") { A.pushChat("bot", G.estado === "semgrupo" ? "Você ainda não está em um grupo. Crie ou entre em um em Mais > Conta compartilhada." : G.erro || "Não consegui acessar a conta compartilhada agora."); A.salvar(); A.render(); return; }
        return inserirNoGrupo({ tipo: r.tipo, valor: r.valor, cat: r.cat, data: r.data, descr: (r.desc || r.cat).slice(0, 80) }).then(function (ok) {
          A.pushChat("bot", ok ? "Lançado no grupo " + G.grupo.nome + ": " + (r.tipo === "receita" ? "receita" : "despesa") + " de " + R(r.valor) + " em " + r.cat + "." : (G.erro || "Não foi possível lançar no grupo."));
          G.estado = "novo"; A.salvar(); A.render();
        });
      });
      return "Lançando na conta compartilhada…";
    }
    if (!temNum && /^(acerto|acerto de contas|quem deve|quem paga)/.test(n.trim())) {
      if (G.estado !== "grupo") return "Abra Mais > Conta compartilhada para eu carregar o grupo e calcular o acerto.";
      return textoAcerto();
    }
    return null;
  });

  A.render();
})();
