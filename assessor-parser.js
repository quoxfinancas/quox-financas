/* Interpretador de frases do chat do Assessor financeiro. Roda no aparelho, sem enviar nada para a internet.
   Exemplo: "gastei 30 no mercado no cartão Nubank" -> valor 30, Alimentação, Crédito, Nubank, hoje. */
(function (root) {
  "use strict";

  var CATS_D = ["Moradia", "Alimentação", "Transporte", "Saúde", "Educação", "Lazer", "Compras", "Beleza e cuidados", "Pets", "Presentes e doações", "Assinaturas", "Cartão e dívidas", "Impostos e taxas", "Outros"];
  var CATS_R = ["Salário", "Renda extra", "Investimentos", "Outros"];
  var FORMAS = ["Crédito", "Débito", "Pix", "Dinheiro", "Boleto", "Transferência"];
  var BANCOS = ["Nubank", "Itaú", "Bradesco", "Santander", "Banco do Brasil", "Caixa", "Inter", "C6 Bank", "PicPay", "Mercado Pago", "XP", "BTG", "Neon", "Next", "Sicredi", "Sicoob", "Safra", "Will Bank", "PagBank", "Original", "Digio", "Nomad"];

  /* palavras-chave por categoria (com acento, para exibir). Vence a categoria cuja palavra-chave for mais longa. */
  var KW_D = {
    "Cartão e dívidas": ["fatura", "pagamento da fatura", "fatura do cartão", "empréstimo", "emprestimo", "financiamento", "juros", "cheque especial", "renegociação", "consórcio", "parcela do carro", "parcela da casa", "negociação da dívida", "dívida"],
    "Assinaturas": ["netflix", "spotify", "amazon prime", "prime video", "disney", "hbo", "max", "youtube premium", "deezer", "icloud", "google one", "assinatura", "globoplay", "apple tv", "chatgpt", "claude", "paramount", "crunchyroll", "mensalidade do app"],
    "Saúde": ["farmácia", "farmacia", "remédio", "remedio", "médico", "medico", "consulta", "dentista", "exame", "plano de saúde", "plano de saude", "hospital", "psicólogo", "psicologo", "terapia", "academia", "ótica", "otica", "óculos", "oculos", "fisioterapia", "vacina", "drogaria", "unimed", "amil", "fisio", "nutricionista"],
    "Educação": ["escola", "faculdade", "curso", "mensalidade escolar", "livro", "material escolar", "apostila", "mba", "udemy", "alura", "matrícula", "matricula", "colégio", "colegio", "inglês", "ingles", "pós-graduação", "creche"],
    "Transporte": ["uber", "99", "táxi", "taxi", "gasolina", "combustível", "combustivel", "etanol", "estacionamento", "pedágio", "pedagio", "ônibus", "onibus", "metrô", "metro", "passagem", "bilhete único", "bilhete unico", "mecânico", "mecanico", "oficina", "ipva", "revisão do carro", "seguro do carro", "posto", "abasteci", "diesel", "lavagem do carro", "moto", "sem parar", "recarga do bilhete", "cabify", "inDrive"],
    "Moradia": ["aluguel", "condomínio", "condominio", "luz", "energia", "conta de luz", "água", "agua", "conta de água", "gás", "gas", "botijão", "botijao", "internet", "iptu", "reforma", "faxina", "diarista", "plano de celular", "telefone", "conta de telefone", "tv a cabo", "manutenção da casa", "encanador", "eletricista", "mudança"],
    "Alimentação": ["mercado", "supermercado", "feira", "padaria", "restaurante", "lanche", "almoço", "almoco", "janta", "jantar", "café", "cafe", "ifood", "delivery", "pizza", "hambúrguer", "hamburguer", "açougue", "acougue", "hortifruti", "sorvete", "comida", "refeição", "refeicao", "marmita", "sacolão", "sacolao", "uber eats", "rappi", "atacadão", "atacadao", "assaí", "assai", "carrefour", "pão de açúcar", "mcdonald", "burger king", "açaí", "acai", "sushi", "bebida", "cafeteria", "starbucks", "doce", "bolo"],
    "Lazer": ["cinema", "show", "viagem", "bar", "balada", "festa", "jogo", "parque", "passeio", "hotel", "ingresso", "cerveja", "churrasco", "clube", "teatro", "pousada", "airbnb", "passagem aérea", "passagem aerea", "boliche", "steam", "playstation", "xbox", "role", "rolê", "praia", "happy hour", "sinuca"],
    "Compras": ["shopping", "roupa", "sapato", "tênis", "tenis", "camisa", "calça", "calca", "eletrônico", "eletronico", "shopee", "amazon", "mercado livre", "magalu", "shein", "loja", "móvel", "movel", "móveis", "moveis", "decoração", "decoracao", "notebook", "celular novo", "aliexpress", "renner", "c&a", "riachuelo", "zara", "americanas", "casas bahia", "utensílios", "utensilios", "eletrodoméstico", "eletrodomestico", "televisão", "televisao", "fone"],
    "Beleza e cuidados": ["salão", "salao", "barbeiro", "barbearia", "cabelo", "manicure", "unha", "cosmético", "cosmetico", "perfume", "maquiagem", "depilação", "depilacao", "estética", "estetica", "skincare", "boticário", "boticario", "natura", "sephora"],
    "Pets": ["ração", "racao", "veterinário", "veterinario", "petshop", "pet shop", "banho do cachorro", "banho e tosa", "cachorro", "gato", "vacina do cachorro", "areia do gato", "petz", "cobasi"],
    "Presentes e doações": ["presente", "doação", "doacao", "dízimo", "dizimo", "oferta", "vaquinha", "caridade", "aniversário do", "casamento de"],
    "Impostos e taxas": ["imposto", "taxa", "tarifa", "darf", "multa", "anuidade", "cartório", "cartorio", "imposto de renda", "das mei", "inss", "licenciamento", "iof"]
  };
  var KW_R = {
    "Salário": ["salário", "salario", "holerite", "décimo terceiro", "decimo terceiro", "13º", "férias", "ferias", "contracheque", "pagamento do mês", "adiantamento"],
    "Renda extra": ["freela", "freelance", "freelancer", "bico", "venda", "vendi", "extra", "comissão", "comissao", "reembolso", "aluguel", "pensão", "pensao", "mesada", "presente", "restituição", "restituicao", "prêmio", "premio", "cashback", "bônus", "bonus", "serviço", "servico"],
    "Investimentos": ["rendimento", "dividendo", "dividendos", "juros", "resgate", "cdb", "tesouro", "fii", "lucro", "proventos"]
  };
  var BANCO_RE = [
    ["Nubank", /(^|[^a-z0-9])(nubank|nu bank|roxinho|cartao nu|nu)([^a-z0-9]|$)/],
    ["Itaú", /(^|[^a-z0-9])(itau|itaucard|personnalite)([^a-z0-9]|$)/],
    ["Bradesco", /(^|[^a-z0-9])(bradesco|bradescard)([^a-z0-9]|$)/],
    ["Santander", /(^|[^a-z0-9])santander([^a-z0-9]|$)/],
    ["Banco do Brasil", /(^|[^a-z0-9])(banco do brasil|ourocard|bb)([^a-z0-9]|$)/],
    ["Caixa", /(^|[^a-z0-9])(caixa economica|caixa|cef)([^a-z0-9]|$)/],
    ["Inter", /(^|[^a-z0-9])(banco inter|inter)([^a-z0-9]|$)/],
    ["C6 Bank", /(^|[^a-z0-9])(c6|c6 bank)([^a-z0-9]|$)/],
    ["PicPay", /(^|[^a-z0-9])picpay([^a-z0-9]|$)/],
    ["Mercado Pago", /(^|[^a-z0-9])(mercado pago|mercadopago)([^a-z0-9]|$)/],
    ["XP", /(^|[^a-z0-9])xp([^a-z0-9]|$)/],
    ["BTG", /(^|[^a-z0-9])btg([^a-z0-9]|$)/],
    ["Neon", /(^|[^a-z0-9])neon([^a-z0-9]|$)/],
    ["Next", /(^|[^a-z0-9])next([^a-z0-9]|$)/],
    ["Sicredi", /(^|[^a-z0-9])sicredi([^a-z0-9]|$)/],
    ["Sicoob", /(^|[^a-z0-9])sicoob([^a-z0-9]|$)/],
    ["Safra", /(^|[^a-z0-9])safra([^a-z0-9]|$)/],
    ["Will Bank", /(^|[^a-z0-9])(will bank|will)([^a-z0-9]|$)/],
    ["PagBank", /(^|[^a-z0-9])(pagbank|pagseguro)([^a-z0-9]|$)/],
    ["Original", /(^|[^a-z0-9])banco original([^a-z0-9]|$)/],
    ["Digio", /(^|[^a-z0-9])digio([^a-z0-9]|$)/],
    ["Nomad", /(^|[^a-z0-9])nomad([^a-z0-9]|$)/]
  ];
  var RECEITA_V = ["recebi", "recebimento", "receita", "ganhei", "entrou", "entrada", "depositaram", "deposito", "salario", "freela", "vendi", "reembolso", "rendimento", "dividendo", "comissao", "bico", "me pagaram", "caiu na conta", "caiu o salario"];
  var DESPESA_V = ["gastei", "gasto", "paguei", "pago", "comprei", "compra", "despesa", "saiu", "debitou", "assinei", "abasteci", "custou", "foi", "torrei", "gastamos", "pagamos", "compramos", "fui no", "fui na"];

  function sem(s) { return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
  function esc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function kwRe(nk) { return new RegExp("(^|[^a-z0-9])" + esc(nk).replace(/ /g, "\\s+") + "([^a-z0-9]|$)"); }
  function compilar(mapa) {
    var l = [];
    Object.keys(mapa).forEach(function (cat) {
      mapa[cat].forEach(function (kw) { var nk = sem(kw).trim(); l.push({ cat: cat, kw: kw.trim(), nk: nk, re: kwRe(nk) }); });
    });
    return l;
  }
  var LD = compilar(KW_D), LR = compilar(KW_R);

  function parseValor(s) {
    s = String(s).replace(/\s/g, "");
    if (!s) return NaN;
    if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    return /^\d+(\.\d+)?$/.test(s) ? parseFloat(s) : NaN;
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }

  function acharValor(n) {
    /* tira datas, parcelas e números que não são o valor */
    var w = n.replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, " ")
      .replace(/\bdia\s+\d{1,2}\b/g, " ")
      .replace(/\b\d+\s*x\b/g, " ")
      .replace(/\bem\s+\d+\s+vezes\b/g, " ")
      .replace(/\b\d+\s*parcelas?\b/g, " ")
      .replace(/\b(?:na|no|de|pela|pelo|com|uber|taxi)\s+99\b/g, " ");
    var re = /(^|[^a-z0-9.,])(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(\s*mil\b)?/g, m, achados = [];
    while ((m = re.exec(w))) {
      var v = parseValor(m[2]); if (!isFinite(v) || v <= 0) continue;
      if (m[3] && v < 1000) v = v * 1000;
      var inicio = m.index + m[1].length, antes = w.slice(Math.max(0, inicio - 4), inicio).replace(/\s/g, ""), depois = w.slice(inicio + m[0].length - m[1].length);
      var marcado = /r\$$/.test(antes) || /^\s*(reais|real|conto|contos|pila|pilas|paus)\b/.test(depois);
      achados.push({ v: v, marcado: marcado });
      re.lastIndex = m.index + m[0].length - 0;
    }
    if (!achados.length) return NaN;
    for (var i = 0; i < achados.length; i++) if (achados[i].marcado) return achados[i].v;
    return achados[0].v;
  }

  function acharData(n, hoje) {
    var d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()), m;
    if (/\banteontem\b/.test(n)) { d.setDate(d.getDate() - 2); return { data: iso(d), explicita: true }; }
    if (/\bontem\b/.test(n)) { d.setDate(d.getDate() - 1); return { data: iso(d), explicita: true }; }
    if (/\bhoje\b/.test(n)) return { data: iso(d), explicita: true };
    if ((m = n.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
      var dia = +m[1], mes = +m[2], ano = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : hoje.getFullYear();
      var t = new Date(ano, mes - 1, dia);
      if (t.getFullYear() === ano && t.getMonth() === mes - 1 && t.getDate() === dia) return { data: iso(t), explicita: true };
      return { data: iso(d), explicita: false, erro: true };
    }
    if ((m = n.match(/\bdia\s+(\d{1,2})\b/))) {
      var di = +m[1], t2 = new Date(hoje.getFullYear(), hoje.getMonth(), di);
      if (di > hoje.getDate()) t2 = new Date(hoje.getFullYear(), hoje.getMonth() - 1, di);
      if (di >= 1 && di <= 31 && t2.getDate() === di) return { data: iso(t2), explicita: true };
      return { data: iso(d), explicita: false, erro: true };
    }
    return { data: iso(d), explicita: false };
  }

  function melhorCat(n, lista) {
    var best = null;
    lista.forEach(function (x) { if (x.re.test(n) && (!best || x.nk.length > best.nk.length)) best = x; });
    return best;
  }
  function cap(s) { s = s.trim(); return s.charAt(0).toUpperCase() + s.slice(1); }
  function primeira(n, lista) { var p = 1e9; lista.forEach(function (w) { var m = new RegExp("(^|[^a-z0-9])" + esc(w).replace(/ /g, "\\s+")).exec(n); if (m && m.index + m[1].length < p) p = m.index + m[1].length; }); return p; }

  function acharBanco(n) {
    for (var i = 0; i < BANCO_RE.length; i++) if (BANCO_RE[i][1].test(n)) return BANCO_RE[i][0];
    var m = n.match(/cartao\s+(?:d[aeo]s?\s+)?([a-z0-9]+)/);
    if (m && ["credito", "debito", "de", "do", "da", "no", "na", "visa", "mastercard", "master", "elo", "amex", "hipercard", "e", "para", "pra", "com", "ontem", "hoje", "dia", "em", "que", "um", "uma", "novo", "velho"].indexOf(m[1]) < 0 && !/^\d+$/.test(m[1])) return cap(m[1]);
    return "";
  }

  /* Interpreta UMA frase. Retorna {ok:true, ...} ou {ok:false, erro}. */
  function interpretar(texto, hojeDate) {
    var hoje = hojeDate || new Date();
    var bruto = String(texto || "").trim();
    var n = sem(bruto);
    if (!n) return { ok: false, erro: "vazio" };
    var valor = acharValor(n);
    if (!isFinite(valor)) return { ok: false, erro: "sem-valor" };
    if (valor > 1e9) return { ok: false, erro: "valor-grande" };

    var pr = primeira(n, RECEITA_V), pd = primeira(n, DESPESA_V);
    var tipo = pr < 1e9 && pr < pd ? "receita" : "despesa";
    var lista = tipo === "receita" ? LR : LD, padrao = "Outros";
    var achou = melhorCat(n, lista);
    var cat = achou ? achou.cat : padrao;
    var desc = achou ? cap(achou.kw) : "";

    var banco = acharBanco(n), forma = "", suposta = false;
    if (/(^|[^a-z0-9])pix([^a-z0-9]|$)/.test(n)) forma = "Pix";
    else if (/(^|[^a-z0-9])debito([^a-z0-9]|$)/.test(n)) forma = "Débito";
    else if (/(^|[^a-z0-9])(dinheiro|especie)([^a-z0-9]|$)/.test(n)) forma = "Dinheiro";
    else if (/(^|[^a-z0-9])boleto([^a-z0-9]|$)/.test(n)) forma = "Boleto";
    else if (/(^|[^a-z0-9])(transferencia|ted|doc)([^a-z0-9]|$)/.test(n)) forma = "Transferência";
    else if (/(^|[^a-z0-9])(credito|cartao|parcelado|parcelei|parcelamos)([^a-z0-9]|$)/.test(n) || /(^|[^a-z0-9])\d+\s*x([^a-z0-9]|$)/.test(n)) forma = "Crédito";
    else if (banco && tipo === "despesa") { forma = "Crédito"; suposta = true; }
    if (tipo === "receita" && forma === "Crédito") forma = "";

    var dt = acharData(n, hoje);
    if (!desc) {
      var l = bruto.replace(/r\$\s*/ig, "").replace(/\d[\d.,]*/g, " ").replace(/\b(gastei|paguei|comprei|recebi|ganhei|reais|real|hoje|ontem|anteontem|no|na|em|de|do|da|com|cart[aã]o|cr[eé]dito|d[eé]bito|pix|dinheiro|boleto|para|pra|um|uma|o|a|e|x|dia|meu|minha)\b/ig, " ").replace(/\s+/g, " ").trim();
      if (banco) l = l.replace(new RegExp(esc(banco), "ig"), " ").replace(/\s+/g, " ").trim();
      desc = l ? cap(l.slice(0, 40)) : (tipo === "receita" ? "Receita" : "Despesa");
    }
    return { ok: true, tipo: tipo, valor: Math.round(valor * 100) / 100, cat: cat, desc: desc, forma: forma, banco: banco, data: dt.data, dataExplicita: dt.explicita, dataErro: !!dt.erro, formaSuposta: suposta, semCategoria: !achou };
  }

  /* Separa várias frases (uma por linha ou separadas por ponto e vírgula). */
  function dividir(texto) {
    return String(texto || "").split(/[\n;]+/).map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function categoriaCitada(texto) {
    var n = sem(texto), x = melhorCat(n, LD);
    return x ? x.cat : null;
  }

  var api = { interpretar: interpretar, dividir: dividir, categoriaCitada: categoriaCitada, sem: sem, CATS_D: CATS_D, CATS_R: CATS_R, FORMAS: FORMAS, BANCOS: BANCOS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.QuoxParser = api;
})(typeof window !== "undefined" ? window : globalThis);
