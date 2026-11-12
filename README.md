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

## Como usar
Abra `index.html` no navegador (ou sirva a pasta: `python3 -m http.server`).
Os dados ficam no `localStorage` do navegador (chave `meu-caixa-v1`).

## Origem
Projeto criado a partir do artefato "Meu Caixa".
