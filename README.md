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

## Como usar no computador
Abra `index.html` no navegador (ou sirva a pasta: `python3 -m http.server`).
Os dados ficam no `localStorage` do navegador (chave `meu-caixa-v1`).

## Origem
Projeto criado a partir do artefato "Meu Caixa".
