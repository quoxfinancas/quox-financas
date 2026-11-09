/* Menu, rodapé e service worker do site QUOX - Finanças. Cada página só precisa de <body data-page="..."> e deste arquivo. */
(function () {
  var pagina = document.body.getAttribute("data-page") || "";
  var inicio = [["home", "./", "Início"], ["artigos", "artigos.html", "Artigos"]];
  var apps = [
    ["simulador", "simulador.html", "Simulador de investimentos"],
    ["assessor", "assessor.html", "Prumo, assessor financeiro"],
    ["valuation", "valuation.html", "Valuation de empresas"]
  ];
  var sites = [["sites", "sites-para-empresas.html", "Sites para empresas"]];
  var itens = inicio.concat(apps, sites);
  var legais = [
    ["termos", "termos.html", "Termos de uso"],
    ["privacidade", "privacidade.html", "Política de privacidade"]
  ];
  function link(x) {
    var atual = x[0] === pagina || (x[0] === "artigos" && pagina === "artigo");
    return '<a href="' + x[1] + '"' + (atual ? ' aria-current="page"' : "") + ">" + x[2] + "</a>";
  }
  var emApp = apps.some(function (x) { return x[0] === pagina; });
  function menu(titulo, lista, ativo) {
    return '<details class="sx-more"><summary' + (ativo ? ' class="sx-ativo"' : "") + ">" + titulo + " ▾</summary><div class=\"sx-drop\">" + lista.map(link).join("") + "</div></details>" +
      '<div class="sx-sec sx-extra">' + titulo + '</div><div class="sx-extra">' + lista.map(link).join("") + "</div>";
  }
  var nav = inicio.map(link).join("") + menu("Aplicativos", apps, emApp) + sites.map(link).join("") +
    '<a class="sx-conta" id="sx-conta" href="conta.html">Entrar / Criar conta</a>' + menu("Institucional", legais, false);
  var head =
    '<header class="sx-head"><div class="sx-bar">' +
    '<a class="sx-logo" href="./"><img src="icon-192.png" alt="" width="40" height="40"><span>QUOX<small>FINANÇAS</small></span></a>' +
    '<button class="sx-burger" type="button" aria-expanded="false" aria-controls="sx-nav">Menu</button>' +
    '<nav class="sx-nav" id="sx-nav" aria-label="Principal">' + nav + "</nav></div></header>";
  var foot =
    '<footer class="sx-foot"><div class="in">' +
    "<p><strong>QUOX - Finanças</strong>: educação financeira em português simples, com ferramentas para você aplicar o que aprende.</p>" +
    '<nav aria-label="Rodapé">' + itens.concat(legais).map(function (x) { return '<a href="' + x[1] + '">' + x[2] + "</a>"; }).join("") + "</nav>" +
    '<p class="sx-legal">Conteúdo e ferramentas com fins educativos. Não são consultoria, recomendação nem oferta de investimento, seguro ou crédito. Rentabilidade passada ou simulada não garante resultado futuro. Antes de decidir, confirme as condições com a instituição e, se precisar, procure um profissional habilitado.</p>' +
    "</div></footer>";
  document.body.insertAdjacentHTML("afterbegin", head);
  document.body.insertAdjacentHTML("beforeend", foot);
  try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (/^sb-.*-auth-token$/.test(k) && localStorage.getItem(k)) { var c = document.getElementById("sx-conta"); if (c) { c.textContent = "Minha conta"; c.href = "conta.html";  } break; } } } catch (e) {}
  var b = document.querySelector(".sx-burger"), n = document.getElementById("sx-nav");
  b.addEventListener("click", function () {
    var aberto = n.classList.toggle("sx-open");
    b.setAttribute("aria-expanded", aberto ? "true" : "false");
  });
  var dets = document.querySelectorAll(".sx-more");
  dets.forEach(function (d) { d.addEventListener("toggle", function () { if (d.open) dets.forEach(function (o) { if (o !== d) o.open = false; }); }); });
  document.addEventListener("click", function (e) { dets.forEach(function (d) { if (!d.contains(e.target)) d.open = false; }); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { n.classList.remove("sx-open"); b.setAttribute("aria-expanded", "false"); }
  });
  try {
    if (window.matchMedia("(display-mode: standalone)").matches || navigator.standalone) document.body.classList.add("sx-app");
  } catch (x) {}
  if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(function () {});
})();
