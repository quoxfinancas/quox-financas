/* QUOX - gerador de planilha .xlsx (puro, sem bibliotecas). Cria o ZIP sem compressão e o XML do Excel. */
(function (root) {
  "use strict";
  var CRC = null;
  function crc32(b) {
    if (!CRC) { CRC = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
    var x = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) x = CRC[(x ^ b[i]) & 255] ^ (x >>> 8);
    return (x ^ 0xFFFFFFFF) >>> 0;
  }
  function utf8(s) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s);
    return Uint8Array.from(Buffer.from(s, "utf8"));
  }
  function zip(arquivos) {
    var partes = [], central = [], off = 0;
    function u16(v) { return [v & 255, (v >>> 8) & 255]; }
    function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }
    arquivos.forEach(function (a) {
      var nome = utf8(a.nome), dados = utf8(a.txt), crc = crc32(dados);
      var loc = [].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(dados.length), u32(dados.length), u16(nome.length), u16(0));
      partes.push(Uint8Array.from(loc), nome, dados);
      central.push(Uint8Array.from([].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(dados.length), u32(dados.length), u16(nome.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(off))), nome);
      off += loc.length + nome.length + dados.length;
    });
    var tamC = 0; central.forEach(function (c) { tamC += c.length; });
    var fim = Uint8Array.from([].concat(u32(0x06054b50), u16(0), u16(0), u16(arquivos.length), u16(arquivos.length), u32(tamC), u32(off), u16(0)));
    var todos = partes.concat(central, [fim]), total = 0; todos.forEach(function (p) { total += p.length; });
    var out = new Uint8Array(total), p = 0; todos.forEach(function (x) { out.set(x, p); p += x.length; });
    return out;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ""); }
  function col(i) { var s = ""; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function serial(iso) { var p = String(iso).split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000 + 25569; }
  /* estilos: 0 normal, 1 cabeçalho, 2 moeda, 3 data, 4 moeda negrito, 5 porcentagem, 6 negrito, 7 texto com quebra */
  var STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00;[Red]\\-&quot;R$&quot;\\ #,##0.00"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts>' +
    '<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0B3D2E"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="164" fontId="2" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
    '<xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  /* célula: primitivo (texto/número) ou {v, f, s, d:true}. d = data ISO. */
  function celula(c, r, i) {
    var ref = col(i) + r, o = c;
    if (o === null || o === undefined || o === "") return "";
    if (typeof o !== "object") o = { v: o };
    var s = o.s ? ' s="' + o.s + '"' : "", f = o.f ? "<f>" + esc(o.f) + "</f>" : "";
    if (o.d) return '<c r="' + ref + '" s="' + (o.s || 3) + '"><v>' + serial(o.v) + "</v></c>";
    if (typeof o.v === "number") return '<c r="' + ref + '"' + s + ">" + f + "<v>" + (isFinite(o.v) ? o.v : 0) + "</v></c>";
    if (o.f) return '<c r="' + ref + '"' + s + ' t="str">' + f + "<v>" + esc(o.v == null ? "" : o.v) + "</v></c>";
    return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + esc(o.v) + "</t></is></c>";
  }
  /* planilhas: [{nome, larguras:[...], linhas:[[células]], congelar:true}] */
  function gerar(planilhas) {
    var arq = [], ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
      wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>',
      rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
    planilhas.forEach(function (p, k) {
      var n = k + 1, nome = String(p.nome).replace(/[\[\]:*?\/\\]/g, " ").slice(0, 31);
      ct += '<Override PartName="/xl/worksheets/sheet' + n + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
      wb += '<sheet name="' + esc(nome) + '" sheetId="' + n + '" r:id="rId' + n + '"/>';
      rels += '<Relationship Id="rId' + n + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + n + '.xml"/>';
      var x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"' + (k === 0 ? ' tabSelected="1"' : "") + ">" + (p.congelar ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : "") + "</sheetView></sheetViews><sheetFormatPr defaultRowHeight=\"15\"/>";
      if (p.larguras) x += "<cols>" + p.larguras.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join("") + "</cols>";
      x += "<sheetData>" + p.linhas.map(function (l, r) { return '<row r="' + (r + 1) + '">' + l.map(function (c, i) { return celula(c, r + 1, i); }).join("") + "</row>"; }).join("") + "</sheetData></worksheet>";
      arq.push({ nome: "xl/worksheets/sheet" + n + ".xml", txt: x });
    });
    var ns = planilhas.length + 1;
    rels += '<Relationship Id="rId' + ns + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    arq.unshift({ nome: "[Content_Types].xml", txt: ct + "</Types>" },
      { nome: "_rels/.rels", txt: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { nome: "xl/workbook.xml", txt: wb + "</sheets></workbook>" },
      { nome: "xl/_rels/workbook.xml.rels", txt: rels },
      { nome: "xl/styles.xml", txt: STYLES });
    return zip(arq);
  }
  /* Monta as planilhas do QUOX a partir dos lançamentos. */
  function planilhasQuox(lanc, opts) {
    opts = opts || {}; var hoje = opts.hoje || "0000-00-00", R2 = function (v) { return Math.round(v * 100) / 100; };
    var l = lanc.slice().sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; });
    var H = function (t) { return { v: t, s: 1 }; };
    var L1 = [[H("Data"), H("Mês"), H("Tipo"), H("Categoria"), H("Descrição"), H("Forma de pagamento"), H("Banco ou cartão"), H("Valor")]];
    l.forEach(function (x) { L1.push([{ v: x.data, d: true }, x.data.slice(0, 7), x.tipo === "receita" ? "receita" : "despesa", x.cat, x.desc || "", x.forma || "", x.banco || "", { v: R2(x.valor), s: 2 }]); });
    var last = Math.max(2, L1.length), A = "Lançamentos!";
    var meses = {}; l.forEach(function (x) { meses[x.data.slice(0, 7)] = 1; }); meses = Object.keys(meses).sort();
    var L2 = [[H("Mês"), H("Receitas"), H("Despesas"), H("Saldo"), H("% poupado")]];
    meses.forEach(function (m, i) {
      var r = i + 2, rec = 0, des = 0; l.forEach(function (x) { if (x.data.slice(0, 7) === m) { if (x.tipo === "receita") rec += x.valor; else des += x.valor; } });
      rec = R2(rec); des = R2(des);
      L2.push([m,
        { v: rec, s: 2, f: 'SUMIFS(' + A + '$H$2:$H$' + last + ',' + A + '$C$2:$C$' + last + ',"receita",' + A + '$B$2:$B$' + last + ',$A' + r + ")" },
        { v: des, s: 2, f: 'SUMIFS(' + A + '$H$2:$H$' + last + ',' + A + '$C$2:$C$' + last + ',"despesa",' + A + '$B$2:$B$' + last + ',$A' + r + ")" },
        { v: R2(rec - des), s: 2, f: "B" + r + "-C" + r },
        { v: rec > 0 ? (rec - des) / rec : 0, s: 5, f: "IF(B" + r + ">0,D" + r + "/B" + r + ",0)" }]);
    });
    var n2 = L2.length;
    if (meses.length) { var tr = n2 + 1, tr1 = 0, td = 0; l.forEach(function (x) { if (x.tipo === "receita") tr1 += x.valor; else td += x.valor; }); tr1 = R2(tr1); td = R2(td);
      L2.push([{ v: "Total", s: 6 }, { v: tr1, s: 4, f: "SUM(B2:B" + n2 + ")" }, { v: td, s: 4, f: "SUM(C2:C" + n2 + ")" }, { v: R2(tr1 - td), s: 4, f: "B" + tr + "-C" + tr }, { v: tr1 > 0 ? (tr1 - td) / tr1 : 0, s: 5, f: "IF(B" + tr + ">0,D" + tr + "/B" + tr + ",0)" }]); }
    var cats = {}, totD = 0; l.forEach(function (x) { if (x.tipo === "despesa") { cats[x.cat] = (cats[x.cat] || 0) + x.valor; totD += x.valor; } });
    var ordem = Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; });
    var L3 = [[H("Categoria"), H("Total gasto"), H("% das despesas")]];
    ordem.forEach(function (c, i) { var r = i + 2;
      L3.push([c, { v: R2(cats[c]), s: 2, f: 'SUMIFS(' + A + '$H$2:$H$' + last + ',' + A + '$C$2:$C$' + last + ',"despesa",' + A + '$D$2:$D$' + last + ',$A' + r + ")" }, { v: totD ? cats[c] / totD : 0, s: 5, f: "IF(SUM($B$2:$B$" + (ordem.length + 1) + ")>0,B" + r + "/SUM($B$2:$B$" + (ordem.length + 1) + "),0)" }]); });
    if (ordem.length) L3.push([{ v: "Total", s: 6 }, { v: R2(totD), s: 4, f: "SUM(B2:B" + (ordem.length + 1) + ")" }, { v: 1, s: 5, f: "SUM(C2:C" + (ordem.length + 1) + ")" }]);
    var fut = l.filter(function (x) { return x.tipo === "despesa" && /^p[a-z0-9]{4,12}_\d{1,2}_\d{1,2}$/.test(x.id || "") && x.data > hoje; });
    var L4 = [[H("Vencimento"), H("Compra"), H("Cartão"), H("Valor")]];
    fut.forEach(function (x) { L4.push([{ v: x.data, d: true }, x.desc, x.banco || x.forma || "", { v: R2(x.valor), s: 2 }]); });
    if (fut.length) { var sf = 0; fut.forEach(function (x) { sf += x.valor; }); L4.push([{ v: "Total a pagar", s: 6 }, "", "", { v: R2(sf), s: 4, f: "SUM(D2:D" + (fut.length + 1) + ")" }]); }
    else L4.push(["Nenhuma parcela futura.", "", "", ""]);
    return [{ nome: "Lançamentos", larguras: [12, 10, 10, 22, 34, 20, 20, 16], linhas: L1, congelar: true },
      { nome: "Resumo mensal", larguras: [12, 16, 16, 16, 12], linhas: L2, congelar: true },
      { nome: "Por categoria", larguras: [26, 16, 16], linhas: L3, congelar: true },
      { nome: "Parcelas futuras", larguras: [14, 34, 20, 16], linhas: L4, congelar: true }];
  }
  var api = { gerar: gerar, planilhasQuox: planilhasQuox, crc32: crc32, zip: zip };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.QuoxXlsx = api;
})(typeof window !== "undefined" ? window : globalThis);
