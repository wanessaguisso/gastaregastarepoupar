# Gastar, Gastar, Repoupar — Meu Caixa

App web de finanças pessoais (HTML/CSS/JS em um único arquivo, sem build).

## Recursos
- **Painel**: sobra prevista do mês, divisão da renda e projeção de 12 meses
- **Mês**: lançamentos agrupados por cartão/forma de pagamento, marcação de pago
- **Cartões**: fatura, limite usado e disponível; importação de fatura em CSV
- **Parcelas**: compras parceladas em andamento e queda de parcelas ao longo do tempo
- **Pessoas**: gastos de terceiros e controle de quem já pagou
- **Fixos e renda**: despesas recorrentes e entradas
- **Projetos**: metas com valor, prazo e aporte mensal
- Backup/restauração em JSON; tema claro/escuro automático

## Abrir no celular (PWA)
O app é instalável e funciona offline depois da primeira abertura.
1. Publique no GitHub Pages: no repositório, **Settings → Pages → Source: GitHub Actions**.
2. Faça merge na `main`; o workflow `.github/workflows/pages.yml` publica em
   `https://wanessaguisso.github.io/gastaregastarepoupar/`.
3. No celular, abra o link e use **Adicionar à tela inicial** (Safari: Compartilhar → Adicionar à Tela de Início; Chrome: menu ⋮ → Instalar app).

Os dados ficam só no celular. Use o backup JSON (rodapé do app) para guardar ou levar os dados a outro aparelho.
Ao alterar o app, aumente `VERSION` em `sw.js` para os celulares receberem a atualização.

## Sincronizar com o Supabase (opcional)
Com isso, os dados passam a ser salvos na sua conta e aparecem em todos os aparelhos.
1. No Supabase, abra **SQL Editor**, cole o conteúdo de `supabase/schema.sql` e rode (cria a tabela `finance_state` com RLS).
2. Em **Project Settings → API**, copie a chave **anon public** e cole em `supabase-config.js` (`SUPABASE_ANON_KEY`).
3. Em **Authentication → URL Configuration**, ponha o link do app (GitHub Pages) em *Site URL*. Se não quiser confirmar e-mail, desligue *Confirm email* em Authentication → Providers → Email.
4. No app, rodapé → **Entrar para sincronizar** → crie a conta.

Segurança: o app usa só a URL e a chave `anon` (públicas). **Nunca** ponha a senha do Postgres nem a chave `service_role` no projeto; quem protege os dados é o RLS.
Ao entrar, se já houver dados na nuvem eles substituem os locais; uma cópia dos locais fica em `localStorage['meu-caixa-pre-sync']`.

## Como usar no computador
Abra `index.html` no navegador (ou sirva a pasta: `python3 -m http.server`).
Os dados ficam no `localStorage` do navegador (chave `meu-caixa-v1`).

## Origem
Projeto criado a partir do artefato "Meu Caixa".
