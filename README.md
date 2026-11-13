# Meu Caixa

App web de finanças pessoais (HTML/CSS/JS puro, sem framework). Instalável no celular (PWA), funciona offline e sincroniza entre aparelhos via Supabase (opcional).

## Recursos
- **Gasto rápido**: botão **+** fixo; valor, descrição, pagamento e categoria em poucos toques (lembra o último cartão e sugere a categoria).
- **Painel**: sobra prevista, divisão da renda, projeção de 12 meses, vencimentos próximos e alertas de orçamento.
- **Orçamento por categoria**: teto mensal com aviso a partir de 80%.
- **Lembretes de vencimento**: faturas e boletos (notificação local ao abrir o app).
- **Dividir compra com outras pessoas**: em qualquer lançamento (à vista, parcelado ou fixo), divida **igual**, **por %** ou **por valor** entre você e quem cadastrou em Pessoas. A fatura e o limite do cartão continuam com o valor inteiro, mas só a sua parte entra nos seus gastos, e cada pessoa tem a própria parte a receber, com acerto individual por parcela.
- **Cartões, Parcelas, Pessoas, Fixos e renda, Projetos**.
- **Importar fatura** em **CSV ou OFX**; o app aprende suas categorias (descrições parecidas viram a mesma categoria).
- Backup/restauração em JSON, exportação CSV, tema claro/escuro.

## Hospedar no Netlify
1. Netlify → **Add new site → Import from Git** → escolha este repositório e a branch `main` (o `netlify.toml` já define tudo; não precisa preencher build/publish).
2. (Para ter login e sincronização) **Site configuration → Environment variables**, crie:
   - `SUPABASE_URL` = `https://jpbfezjhtvicuusdankd.supabase.co`
   - `SUPABASE_ANON_KEY` = chave **anon public** (Supabase → Project Settings → API)
3. Faça o deploy. No celular, abra o link e **Adicionar à tela inicial** (iPhone: Safari → Compartilhar; Android: Chrome → ⋮ → Instalar app).

Sem `SUPABASE_ANON_KEY` o app funciona, mas **sem login** e salvando apenas no aparelho.
> Nunca use a senha do Postgres nem a chave `service_role`: o build recusa a `service_role`, e o app só precisa da `anon`.

## Login e senha (Supabase)
Com `SUPABASE_ANON_KEY` configurada, o app **só abre depois do login** (e-mail e senha). Sem a chave, ele roda sem login e salva só no aparelho.
- Telas: entrar, criar conta, esqueci a senha (link por e-mail) e alterar senha (rodapé → conta).
- A sessão fica guardada no aparelho; recarregar o app não pede senha de novo. Sem internet, abre com os dados do aparelho se você já tinha entrado com a mesma conta.
- **Sair** apaga os dados do aparelho (continuam na nuvem). Uma conta diferente nunca herda os dados da anterior. Se não der para sincronizar antes de sair, o app avisa e não sai.
- Quem protege os dados de verdade é o RLS do Supabase (cada conta só lê e grava a própria linha), não a tela de login.

### Configurar
1. Supabase → **SQL Editor**: rode `supabase/schema.sql` (tabela `finance_state` com RLS).
2. Supabase → **Authentication → URL Configuration**: ponha o endereço do app em **Site URL** e em **Redirect URLs** (o link de recuperar senha volta para ele).
3. Netlify → variáveis: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (chave **anon public**, nunca a `service_role`).
4. Crie a sua conta pela tela "Criar conta" e **depois bloqueie novos cadastros**: Supabase → Authentication → Sign In / Providers → desligue **Allow new users to sign up**, e no Netlify crie `ALLOW_SIGNUP=false` (esconde o botão). Assim só você entra.
5. Para não exigir confirmação por e-mail na sua conta, ajuste *Confirm email* em Authentication → Providers → Email.

Se dois aparelhos editarem ao mesmo tempo, o app avisa e você escolhe qual versão vale.

## Desenvolvimento
```bash
npm test                      # testes da lógica financeira (Node 18+, sem dependências)
python3 -m http.server 8000   # abrir http://localhost:8000
```
- `app.js`: o trecho entre `//<core>` e `//</core>` é lógica pura e é o que os testes carregam.
- `sw.js`: ao mudar o app, aumente `VERSION` para limpar o cache antigo.
- Fontes e `supabase-js` ficam no repositório (`fonts/`, `vendor-supabase.js`); não há dependência de CDN.

## Fora do escopo (ideias futuras)
Contas com saldo real, conta compartilhada entre pessoas e leitura de PDF de fatura exigem mudar o modelo de dados e não foram feitos.
