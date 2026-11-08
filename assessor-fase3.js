/* QUOX - Assessor, fase 3: desafios, resumo semanal e comandos de chat. Usa window.QuoxApp. */
(function () {
  "use strict";
  var A = window.QuoxApp, L = window.QuoxLib, PA = window.QuoxParser;
  if (!A || !L || !PA) return;
  var $ = function (id) { return document.getElementById(id); };
  var E = A.esc, R = A.R, pct = A.pct, est = A.estado;
  function dmy(iso) { return iso.split("-").reverse().join("/"); }
  function prog(d) { return L.progressoDesafio(d, est().lanc, A.hoje()); }

  /* ---------- desafios ---------- */
  function titulo(d) {
    if (d.tipo === "sem") return d.dias + " dias sem gastar com " + d.cat;
    if (d.tipo === "teto") return "No máximo " + R(d.alvo) + " em " + d.cat + " (" + d.dias + " dias)";
    return "Anotar os gastos todos os dias (" + d.dias + " dias)";
  }
  function detalhe(d, p) {
    if (p.naoComecou) return "Começa em " + dmy(d.ini) + ".";
    if (d.tipo === "sem") return p.st === "perdido" ? "Você gastou com " + d.cat + " em " + dmy(p.quando) + ". Dá para recomeçar quando quiser." : p.st === "ganho" ? "Você passou " + d.dias + " dias sem gastar com " + d.cat + ". Parabéns!" : "Dia " + p.dec + " de " + d.dias + (p.restam ? ". Faltam " + p.restam + (p.restam === 1 ? " dia." : " dias.") : ".");
    if (d.tipo === "teto") return p.st === "perdido" ? "Passou do limite: " + R(p.gasto) + " de " + R(d.alvo) + "." : p.st === "ganho" ? "Você ficou dentro do limite (" + R(p.gasto) + " de " + R(d.alvo) + "). Parabéns!" : "Gasto até agora: " + R(p.gasto) + " de " + R(d.alvo) + ". Restam " + R(Math.max(0, d.alvo - p.gasto)) + " e " + p.restam + " dias.";
    return p.st === "perdido" ? "Ficou um dia sem anotar. Dá para recomeçar quando quiser." : p.st === "ganho" ? "Você anotou todos os dias. Parabéns!" : p.feitos + " de " + d.dias + " dias anotados. Anote hoje para manter a sequência.";
  }
  function renderDesafios() {
    var ds = est().desafios, vence = 0;
    ds.forEach(function (d) { if (prog(d).st === "ganho") vence++; });
    var cab = vence ? '<p class="sub">Desafios vencidos: <strong>' + vence + "</strong> 🏆</p>" : "";
    $("ds-lista").innerHTML = ds.length ? cab + ds.slice().reverse().map(function (d) {
      var p = prog(d), cl = p.st === "ganho" ? "ok" : p.st === "perdido" ? "perdeu" : "";
      return '<div class="carto"><h3>' + E(titulo(d)) + (p.st === "ganho" ? " ✓" : p.st === "perdido" ? " ✗" : "") + '</h3><div class="barra"><div class="trilho"><span class="fill ' + cl + '" style="width:' + Math.max(2, p.pct) + '%"></span></div></div><p class="sub" style="margin:6px 0">' + E(detalhe(d, p)) + '</p><div class="acs" style="display:flex;gap:6px"><button class="mini-b perigo" type="button" data-dsdel="' + E(d.id) + '">' + (p.st === "andamento" ? "Desistir" : "Remover") + "</button>" + (p.st === "perdido" ? '<button class="mini-b" type="button" data-dsre="' + E(d.id) + '">Recomeçar</button>' : "") + "</div></div>";
    }).join("") : '<p class="vazio">Nenhum desafio ainda. Crie o primeiro abaixo, por exemplo "7 dias sem gastar com Delivery" ou "Anotar os gastos por 7 dias".</p>';
    var raiz = $("ds-lista");
    raiz.querySelectorAll("[data-dsdel]").forEach(function (b) { A.duplo(b, "Confirmar?", function () { est().desafios = est().desafios.filter(function (x) { return x.id !== b.getAttribute("data-dsdel"); }); A.salvar(); A.render(); }); });
    raiz.querySelectorAll("[data-dsre]").forEach(function (b) { b.addEventListener("click", function () { est().desafios.forEach(function (x) { if (x.id === b.getAttribute("data-dsre")) { x.ini = A.hoje(); x.visto = 0; } }); A.salvar(); A.render(); A.toast("Desafio recomeçado. Boa!"); }); });
    ds.forEach(function (d) { if (!d.visto && prog(d).st !== "andamento") d.visto = 1; });
  }
  function ajustaForm() {
    var t = $("ds-tipo").value;
    $("ds-cat-l").hidden = t === "anotar"; $("ds-alvo-l").hidden = t !== "teto";
  }
  $("ds-cat").innerHTML = PA.CATS_D.map(function (c) { return '<option value="' + E(c) + '">' + E(c) + "</option>"; }).join("");
  $("ds-tipo").addEventListener("change", ajustaForm); ajustaForm();
  $("ds-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var t = $("ds-tipo").value, er = $("ds-erro"), alvo = 0;
    if (t === "teto") { alvo = A.parseBR($("ds-alvo").value); if (!isFinite(alvo) || alvo <= 0) { er.textContent = "Informe o valor máximo, por exemplo 200."; return; } }
    if (est().desafios.filter(function (d) { return prog(d).st === "andamento"; }).length >= 5) { er.textContent = "Termine ou remova algum desafio antes: o ideal é no máximo 5 ao mesmo tempo."; return; }
    er.textContent = "";
    est().desafios.push({ id: A.uid().slice(0, 12), tipo: t, cat: t === "anotar" ? "" : $("ds-cat").value, alvo: Math.round(alvo * 100) / 100, dias: +$("ds-dias").value, ini: A.hoje(), visto: 0 });
    $("ds-alvo").value = ""; A.salvar(); A.render(); A.toast("Desafio criado. Vamos nessa!");
  });
  window.QuoxTabs.desafios = renderDesafios;

  /* aviso no topo quando um desafio é vencido ou perdido e ainda não foi visto */
  var prevAv = A.avisosExtra;
  A.avisosExtra = function () {
    var o = prevAv ? prevAv() : [];
    est().desafios.forEach(function (d) { if (!d.visto) { var st = prog(d).st; if (st === "ganho") o.push("desafio vencido: " + titulo(d)); else if (st === "perdido") o.push("desafio perdido: " + titulo(d)); } });
    return o;
  };
  window.QuoxApp.avisosExtra = A.avisosExtra;

  /* ---------- resumo semanal ---------- */
  function textoSemana(r) {
    var l = ["Minha semana (" + dmy(r.ini) + " a " + dmy(r.fim) + ") no QUOX Finanças:", "Entrou: " + R(r.rec), "Saiu: " + R(r.desp) + (r.delta == null ? "" : " (" + (r.delta >= 0 ? "+" : "") + Math.round(r.delta) + "% sobre a semana anterior)")];
    if (r.top) l.push("Onde mais gastei: " + r.top[0] + " (" + R(r.top[1]) + ")");
    l.push("Dias com anotações: " + r.dias + " de 7"); return l.join("\n");
  }
  function conselho(r) {
    if (!r.n) return "Você não anotou nada nos últimos 7 dias. Lance os gastos de hoje em 10 segundos pelo chat para retomar o controle.";
    if (r.delta != null && r.delta >= 25 && r.desp - r.despAnt >= 50) return "Os gastos subiram " + Math.round(r.delta) + "% em relação à semana anterior" + (r.top ? ", puxados por " + r.top[0] : "") + ". Que tal um desafio curto nessa categoria?";
    if (r.delta != null && r.delta <= -15) return "Você gastou " + Math.round(-r.delta) + "% menos que na semana anterior. Ótimo ritmo!";
    if (r.dias < 4) return "Você anotou em " + r.dias + " dos 7 dias. Quanto mais constante, mais fiéis ficam o resumo e as dicas.";
    return "Semana equilibrada. Continue anotando todo dia para manter o quadro completo.";
  }
  function renderSemana() {
    var el = $("sem-res"); if (!el) return;
    var r = L.resumoSemana(est().lanc, A.hoje());
    el.innerHTML = '<p class="sub" style="margin-top:0">' + dmy(r.ini) + " a " + dmy(r.fim) + '</p><div class="kpis" style="margin-bottom:8px"><div class="kpi"><span>Entrou</span><b class="pos">' + R(r.rec) + '</b></div><div class="kpi"><span>Saiu</span><b class="neg">' + R(r.desp) + "</b></div></div>" +
      '<p style="margin:6px 0">' + (r.delta == null ? "Sem gastos na semana anterior para comparar." : "Gastos " + (r.delta >= 0 ? "<strong>" + Math.round(r.delta) + "% acima</strong>" : "<strong>" + Math.round(-r.delta) + "% abaixo</strong>") + " da semana anterior (" + R(r.despAnt) + ").") + (r.top ? " Maior gasto: <strong>" + E(r.top[0]) + "</strong> (" + R(r.top[1]) + ")." : "") + "</p>" +
      '<p style="margin:6px 0">' + E(conselho(r)) + '</p><button class="mini-b" type="button" id="sem-comp">Compartilhar resumo</button>';
    $("sem-comp").addEventListener("click", function () {
      var tx = textoSemana(r);
      if (navigator.share) navigator.share({ text: tx }).catch(function () {});
      else if (navigator.clipboard) navigator.clipboard.writeText(tx).then(function () { A.toast("Resumo copiado."); }, function () { A.toast("Não consegui copiar."); });
    });
  }
  window.QuoxTabs.semana = renderSemana;

  /* ---------- chat ---------- */
  A.chat.push(function (texto, n, temNum) {
    if (temNum) return null;
    var t = n.trim();
    if (/^(minha semana|resumo (da|de) semana|resumo semanal|semana|como foi a semana|como foi minha semana)$/.test(t)) return textoSemana(L.resumoSemana(est().lanc, A.hoje())) + "\n\n" + conselho(L.resumoSemana(est().lanc, A.hoje()));
    if (/^(desafios?|meus desafios)$/.test(t)) {
      var ds = est().desafios; if (!ds.length) return "Você ainda não tem desafios. Crie um na aba Desafios (em Mais), por exemplo \"7 dias sem gastar com Delivery\".";
      return "Seus desafios:\n" + ds.map(function (d) { var p = prog(d); return "• " + titulo(d) + ": " + (p.st === "ganho" ? "vencido ✓" : p.st === "perdido" ? "perdido" : "em andamento") + ". " + detalhe(d, p); }).join("\n");
    }
    if (/^(dicas?|me de dicas|me da dicas|o que voce acha)$/.test(t)) {
      var ins = (A.insights ? A.insights(A.mes()) : []).slice(0, 3);
      return ins.length ? "Minhas dicas para você:\n" + ins.map(function (i) { return "• " + i.t + (i.a ? " (Leia: " + i.a[1] + ")" : ""); }).join("\n") : "Veja as dicas na aba Resumo.";
    }
    return null;
  });
})();
