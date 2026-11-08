/* Login e cadastro na página inicial. Usa o mesmo Supabase do simulador e do assessor (conta única). */
(function(){
var box=document.getElementById("conta-box");if(!box)return;
var CFG=window.QUOX_CFG||{};
if(!(CFG.supabaseUrl&&CFG.supabaseKey&&window.supabase))return; /* sem configuração: mantém o link de reserva */
var sb=window.supabase.createClient(CFG.supabaseUrl,CFG.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
var user=null,recup=false,tela="entrar";
var $=function(i){return document.getElementById(i)};
function base(){return location.origin+location.pathname.replace(/[^\/]*$/,"")}
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
function emailOk(s){return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)}
function telOk(s){var d=s.replace(/\D/g,"");return d.length===10||d.length===11}
function masc(e){var d=e.target.value.replace(/\D/g,"").slice(0,11),s=d;if(d.length>2){var k=d.length>10?7:6;s="("+d.slice(0,2)+") "+d.slice(2,k)+(d.length>k?"-"+d.slice(k):"")}e.target.value=s}
function erroAuth(e){var m=String((e&&e.message)||e||"").toLowerCase();
 if(m.indexOf("invalid login")>=0)return"E-mail ou senha incorretos.";
 if(m.indexOf("not confirmed")>=0)return"Confirme seu e-mail pelo link que enviamos antes de entrar.";
 if(m.indexOf("already registered")>=0)return"Este e-mail já tem cadastro. Use “Entrar”.";
 if(m.indexOf("password")>=0&&m.indexOf("least")>=0)return"A senha precisa ter pelo menos 8 caracteres.";
 if(m.indexOf("rate limit")>=0||m.indexOf("too many")>=0)return"Muitas tentativas. Aguarde alguns minutos e tente de novo.";
 if(m.indexOf("fetch")>=0||m.indexOf("network")>=0)return"Sem conexão. Verifique a internet e tente de novo.";
 return"Não foi possível concluir. Tente novamente."}
var LGPD='<label class="opt"><input type="checkbox" id="@"><span>Concordo em fornecer nome, e-mail e telefone para uso da plataforma e para contato sobre ela, conforme a LGPD, os <a href="termos.html" target="_blank" rel="noopener">Termos de Uso</a> e a <a href="privacidade.html" target="_blank" rel="noopener">Política de Privacidade</a>.</span></label>';
var G='<button class="btn sec" type="button" data-google>Continuar com o Google</button>';
var T={
 entrar:'<h2>Entrar na sua conta</h2><form id="f-entrar" novalidate><label>E-mail<input id="e-email" type="email" autocomplete="email" inputmode="email"></label><label>Senha<input id="e-senha" type="password" autocomplete="current-password"></label><button class="btn" type="submit">Entrar</button>'+G+'<div class="mini"><button class="link" type="button" data-ir="recuperar">Esqueci a senha</button><button class="link" type="button" data-ir="criar">Criar conta</button></div></form>',
 criar:'<h2>Criar conta grátis</h2><p class="note">Um cadastro único para o simulador e o assessor.</p><form id="f-criar" novalidate><label>Nome completo<input id="n-nome" autocomplete="name"></label><label>E-mail<input id="n-email" type="email" autocomplete="email" inputmode="email"></label><label>Telefone com DDD<input id="n-tel" type="tel" autocomplete="tel-national" inputmode="tel" placeholder="(11) 91234-5678"></label><label>Senha (mínimo de 8 caracteres)<input id="n-senha" type="password" autocomplete="new-password"></label>'+LGPD.replace("@","n-lgpd")+'<button class="btn" type="submit">Criar conta</button>'+G+'<div class="mini"><button class="link" type="button" data-ir="entrar">Já tenho conta</button></div></form>',
 confirmar:'<h2>Confirme seu e-mail</h2><p>Enviamos um link para <strong id="conf-email"></strong>. Abra o e-mail (veja também o spam) e toque no link para ativar a conta.</p><button class="btn" type="button" id="reenviar">Reenviar e-mail</button><div class="mini"><button class="link" type="button" data-ir="entrar">Voltar para entrar</button></div>',
 recuperar:'<h2>Recuperar senha</h2><form id="f-rec" novalidate><p>Informe seu e-mail e enviaremos um link para criar uma nova senha.</p><label>E-mail<input id="r-email" type="email" autocomplete="email" inputmode="email"></label><button class="btn" type="submit">Enviar link</button><div class="mini"><button class="link" type="button" data-ir="entrar">Voltar para entrar</button></div></form>',
 novasenha:'<h2>Nova senha</h2><form id="f-nova" novalidate><label>Nova senha (mínimo de 8 caracteres)<input id="s-senha" type="password" autocomplete="new-password"></label><button class="btn" type="submit">Salvar senha</button></form>',
 completar:'<h2>Falta pouco</h2><form id="f-comp" novalidate><p>Informe seu telefone para concluir o cadastro.</p><label>Telefone com DDD<input id="p-tel" type="tel" autocomplete="tel-national" inputmode="tel" placeholder="(11) 91234-5678"></label>'+LGPD.replace("@","p-lgpd")+'<button class="btn" type="submit">Concluir cadastro</button><div class="mini"><button class="link" type="button" id="p-sair">Sair</button></div></form>'};
function msgs(){return'<p id="a-erro" class="erro" role="alert"></p><p id="a-ok" class="note" role="status"></p>'}
function erro(t){$("a-erro").textContent=t||"";}
function mostrar(n){tela=n;box.innerHTML=T[n]+msgs();ligar()}
function logado(nome){
 box.innerHTML='<h2>Olá, '+esc(nome)+'!</h2><p>Você está conectado. Escolha por onde quer continuar:</p><div class="acoes"><a class="btn" href="simulador.html">Simulador de investimentos</a><a class="btn" href="assessor.html">Assessor financeiro</a></div><div class="pref-email"><label class="opt"><input type="checkbox" id="c-semanal" disabled><span><strong>Receber o resumo semanal por e-mail</strong><br>Um e-mail curto por semana com quanto entrou, quanto saiu e uma dica. Você cancela quando quiser.</span></label><p class="note" id="c-semanal-msg" role="status"></p></div><div class="mini"><button class="link" type="button" id="c-sair">Sair da conta</button></div>';
 prefEmail();
 $("c-sair").addEventListener("click",function(){sb.auth.signOut().then(function(){decidir(null)},function(){decidir(null)})})}
function prefEmail(){
 var cx=$("c-semanal"),mg=$("c-semanal-msg");if(!cx||!user)return;
 sb.from("email_prefs").select("semanal").eq("user_id",user.id).maybeSingle().then(function(r){
  if(r.error){cx.closest(".pref-email").hidden=true;return}
  cx.checked=!!(r.data&&r.data.semanal);cx.disabled=false},function(){cx.closest(".pref-email").hidden=true});
 cx.addEventListener("change",function(){
  var on=cx.checked;cx.disabled=true;mg.textContent="";
  var agora=new Date().toISOString(),dados={semanal:on,consentido_em:on?agora:null,atualizado_em:agora};
  sb.from("email_prefs").update(dados).eq("user_id",user.id).select("user_id").then(function(r){
   if(r.error||(r.data&&r.data.length))return r;
   dados.user_id=user.id;return sb.from("email_prefs").insert(dados)}).then(function(r){
   cx.disabled=false;
   if(r.error){cx.checked=!on;mg.textContent="Não foi possível salvar ("+(r.error.message||r.error.code||"erro")+"). Se persistir, rode de novo o arquivo schema-email.sql no Supabase.";return}
   mg.textContent=on?"Ativado. O primeiro e-mail chega em até 7 dias, para "+(user.email||"o seu e-mail")+".":"Desativado. Você não vai mais receber o resumo."},function(){cx.disabled=false;cx.checked=!on;mg.textContent="Sem conexão. Tente novamente."})})}
function ligar(){
 var q=function(s,f){var e=box.querySelectorAll(s);Array.prototype.forEach.call(e,f)};
 q("[data-ir]",function(b){b.addEventListener("click",function(){mostrar(b.getAttribute("data-ir"))})});
 q("[data-google]",function(b){b.addEventListener("click",oauth)});
 ["n-tel","p-tel"].forEach(function(i){if($(i))$(i).addEventListener("input",masc)});
 if($("f-entrar"))$("f-entrar").addEventListener("submit",function(e){e.preventDefault();var em=$("e-email").value.trim(),se=$("e-senha").value;
  if(!emailOk(em)||!se){erro("Informe e-mail e senha.");return}
  sb.auth.signInWithPassword({email:em,password:se}).then(function(r){if(r.error){erro(erroAuth(r.error));return}},function(x){erro(erroAuth(x))})});
 if($("f-criar"))$("f-criar").addEventListener("submit",function(e){e.preventDefault();
  var nome=$("n-nome").value.trim().replace(/\s+/g," "),em=$("n-email").value.trim(),tel=$("n-tel").value,se=$("n-senha").value;
  if(nome.length<5||nome.indexOf(" ")<0){erro("Informe seu nome completo (nome e sobrenome).");return}
  if(!emailOk(em)){erro("Informe um e-mail válido.");return}
  if(!telOk(tel)){erro("Informe o telefone com DDD (10 ou 11 dígitos).");return}
  if(se.length<8){erro("A senha precisa ter pelo menos 8 caracteres.");return}
  if(!$("n-lgpd").checked){erro("Para se cadastrar, é preciso concordar com o uso dos dados.");return}
  sb.auth.signUp({email:em,password:se,options:{emailRedirectTo:base(),data:{nome:nome,telefone:tel.replace(/\D/g,""),consentimento_em:new Date().toISOString()}}}).then(function(r){
   if(r.error){erro(erroAuth(r.error));return}
   if(r.data&&r.data.session)return;
   mostrar("confirmar");$("conf-email").textContent=em},function(x){erro(erroAuth(x))})});
 if($("reenviar"))$("reenviar").addEventListener("click",function(){sb.auth.resend({type:"signup",email:$("conf-email").textContent,options:{emailRedirectTo:base()}}).then(function(r){
  erro(r.error?erroAuth(r.error):"");$("a-ok").textContent=r.error?"":"E-mail reenviado. Pode levar alguns minutos."})});
 if($("f-rec"))$("f-rec").addEventListener("submit",function(e){e.preventDefault();var em=$("r-email").value.trim();
  if(!emailOk(em)){erro("Informe um e-mail válido.");return}
  sb.auth.resetPasswordForEmail(em,{redirectTo:base()}).then(function(r){if(r.error){erro(erroAuth(r.error));return}
   erro("");$("a-ok").textContent="Se este e-mail tiver cadastro, enviamos um link para criar a nova senha."})});
 if($("f-nova"))$("f-nova").addEventListener("submit",function(e){e.preventDefault();var se=$("s-senha").value;
  if(se.length<8){erro("A senha precisa ter pelo menos 8 caracteres.");return}
  sb.auth.updateUser({password:se}).then(function(r){if(r.error){erro(erroAuth(r.error));return}
   recup=false;sb.auth.getSession().then(function(g){decidir(g.data&&g.data.session)})})});
 if($("f-comp"))$("f-comp").addEventListener("submit",function(e){e.preventDefault();var tel=$("p-tel").value;
  if(!telOk(tel)){erro("Informe o telefone com DDD (10 ou 11 dígitos).");return}
  if(!$("p-lgpd").checked){erro("Para concluir, é preciso concordar com o uso dos dados.");return}
  var m=user.user_metadata||{};
  sb.from("perfis").upsert({id:user.id,email:user.email,nome:m.nome||m.full_name||m.name||user.email,telefone:tel.replace(/\D/g,""),consentimento_em:new Date().toISOString()}).then(function(r){
   if(r.error){erro("Não foi possível salvar. Tente novamente.");return}
   decidir({user:user})})});
 if($("p-sair"))$("p-sair").addEventListener("click",function(){sb.auth.signOut().then(function(){decidir(null)},function(){decidir(null)})})}
function oauth(){erro("");sb.auth.signInWithOAuth({provider:"google",options:{redirectTo:base(),skipBrowserRedirect:true}}).then(function(r){
 if(r&&r.error){erro(erroAuth(r.error));return}var u=r&&r.data&&r.data.url;if(!u){erro("Não foi possível iniciar o login.");return}
 if(u.indexOf("apikey=")<0)u+=(u.indexOf("?")<0?"?":"&")+"apikey="+encodeURIComponent(CFG.supabaseKey);location.href=u},function(x){erro(erroAuth(x))})}
function voltar(){var v="";try{v=localStorage.getItem("quox-voltar")||""}catch(x){}
 if(!v)return false;try{localStorage.removeItem("quox-voltar")}catch(x){}
 var p=v.split("@");if(p[0]==="assessor.html"&&Date.now()-(+p[1]||0)<1800000){location.replace("assessor.html");return true}return false}
var hashTela=(function(){var h=(location.hash||"").slice(1);return h==="criar"||h==="recuperar"||h==="entrar"?h:""})();
function decidir(session){
 if(recup)return;
 if(!session){user=null;mostrar(hashTela||"entrar");hashTela="";return}
 user=session.user;var m=user.user_metadata||{};
 sb.from("perfis").select("nome,telefone").eq("id",user.id).maybeSingle().then(function(r){
  var p=r.data||{},nome=p.nome||m.nome||m.full_name||m.name||user.email||"";
  if(!p.telefone){mostrar("completar");return}
  if(voltar())return;
  logado(nome.split(" ")[0])},function(){if(!voltar())logado((m.nome||m.full_name||user.email||"").split(" ")[0])})}
sb.auth.onAuthStateChange(function(ev,session){
 if(ev==="PASSWORD_RECOVERY"){recup=true;mostrar("novasenha");return}
 if(ev==="TOKEN_REFRESHED"||ev==="USER_UPDATED")return;
 setTimeout(function(){decidir(session)},0)});
box.innerHTML="<p class=\"note\">Carregando…</p>";
sb.auth.getSession().then(function(g){if(!user&&!recup)decidir(g.data&&g.data.session)},function(){mostrar("entrar")});
})();
