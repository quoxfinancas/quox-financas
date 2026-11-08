# Guia: resumo semanal por e-mail (Resend + Supabase)

Tempo estimado: 40 a 60 minutos, na primeira vez. Custo: R$ 0 até cerca de 100 pessoas com o recurso ligado (plano grátis do Resend: 3.000 e-mails por mês e no máximo 100 por dia).

Você vai fazer 4 coisas: **A)** criar a conta de envio no Resend, **B)** preparar o Supabase, **C)** testar, **D)** subir os arquivos do site no GitHub. Faça nessa ordem.

Anote em um bloco de notas, enquanto avança: a **chave do Resend** (começa com `re_`) e o **segredo do agendamento** (você inventa, passo B4). Nunca coloque esses dois no GitHub.

---

## A) Resend (o serviço que envia os e-mails)

**A1. Criar a conta**
1. Entre em https://resend.com e clique em *Sign up*. Use o e-mail da empresa e confirme pelo link que chegar.

**A2. Cadastrar o seu domínio**
1. No menu da esquerda, clique em **Domains** e depois em **Add Domain**.
2. Em *Name*, digite `quoxfinancas.com.br`. Em *Region*, escolha **São Paulo (sa-east-1)**, se aparecer; senão deixe a opção padrão. Clique em **Add**.
3. O Resend mostra uma tabela de registros DNS (normalmente 3 ou 4 linhas: do tipo **MX** e **TXT**, um deles com `_domainkey` no nome). Deixe essa página aberta.

**A3. Colocar os registros no seu domínio**
1. Abra o painel onde você configura o DNS do domínio. É o mesmo lugar onde você apontou `quoxfinancas.com.br` para o GitHub Pages (Registro.br, Cloudflare, ou onde você comprou).
2. Para cada linha da tabela do Resend, crie um registro com o mesmo **Tipo**, **Nome** (ou *Host*) e **Valor** (ou *Conteúdo*). Copie e cole, sem alterar. Se o painel pedir *prioridade* no MX, use o número que o Resend mostrou.
3. Atenção: se o seu painel já acrescenta o domínio ao final do nome, digite só a parte da frente (por exemplo `send` em vez de `send.quoxfinancas.com.br`).
4. Volte ao Resend e clique em **Verify DNS Records**. Pode demorar de alguns minutos até algumas horas. Quando o domínio ficar com o selo **Verified**, siga em frente.

**A4. Criar a chave de envio**
1. No menu, clique em **API Keys** e depois em **Create API Key**.
2. Nome: `quox-resumo`. Permissão (*Permission*): **Sending access**. Domínio: `quoxfinancas.com.br`. Clique em **Add**.
3. Copie a chave (começa com `re_`). **Ela só aparece uma vez.** Cole no bloco de notas.

---

## B) Supabase (banco, função e agendamento)

Abra o seu projeto em https://supabase.com/dashboard.

**B1. Criar a tabela de preferências**
1. Menu **SQL Editor** → **New query**.
2. Abra o arquivo `supabase/schema-email.sql` deste pacote, copie tudo, cole no editor e clique em **Run**. Deve aparecer *Success. No rows returned*. (Pode rodar de novo sem problema.)

**B2. Ativar as extensões do agendamento**
1. Menu **Database** → **Extensions**.
2. Procure **pg_cron** e ative. Procure **pg_net** e ative.

**B3. Publicar a função que envia**
1. Menu **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. O nome da função precisa ser exatamente `resumo-semanal`.
3. Apague o código de exemplo. Abra o arquivo `supabase/functions/resumo-semanal/index.ts` deste pacote, copie **todo** o conteúdo e cole no editor. Clique em **Deploy function**.
4. Depois de publicada, abra a função, vá em **Details** (ou **Settings**) e **desligue** a opção **Verify JWT** / *Enforce JWT verification*. Salve. (A proteção da função é o segredo do passo B4, não o login.)

**B4. Cadastrar os segredos**
1. Menu **Edge Functions** → **Secrets** (ou *Manage secrets*).
2. Adicione, um por vez (*Name* → *Value*):
   - `RESEND_API_KEY` → a chave que você copiou no passo A4.
   - `CRON_SECRET` → invente uma senha longa (40 caracteres ou mais, só letras e números; um gerador de senhas ajuda). Anote: você vai usar de novo no passo B6.
   - `EMAIL_FROM` (opcional) → `QUOX Finanças <resumo@quoxfinancas.com.br>`. Se não criar, esse mesmo texto é usado.
3. Salve. O endereço do remetente pode ser qualquer um `@quoxfinancas.com.br`, mesmo que a caixa de entrada não exista (ele só envia, não recebe).

---

## C) Testar antes de agendar

**C1. Ligar o resumo na sua conta**
1. Suba os arquivos do site (passo D) **antes** deste teste, ou, se preferir testar sem o site, rode no SQL Editor (trocando o e-mail pelo seu):
   ```sql
   insert into public.email_prefs (user_id, semanal, consentido_em)
   select id, true, now() from auth.users where email = 'SEU_EMAIL_AQUI'
   on conflict (user_id) do update set semanal = true;
   ```
