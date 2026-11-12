const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Carrega só o trecho //<core> de app.js (lógica pura, sem DOM).
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const core = src.match(/\/\/<core>([\s\S]*?)\/\/<\/core>/)[1];
const C = new Function(core + `;return {addM,diffM,r2,parseMoney,billMonth,installmentAmount,chargesOf,allCharges,isPaid,
  incomeIn,totalsOf,projInfo,plannedIn,parseCsv,parseAmount,parseDateAny,parseFatura,guessCat,learnCat,memKey,isOfx,parseOfx,
  budgetStatus,dueList,ensureState,emptyState,seed,dateOf};`)();

const cards = [{ id: 'c1', name: 'Nubank', closing: 3, due: 10 }, { id: 'c2', name: 'Itaú', closing: 20, due: 27 }];

test('addM/diffM cruzam o ano', () => {
  assert.equal(C.addM('2026-11', 2), '2027-01');
  assert.equal(C.addM('2026-01', -1), '2025-12');
  assert.equal(C.diffM('2027-01', '2026-11'), 2);
});

test('parseMoney entende formato brasileiro', () => {
  assert.equal(C.parseMoney('1.234,56'), 1234.56);
  assert.equal(C.parseMoney('R$ 89,90'), 89.9);
  assert.equal(C.parseMoney('12'), 12);
  assert.ok(Number.isNaN(C.parseMoney('abc')));
});

test('compra após o fechamento cai na fatura do mês seguinte', () => {
  assert.equal(C.billMonth({ date: '2026-11-03', method: 'c1' }, cards), '2026-11'); // no dia do fechamento
  assert.equal(C.billMonth({ date: '2026-11-04', method: 'c1' }, cards), '2026-12');
  assert.equal(C.billMonth({ date: '2026-12-25', method: 'c2' }, cards), '2027-01'); // virada de ano
  assert.equal(C.billMonth({ date: '2026-11-25', method: 'pix' }, cards), '2026-11'); // sem cartão
  assert.equal(C.billMonth({ date: '2026-11-25', method: 'c1', bill: '2026-09' }, cards), '2026-09');
});

test('parcelas somam exatamente o total (sem perder centavo)', () => {
  for (const [total, n] of [[100, 3], [4800, 12], [0.1, 3], [999.99, 7], [1200, 4]]) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += C.installmentAmount(total, n, i);
    assert.equal(C.r2(sum), total, `${total} em ${n}x`);
  }
  assert.equal(C.installmentAmount(100, 3, 0), 33.33);
  assert.equal(C.installmentAmount(100, 3, 2), 33.34);
});

test('chargesOf: à vista, parcelado e fixo com término', () => {
  const av = C.chargesOf({ id: 'a', kind: 'avista', amount: 50, method: 'pix', date: '2026-11-10' }, cards, '2027-06');
  assert.deepEqual(av.map(c => [c.ym, c.amount]), [['2026-11', 50]]);
  const pa = C.chargesOf({ id: 'b', kind: 'parcelado', amount: 300, n: 3, method: 'c1', date: '2026-12-20' }, cards, '2027-06');
  assert.deepEqual(pa.map(c => c.ym), ['2027-01', '2027-02', '2027-03']);
  const fx = C.chargesOf({ id: 'c', kind: 'fixo', amount: 100, method: 'pix', date: '2026-11-05', end: '2027-01' }, cards, '2027-06');
  assert.deepEqual(fx.map(c => c.ym), ['2026-11', '2026-12', '2027-01']);
  const fx2 = C.chargesOf({ id: 'd', kind: 'fixo', amount: 100, method: 'pix', date: '2026-11-05' }, cards, '2027-01');
  assert.equal(fx2.length, 3); // sem término vai até o horizonte
});

test('isPaid: passado conta como pago, a menos que desmarcado', () => {
  const S = { paid: {} };
  const c = { key: 'x#0', ym: '2026-10' };
  assert.equal(C.isPaid(S, c, '2026-11'), true);
  S.paid['x#0'] = false;
  assert.equal(C.isPaid(S, c, '2026-11'), false);
  assert.equal(C.isPaid({ paid: {} }, { key: 'y#0', ym: '2026-12' }, '2026-11'), false);
});

test('renda mensal e avulsa', () => {
  const S = { income: [{ kind: 'mensal', amount: 1000 }, { kind: 'unica', amount: 500, month: '2026-12' }] };
  assert.equal(C.incomeIn(S, '2026-11'), 1000);
  assert.equal(C.incomeIn(S, '2026-12'), 1500);
});

test('projInfo: aporte necessário, previsão e status', () => {
  const p = { target: 12000, monthly: 500, deadline: '2027-11-01', contribs: [{ date: '2026-10-05', amount: 2000 }] };
  const i = C.projInfo(p, '2026-11');
  assert.equal(i.saved, 2000);
  assert.equal(i.rem, 10000);
  assert.equal(i.left, 12);
  assert.equal(i.need, 833.33);
  assert.equal(i.status, 'low'); // 500 < 833,33
  assert.equal(C.projInfo({ ...p, monthly: 900 }, '2026-11').status, 'ok');
  assert.equal(C.projInfo({ ...p, contribs: [{ date: '2026-10-05', amount: 12000 }] }, '2026-11').status, 'done');
  assert.equal(C.projInfo({ ...p, deadline: '2026-01-01' }, '2026-11').status, 'late');
});

