/* Configuração do site. É o único lugar onde você mexe para ligar o login e outros recursos.
   Se você já tinha o login funcionando, copie para cá os mesmos valores que estavam no index.html antigo. */
window.QUOX_CFG = {
  // Endereço do projeto Supabase, só até ".supabase.co" (sem /rest/v1 e sem barra no final).
  supabaseUrl: "",
  // Chave pública do Supabase (a "publishable" ou "anon"). Pode ficar no site, ela é pública.
  supabaseKey: "",
  // Endereço que aceita POST para receber cadastros (opcional; Supabase já guarda os cadastros).
  cadastroUrl: "",
  // Mostrar o botão "Entrar com Apple" (só depois de configurar a Apple no Supabase).
  apple: false,
  // Opcional: endereço da função de IA do Assessor (veja supabase/functions/assessor-ia). Vazio = só dicas automáticas.
  iaUrl: ""
};
