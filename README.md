# QUOX - Finanças (site)

## O que tem no site

| Página | Arquivo | O que é |
|---|---|---|
| Início | `index.html` | Página inicial do blog (gerada pelo gerador) |
| Artigos | `artigos.html` e `artigo-*.html` | Blog de educação financeira (gerados pelo gerador) |
| Simulador de investimentos | `simulador.html` | O simulador, com login (Supabase) |
| Assessor financeiro | `assessor.html`, `assessor.js`, `assessor.css`, `manifest-assessor.webmanifest` | Aplicativo de gastos, dívidas e relatórios (instalável) |
| Termos e privacidade | `termos.html`, `privacidade.html`, `empresa.js` | Textos legais e seus dados de contato |
| Menu e rodapé | `site.js`, `nav.css`, `site.css` | Visual compartilhado |
| Configuração | `config.js` | Chaves do Supabase e opções (único lugar para editar) |

**Importante (login):** a chave e o endereço do Supabase agora ficam em `config.js`. Copie para lá os valores que estavam no `index.html` antigo. Não precisa mexer em mais nada.

**Todos os arquivos ficam na raiz do repositório** (sem pastas, exceto `scripts/`, `.github/`, `supabase/`, `assets/`, `play-store/`).

## Como adicionar artigos
Os artigos ficam em `gerador-do-site/` (fora do repositório do site). Peça ao Claude para escrever e gerar novos artigos e depois envie ao GitHub os arquivos novos (`artigo-*.html`, `artigos.html`, `index.html`, `sitemap.xml`).

## Análise com IA no assessor (opcional)
O assessor já gera dicas automáticas, sem custo. Para ter também um comentário escrito por IA, publique a função `supabase/functions/assessor-ia` (instruções no topo do arquivo) e coloque o endereço em `iaUrl` no `config.js`. O uso da API de IA é pago por uso.

---

# QUOX - Finanças

Simulador de investimentos para o mercado brasileiro, publicado como site estático no GitHub Pages e atualizado automaticamente.

## O que o app faz

- Perfil do investidor: conservador, moderado, arrojado ou agressivo.
- O usuário escolhe em quantas opções diversificar (de 1 a 5) e quais, ou pede a sugestão para o perfil.
- Opções de baixo, moderado e alto risco, incluindo previdência privada (renda fixa, multimercado e renda variável).
- Cadastro e login com nome, e-mail, telefone e senha, confirmação por e-mail e entrada com Google; sessão mantida no aparelho.
- Site instalável no celular (PWA), com caminho para a Google Play.

## Atualização automática (dias úteis, horário de Brasília)

Às 07:30, 12:00 e 16:10 o GitHub roda `scripts/update.mjs`, que atualiza o `data.json` e republica o site:

| Fonte | O que traz | Requisito |
|---|---|---|
| Banco Central (SGS) | Selic, CDI, IPCA 12 meses | nenhum |
| Tesouro Transparente | Taxas do Tesouro Selic 2031, IPCA+ 2032, Prefixado 2032 | nenhum |
| B3 via brapi.dev | Ibovespa (pontos e variação do dia) | segredo `BRAPI_TOKEN` (opcional) |
| Planilha de ofertas | CDB, LCI e LCA de XP, Rico e Clear | segredo `OFERTAS_CSV_URL` ou arquivo `ofertas.csv` |

O GitHub pode atrasar a execução em alguns minutos. A cotação do Ibovespa das 16:10 é do pregão em andamento, com possível atraso da fonte.

## Publicar (uma vez)

1. Crie um repositório público no GitHub e envie todos os arquivos desta pasta, inclusive a pasta oculta `.github`.
2. Em **Settings → Pages**, em **Source**, escolha **GitHub Actions**.
3. Em **Actions → QUOX - Atualizar taxas e publicar → Run workflow**.

### Opcional: cotação da B3
Crie uma conta em brapi.dev, gere um token e salve em **Settings → Secrets and variables → Actions → New repository secret** com o nome `BRAPI_TOKEN`. Sem o token, a etapa é ignorada e o app só não mostra o Ibovespa. A brapi cobre o Ibovespa (`^BVSP`); o IFIX não está garantido na API, por isso não foi incluído.

## Ofertas de CDB, LCI e LCA (XP, Rico e Clear)

**Não há raspagem automática dos sites dessas corretoras.** Elas não oferecem API pública para isso, as taxas ficam atrás de login e os termos de uso costumam proibir coleta automatizada (além de o GitHub ser bloqueado com frequência). Em vez disso, o app lê uma **planilha de curadoria** que a sua equipe preenche olhando as plataformas.

Formato (arquivo `ofertas.csv`, uma oferta por linha):

```
instituicao;tipo;emissor;indexador;taxa;prazo_meses;liquidez;atualizado_em
XP;CDB;Nome do banco emissor;cdi;112,5;24;No vencimento;05/11/2026
```

- `instituicao`: XP, Rico ou Clear · `tipo`: CDB, LCI ou LCA · `indexador`: `cdi` (taxa em % do CDI), `ipca` (IPCA + taxa) ou `pre` (% a.a.).
- Linhas inválidas são ignoradas e listadas no log da aba Actions.