test('parseAmount aceita formatos de banco', () => {
  assert.equal(C.parseAmount('1.234,56'), 1234.56);
  assert.equal(C.parseAmount('1,234.56'), 1234.56);
  assert.equal(C.parseAmount('-45,90'), -45.9);
  assert.equal(C.parseAmount('(45,90)'), -45.9);
  assert.equal(C.parseAmount('R$ 1.500'), 1500);
  assert.ok(Number.isNaN(C.parseAmount('')));
});

test('parseCsv: ; , aspas e BOM', () => {
  assert.deepEqual(C.parseCsv('﻿data;descricao;valor\n05/11/2026;"Padaria; do Zé";12,50\n'),
    [['data', 'descricao', 'valor'], ['05/11/2026', 'Padaria; do Zé', '12,50']]);
  assert.deepEqual(C.parseCsv('a,b\n"x ""y""",2'), [['a', 'b'], ['x "y"', '2']]);
});

test('parseFatura ignora pagamentos e detecta sinal invertido', () => {
  const rows = C.parseCsv('Data,Descrição,Valor\n05/11/2026,Uber *Trip,-23.50\n06/11/2026,Pagamento recebido,500.00\n07/11/2026,Netflix,-55.90');
  const r = C.parseFatura(rows, '2026-11', 'auto');
  assert.equal(r.rows.length, 2);
  assert.deepEqual(r.rows.map(x => [x.date, x.amount, x.cat]), [['2026-11-05', 23.5, 'Transporte'], ['2026-11-07', 55.9, 'Assinaturas']]);
  assert.equal(r.skipped, 1);
  assert.ok(C.parseFatura([], '2026-11', 'auto').error);
});

test('memória de categorias vence as regras e ignora números/parcelas', () => {
  const S = { catMem: {} };
  assert.equal(C.guessCat('Padaria Pão Quente 12/01', S.catMem), 'Alimentação');
  C.learnCat(S, 'PADARIA PAO QUENTE 07/12', 'Mercado');
  assert.equal(C.guessCat('Padaria Pao Quente 03/12', S.catMem), 'Mercado');
  C.learnCat(S, 'Loja X', 'Outros'); // 'Outros' sem histórico não polui a memória
  assert.equal(S.catMem[C.memKey('Loja X')], undefined);
});

test('OFX: lê lançamentos de cartão e converte para o mesmo formato do CSV', () => {
  const ofx = `OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261105120000[-3:BRT]<TRNAMT>-23.50<FITID>1<MEMO>Uber *Trip</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261106<TRNAMT>500.00<FITID>2<MEMO>Pagamento recebido</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261107<TRNAMT>-1234.50<FITID>3<NAME>Geladeira &amp; Cia</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
  assert.ok(C.isOfx(ofx));
  assert.ok(!C.isOfx('a;b;c'));
  const r = C.parseFatura(C.parseOfx(ofx), '2026-11', 'auto');
  assert.deepEqual(r.rows.map(x => [x.date, x.desc, x.amount]), [['2026-11-05', 'Uber *Trip', 23.5], ['2026-11-07', 'Geladeira & Cia', 1234.5]]);
});

test('budgetStatus: níveis ok / warn / bad', () => {
  assert.equal(C.budgetStatus(50, 100).level, 'ok');
  assert.equal(C.budgetStatus(80, 100).level, 'warn');
  assert.equal(C.budgetStatus(100, 100).level, 'bad');
  assert.equal(C.budgetStatus(130, 100).left, -30);
  assert.equal(C.budgetStatus(10, 0), null);
});

test('dueList: fatura aberta, boleto e atrasos; pagos saem da lista', () => {
  const S = C.ensureState({ cards, expenses: [], income: [], projects: [], paid: {} });
  const ex = [
    { id: 'a', kind: 'avista', amount: 200, method: 'c1', date: '2026-10-20', desc: 'Mercado', who: '' }, // fatura 2026-11, vence 10/11
    { id: 'b', kind: 'avista', amount: 80, method: 'boleto', date: '2026-11-12', desc: 'Internet', who: '' },
    { id: 'c', kind: 'avista', amount: 99, method: 'c1', date: '2026-10-20', desc: 'De outro', who: 'pe1' }, // de terceiro: não entra
    { id: 'd', kind: 'avista', amount: 70, method: 'boleto', date: '2026-11-30', desc: 'Longe', who: '' }
  ];
  S.expenses = ex;
  const ch = C.allCharges(S, '2027-01');
  const l = C.dueList(S, ch, '2026-11-09', 7);
  assert.deepEqual(l.map(d => [d.label, d.amount, d.days]), [['Fatura Nubank', 200, 1], ['Internet', 80, 3]]);
  S.paid['a#0'] = true;
  assert.equal(C.dueList(S, C.allCharges(S, '2027-01'), '2026-11-09', 7).length, 1);
  // atrasada (não paga, mês anterior desmarcado)
  S.paid['a#0'] = false; const late = C.dueList(S, C.allCharges(S, '2027-01'), '2026-11-15', 7);
  assert.ok(late.some(d => d.days < 0));
});

test('seed e ensureState sempre produzem estado completo', () => {
  const S = C.ensureState(C.seed('2026-11'));
  for (const k of ['budgets', 'catMem', 'last', 'people', 'settled', 'paid']) assert.ok(S[k] !== undefined, k);
  const E = C.ensureState({});
  assert.deepEqual([E.cards, E.expenses, E.income, E.projects], [[], [], [], []]);
});
