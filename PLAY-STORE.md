# Publicar o QUOX - Finanças na Google Play

O app Android é o próprio site embrulhado (TWA, "Trusted Web Activity"): o Chrome abre o seu site em tela cheia, sem barra de endereço. Toda atualização do site chega ao app sem nova versão na loja.

## O que você precisa antes

1. **Um endereço próprio (domínio), por exemplo `app.suaempresa.com.br`**, apontando para o GitHub Pages (Settings → Pages → Custom domain). Não funciona em `usuario.github.io/repositorio`, porque a Play exige um arquivo de verificação na raiz do domínio.
2. **Conta de desenvolvedor da Google Play** (taxa única de US$ 25) em play.google.com/console. Contas pessoais novas precisam de um teste fechado com pelo menos 12 testadores por 14 dias antes de liberar ao público; contas de empresa (com D-U-N-S) não têm essa regra.
3. **Política de privacidade publicada em um endereço** (obrigatória, porque o app coleta nome, e-mail e telefone) e o formulário "Segurança dos dados" da Play preenchido.

## Passo a passo (a forma mais simples)

1. Abra **pwabuilder.com**, informe o endereço do site e clique em **Package for stores → Android**.
2. Preencha: nome "QUOX - Finanças", identificador do pacote (ex.: `br.com.suaempresa.quox`) e deixe o PWABuilder gerar a chave de assinatura. **Guarde o arquivo da chave e a senha em local seguro**: sem ela você não consegue atualizar o app.
3. Baixe o pacote. Ele traz o arquivo `.aab` (para a Play) e um `assetlinks.json`.
4. Publique o `assetlinks.json` em `https://SEU-DOMINIO/.well-known/assetlinks.json`. Para isso, crie a pasta `.well-known` no repositório com esse arquivo e inclua-a no passo "Montar o site" do workflow (ou peça que eu faça).
5. Na Play Console: **Criar app → enviar o `.aab` num teste fechado**, preencher ficha da loja (descrição, capturas de tela, ícone 512×512, classificação etária) e enviar para revisão.

## Imagens prontas para a ficha da loja

Na pasta `play-store/`:
- `icone-512x512.png`: ícone do app (PNG 512×512, exigido pela Play).
- `grafico-de-destaque-1024x500.png`: gráfico de destaque (1024×500, obrigatório na ficha).

As capturas de tela do app você tira no próprio celular (mínimo de 2).

## Pontos de atenção

- **Login com Google no Android:** o Supabase abre a página do Google no navegador e volta ao app. Funciona, mas adicione o seu domínio em *Authentication → URL Configuration* no Supabase.
- **Aplicativos de finanças:** a Play pede declarações sobre o que o app faz. Deixe claro, na descrição e na ficha da loja, que é **simulação educativa e não oferece consultoria nem intermedia investimentos**.
- **iPhone:** o plano é o site instalável. No Safari: Compartilhar → Adicionar à Tela de Início.