Para atualizar sem mexer no repositório, use uma planilha do Google Sheets com essas colunas, publique-a em **Arquivo → Compartilhar → Publicar na web → CSV** e salve o link no segredo `OFERTAS_CSV_URL`. Se um dia as corretoras liberarem uma API ou um parceiro oficial fornecer os dados, basta trocar a função `lerOfertas` em `scripts/update.mjs`.

## Login (e-mail e senha, Google e Apple) com Supabase

O app já vem com as telas de **entrar, criar conta, confirmar por e-mail, esqueci a senha e completar cadastro**. Enquanto você não configurar o Supabase, ele usa o cadastro local antigo (dados só no aparelho de cada pessoa).

O login fica salvo no aparelho: quem fecha e reabre o app continua logado, e em outro aparelho precisa entrar de novo. O aviso de "é só uma simulação" aparece a cada nova abertura.

### Configurar (cerca de 20 minutos)

1. Crie uma conta e um projeto em **supabase.com** (plano gratuito).
2. **SQL Editor → New query**: cole o conteúdo de `supabase/schema.sql` e clique em Run. Isso cria a tabela de cadastros (nome, e-mail, telefone, consentimento) e a regra de que cada pessoa só vê o próprio cadastro.
3. **Novo query de novo**: cole `supabase/schema-assessor.sql` e clique em Run. Cria as tabelas `lancamentos`, `dividas`, `assessor_chat` e `simulacoes`, todas com regra de que cada pessoa só acessa os próprios dados. O assessor exige login e sincroniza tudo com a nuvem (com cópia no aparelho para uso offline).
3. **Authentication → Providers → Email**: deixe ligado e mantenha **Confirm email** ativado.
4. **Authentication → URL Configuration**: em *Site URL* coloque o endereço do seu site e, em *Redirect URLs*, o mesmo endereço (e `http://localhost:8123` se for testar no computador).
5. **Project Settings → API**: copie a **Project URL** e a chave **anon public**. Cole em `CFG.supabaseUrl` e `CFG.supabaseKey` no início do script do `index.html`. A chave anon é pública por desenho; quem protege os dados são as regras do passo 2. **Nunca use a chave `service_role` no app.**
6. **E-mails de confirmação:** o envio padrão do Supabase é limitado (poucos e-mails por hora) e serve só para testes. Para valer, configure um SMTP próprio em *Authentication → SMTP Settings* (Resend, Brevo ou similar, todos com plano gratuito) e personalize o texto do e-mail em *Authentication → Email Templates*.

### Google
No Google Cloud (console.cloud.google.com): crie um projeto → *APIs e serviços → Credenciais → Criar ID do cliente OAuth* (tipo Aplicativo da Web). Em *URIs de redirecionamento autorizados* cole o endereço de callback que o Supabase mostra em *Authentication → Providers → Google*. Copie o Client ID e o Client Secret para o Supabase e ative o provedor.

### Apple (opcional)
Exige conta **Apple Developer (US$ 99 por ano)** e configuração de Services ID e chave. Quando estiver pronta, ative o provedor *Apple* no Supabase e troque `apple:false` por `apple:true` em `CFG`; os botões "Entrar com a Apple" aparecem. Se você publicar um app nativo no iPhone com login do Google, a Apple exige oferecer também o login com Apple.

### Ver os cadastros
No Supabase, **Table Editor → perfis** mostra nome, e-mail e telefone de todos. Para exportar, use o botão de exportar CSV da própria tabela.

### Privacidade (LGPD)
Você passa a guardar dados pessoais. Publique uma política de privacidade, identifique quem é o responsável pelos dados, atenda pedidos de acesso e exclusão (apagar o usuário no Supabase remove também o cadastro) e peça revisão jurídica do texto de consentimento.

## Instalar no celular

- **iPhone:** abra o site no Safari → Compartilhar → **Adicionar à Tela de Início**.
- **Android:** o Chrome oferece "Instalar app"; para ficar na Play Store, siga o `PLAY-STORE.md`.
- O app abre mesmo sem internet a partir do último acesso, mas o login e as taxas novas precisam de conexão.

## Se algo falhar

- Cada fonte é independente e o último valor bom é mantido; o app nunca fica sem dados.
- "Título não encontrado": um título do Tesouro saiu de oferta. Troque o ano em `scripts/lib.mjs` (`TARGETS`) e o nome em `index.html`.
- "Cabeçalho do CSV não reconhecido": o layout do arquivo do Tesouro mudou; ajuste `createCsvReader` em `scripts/lib.mjs`.
- Testes locais (Node 18+): `node scripts/test.mjs` e `node scripts/update.mjs`.
- O GitHub pausa agendamentos de repositórios sem atividade por 60 dias; se isso ocorrer, use Run workflow.

## Aviso

O app é uma simulação educativa, não consultoria. Material divulgado a clientes deve passar pelo compliance da sua empresa.


## Assessor: planejamento, contas e voz

A aba **Planejar** reúne contas a pagar (com aviso no topo do app), limites por categoria (avisos aos 80% e 100%) e lançamentos automáticos (salário, aluguel, assinaturas). No chat, escreva "conta de luz 150 vence dia 10", "limite alimentação 800", "contas", "orçamento" ou "paguei luz". O microfone usa o reconhecimento de voz do navegador. Os dados novos ficam na tabela `assessor_extra` (rode `supabase/schema-assessor.sql` de novo no SQL Editor, é seguro repetir).