2. Anote o seu **User UID**: menu **Authentication** → **Users** → copie o *UID* da sua linha.

**C2. Disparar um envio de teste**
Escolha uma das duas formas.

*Pelo painel:* **Edge Functions** → `resumo-semanal` → aba **Test**. Método **POST**. Em *Headers* acrescente `x-cron-secret` com o valor do CRON_SECRET. No *Body* (JSON), coloque:
```json
{"so_usuario": "COLE_AQUI_O_SEU_UID"}
```
Clique em enviar.

*Pelo Windows (PowerShell):*
```powershell
Invoke-RestMethod -Method Post -Uri "https://mjospmioycadvccqlyty.supabase.co/functions/v1/resumo-semanal" -Headers @{"x-cron-secret"="SEU_CRON_SECRET"} -ContentType "application/json" -Body '{"so_usuario":"SEU_UID"}'
```

**C3. Ler o resultado**
- A resposta mostra algo como `{"enviados":1,"pulados":0,"erros":0,...}`.
- `enviados: 1` → confira a caixa de entrada (e o spam). O e-mail deve ter o resumo da última semana.
- `pulados: 1` → você não tem lançamentos nas últimas 2 semanas. Anote um gasto no assessor e tente de novo.
- `erros: 1` → leia o campo `detalhes`. O mais comum é `Resend 403`: o domínio ainda não está *Verified* (volte ao A3).
- Erro `401`: o segredo do cabeçalho não bate com o `CRON_SECRET`. Erro `500` dizendo que falta configuração: faltou cadastrar `CRON_SECRET` (mínimo de 16 caracteres) ou `RESEND_API_KEY` no B4.

**C4. Testar o "parar de receber"**
Clique no link no fim do e-mail, confirme na página, depois abra sua conta (`/conta.html`) e veja a opção desligada.

---

## B6) Agendar o envio automático (faça só depois do teste dar certo)

1. **SQL Editor** → **New query**.
2. Abra `supabase/schema-email-cron.sql`, copie tudo, cole e troque o texto `COLE_AQUI_O_CRON_SECRET` pelo seu CRON_SECRET (entre as aspas simples, mantendo as aspas).
3. Clique em **Run**. Isso programa a função para rodar todo dia às 08:00 (horário de Brasília). Ela só envia para quem é "do dia": cada pessoa recebe em um dia fixo da semana, sorteado quando liga o recurso. Assim os envios se espalham e você não passa de 100 por dia.
4. Para conferir, rode em uma nova query:
   ```sql
   select jobname, schedule, active from cron.job;
   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
   ```
   No dia seguinte (depois das 08:00), a segunda consulta deve mostrar uma linha com `succeeded`.
5. **Não salve esse SQL com o segredo preenchido em nenhum arquivo do GitHub.**

---

## D) Subir os arquivos do site no GitHub

No repositório `quoxfinancas/quox-financas`: **Add file** → **Upload files**, arraste e faça o commit dos arquivos que estão na raiz deste pacote:
`conta.js`, `site.css`, `cancelar-email.html`, `privacidade.html`.

Não precisa subir nada da pasta `supabase` nem `scripts` (elas servem só para você colar no Supabase, e os testes ficam como referência). Se quiser guardar tudo no GitHub, pode subir, desde que o SQL do agendamento esteja **sem** o segredo.

Depois do deploy, entre em **Minha conta** (menu do site): aparece a caixa "Receber o resumo semanal por e-mail".

---

## E) Bônus: e-mails de cadastro com o seu domínio (SMTP do Supabase)

Hoje o Supabase envia os e-mails de confirmação de cadastro e de recuperação de senha com o servidor padrão dele, que tem limite baixo e cai no spam. Dá para usar o mesmo Resend:

1. Supabase → **Authentication** → **Emails** (ou *Settings*) → **SMTP Settings** → ative *Enable custom SMTP*.
2. Preencha: *Sender email* `no-reply@quoxfinancas.com.br`; *Sender name* `QUOX Finanças`; *Host* `smtp.resend.com`; *Port* `465`; *Username* `resend`; *Password* a chave do Resend (A4).
3. Salve e crie uma conta de teste para ver o e-mail chegar. (Se algum dado acima tiver mudado, confira na página de SMTP da documentação do Resend.)

---

## Dúvidas comuns

- **Quando chega o primeiro e-mail?** Em até 7 dias depois de a pessoa ligar a opção, no dia da semana que foi sorteado para ela, por volta das 08:00.
- **O que passa de 100 pessoas?** O Resend limita 100 e-mails por dia no plano grátis; a função manda no máximo 90 por execução. Com os envios espalhados por 7 dias, o plano grátis aguenta cerca de 600 pessoas. Acima disso, o plano Pro do Resend custa US$ 20 por mês.
- **Alguém reclamou que não quer mais receber.** Peça para clicar em "Parar de receber" no e-mail, ou rode: `update public.email_prefs set semanal = false where user_id = (select id from auth.users where email = 'EMAIL');`
- **Quero mudar o texto do e-mail.** Edite `supabase/functions/resumo-semanal/resumo.js`, rode `node scripts/build-email-fn.mjs` para gerar de novo o `index.ts` e cole no painel (B3). Ou peça para mim.
