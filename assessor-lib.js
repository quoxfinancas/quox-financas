/* QUOX - Assessor: funções puras (importação de extrato, faturas de cartão, metas). Sem acesso à tela. */
(function (root) {
  "use strict";
  function sem(s) { return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim(); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function iso(y, m, d) { return y + "-" + pad(m) + "-" + pad(d); }
  function dataOk(y, m, d) { var t = new Date(y, m - 1, d); return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d; }

  /* ---------- números e datas ---------- */
  function numero(s) {
    var t = String(s == null ? "" : s).trim(); if (!t) return NaN;
    var neg = false;
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
    if (/-\s*$/.test(t)) { neg = true; t = t.replace(/-\s*$/, ""); }
    if (/^[-−–]/.test(t)) { neg = !neg; t = t.replace(/^[-−–]\s*/, ""); }
    t = t.replace(/^\+/, "").replace(/R\$|\s| /g, "").replace(/[A-Za-z]/g, "");
    if (!t || !/^[\d.,]+$/.test(t)) return NaN;
    var ult = Math.max(t.lastIndexOf(","), t.lastIndexOf("."));
    if (t.indexOf(",") >= 0 && t.indexOf(".") >= 0) t = ult === t.lastIndexOf(",") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
    else if (t.indexOf(",") >= 0) t = t.replace(/\./g, "").replace(",", ".");
    else if (t.indexOf(".") >= 0 && /^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
    var v = parseFloat(t); if (!isFinite(v)) return NaN;
    return neg ? -v : v;
  }
  function data(s) {
    var t = String(s == null ? "" : s).trim(), m;
    if ((m = t.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/))) return dataOk(+m[1], +m[2], +m[3]) ? iso(+m[1], +m[2], +m[3]) : "";
    if ((m = t.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/))) { var y = +m[3]; if (y < 100) y += 2000; return dataOk(y, +m[2], +m[1]) ? iso(y, +m[2], +m[1]) : ""; }
    if ((m = t.match(/^(\d{4})(\d{2})(\d{2})/))) return dataOk(+m[1], +m[2], +m[3]) ? iso(+m[1], +m[2], +m[3]) : "";
    return "";
  }

  /* ---------- OFX ---------- */
  function lerOFX(txt) {
    var rows = [], blocos = String(txt).split(/<STMTTRN>/i).slice(1);
    blocos.forEach(function (b) {
      b = b.split(/<\/STMTTRN>/i)[0].split(/<\/BANKTRANLIST>|<\/CCSTMTRS>|<\/STMTRS>/i)[0];
      function tag(n) { var m = b.match(new RegExp("<" + n + ">\\s*([^<\\r\\n]*)", "i")); return m ? m[1].trim() : ""; }
      var d = data(tag("DTPOSTED")), v = numero(tag("TRNAMT")), desc = tag("MEMO") || tag("NAME");
      if (!d || !isFinite(v) || v === 0) return;
      rows.push({ data: d, valor: v, desc: desc.replace(/\s+/g, " ").slice(0, 80), fitid: tag("FITID") });
    });
    return rows;
  }

  /* ---------- CSV ---------- */
  function lerLinhasCSV(txt) {
    txt = String(txt).replace(/^﻿/, "");
    var primeira = txt.split(/\r?\n/).find(function (l) { return l.trim(); }) || "";
    var cont = { ";": (primeira.match(/;/g) || []).length, ",": (primeira.match(/,/g) || []).length, "\t": (primeira.match(/\t/g) || []).length };
    var sep = cont[";"] >= cont[","] && cont[";"] >= cont["\t"] ? ";" : cont["\t"] > cont[","] ? "\t" : ",";
    var out = [], row = [], cel = "", q = false, i, c;
    for (i = 0; i < txt.length; i++) {
      c = txt[i];
      if (q) { if (c === '"') { if (txt[i + 1] === '"') { cel += '"'; i++; } else q = false; } else cel += c; }
      else if (c === '"') q = true;
      else if (c === sep) { row.push(cel); cel = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && txt[i + 1] === "\n") i++; row.push(cel); cel = ""; if (row.some(function (x) { return x.trim(); })) out.push(row); row = []; }
      else cel += c;
    }
    row.push(cel); if (row.some(function (x) { return x.trim(); })) out.push(row);
    return out;
  }
  function lerCSV(txt) {
    var linhas = lerLinhasCSV(txt), avisos = [];
    if (linhas.length < 2) return { rows: [], avisos: ["O arquivo está vazio ou não parece um CSV de extrato."], invertir: false };
    var hi = -1, i;
    for (i = 0; i < Math.min(linhas.length, 15); i++) { if (linhas[i].some(function (x) { return /^(data|date|dt\b|dia)/.test(sem(x)); }) && !linhas[i].some(function (x) { return data(x); })) { hi = i; break; } }
    var cab = hi >= 0 ? linhas[hi].map(sem) : [], corpo = linhas.slice(hi + 1), n = Math.max.apply(null, linhas.map(function (l) { return l.length; }));
    function acha(re) { for (var k = 0; k < cab.length; k++) if (re.test(cab[k])) return k; return -1; }
    var cd = acha(/^(data|date|dt)/), cv = acha(/^(valor|amount|quantia|montante|value)/), cdesc = acha(/(descri|historico|lancamento|title|memo|estabelecimento|detalhe|nome)/), cdeb = acha(/^debito/), ccre = acha(/^credito/);
    function mais(fn) { var best = -1, bs = 0; for (var k = 0; k < n; k++) { var s = corpo.filter(function (r) { return fn(r[k]); }).length; if (s > bs) { bs = s; best = k; } } return best; }
    if (cd < 0) cd = mais(function (x) { return !!data(x); });
    if (cv < 0 && cdeb < 0 && ccre < 0) cv = mais(function (x) { return isFinite(numero(x)) && /\d[,.]\d{2}\s*$|^\s*-?\d+\s*$/.test(String(x || "")); });
    if (cdesc < 0) { var bl = -1, bs = -1; for (var k = 0; k < n; k++) { if (k === cd || k === cv || k === cdeb || k === ccre) continue; var s2 = corpo.slice(0, 30).reduce(function (a, r) { return a + String(r[k] || "").length; }, 0); if (s2 > bs) { bs = s2; bl = k; } } cdesc = bl; }
    if (cd < 0 || (cv < 0 && cdeb < 0 && ccre < 0)) return { rows: [], avisos: ["Não consegui identificar as colunas de data e valor. Use o arquivo OFX do banco, se tiver."], invertir: false };
    var rows = [];
    corpo.forEach(function (r) {
      var d = data(r[cd]); if (!d) return;
      var v;
      if (cv >= 0) v = numero(r[cv]);
      else { var de = numero(r[cdeb]), cr = numero(r[ccre]); v = (isFinite(cr) ? Math.abs(cr) : 0) - (isFinite(de) ? Math.abs(de) : 0); if (!v) v = NaN; }
      if (!isFinite(v) || v === 0) return;
      rows.push({ data: d, valor: v, desc: String(cdesc >= 0 ? r[cdesc] || "" : "").replace(/\s+/g, " ").trim().slice(0, 80), fitid: "" });
    });
    var invertir = cab.indexOf("title") >= 0 && cab.indexOf("amount") >= 0;
    if (invertir) avisos.push("Parece uma fatura de cartão (valores positivos são compras). Já inverti os sinais.");
    return { rows: rows, avisos: avisos, invertir: invertir };
  }

  function hash(s) { var h = 5381, i; for (i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function idImport(r, seq) { return "i" + hash(r.data + "|" + r.valor.toFixed(2) + "|" + sem(r.desc) + "|" + (r.fitid || "") + "|" + (seq || 0)); }
  function lerExtrato(txt, nomeArquivo) {
    var ehOfx = /<OFX|<STMTTRN>/i.test(txt) || /\.ofx$/i.test(nomeArquivo || "");
    if (ehOfx) { var r = lerOFX(txt); return { formato: "OFX", rows: r, avisos: r.length ? [] : ["Não encontrei lançamentos neste arquivo OFX."], invertir: false }; }
    var c = lerCSV(txt); return { formato: "CSV", rows: c.rows, avisos: c.avisos, invertir: c.invertir };
  }

  /* ---------- faturas de cartão ---------- */
  function ultimoDia(ym) { return new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate(); }
  function mesDia(ym, dia) { return ym + "-" + pad(Math.min(dia, ultimoDia(ym))); }
  function somaMes(ym, n) { var t = +ym.slice(0, 4) * 12 + (+ym.slice(5, 7) - 1) + n; return Math.floor(t / 12) + "-" + pad((t % 12) + 1); }
  function mesmoCartao(banco, nome) { var a = sem(banco), b = sem(nome); return !!a && !!b && (a === b || a.indexOf(b) === 0 || b.indexOf(a) === 0); }
  function faturaDaCompra(dataIso, fecha) {
    var ym = dataIso.slice(0, 7), dia = +dataIso.slice(8);
    return dia <= Math.min(fecha, ultimoDia(ym)) ? ym : somaMes(ym, 1);
  }
  function faturas(cartao, lancs, hoje) {
    var mapa = {};
    lancs.forEach(function (l) {
      if (l.tipo !== "despesa" || l.forma !== "Crédito" || !mesmoCartao(l.banco, cartao.nome)) return;
      var ym = faturaDaCompra(l.data, cartao.fecha); (mapa[ym] = mapa[ym] || []).push(l);
    });
    var pagas = cartao.pagas || [];
    return Object.keys(mapa).sort().map(function (ym) {
      var fecha = mesDia(ym, cartao.fecha), vence = cartao.vence > cartao.fecha ? mesDia(ym, cartao.vence) : mesDia(somaMes(ym, 1), cartao.vence);
      var itens = mapa[ym], total = itens.reduce(function (s, x) { return s + x.valor; }, 0), paga = pagas.indexOf(ym) >= 0;
      var estado = fecha >= hoje ? "aberta" : paga ? "paga" : vence >= hoje ? "fechada" : "vencida";
      return { ym: ym, fecha: fecha, vence: vence, total: Math.round(total * 100) / 100, itens: itens, estado: estado };
    });
  }
  function limiteUsado(fs) { return Math.round(fs.filter(function (f) { return f.estado === "aberta" || f.estado === "fechada" || f.estado === "vencida"; }).reduce(function (s, f) { return s + f.total; }, 0) * 100) / 100; }


  /* ---------- parcelamento ---------- */
  function dataMaisMeses(dataIso, k) {
    var ym = somaMes(dataIso.slice(0, 7), k); return mesDia(ym, +dataIso.slice(8));
  }
  /* Divide uma compra em parcelas mensais. total: valor total (ou de cada parcela, se ehParcela). A última parcela absorve os centavos. */
  function parcelar(valor, n, dataIso, ehParcela) {
    var total = Math.round((ehParcela ? valor * n : valor) * 100) / 100, base = Math.floor((total / n) * 100) / 100, out = [], soma = 0, k;
    if (ehParcela) base = Math.round(valor * 100) / 100;
    for (k = 0; k < n; k++) {
      var v = k === n - 1 ? Math.round((total - soma) * 100) / 100 : base;
      soma += v; out.push({ k: k + 1, n: n, data: dataMaisMeses(dataIso, k), valor: v });
    }
    return out;
  }
  var RE_PARC = /^p([a-z0-9]{4,12})_(\d{1,2})_(\d{1,2})$/;
  function infoParcela(id) { var m = RE_PARC.exec(String(id || "")); return m ? { g: m[1], k: +m[2], n: +m[3] } : null; }

  /* ---------- metas ---------- */
  function mesesAte(hojeIso, prazo) { var a = +hojeIso.slice(0, 4) * 12 + +hojeIso.slice(5, 7), b = +prazo.slice(0, 4) * 12 + +prazo.slice(5, 7); return Math.max(1, b - a); }
  function porMes(meta, hojeIso) { var falta = meta.alvo - meta.guardado; if (falta <= 0 || !meta.prazo || meta.prazo <= hojeIso) return null; return Math.ceil((falta / mesesAte(hojeIso, meta.prazo)) * 100) / 100; }

  var api = { parcelar: parcelar, dataMaisMeses: dataMaisMeses, infoParcela: infoParcela, numero: numero, data: data, lerOFX: lerOFX, lerCSV: lerCSV, lerExtrato: lerExtrato, idImport: idImport, faturas: faturas, faturaDaCompra: faturaDaCompra, limiteUsado: limiteUsado, mesmoCartao: mesmoCartao, mesDia: mesDia, somaMes: somaMes, porMes: porMes, sem: sem };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.QuoxLib = api;
})(typeof window !== "undefined" ? window : globalThis);
