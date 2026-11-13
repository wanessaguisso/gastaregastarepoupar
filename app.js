//<core>
const CATS=['Moradia','Mercado','Alimentação','Transporte','Saúde','Educação','Lazer','Assinaturas','Compras','Viagem','Dívidas','Outros'];
const METHODS=[{id:'pix',name:'Pix'},{id:'debito',name:'Débito'},{id:'boleto',name:'Boleto'},{id:'dinheiro',name:'Dinheiro'}];
const MESES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const MESES_L=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const pad=n=>String(n).padStart(2,'0');
const r2=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;
const ymOf=d=>d.slice(0,7);
function addM(ym,n){const [y,m]=ym.split('-').map(Number);const t=y*12+(m-1)+n;return Math.floor(t/12)+'-'+pad(t%12+1);}
function diffM(a,b){const [ya,ma]=a.split('-').map(Number),[yb,mb]=b.split('-').map(Number);return (ya*12+ma)-(yb*12+mb);}
function mShort(ym){const [y,m]=ym.split('-').map(Number);return MESES[m-1]+'/'+String(y).slice(2);}
function mLong(ym){const [y,m]=ym.split('-').map(Number);return MESES_L[m-1]+' de '+y;}
function parseMoney(s){
  s=String(s==null?'':s).replace(/[^\d,.\-]/g,'');
  if(s.includes(',')) s=s.replace(/\./g,'').replace(',','.');
  const n=parseFloat(s); return isNaN(n)?NaN:r2(n);
}
function billMonth(e,cards){
  if(e.bill) return e.bill;
  const ym=ymOf(e.date); const c=cards.find(c=>c.id===e.method);
  if(c && Number(e.date.slice(8,10))>c.closing) return addM(ym,1);
  return ym;
}
function installmentAmount(total,n,i){
  const base=Math.floor(total*100/n)/100;
  return i<n-1?base:r2(total-base*(n-1));
}
function chargesOf(e,cards,horizon){
  return expandParts(e,chargesRaw(e,cards,horizon));
}
function chargesRaw(e,cards,horizon){
  const out=[]; const s=billMonth(e,cards);
  if(e.kind==='avista'){out.push({key:e.id+'#0',eid:e.id,ym:s,amount:r2(e.amount),i:0,n:1});}
  else if(e.kind==='parcelado'){
    const n=Math.max(1,e.n|0);
    for(let i=0;i<n;i++) out.push({key:e.id+'#'+i,eid:e.id,ym:addM(s,i),amount:installmentAmount(e.amount,n,i),i,n});
  } else if(e.kind==='fixo'){
    const end=(e.end&&e.end<horizon)?e.end:horizon;
    let i=0; for(let m=s;diffM(m,end)<=0;m=addM(m,1),i++) out.push({key:e.id+'#'+i,eid:e.id,ym:m,amount:r2(e.amount),i,n:0});
  }
  return out;
}
function allCharges(S,horizon){
  const out=[];
  for(const e of S.expenses) for(const c of chargesOf(e,S.cards,horizon)){c.e=e;out.push(c);}
  return out;
}
function isPaid(S,c,cur){const k=c.pkey||c.key;return S.paid[k]!==undefined?S.paid[k]:c.ym<cur;}
/* ---- divisão de compra entre pessoas ----
   e.split = [{who:'' (eu) | id da pessoa, w:peso}], com 2 ou mais participantes.
   Cada cobrança vira uma "parte" por pessoa; as partes somam exatamente o valor cheio. */
function splitAmount(amount,weights){
  const cents=Math.round(amount*100), sw=weights.reduce((a,w)=>a+w,0);
  if(!(sw>0)) return weights.map(()=>0);
  const out=weights.map(w=>Math.floor(cents*w/sw));
  let rest=cents-out.reduce((a,b)=>a+b,0);
  for(let i=0;rest>0;i=(i+1)%out.length,rest--) if(weights[i]>0) out[i]++; else rest++;
  return out.map(c=>c/100);
}
function activeSplit(e){return Array.isArray(e.split)&&e.split.length>=2&&e.split.every(p=>p.w>0)?e.split:null;}
function expandParts(e,list){
  const sp=activeSplit(e); const out=[];
  for(const c of list){
    if(!sp){out.push(Object.assign(c,{pkey:c.key,full:c.amount,who:e.who||'',lead:true}));continue;}
    const amts=splitAmount(c.amount,sp.map(p=>p.w));
    sp.forEach((p,k)=>out.push({key:c.key+'@'+(p.who||'me'),pkey:c.key,eid:c.eid,ym:c.ym,amount:amts[k],full:c.amount,i:c.i,n:c.n,who:p.who||'',lead:k===0}));
  }
  return out;
}
function incomeIn(S,ym){
  return r2(S.income.reduce((a,i)=>a+(i.kind==='mensal'?i.amount:(i.month===ym?i.amount:0)),0));
}
function totalsOf(list){
  const t={fixo:0,parcelado:0,avista:0,total:0};
  for(const c of list){t[c.e.kind]+=c.amount;t.total+=c.amount;}
  for(const k in t) t[k]=r2(t[k]);
  return t;
}
function projInfo(p,cur){
  const saved=r2(p.contribs.reduce((a,c)=>a+c.amount,0));
  const rem=Math.max(0,r2(p.target-saved));
  const dl=p.deadline?ymOf(p.deadline):null;
  const left=dl?Math.max(1,diffM(dl,cur)):null;
  const need=(dl&&rem>0)?r2(rem/left):0;
  const eta=(rem>0&&p.monthly>0)?addM(cur,Math.ceil(rem/p.monthly)):null;
  let status='ok';
  if(rem<=0) status='done';
  else if(dl&&diffM(dl,cur)<0) status='late';
  else if(!p.monthly) status='nomonthly';
  else if(dl&&p.monthly<need-0.005) status='low';
  return {saved,rem,dl,left,need,eta,status,pct:p.target>0?Math.max(0,Math.min(100,saved/p.target*100)):0};
}
function contribsIn(S,ym){
  let t=0; for(const p of S.projects) for(const c of p.contribs) if(c.date.slice(0,7)===ym) t+=c.amount; return r2(t);
}
function plannedIn(S,ym,cur){
  if(ym<cur) return Math.max(0,contribsIn(S,ym));
  return r2(S.projects.reduce((a,p)=>{
    const i=projInfo(p,cur);
    if(i.status==='done'||!p.monthly) return a;
    if(i.eta&&ym>i.eta) return a;
    return a+p.monthly;
  },0));
}
/* ---- orçamento por categoria ---- */
function budgetStatus(spent,limit){
  if(!(limit>0)) return null;
  const pct=spent/limit*100;
  return {pct,level:pct>=100?'bad':pct>=80?'warn':'ok',left:r2(limit-spent)};
}
/* ---- vencimentos: faturas de cartão e boletos ainda não pagos ---- */
function dueList(S,charges,today,windowDays){
  const out=[]; const cur=today.slice(0,7);
  const toDays=d=>Math.round(Date.parse(d+'T00:00:00Z')/864e5);
  const t=toDays(today);
  const push=(label,date,amount,key)=>{const days=toDays(date)-t; if(days<=windowDays) out.push({label,date,amount:r2(amount),days,key});};
  for(const ym of [addM(cur,-1),cur,addM(cur,1)]){
    for(const c of S.cards){
      const items=charges.filter(x=>x.ym===ym&&x.e.method===c.id);
      const open=items.filter(x=>!isPaid(S,x,cur)); if(!open.length) continue;
      push('Fatura '+c.name,dateOf(ym,c.due),open.reduce((a,x)=>a+x.amount,0),c.id+'@'+ym);
    }
    for(const x of charges){
      if(x.ym!==ym||x.e.method!=='boleto'||!x.lead||isPaid(S,x,cur)) continue;
      push(x.e.desc,dateOf(ym,Number(x.e.date.slice(8,10))),x.full,x.pkey);
    }
  }
  return out.filter(d=>d.days>=-31).sort((a,b)=>a.days-b.days);
}
function dateOf(ym,day){return ym+'-'+pad(Math.min(day,28));}

/* ---- importação de fatura em CSV ---- */
const noAcc=s=>String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
function parseCsv(text){
  text=text.replace(/^﻿/,'');
  const first=text.split(/\r?\n/).find(l=>l.trim())||'';
  const delim=[';',',','\t'].map(d=>[d,first.split(d).length-1]).sort((a,b)=>b[1]-a[1])[0][0];
  const rows=[]; let row=[],cell='',q=false;
  const push=()=>{row.push(cell);cell='';if(row.some(x=>x.trim()!==''))rows.push(row);row=[];};
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(q){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else q=false;}else cell+=c;}
    else if(c==='"') q=true;
    else if(c===delim){row.push(cell);cell='';}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;push();}
    else cell+=c;
  }
  if(cell!==''||row.length) push();
  return rows;
}
function parseAmount(s){
  s=String(s==null?'':s).trim(); if(!s) return NaN;
  let neg=/^\(.*\)$/.test(s)||/^[^\d]*-/.test(s)||/-\s*$/.test(s);
  s=s.replace(/[^\d.,]/g,''); if(!/\d/.test(s)) return NaN;
  const lc=s.lastIndexOf(','), ld=s.lastIndexOf('.');
  if(lc>=0&&ld>=0){ if(lc>ld) s=s.replace(/\./g,'').replace(',','.'); else s=s.replace(/,/g,''); }
  else if(lc>=0) s=s.replace(/\./g,'').replace(',','.');
  else if(ld>=0 && /^\d{1,3}(\.\d{3})+$/.test(s)) s=s.replace(/\./g,'');
  const n=parseFloat(s); if(isNaN(n)) return NaN;
  return r2(neg?-n:n);
}
function parseDateAny(s,refYm){
  s=String(s||'').trim(); let m;
  if((m=s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return m[1]+'-'+m[2]+'-'+m[3];
  if((m=s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/))){
    let y=+m[3]; if(y<100) y+=2000; const mo=+m[2], d=+m[1];
    return (mo>=1&&mo<=12&&d>=1&&d<=31)?y+'-'+pad(mo)+'-'+pad(d):'';
  }
  let mo=0,d=0;
  if((m=s.match(/^(\d{1,2})[\/.\-](\d{1,2})$/))){d=+m[1];mo=+m[2];}
  else if((m=s.match(/^(\d{1,2})\s+([a-z]{3})/i))){d=+m[1];mo=MESES.indexOf(noAcc(m[2]))+1;}
  if(!(mo>=1&&mo<=12&&d>=1&&d<=31)) return '';
  let y=+refYm.slice(0,4); if(y*12+mo>y*12+(+refYm.slice(5,7))+1) y-=1;
  return y+'-'+pad(mo)+'-'+pad(d);
}
const CAT_RULES=[
  ['Transporte',/uber|99 ?(pop|taxi)|cabify|posto|shell|ipiranga|combustivel|estaciona|pedagio|sem parar|metro|bilhete/],
  ['Alimentação',/ifood|rappi|restaurante|lanchonete|padaria|pizza|burger|mcdonald|cafe|bar |sorvete|acai/],
  ['Mercado',/mercado(?! ?livre)|supermercado|carrefour|assai|atacad|extra |pao de acucar|hortifruti|sacolao/],
  ['Saúde',/farmacia|drogaria|droga|raia|pacheco|clinica|laboratorio|hospital|dentista|academia|smart ?fit/],
  ['Assinaturas',/netflix|spotify|amazon ?prime|disney|youtube|hbo|max |globoplay|apple\.com|google ?(one|play)|icloud|deezer/],
  ['Educação',/curso|escola|faculdade|udemy|alura|livraria|livro/],
  ['Lazer',/cinema|ingresso|show|teatro|steam|playstation|xbox|jogo/],
  ['Viagem',/hotel|airbnb|booking|latam|gol linhas|azul linhas|decolar|passagem|cvc/],
  ['Compras',/amazon|mercado ?livre|magalu|magazine|americanas|shopee|shein|aliexpress|renner|c&a|zara|casas bahia|kabum/]
];
function memKey(desc){return noAcc(desc).replace(/\d+/g,' ').replace(/[^a-z ]/g,' ').split(/\s+/).filter(w=>w.length>1).slice(0,2).join(' ');}
function guessCat(desc,mem){
  const k=memKey(desc); if(mem&&k&&mem[k]) return mem[k];
  const d=noAcc(desc);for(const [c,re] of CAT_RULES) if(re.test(d)) return c;return 'Outros';
}
function learnCat(S,desc,cat){
  const k=memKey(desc); if(!k||!cat) return;
  if(!S.catMem) S.catMem={};
  if(cat==='Outros'&&!S.catMem[k]) return;
  S.catMem[k]=cat;
}
function parseFatura(rows,refYm,signMode,mem){
  if(!rows.length) return {error:'O arquivo está vazio.'};
  const hdr=rows[0].map(noAcc), find=re=>hdr.findIndex(h=>re.test(h));
  let ai=find(/(valor|amount|value|quantia)/), di=find(/^(data|date)/), si=find(/(descri|historico|lancamento|title|titulo|estabelec|detalhe|local)/), ci=find(/categ/);
  const hasHeader=ai>=0; let body=rows;
  if(hasHeader){
    body=rows.slice(1);
    if(di<0) di=0;
    if(si<0||si===di||si===ai) si=hdr.findIndex((h,i)=>i!==di&&i!==ai&&i!==ci);
    if(si<0) return {error:'Não achei a coluna de descrição.'};
  } else {
    const w=rows[0].length;
    if(w<2) return {error:'Não reconheci as colunas. O arquivo precisa ter data, descrição e valor.'};
    ai=w-1; if(w===2){di=-1;si=0;} else {di=0;si=1;}
  }
  const items=[]; let pos=0,neg=0;
  for(const r of body){
    const amt=parseAmount(r[ai]); if(isNaN(amt)) continue;
    const desc=String(r[si]||'').replace(/\s+/g,' ').trim(); if(!desc) continue;
    items.push({date:di>=0?parseDateAny(r[di],refYm):'',desc,raw:amt});
    if(amt>0)pos++; else if(amt<0)neg++;
  }
  const flip=signMode==='neg'||(signMode==='auto'&&neg>pos);
  const out=[]; let skipped=0;
  for(const it of items){
    const v=flip?-it.raw:it.raw;
    if(v<=0||/pagamento (recebido|efetuado|de fatura)|^total\b|saldo (anterior|restante)/.test(noAcc(it.desc))){skipped++;continue;}
    out.push({date:it.date,desc:it.desc,amount:r2(v),cat:guessCat(it.desc,mem)});
  }
  if(!out.length) return {error:'Não encontrei compras neste arquivo. Confira o cartão e a opção de sinal dos valores.',skipped};
  return {rows:out,skipped,flip};
}
function isOfx(text){return /<OFX>|OFXHEADER/i.test(text.slice(0,3000));}
function parseOfx(text){
  const rows=[['Data','Descrição','Valor']];
  const blocks=text.split(/<STMTTRN>/i).slice(1);
  const tag=(b,t)=>{const m=b.match(new RegExp('<'+t+'>([^<\\r\\n]*)','i'));return m?m[1].trim():'';};
  for(const b of blocks){
    const d=tag(b,'DTPOSTED').match(/^(\d{4})(\d{2})(\d{2})/); if(!d) continue;
    const amt=parseFloat(tag(b,'TRNAMT').replace(',','.')); if(isNaN(amt)) continue;
    const desc=(tag(b,'MEMO')||tag(b,'NAME')).replace(/&amp;/g,'&');
    rows.push([d[1]+'-'+d[2]+'-'+d[3],desc,(amt<0?'-':'')+Math.abs(amt).toFixed(2).replace('.',',')]);
  }
  return rows;
}
const impKey=(method,bill,date,desc,amount)=>[method,bill,date,noAcc(desc).trim(),amount].join('|');
const DEFAULT_PEOPLE=[{id:'pe1',name:'Ceir',color:'#1F6FEB'},{id:'pe2',name:'Cristina',color:'#C0392B'},{id:'pe3',name:'Juliana',color:'#E06A00'}];
function ensureState(S){
  for(const k of ['cards','income','expenses','projects']) if(!Array.isArray(S[k])) S[k]=[];
  if(!S.paid||typeof S.paid!=='object') S.paid={};
  if(!S.settled||typeof S.settled!=='object') S.settled={};
  if(!S.budgets||typeof S.budgets!=='object') S.budgets={};
  if(!S.catMem||typeof S.catMem!=='object') S.catMem={};
  if(!S.last||typeof S.last!=='object') S.last={};
  if(!Array.isArray(S.people)) S.people=DEFAULT_PEOPLE.map(p=>Object.assign({},p));
  return S;
}
function emptyState(){return ensureState({v:1,demo:false,cards:[],income:[],expenses:[],projects:[],paid:{}});}
function seed(cur){
  const id=(()=>{let n=0;return p=>p+(++n);})();
  const c1={id:'c1',name:'Nubank',limit:8000,closing:3,due:10,color:'#7B3FBF'};
  const c2={id:'c2',name:'Itaú Visa',limit:5000,closing:20,due:27,color:'#E06A00'};
  const x=(desc,kind,amount,method,date,cat,extra)=>Object.assign({id:id('e'),desc,kind,amount,method,date,cat,n:1,end:'',who:''},extra||{});
  const expenses=[
    x('Aluguel','fixo',1850,'pix',dateOf(addM(cur,-8),5),'Moradia'),
    x('Condomínio','fixo',420,'boleto',dateOf(addM(cur,-8),8),'Moradia'),
    x('Energia e água','fixo',260,'pix',dateOf(addM(cur,-8),12),'Moradia'),
    x('Internet','fixo',119.9,'c1',dateOf(addM(cur,-6),1),'Assinaturas'),
    x('Streaming','fixo',55.9,'c1',dateOf(addM(cur,-6),1),'Assinaturas',{who:'pe2'}),
    x('Academia','fixo',129.9,'c2',dateOf(addM(cur,-4),2),'Saúde'),
    x('Plano de saúde','fixo',480,'boleto',dateOf(addM(cur,-8),10),'Saúde'),
    x('Notebook','parcelado',4800,'c1',dateOf(addM(cur,-3),18),'Compras',{n:12}),
    x('Geladeira','parcelado',3200,'c2',dateOf(addM(cur,-5),10),'Moradia',{n:10}),
    x('Passagens de ônibus (viagem)','parcelado',1800,'c1',dateOf(addM(cur,-1),25),'Viagem',{n:6}),
    x('Curso de inglês','parcelado',1200,'c2',dateOf(addM(cur,-1),5),'Educação',{n:4}),
    x('Cadeira de escritório','parcelado',900,'c1',dateOf(cur,2),'Compras',{n:3}),
    x('Mercado','avista',612.4,'c1',dateOf(cur,4),'Mercado'),
    x('Restaurante','avista',148.5,'c1',dateOf(cur,6),'Alimentação',{who:'pe3'}),
    x('Uber','avista',63.2,'c1',dateOf(cur,7),'Transporte',{who:'pe1'}),
    x('Farmácia','avista',87.9,'pix',dateOf(cur,8),'Saúde'),
    x('Mercado','avista',284.7,'pix',dateOf(cur,9),'Mercado'),
    x('Cinema','avista',72,'c2',dateOf(cur,10),'Lazer',{who:'pe2'}),
    x('Mercado','avista',890,'pix',dateOf(addM(cur,-1),12),'Mercado'),
    x('Show','avista',320,'c2',dateOf(addM(cur,-1),15),'Lazer')
  ];
  const k=(date,amount,note)=>({id:id('k'),date,amount,note});
  const projects=[
    {id:'p1',name:'Reserva de emergência',target:30000,deadline:dateOf(addM(cur,18),1),monthly:800,contribs:[k(dateOf(addM(cur,-3),5),9000,'Saldo inicial'),k(dateOf(addM(cur,-2),5),800,''),k(dateOf(addM(cur,-1),5),800,'')]},
    {id:'p2',name:'Viagem ao Japão',target:18000,deadline:dateOf(addM(cur,14),1),monthly:700,contribs:[k(dateOf(addM(cur,-3),5),3000,'Saldo inicial'),k(dateOf(addM(cur,-2),6),700,''),k(dateOf(addM(cur,-1),6),500,'')]},
    {id:'p3',name:'Entrada do carro',target:25000,deadline:dateOf(addM(cur,30),1),monthly:600,contribs:[k(dateOf(addM(cur,-1),10),2000,'Saldo inicial')]}
  ];
  return {v:1,demo:true,people:DEFAULT_PEOPLE.map(p=>Object.assign({},p)),settled:{},cards:[c1,c2],income:[
    {id:'i1',desc:'Salário',amount:7500,kind:'mensal',month:'',day:5},
    {id:'i2',desc:'Renda extra',amount:800,kind:'mensal',month:'',day:15}
  ],expenses,projects,paid:{}};
}
//</core>

/* ===== app ===== */
const use=n=>(window.claude&&window.claude.use)?window.claude.use(n):Promise.resolve(null);
const BRL=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const money=n=>BRL.format(n||0);
const fmtIn=n=>(Math.round(n*100)/100).toFixed(2).replace('.',',');
function kfmt(n){return n>=1000?'R$ '+(n/1000).toFixed(n%1000===0?0:1).replace('.',',')+' mil':'R$ '+Math.round(n);}
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-3);
const todayStr=()=>{const d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());};
const CUR=todayStr().slice(0,7);
const dm=d=>d.slice(8,10)+'/'+d.slice(5,7);
const KIND={avista:'À vista',parcelado:'Parcelado',fixo:'Fixo mensal'};
const SWATCH=['#7B3FBF','#E06A00','#1F6FEB','#0E6B58','#C0392B','#444D56'];

let S=null, sel=CUR, tab='painel', filter='todos', pfilter='todos', ALL=[];
const personOf=id=>S.people.find(p=>p.id===id);
const pName=id=>{const p=personOf(id);return p?p.name:'Meu';};
const ptag=id=>{const p=personOf(id);return p?`<span class="ptag"><i style="background:${esc(p.color)}"></i>${esc(p.name)}</span>`:'';};
const whoOpts=()=>[['','Meu'],...S.people.map(p=>[p.id,p.name])];
let loadedFromCloud=false, saveRef=null, saving=false, pending=false, timer=null;

try{const raw=localStorage.getItem('meu-caixa-v1');if(raw){const o=JSON.parse(raw);if(o&&o.expenses)S=o;}}catch(e){}
if(!S) S=seed(CUR);
ensureState(S);

/* ---- persistence ---- */
function setStatus(t){const el=document.getElementById('status');if(el)el.textContent=t;}
function commit(){
  render(); setStatus('Salvando…');
  clearTimeout(timer); timer=setTimeout(persist,500);
}
async function persist(){
  try{localStorage.setItem('meu-caixa-v1',JSON.stringify(S));}catch(e){}
  if(!saveRef){setStatus('Salvo só neste navegador');return;}
  if(conflictOpen){return;}
  if(saving){pending=true;return;}
  saving=true;
  try{
    await saveRef.set({data:JSON.parse(JSON.stringify(S)),savedAt:Date.now()});
    setStatus('Salvo na sua conta');
  }catch(e){
    if(e&&e.conflict){conflictAsk();}
    else setStatus('Não salvou na nuvem; cópia local mantida');
  }
  saving=false;
  if(pending){pending=false;persist();}
}
let sb=null, sbUser=null, lastRemote=null, conflictOpen=false;
function cloudLabel(){return sbUser?'Conta: '+sbUser.email:(window.SUPABASE_ANON_KEY?'Entrar para sincronizar':'');}
function makeRef(){
  return {set:async o=>{
    const now=new Date().toISOString(), row={data:o.data,updated_at:now};
    let q;
    if(lastRemote) q=await sb.from('finance_state').update(row).eq('user_id',sbUser.id).eq('updated_at',lastRemote).select('updated_at');
    else q=await sb.from('finance_state').insert({user_id:sbUser.id,...row}).select('updated_at');
    if(q.error){ if(q.error.code==='23505') throw Object.assign(new Error('conflict'),{conflict:true}); throw q.error; }
    if(!q.data||!q.data.length) throw Object.assign(new Error('conflict'),{conflict:true});
    lastRemote=q.data[0].updated_at;
  }};
}
async function pullRemote(force){
  const {data,error}=await sb.from('finance_state').select('data,updated_at').eq('user_id',sbUser.id).maybeSingle();
  if(error) throw error;
  if(data&&data.data&&data.data.expenses){
    if(force||data.updated_at!==lastRemote){
      try{localStorage.setItem('meu-caixa-pre-sync',JSON.stringify(S));}catch(e){}
      S=ensureState(data.data); lastRemote=data.updated_at; loadedFromCloud=true; render();
    }
    return true;
  }
  return false;
}
function conflictAsk(){
  if(conflictOpen) return; conflictOpen=true; setStatus('Conflito: outro aparelho alterou os dados');
  openModal({title:'Os dados mudaram em outro aparelho',submit:'Manter os meus (sobrescrever)',danger:true,
    body:`<p>Você alterou os dados aqui e, ao mesmo tempo, outro aparelho salvou uma versão diferente na nuvem.</p><p class="muted small">Escolha qual versão vale. Uma cópia da versão que você descartar fica guardada neste aparelho.</p><button type="button" class="btn" data-action="conflict-remote">Usar a versão da nuvem</button>`,
    onSubmit:()=>{resolveConflict(true);}});
}
async function resolveConflict(keepMine){
  try{
    if(keepMine){
      const {data}=await sb.from('finance_state').select('updated_at').eq('user_id',sbUser.id).maybeSingle();
      lastRemote=data?data.updated_at:null; conflictOpen=false; await persist();
    } else { conflictOpen=false; await pullRemote(true); try{localStorage.setItem('meu-caixa-v1',JSON.stringify(S));}catch(e){} setStatus('Salvo na sua conta'); }
  }catch(e){conflictOpen=false;setStatus('Sem conexão com a nuvem; usando cópia local');}
  closeModal();
}
async function onSession(session){
  sbUser=session?session.user:null; saveRef=null;
  if(!sbUser){setStatus('Salvo só neste navegador');render();return;}
  try{
    saveRef=makeRef();
    const had=await pullRemote(true);
    setStatus(had?'Salvo na sua conta':(S.demo?'Exemplo: ainda não salvo':'Sincronizando…'));
    if(!had&&!S.demo) await persist();
    render();
  }catch(e){saveRef=null;setStatus('Sem conexão com a nuvem; usando cópia local');}
}
async function initCloud(){
  if(!window.SUPABASE_ANON_KEY||!window.supabase){setStatus('Salvo só neste navegador');return;}
  try{
    sb=window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
    sb.auth.onAuthStateChange((ev,session)=>{ if(ev==='SIGNED_IN'||ev==='SIGNED_OUT'||ev==='INITIAL_SESSION') setTimeout(()=>onSession(session),0); });
    document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible'&&sbUser&&saveRef&&!saving&&!pending&&!conflictOpen) pullRemote(false).catch(()=>{}); });
  }catch(e){setStatus('Salvo só neste navegador');}
}
function openAccount(){
  if(!sb){toast('Sincronização não configurada.');return;}
  if(sbUser){
    openModal({title:'Sua conta',body:`<p>Conectado como <b>${esc(sbUser.email)}</b>.</p><p class="muted small">Seus dados são sincronizados entre os aparelhos em que você entrar com esta conta.</p>`,submit:'Sair',danger:true,onSubmit:()=>{sb.auth.signOut();}});
    return;
  }
  openModal({title:'Entrar para sincronizar',submit:'Entrar',
    body:field('E-mail','<input name="email" type="email" autocomplete="email" inputmode="email" autocapitalize="none">')+field('Senha','<input name="pw" type="password" autocomplete="current-password">','Mínimo de 6 caracteres.')+`<button type="button" class="btn" data-action="auth-up">Criar conta nova</button>`,
    onSubmit:f=>{
      const email=String(f.get('email')||'').trim(), pw=String(f.get('pw')||'');
      if(!email||!pw) return 'Informe e-mail e senha.';
      sb.auth.signInWithPassword({email,password:pw}).then(r=>{ if(r.error) toast('Não entrou: '+(/invalid/i.test(r.error.message)?'e-mail ou senha incorretos.':r.error.message)); else toast('Conectado.'); });
    }});
}
async function signUp(){
  const f=modalEl&&modalEl.querySelector('form'); if(!f) return;
  const email=f.email.value.trim(), pw=f.pw.value;
  if(!email||pw.length<6){setErr('Informe e-mail e uma senha de pelo menos 6 caracteres.');return;}
  const r=await sb.auth.signUp({email,password:pw});
  if(r.error){setErr(r.error.message);return;}
  closeModal();
  toast(r.data.session?'Conta criada e conectada.':'Conta criada. Confirme pelo e-mail que enviamos e depois entre.');
}

/* ---- derived ---- */
function build(){
  const horizon=addM(sel>CUR?sel:CUR,14);
  ALL=allCharges(S,horizon);
}
const inMonth=ym=>ALL.filter(c=>c.ym===ym);
const methodName=id=>{const c=S.cards.find(c=>c.id===id);if(c)return c.name;const m=METHODS.find(m=>m.id===id);return m?m.name:'Outro';};
const cardOf=id=>S.cards.find(c=>c.id===id);
const paid=c=>isPaid(S,c,CUR);

function allocBar(ym){
  const t=totalsOf(inMonth(ym).filter(c=>!c.who)), inc=incomeIn(S,ym), pl=plannedIn(S,ym,CUR);
  const left=r2(inc-t.total-pl);
  const segs=[['fixo','Fixos',t.fixo],['parc','Parcelas',t.parcelado],['avul','Avulsos',t.avista],['proj','Projetos',pl]];
  const used=t.total+pl; const base=Math.max(inc,used)||1;
  const bar=segs.map(([c,l,v])=>`<i class="b-${c}" style="width:${v/base*100}%" title="${l}: ${money(v)}"></i>`).join('')+(left>0?`<i class="b-sobra" style="width:${left/base*100}%" title="Sobra: ${money(left)}"></i>`:'');
  const pct=v=>inc>0?Math.round(v/inc*100)+'%':'–';
  const leg=segs.map(([c,l,v])=>`<span><i class="dot d-${c}"></i>${l} <b class="num">${money(v)}</b> <span class="muted">${pct(v)}</span></span>`).join('')+`<span><i class="dot d-sobra"></i>${left>=0?'Sobra':'Falta'} <b class="num ${left<0?'neg':''}">${money(Math.abs(left))}</b></span>`;
  return {html:`<div class="alloc" role="img" aria-label="Divisão da renda do mês">${bar}</div><div class="legend">${leg}</div>`,t,inc,pl,left};
}

/* ---- views ---- */
const views={};

views.painel=function(){
  const mine=c=>!c.who;
  const chAll=inMonth(sel), ch=chAll.filter(mine), a=allocBar(sel);
  const othersAmt=r2(totalsOf(chAll).total-a.t.total);
  const paidSum=r2(ch.filter(paid).reduce((s,c)=>s+c.amount,0)), toPay=r2(a.t.total-paidSum);
  const onboarding=!S.expenses.length&&!S.income.length?`
    <div class="card c12"><h2>Comece por aqui</h2><ol class="steps">
      <li><button class="btn" data-action="new-card">Cadastrar um cartão</button><span class="muted">Limite, dia de fechamento e vencimento.</span></li>
      <li><button class="btn" data-action="new-inc">Adicionar renda</button><span class="muted">Salário e outras entradas do mês.</span></li>
      <li><button class="btn" data-action="new-exp">Lançar um gasto</button><span class="muted">À vista, parcelado ou fixo mensal.</span></li>
      <li><button class="btn" data-action="new-proj">Criar um projeto</button><span class="muted">Uma meta com valor, prazo e aporte mensal.</span></li>
    </ol></div>`:'';
  // chart
  const months=Array.from({length:12},(_,i)=>addM(sel,i));
  const data=months.map(m=>{const t=totalsOf(inMonth(m).filter(mine));return {m,t,inc:incomeIn(S,m)};});
  const maxV=Math.max(1,...data.map(d=>Math.max(d.t.total,d.inc)));
  const step=[500,1000,2000,2500,5000,10000,20000,50000].find(s=>maxV/s<=5)||100000;
  const top=Math.ceil(maxV/step)*step;
  const W=720,H=250,L=52,B=28,T=12,pw=W-L-8,ph=H-B-T,slot=pw/12,bw=Math.min(36,slot*.66);
  const y=v=>T+ph-(v/top)*ph;
  let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gastos comprometidos nos próximos 12 meses"><title>Gastos dos próximos 12 meses, por tipo, contra a renda</title>`;
  for(let v=0;v<=top;v+=step) svg+=`<line class="grid-l" x1="${L}" x2="${W-8}" y1="${y(v)}" y2="${y(v)}"/><text x="${L-6}" y="${y(v)+4}" text-anchor="end">${kfmt(v).replace('R$ ','')}</text>`;
  data.forEach((d,i)=>{
    const x0=L+i*slot+(slot-bw)/2; let acc=0;
    if(i===0) svg+=`<rect class="sel-bg" x="${L+i*slot}" y="${T}" width="${slot}" height="${ph}" rx="6"/>`;
    for(const [k,cls] of [['fixo','s-fixo'],['parcelado','s-parc'],['avista','s-avul']]){
      const v=d.t[k]; if(v<=0) continue;
      svg+=`<rect class="${cls}" x="${x0}" y="${y(acc+v)}" width="${bw}" height="${Math.max(1,y(acc)-y(acc+v))}" rx="2"><title>${mShort(d.m)} · ${k==='fixo'?'Fixos':k==='parcelado'?'Parcelas':'Avulsos'}: ${money(v)}</title></rect>`;
      acc+=v;
    }
    svg+=`<text x="${L+i*slot+slot/2}" y="${H-9}" text-anchor="middle">${mShort(d.m)}</text>`;
    svg+=`<rect class="hit" data-action="goto" data-ym="${d.m}" x="${L+i*slot}" y="${T}" width="${slot}" height="${ph+B}"><title>${mLong(d.m)}: ${money(d.t.total)} de gastos, renda ${money(d.inc)}</title></rect>`;
  });
  const incPath=data.map((d,i)=>`${i?'L':'M'}${L+i*slot+slot/2} ${y(d.inc)}`).join(' ');
  svg+=`<path class="inc" d="${incPath}"/></svg>`;
  // insight
  const par=data.map(d=>d.t.parcelado); let insight='';
  for(let i=1;i<par.length;i++) if(par[i]<par[i-1]-0.5){insight=`Em <b>${mShort(data[i].m)}</b> suas parcelas caem de <b>${money(par[i-1])}</b> para <b>${money(par[i])}</b>.`;break;}
  // cards
  const cardsHtml=S.cards.length?S.cards.map(c=>{
    const f=r2(chAll.filter(x=>x.e.method===c.id).reduce((s,x)=>s+x.amount,0));
    const fm=r2(ch.filter(x=>x.e.method===c.id).reduce((s,x)=>s+x.amount,0));
    const used=r2(ALL.filter(x=>x.e.method===c.id&&x.e.kind!=='fixo'&&!paid(x)).reduce((s,x)=>s+x.amount,0));
    const p=c.limit>0?Math.min(100,used/c.limit*100):0;
    return `<div style="padding:10px 0;border-top:1px solid var(--line)"><div style="display:flex;justify-content:space-between;gap:8px"><b><i class="cardtag" style="background:${esc(c.color)}"></i>${esc(c.name)}</b><b class="num">${money(f)}</b></div><div class="meter ${p>85?'bad':p>65?'warn':''}" style="margin:8px 0 4px"><i style="width:${p}%"></i></div><div class="small muted">Fatura inteira; sua parte ${money(fm)} · limite usado ${money(used)} de ${money(c.limit)} · vence dia ${c.due}</div></div>`;
  }).join(''):`<p class="muted">Nenhum cartão cadastrado.</p><button class="btn sm" data-action="new-card" style="margin-top:8px">Cadastrar cartão</button>`;
  // categories
  const cat={}; ch.forEach(c=>{cat[c.e.cat]=(cat[c.e.cat]||0)+c.amount;});
  Object.keys(S.budgets).forEach(k=>{if(S.budgets[k]>0&&cat[k]===undefined)cat[k]=0;});
  const cats=Object.entries(cat).sort((x,y)=>y[1]-x[1]); const cmax=Math.max(1,...cats.map(x=>x[1]));
  const alerts=cats.map(([k,v])=>({k,v,b:budgetStatus(v,S.budgets[k])})).filter(x=>x.b&&x.b.level!=='ok');
  const catHtml=(cats.length?`<div class="bars">${cats.map(([k,v])=>{
    const b=budgetStatus(v,S.budgets[k]);
    const w=b?Math.min(100,b.pct):v/cmax*100;
    return `<div class="br"><span>${esc(k)}</span><div class="bar ${b?'bud '+b.level:''}"><i style="width:${w}%"></i></div><b class="num" style="text-align:right">${money(v)}${b?`<span class="muted small" style="font-weight:400"> / ${money(S.budgets[k])}</span>`:''}</b></div>`;}).join('')}</div>`:`<p class="muted">Sem gastos neste mês.</p>`)
    +`<button class="btn sm" data-action="budgets" style="margin-top:12px">Definir orçamentos</button>`;
  const alertHtml=alerts.length?`<div class="banner alert" role="status"><p>${alerts.map(x=>`<b>${esc(x.k)}</b>: ${x.b.level==='bad'?`estourou em ${money(-x.b.left)}`:`já usou ${Math.round(x.b.pct)}% do orçamento (restam ${money(x.b.left)})`}`).join('<br>')}</p></div>`:'';
  // vencimentos
  const dues=sel===CUR?dueList(S,ALL,todayStr(),7):[];
  const dueHtml=dues.length?`<section class="card c12" aria-label="Vencimentos"><div class="card-h"><h2>Vencimentos próximos</h2><button class="btn sm" data-action="notif">${'Notification' in window&&Notification.permission==='granted'?'Lembretes ativos':'Ativar lembretes'}</button></div>${dues.map(d=>`<div class="row nochk" style="padding-left:0;padding-right:0"><div><div class="t">${esc(d.label)}</div><div class="m ${d.days<0?'neg':''}">${d.days<0?`venceu há ${-d.days} dia${d.days===-1?'':'s'}`:d.days===0?'vence hoje':d.days===1?'vence amanhã':`vence em ${d.days} dias`} · ${dm(d.date)}</div></div><div class="v num">${money(d.amount)}</div></div>`).join('')}</section>`:'';
  // por pessoa
  const whoRows=whoOpts().map(([id,name])=>({id,name,v:r2(chAll.filter(c=>c.who===id).reduce((s,c)=>s+c.amount,0))}));
  const owedNow=r2(ALL.filter(c=>c.who&&c.ym<=sel&&!S.settled[c.key]).reduce((s,c)=>s+c.amount,0));
  const wmax=Math.max(1,...whoRows.map(r=>r.v));
  const whoHtml=`<div class="bars">${whoRows.map(r=>`<div class="br"><span>${esc(r.name)}</span><div class="bar"><i style="width:${r.v/wmax*100}%"></i></div><b class="num" style="text-align:right">${money(r.v)}</b></div>`).join('')}</div><p class="note">${owedNow>0?`<b class="num">${money(owedNow)}</b> a receber das outras pessoas até ${mShort(sel)}. <a href="#pessoas">Ver quem deve</a>`:'Nada a receber das outras pessoas.'}</p>`;
  // projects
  const projHtml=S.projects.length?S.projects.map(p=>{const i=projInfo(p,CUR);return `<div style="padding:10px 0;border-top:1px solid var(--line)"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(p.name)}</b><span class="num">${Math.round(i.pct)}%</span></div><div class="meter" style="margin:8px 0 4px"><i style="width:${i.pct}%"></i></div><div class="small muted num">${money(i.saved)} de ${money(p.target)}</div></div>`;}).join(''):`<p class="muted">Nenhum projeto ainda.</p><button class="btn sm" data-action="new-proj" style="margin-top:8px">Criar projeto</button>`;
  return `
  ${onboarding}${alertHtml}
  <div class="grid">
    ${dueHtml}
    <section class="card c7" aria-labelledby="h-sobra">
      <div class="eyebrow" id="h-sobra">${a.left>=0?'Sobra prevista':'Falta no mês'} · ${mLong(sel)}</div>
      <div class="big num ${a.left<0?'neg':'pos'}">${money(Math.abs(a.left))}</div>
      <p class="muted small num">Renda ${money(a.inc)} − seus gastos ${money(a.t.total)} − projetos ${money(a.pl)}</p>
      ${othersAmt>0?`<p class="muted small num">Não inclui ${money(othersAmt)} de gastos de outras pessoas.</p>`:''}
      ${a.html}
    </section>
    <section class="card c5" aria-label="Situação do mês">
      <div class="eyebrow">Contas do mês</div>
      <div class="kpis" style="margin-top:10px">
        <div class="kpi"><span class="small muted">Já pago</span><b class="num">${money(paidSum)}</b></div>
        <div class="kpi"><span class="small muted">A pagar</span><b class="num">${money(toPay)}</b></div>
      </div>
      <div class="meter" style="margin-top:14px"><i style="width:${a.t.total>0?paidSum/a.t.total*100:0}%"></i></div>
      <p class="note">${insight||'Sem queda de parcelas prevista nos próximos 12 meses.'}</p>
    </section>
    <section class="card c12">
      <div class="card-h"><h2>Próximos 12 meses</h2><span class="legend"><span><i class="dot d-fixo"></i>Fixos</span><span><i class="dot d-parc"></i>Parcelas</span><span><i class="dot d-avul"></i>Avulsos</span><span class="muted">- - Renda</span></span></div>
      <div class="chart-wrap">${svg}</div>
      <p class="note">Só gastos seus, sem os de outras pessoas. Meses futuros mostram só o que já está comprometido: fixos e parcelas. Toque numa barra para abrir o mês.</p>
    </section>
    <section class="card c4"><div class="card-h"><h2>Cartões</h2><a class="small" href="#cartoes">ver tudo</a></div>${cardsHtml}</section>
    <section class="card c4"><div class="card-h"><h2>Por categoria</h2></div>${catHtml}</section>
    <section class="card c4"><div class="card-h"><h2>Projetos</h2><a class="small" href="#projetos">ver tudo</a></div>${projHtml}</section>
    <section class="card c12"><div class="card-h"><h2>De quem é o gasto em ${mShort(sel)}</h2><a class="small" href="#pessoas">ver por pessoa</a></div>${whoHtml}</section>
  </div>`;
};

views.mes=function(){
  const ch=inMonth(sel).filter(c=>(filter==='todos'||c.e.kind===filter)&&(pfilter==='todos'||(pfilter==='_me'?!c.who:c.who===pfilter)));
  const pchips=[['todos','Todas as pessoas'],['_me','Meus'],...S.people.map(p=>[p.id,p.name])].map(([k,l])=>`<button type="button" class="chip" data-action="pfilter" data-f="${esc(k)}" aria-pressed="${pfilter===k}">${esc(l)}</button>`).join('');
  const chips=[['todos','Tudo'],['fixo','Fixos'],['parcelado','Parcelas'],['avista','Avulsos']].map(([k,l])=>`<button type="button" class="chip" data-action="filter" data-f="${k}" aria-pressed="${filter===k}">${l}</button>`).join('')+`<button type="button" class="btn sm" data-action="imp-fatura" style="margin-left:auto">Importar fatura (CSV/OFX)</button>`;
  const merged=pfilter==='todos'?[...ch.reduce((m,c)=>{const g=m.get(c.pkey);if(g){g.amount=r2(g.amount+c.amount);g.parts.push(c);}else m.set(c.pkey,Object.assign({},c,{parts:[c]}));return m;},new Map()).values()]:ch.map(c=>Object.assign({},c,{parts:[c]}));
  const order=[...S.cards.map(c=>c.id),...METHODS.map(m=>m.id)];
  const groups=order.map(id=>({id,list:merged.filter(c=>c.e.method===id)})).filter(g=>g.list.length);
  const body=groups.length?groups.map(g=>{
    const sub=r2(g.list.reduce((s,c)=>s+c.amount,0)), cd=cardOf(g.id);
    const head=cd?`<span><i class="cardtag" style="background:${esc(cd.color)}"></i>${esc(cd.name)} <span class="muted small">fatura · vence dia ${cd.due}</span></span>`:`<span>${esc(methodName(g.id))}</span>`;
    const allPaid=g.list.every(paid);
    const act=cd?`<button class="btn sm" data-action="pay-card" data-id="${cd.id}" data-v="${allPaid?0:1}">${allPaid?'Desmarcar fatura':'Marcar fatura paga'}</button>`:'';
    return `<div class="group-h">${head}<span style="display:flex;gap:10px;align-items:center"><b class="num">${money(sub)}</b>${act}</span></div>`+g.list.sort((a,b)=>b.amount-a.amount).map(c=>{
      const meta=[c.e.cat,c.e.kind==='parcelado'?`parcela ${c.i+1}/${c.n}`:c.e.kind==='fixo'?'fixo':`à vista, ${dm(c.e.date)}`].join(' · ');
      const p=paid(c), multi=c.parts.length>1, one=!multi&&c.e.split&&activeSplit(c.e);
      const splitTxt=multi?`dividido: ${c.parts.map(x=>`${esc(x.who?pName(x.who):'Eu')} ${money(x.amount)}`).join(' · ')}`:one?`sua visão: parte de ${esc(pName(c.who)||'Eu')} em compra de ${money(c.full)}`:'';
      return `<div class="row click ${p?'paid':''}"><input class="chk" type="checkbox" data-action="paid" data-key="${esc(c.pkey)}" ${p?'checked':''} aria-label="Marcar ${esc(c.e.desc)} como pago"><div><div class="t">${esc(c.e.desc)} ${multi?'<span class="ptag">dividido</span>':ptag(c.who)}</div><div class="m">${esc(meta)}</div>${splitTxt?`<div class="m">${splitTxt}</div>`:''}</div><div style="display:flex;gap:10px;align-items:center"><span class="v num">${money(c.amount)}</span><button class="btn sm ghost" data-action="edit-exp" data-id="${c.e.id}" aria-label="Editar ${esc(c.e.desc)}">Editar</button></div></div>`;
    }).join('');
  }).join(''):`<div class="empty">Nada lançado em ${mLong(sel)}.<br><button class="btn primary" data-action="new-exp">+ Lançamento</button></div>`;
  const tot=totalsOf(ch);
  return `<div class="chips">${chips}</div><div class="chips" aria-label="Filtrar por pessoa">${pchips}</div>
    <section class="card flush"><div class="card-h"><h2>${mLong(sel)}</h2><b class="num">${money(tot.total)}</b></div><div style="margin-top:12px">${body}</div></section>
    <p class="note">Compras no cartão caem na fatura do mês em que fecham. Meses anteriores ao atual contam como pagos, a menos que você desmarque.</p>`;
};

views.cartoes=function(){
  const list=S.cards.map(c=>{
    const months=Array.from({length:6},(_,i)=>addM(sel,i));
    const vals=months.map(m=>r2(inMonth(m).filter(x=>x.e.method===c.id).reduce((s,x)=>s+x.amount,0)));
    const mx=Math.max(1,...vals);
    const used=r2(ALL.filter(x=>x.e.method===c.id&&x.e.kind!=='fixo'&&!paid(x)).reduce((s,x)=>s+x.amount,0));
    const p=c.limit>0?Math.min(100,used/c.limit*100):0;
    const closeNote=sel===CUR?`Fecha dia ${c.closing}, vence dia ${c.due}`:`Fecha dia ${c.closing}, vence dia ${c.due}`;
    return `<section class="card c6"><div class="card-h"><h2><i class="cardtag" style="background:${esc(c.color)}"></i>${esc(c.name)}</h2><button class="btn sm" data-action="edit-card" data-id="${c.id}">Editar</button></div>
      <div class="eyebrow">Fatura de ${mShort(sel)}</div><div class="big num" style="font-size:36px">${money(vals[0])}</div>
      <p class="small muted">${closeNote}</p>
      <div class="meter ${p>85?'bad':p>65?'warn':''}" style="margin:14px 0 4px"><i style="width:${p}%"></i></div>
      <p class="small num"><b>${money(Math.max(0,c.limit-used))}</b> disponível <span class="muted">· ${money(used)} usado de ${money(c.limit)}</span></p>
      <div class="mini" aria-hidden="true">${vals.map((v,i)=>`<div class="${i===0?'cur':''}"><i style="height:${Math.max(2,v/mx*100)}%" title="${mShort(months[i])}: ${money(v)}"></i></div>`).join('')}</div>
      <div class="mini-l">${months.map(m=>`<span>${mShort(m)}</span>`).join('')}</div>
    </section>`;
  }).join('');
  return `<div class="card-h" style="margin-bottom:14px"><h2>Seus cartões</h2><span class="actions"><button class="btn" data-action="imp-fatura">Importar fatura (CSV/OFX)</button><button class="btn primary" data-action="new-card">+ Cartão</button></span></div>
    ${S.cards.length?`<div class="grid">${list}</div><p class="note">Limite usado soma o que ainda não foi pago em compras à vista e parceladas, inclusive as parcelas futuras.</p>`:`<div class="card empty">Cadastre seu primeiro cartão para ver faturas e limite.<br><button class="btn primary" data-action="new-card">+ Cartão</button></div>`}`;
};

views.parcelas=function(){
  const items=S.expenses.filter(e=>e.kind==='parcelado').map(e=>{
    const cs=ALL.filter(c=>c.eid===e.id&&c.lead); const pd=cs.filter(paid).length;
    const rem=r2(cs.filter(c=>!paid(c)).reduce((s,c)=>s+c.full,0));
    const mine=r2(ALL.filter(c=>c.eid===e.id&&!c.who&&!paid(c)).reduce((s,c)=>s+c.amount,0));
    return {e,cs,pd,rem,mine,last:cs[cs.length-1].ym,each:cs[0].full};
  });
  const active=items.filter(i=>i.rem>0).sort((a,b)=>a.last<b.last?-1:1), done=items.filter(i=>i.rem<=0);
  const totalRem=r2(active.reduce((s,i)=>s+i.rem,0));
  const nowMonth=r2(inMonth(sel).filter(c=>c.e.kind==='parcelado').reduce((s,c)=>s+c.amount,0));
  const months=Array.from({length:12},(_,i)=>addM(sel,i));
  const vals=months.map(m=>r2(inMonth(m).filter(c=>c.e.kind==='parcelado').reduce((s,c)=>s+c.amount,0)));
  const mx=Math.max(1,...vals);
  const chart=`<div class="mini" style="height:90px;grid-template-columns:repeat(12,1fr)" aria-hidden="true">${vals.map((v,i)=>`<div class="${i===0?'cur':''}"><i style="height:${Math.max(2,v/mx*100)}%;background:var(--parc)" title="${mShort(months[i])}: ${money(v)}"></i></div>`).join('')}</div><div class="mini-l" style="grid-template-columns:repeat(12,1fr)">${months.map(m=>`<span>${m.slice(5)}</span>`).join('')}</div>`;
  const rows=active.map(i=>{const pct=i.pd/i.cs.length*100;return `<div class="row nochk"><div><div class="t">${esc(i.e.desc)} <span class="pill">${i.pd}/${i.cs.length}</span></div><div class="m">${esc(methodName(i.e.method))} · ${money(i.each)} por mês · termina em ${mShort(i.last)}${activeSplit(i.e)?` · sua parte falta ${money(i.mine)}`:''}</div><div class="meter" style="margin-top:8px"><i style="width:${pct}%"></i></div></div><div style="display:flex;gap:10px;align-items:center"><div class="v num">${money(i.rem)}<div class="m" style="font-weight:400">falta pagar</div></div><button class="btn sm ghost" data-action="edit-exp" data-id="${i.e.id}">Editar</button></div></div>`;}).join('');
  return `<div class="grid">
    <section class="card c4"><div class="eyebrow">Ainda a pagar em parcelas</div><div class="big num" style="font-size:38px">${money(totalRem)}</div><p class="small muted">${active.length} compra${active.length===1?'':'s'} em andamento</p></section>
    <section class="card c4"><div class="eyebrow">Parcelas em ${mShort(sel)}</div><div class="big num" style="font-size:38px">${money(nowMonth)}</div><p class="small muted">Pesa ${incomeIn(S,sel)>0?Math.round(nowMonth/incomeIn(S,sel)*100)+'% da renda do mês':'no orçamento do mês'}</p></section>
    <section class="card c4"><div class="eyebrow">Parcelas mês a mês</div>${chart}</section>
    <section class="card flush c12"><div class="card-h"><h2>Em andamento</h2><button class="btn sm primary" data-action="new-exp" data-kind="parcelado">+ Compra parcelada</button></div><div style="margin-top:12px">${rows||'<div class="empty">Nenhuma compra parcelada em andamento.</div>'}</div></section>
    ${done.length?`<section class="card c12"><h2>Quitadas (${done.length})</h2><p class="muted small" style="margin-top:6px">${done.map(i=>esc(i.e.desc)).join(', ')}</p></section>`:''}
  </div>`;
};

views.pessoas=function(){
  const cards=S.people.map(p=>{
    const ch=inMonth(sel).filter(c=>c.who===p.id).sort((a,b)=>b.amount-a.amount);
    const tot=r2(ch.reduce((s,c)=>s+c.amount,0));
    const open=ALL.filter(c=>c.who===p.id&&c.ym<=sel&&!S.settled[c.key]);
    const owed=r2(open.reduce((s,c)=>s+c.amount,0));
    const before=r2(open.filter(c=>c.ym<sel).reduce((s,c)=>s+c.amount,0));
    const all=ch.length&&ch.every(c=>S.settled[c.key]);
    const rows=ch.map(c=>{const rc=!!S.settled[c.key];return `<div class="row ${rc?'paid':''}"><input class="chk" type="checkbox" data-action="settled" data-key="${esc(c.key)}" ${rc?'checked':''} aria-label="Marcar ${esc(c.e.desc)} como recebido"><div><div class="t">${esc(c.e.desc)}</div><div class="m">${esc(methodName(c.e.method))} · ${esc(c.e.cat)}${c.e.kind==='parcelado'?` · parcela ${c.i+1}/${c.n}`:''}${activeSplit(c.e)?` · parte de ${money(c.full)}`:''}</div></div><div style="display:flex;gap:8px;align-items:center"><span class="v num">${money(c.amount)}</span><button class="btn sm ghost" data-action="edit-exp" data-id="${c.e.id}" aria-label="Editar ${esc(c.e.desc)}">Editar</button></div></div>`;}).join('');
    return `<section class="card flush c6"><div class="card-h"><h2>${ptag(p.id)}</h2><button class="btn sm" data-action="edit-person" data-id="${p.id}">Editar</button></div>
      <div class="kpis" style="padding:12px 18px 14px"><div class="kpi"><span class="small muted">Em ${mShort(sel)}</span><b class="num">${money(tot)}</b></div><div class="kpi"><span class="small muted">A receber</span><b class="num ${owed>0?'neg':''}">${money(owed)}</b></div></div>
      ${before>0?`<p class="small muted" style="padding:0 18px 10px">Inclui ${money(before)} de meses anteriores ainda não recebidos.</p>`:''}
      ${rows||'<div class="empty">Nenhum gasto de '+esc(p.name)+' neste mês.</div>'}
      <div class="actions" style="padding:12px 18px">${ch.length?`<button class="btn sm" data-action="settle-month" data-id="${p.id}">${all?'Desmarcar mês':'Marcar mês como recebido'}</button><button class="btn sm" data-action="copy-summary" data-id="${p.id}">Copiar resumo</button>`:''}</div></section>`;
  }).join('');
  return `<div class="card-h" style="margin-bottom:14px"><h2>Quem usa seus cartões</h2><button class="btn primary" data-action="new-person">+ Pessoa</button></div>
    ${S.people.length?`<div class="grid">${cards}</div><p class="note">Marque cada gasto como recebido quando a pessoa pagar. O valor a receber soma tudo que ainda não foi marcado até o mês em análise.</p>`:`<div class="card empty">Cadastre as pessoas que usam seu cartão para separar o que é de cada uma.<br><button class="btn primary" data-action="new-person">+ Pessoa</button></div>`}`;
};

views.fixos=function(){
  const fx=S.expenses.filter(e=>e.kind==='fixo');
  const act=fx.filter(e=>!e.end||e.end>=CUR), ended=fx.filter(e=>e.end&&e.end<CUR);
  const tot=r2(act.reduce((s,e)=>s+e.amount,0)), inc=incomeIn(S,sel);
  const fr=e=>`<div class="row nochk"><div><div class="t">${esc(e.desc)}</div><div class="m">${esc(e.cat)} · ${esc(methodName(e.method))}${e.end?` · até ${mShort(e.end)}`:''}</div></div><div style="display:flex;gap:8px;align-items:center"><span class="v num">${money(e.amount)}</span><button class="btn sm ghost" data-action="edit-exp" data-id="${e.id}">Editar</button>${!e.end?`<button class="btn sm ghost" data-action="end-fixo" data-id="${e.id}">Encerrar</button>`:''}</div></div>`;
  const ir=i=>`<div class="row nochk"><div><div class="t">${esc(i.desc)}</div><div class="m">${i.kind==='mensal'?'Todo mês'+(i.day?`, dia ${i.day}`:''):'Só em '+mShort(i.month)}</div></div><div style="display:flex;gap:8px;align-items:center"><span class="v num pos">${money(i.amount)}</span><button class="btn sm ghost" data-action="edit-inc" data-id="${i.id}">Editar</button></div></div>`;
  return `<div class="grid">
    <section class="card flush c6"><div class="card-h"><h2>Renda</h2><button class="btn sm primary" data-action="new-inc">+ Renda</button></div>
      <div class="kpis" style="padding:12px 18px 14px"><div class="kpi"><span class="small muted">Em ${mShort(sel)}</span><b class="num">${money(inc)}</b></div></div>
      ${S.income.length?S.income.map(ir).join(''):'<div class="empty">Nenhuma renda cadastrada.</div>'}</section>
    <section class="card flush c6"><div class="card-h"><h2>Gastos fixos</h2><button class="btn sm primary" data-action="new-exp" data-kind="fixo">+ Fixo</button></div>
      <div class="kpis" style="padding:12px 18px 14px"><div class="kpi"><span class="small muted">Por mês</span><b class="num">${money(tot)}</b></div><div class="kpi"><span class="small muted">Da renda</span><b class="num">${inc>0?Math.round(tot/inc*100)+'%':'–'}</b></div></div>
      ${act.length?act.map(fr).join(''):'<div class="empty">Nenhum gasto fixo cadastrado.</div>'}
      ${ended.length?`<div class="group-h"><span>Encerrados</span></div>${ended.map(fr).join('')}`:''}</section>
  </div>`;
};

views.projetos=function(){
  const a=allocBar(sel);
  const cards=S.projects.map(p=>{
    const i=projInfo(p,CUR);
    const st={done:['ok','Concluído'],ok:['ok','No ritmo'],low:['warn','Aporte abaixo do necessário'],late:['bad','Prazo vencido'],nomonthly:['warn','Sem aporte mensal']}[i.status];
    const hist=[...p.contribs].sort((x,y)=>x.date<y.date?1:-1).slice(0,5).map(c=>`<div><span>${dm(c.date)}/${c.date.slice(2,4)} ${esc(c.note||(c.amount<0?'Retirada':'Aporte'))}</span><span><b class="num ${c.amount<0?'neg':''}">${money(c.amount)}</b><button data-action="del-contrib" data-pid="${p.id}" data-id="${c.id}" aria-label="Excluir este aporte">excluir</button></span></div>`).join('');
    const info=[];
    if(i.dl) info.push(`Prazo ${mShort(i.dl)}`);
    if(i.status!=='done'&&i.need>0) info.push(`precisa de ${money(i.need)}/mês`);
    if(i.eta) info.push(`no seu aporte de ${money(p.monthly)}, conclui em ${mShort(i.eta)}`);
    return `<section class="card c6 proj"><div class="proj-top"><h3>${esc(p.name)}</h3><span class="pill ${st[0]}">${st[1]}</span></div>
      <div><div class="big num" style="font-size:32px;margin:0">${money(i.saved)} <span class="muted" style="font:500 15px var(--body)">de ${money(p.target)}</span></div></div>
      <div><div class="meter" role="img" aria-label="${Math.round(i.pct)}% guardado"><i style="width:${i.pct}%"></i></div><p class="small muted" style="margin-top:6px">${Math.round(i.pct)}% guardado${i.rem>0?` · faltam ${money(i.rem)}`:''}</p></div>
      <p class="small muted">${info.join(' · ')||'Defina prazo e aporte mensal para acompanhar o ritmo.'}</p>
      <div class="actions"><button class="btn sm primary" data-action="contrib" data-id="${p.id}" data-s="1">+ Guardar</button><button class="btn sm" data-action="contrib" data-id="${p.id}" data-s="-1">Retirar</button><button class="btn sm ghost" data-action="edit-proj" data-id="${p.id}">Editar</button></div>
      ${hist?`<div class="hist">${hist}</div>`:''}</section>`;
  }).join('');
  return `<div class="grid">
    <section class="card c12"><div class="card-h"><h2>Divisão da renda em ${mShort(sel)}</h2><button class="btn primary" data-action="new-proj">+ Projeto</button></div>${a.html}<p class="note">Cada projeto reserva seu aporte mensal da renda. O que sobra depois de fixos, parcelas, avulsos e projetos aparece como sobra.</p></section>
    ${cards||`<div class="card c12 empty">Crie um projeto para separar dinheiro para uma meta: reserva, viagem, entrada de um carro.<br><button class="btn primary" data-action="new-proj">+ Projeto</button></div>`}
  </div>`;
};

/* ---- render ---- */
function render(){
  build();
  document.getElementById('mlabel').textContent=mShort(sel).replace('/',' / ');
  document.querySelectorAll('#tabs a').forEach(a=>{if(a.dataset.tab===tab)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  const demo=S.demo?`<div class="banner"><p><b>Dados de exemplo.</b> Mexa à vontade para conhecer o app e, quando quiser, comece do zero.</p><button class="btn" data-action="clear-demo">Limpar exemplos</button></div>`:'';
  const tools=`<footer class="tools"><button data-action="imp-fatura">Importar fatura (CSV/OFX)</button><button data-action="export-csv">Exportar ${mShort(sel)} (CSV)</button><button data-action="export-json">Backup (JSON)</button><button data-action="import">Restaurar backup</button><button data-action="budgets">Orçamentos</button>${'Notification' in window?`<button data-action="notif">${Notification.permission==='granted'?'Lembretes de vencimento: ativos':'Ativar lembretes de vencimento'}</button>`:''}<button data-action="reset">Apagar tudo</button>${cloudLabel()?`<button data-action="account">${esc(cloudLabel())}</button>`:''}</footer>`;
  document.getElementById('app').innerHTML=demo+(views[tab]||views.painel)()+tools;
  const act=document.querySelector('#tabs a[aria-current]'); if(act&&act.scrollIntoView) act.scrollIntoView({inline:'center',block:'nearest'});
}

/* ---- divisão da compra: lê o formulário e valida ---- */
const splitPeople=()=>[{id:'',name:'Eu'},...S.people.map(p=>({id:p.id,name:p.name}))];
function readSplit(get,amount){
  const mode=get('smode')||'none'; if(mode==='none') return {mode,parts:null};
  const ps=splitPeople(), parts=[]; let sum=0;
  ps.forEach((p,i)=>{
    if(!get('sp'+i)) return;
    const raw=get('sv'+i); const v=mode==='eq'?1:parseMoney(raw);
    parts.push({who:p.id,w:isNaN(v)?0:v}); sum=r2(sum+(isNaN(v)?0:v));
  });
  if(parts.length<2) return {mode,parts:null,error:'Marque pelo menos 2 pessoas para dividir.'};
  if(mode!=='eq'&&parts.some(p=>!(p.w>0))) return {mode,parts:null,sum,error:'Informe o '+(mode==='pct'?'percentual':'valor')+' de cada pessoa marcada.'};
  if(mode==='pct'&&Math.abs(sum-100)>0.009) return {mode,parts,sum,error:'Os percentuais somam '+String(sum).replace('.',',')+'%; precisam somar 100%.'};
  if(mode==='val'&&Math.abs(sum-amount)>0.009) return {mode,parts,sum,error:'Os valores somam '+money(sum)+'; precisam somar '+money(amount)+'.'};
  return {mode,parts,sum};
}

/* ---- entrada rápida (botão +) ---- */
function quickForm(){
  const methodOpts=[...S.cards.map(c=>[c.id,'Cartão '+c.name]),...METHODS.map(m=>[m.id,m.name])];
  const m0=S.last.method&&methodOpts.some(o=>o[0]===S.last.method)?S.last.method:methodOpts[0][0];
  let catTouched=false;
  openModal({title:'Gasto rápido',submit:'Salvar',body:
    field('Valor',`<input name="amount" inputmode="decimal" placeholder="0,00" autocomplete="off" style="font-size:24px;font-weight:700">`)+
    field('O que foi',`<input name="desc" maxlength="80" autocomplete="off" placeholder="Ex.: Mercado, Uber, Farmácia">`)+
    `<div class="two">${field('Pagamento',`<select name="method">${opts(methodOpts,m0)}</select>`)}${field('Categoria',`<select name="cat">${opts(CATS.map(c=>[c,c]),S.last.cat||'Outros')}</select>`)}</div>`+
    `<p class="muted small">Entra como compra à vista de hoje. Para parcelar ou repetir, use <b>+ Lançamento</b>.</p>`,
    onSubmit:fd=>{
      const amount=parseMoney(fd.get('amount')), desc=String(fd.get('desc')).trim();
      if(!(amount>0)) return 'Informe o valor.';
      if(!desc) return 'Diga o que foi.';
      const rec={id:uid(),desc,kind:'avista',amount,method:fd.get('method'),date:todayStr(),cat:fd.get('cat'),who:'',n:1,end:''};
      S.expenses.push(rec); learnCat(S,desc,rec.cat); S.last={method:rec.method,cat:rec.cat}; sel=todayStr().slice(0,7);
      commit(); toast('Salvo: '+money(amount)+' em '+desc+'.');
    }});
  const f=modalEl.querySelector('form'); f.elements.amount.focus();
  f.elements.cat.addEventListener('change',()=>{catTouched=true;});
  f.elements.desc.addEventListener('input',()=>{if(!catTouched) f.elements.cat.value=guessCat(f.elements.desc.value,S.catMem);});
}
/* ---- orçamentos por categoria ---- */
function budgetsForm(){
  openModal({title:'Orçamento por categoria',submit:'Salvar',
    body:`<p class="muted small">Defina um teto mensal. Deixe em branco para não limitar. O painel avisa a partir de 80%.</p><div class="two">${CATS.map((c,i)=>field(esc(c),`<input name="b${i}" inputmode="decimal" placeholder="sem limite" value="${S.budgets[c]>0?fmtIn(S.budgets[c]):''}">`)).join('')}</div>`,
    onSubmit:fd=>{
      const nb={};
      for(let i=0;i<CATS.length;i++){const raw=String(fd.get('b'+i)||'').trim(); if(!raw) continue; const v=parseMoney(raw); if(isNaN(v)||v<0) return 'Valor inválido em '+CATS[i]+'.'; if(v>0) nb[CATS[i]]=v;}
      S.budgets=nb; commit();
    }});
}
/* ---- lembretes de vencimento (notificação local ao abrir o app) ---- */
async function enableNotif(){
  if(!('Notification' in window)){toast('Este navegador não suporta notificações.');return;}
  const r=Notification.permission==='granted'?'granted':await Notification.requestPermission();
  if(r==='granted'){toast('Lembretes ativados.');notifyDues();render();}else toast('Permissão negada. Libere nas configurações do navegador.');
}
async function notifyDues(){
  try{
    if(!('Notification' in window)||Notification.permission!=='granted'||!('serviceWorker' in navigator)) return;
    const today=todayStr(); if(localStorage.getItem('meu-caixa-notif')===today) return;
    const dues=dueList(S,ALL.length?ALL:allCharges(S,addM(CUR,14)),today,1).filter(d=>d.days>=0);
    if(!dues.length) return;
    localStorage.setItem('meu-caixa-notif',today);
    const reg=await navigator.serviceWorker.ready;
    const total=r2(dues.reduce((a,d)=>a+d.amount,0));
    reg.showNotification('Meu Caixa: '+dues.length+' vencimento'+(dues.length===1?'':'s')+' hoje/amanhã',{body:dues.map(d=>d.label+' '+money(d.amount)).join(' · ')+' — total '+money(total),icon:'icons/icon-192.png',tag:'vencimentos'});
  }catch(e){}
}

/* ---- modal ---- */
let modalEl=null;
function closeModal(){if(modalEl){modalEl.remove();modalEl=null;}}
function setErr(m){const e=document.getElementById('merr');if(e)e.textContent=m||'';}
function openModal({title,body,submit='Salvar',onSubmit,onDelete,onChange,deleteLabel='Excluir',danger}){
  closeModal();
  const el=document.createElement('div'); el.className='scrim';
  el.innerHTML=`<form class="sheet" novalidate role="dialog" aria-modal="true" aria-labelledby="mtitle"><div class="sheet-h"><h2 id="mtitle">${esc(title)}</h2><button type="button" class="x" data-action="close" aria-label="Fechar">×</button></div>${body}<p class="err" id="merr" role="alert"></p><div class="sheet-f">${onDelete?`<button type="button" class="btn danger" id="mdel">${deleteLabel}</button>`:''}<span class="sp"></span><button type="button" class="btn ghost" data-action="close">Cancelar</button><button type="button" class="btn ${danger?'danger':'primary'}" id="msave">${submit}</button></div></form>`;
  document.body.appendChild(el); modalEl=el;
  const form=el.querySelector('form');
  /* O visualizador bloqueia o envio de <form>, então o salvar não depende do evento submit. */
  const run=()=>{let err;try{err=onSubmit(new FormData(form));}catch(e){err='Não consegui salvar: '+(e&&e.message?e.message:'erro inesperado');}if(err)setErr(err);else closeModal();};
  form.addEventListener('submit',ev=>ev.preventDefault());
  el.querySelector('#msave').addEventListener('click',run);
  form.addEventListener('keydown',ev=>{if(ev.key==='Enter'&&ev.target.tagName==='INPUT'&&ev.target.type!=='file'&&ev.target.type!=='checkbox'&&ev.target.type!=='radio'){ev.preventDefault();run();}});
  if(onChange){form.addEventListener('input',()=>onChange(form));form.addEventListener('change',()=>onChange(form));onChange(form);}
  if(onDelete){const b=el.querySelector('#mdel');let armed=false;b.addEventListener('click',()=>{if(!armed){armed=true;b.textContent='Confirmar exclusão';return;}const err=onDelete();if(err){setErr(err);armed=false;b.textContent=deleteLabel;}else closeModal();});}
  el.addEventListener('mousedown',ev=>{if(ev.target===el)closeModal();});
  const first=form.querySelector('input:not([type=hidden]):not([type=radio]),select'); if(first&&!danger)first.focus();
}
const field=(label,input,hint)=>`<label class="f"><span>${label}</span>${input}${hint?`<small>${hint}</small>`:''}</label>`;
const opts=(arr,val)=>arr.map(([v,l])=>`<option value="${esc(v)}" ${v===val?'selected':''}>${esc(l)}</option>`).join('');
const seg=(name,arr,val)=>`<div class="seg">${arr.map(([v,l])=>`<label><input type="radio" name="${name}" value="${v}" ${v===val?'checked':''}><span>${l}</span></label>`).join('')}</div>`;
function toast(t){const el=document.createElement('div');el.className='toast';el.setAttribute('role','status');el.textContent=t;document.body.appendChild(el);setTimeout(()=>el.remove(),2800);}
function confirmModal(title,text,label,fn){
  openModal({title,body:`<p>${esc(text)}</p>`,submit:label,danger:true,onSubmit:()=>{fn();}});
}

/* ---- forms ---- */
function expForm(id,presetKind){
  const e=id?S.expenses.find(x=>x.id===id):null;
  const d=Object.assign({who:''},e||{desc:'',kind:presetKind||'avista',amount:'',method:S.last.method&&(cardOf(S.last.method)||METHODS.some(m=>m.id===S.last.method))?S.last.method:(S.cards[0]?S.cards[0].id:'pix'),date:todayStr(),cat:'Outros',n:2,end:''});
  const methodOpts=[...S.cards.map(c=>[c.id,'Cartão '+c.name]),...METHODS.map(m=>[m.id,m.name])];
  const sm=e&&activeSplit(e)?(e.splitMode||'val'):'none';
  const body=`
    ${field('Descrição',`<input name="desc" value="${esc(d.desc)}" maxlength="80" autocomplete="off" placeholder="Ex.: Notebook, Aluguel, Mercado">`)}
    <fieldset><legend>Tipo</legend>${seg('kind',[['avista','À vista'],['parcelado','Parcelado'],['fixo','Fixo mensal']],d.kind)}</fieldset>
    <div class="two">
      ${field('<span id="l-amount">Valor</span>',`<input name="amount" inputmode="decimal" value="${d.amount===''?'':fmtIn(d.amount)}" placeholder="0,00">`)}
      <div id="w-n">${field('Parcelas',`<input name="n" type="number" min="1" max="60" value="${d.n}">`)}</div>
      <div id="w-end">${field('Termina em (opcional)',`<input name="end" type="month" value="${esc(d.end||'')}">`)}</div>
    </div>
    <div class="two">
      ${field('Pagamento',`<select name="method">${opts(methodOpts,d.method)}</select>`)}
      ${field('<span id="l-date">Data da compra</span>',`<input name="date" type="date" value="${esc(d.date)}">`)}
    </div>
    <div class="two">
      ${field('Categoria',`<select name="cat">${opts(CATS.map(c=>[c,c]),d.cat)}</select>`)}
      <div id="w-who">${field('De quem é',`<select name="who">${opts(whoOpts(),d.who||'')}</select>`,'Quem usou o cartão nesta compra.')}</div>
    </div>
    <fieldset><legend>Dividir esta compra com outras pessoas</legend>${seg('smode',[['none','Não'],['eq','Igual'],['pct','Por %'],['val','Por valor']],sm)}
      <div id="w-split" hidden>${splitPeople().map((p,i)=>{const cur=(d.split||[]).find(x=>x.who===p.id);return `<label class="srow"><input class="chk" type="checkbox" name="sp${i}" ${cur?'checked':''} aria-label="Incluir ${esc(p.name)} na divisão"><span>${esc(p.name)}</span><input class="sv" name="sv${i}" inputmode="decimal" value="${cur&&sm!=='eq'?(sm==='pct'?String(cur.w).replace('.',','):fmtIn(cur.w)):''}" aria-label="Parte de ${esc(p.name)}"></label>`;}).join('')}
      ${S.people.length?'':'<p class="muted small">Cadastre pessoas na aba Pessoas para dividir compras.</p>'}</div>
    </fieldset>
    <div class="preview" id="prev" aria-live="polite"></div>`;
  openModal({title:e?'Editar lançamento':'Novo lançamento',body,onChange:f=>{
    const k=f.elements.kind.value; f.querySelector('#w-n').hidden=k!=='parcelado'; f.querySelector('#w-end').hidden=k!=='fixo';
    f.querySelector('#l-amount').textContent=k==='parcelado'?'Valor total da compra':k==='fixo'?'Valor mensal':'Valor';
    f.querySelector('#l-date').textContent=k==='fixo'?'Começa em':'Data da compra';
    const amt=parseMoney(f.elements.amount.value), n=Math.max(1,parseInt(f.elements.n.value)||1), date=f.elements.date.value;
    let t='';
    if(date&&/^\d{4}-\d{2}-\d{2}$/.test(date)){
      const bm=billMonth({date,method:f.elements.method.value,bill:e&&e.bill},S.cards), isCard=!!cardOf(f.elements.method.value);
      if(k==='parcelado'&&amt>0) t=`${n}x de <b>${money(installmentAmount(amt,n,0))}</b> · de ${mShort(bm)} até ${mShort(addM(bm,n-1))}`;
      else if(k==='fixo'&&amt>0) t=`<b>${money(amt)}</b> por mês a partir de ${mShort(bm)}`;
      else if(amt>0) t=`<b>${money(amt)}</b> em ${mShort(bm)}`;
      if(t&&isCard) t+=` · fatura de ${mShort(bm)}`;
    }
    const sg=name=>{const el=f.elements[name];if(!el)return null;if(el.type==='checkbox')return el.checked?'on':null;return el.value;};
    const mode=sg('smode')||'none';
    f.querySelector('#w-split').hidden=mode==='none'; f.querySelector('#w-who').hidden=mode!=='none';
    f.querySelectorAll('.sv').forEach(el=>{el.hidden=mode==='eq';el.placeholder=mode==='pct'?'%':'R$';});
    if(mode!=='none'){
      const r=readSplit(sg,amt);
      if(r.parts&&!r.error&&amt>0){const sh=splitAmount(amt,r.parts.map(p=>p.w));t+=(t?'<br>':'')+'Cada um paga '+(k==='parcelado'?'do total: ':k==='fixo'?'por mês: ':'')+r.parts.map((p,i)=>`${esc(p.who?pName(p.who):'Eu')} <b>${money(sh[i])}</b>`).join(' · ');}
      else if(r.error) t+=(t?'<br>':'')+`<span class="muted">${esc(r.error)}</span>`;
    }
    f.querySelector('#prev').innerHTML=t||'<span class="muted">Preencha valor e data para ver como isso cai nos meses.</span>';
  },onSubmit:fd=>{
    const kind=fd.get('kind'), desc=String(fd.get('desc')).trim(), amount=parseMoney(fd.get('amount')), date=fd.get('date'), n=parseInt(fd.get('n'))||1, end=fd.get('end')||'';
    if(!desc) return 'Dê um nome ao lançamento.';
    if(!(amount>0)) return 'Informe um valor maior que zero.';
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Informe a data.';
    if(kind==='parcelado'&&(n<1||n>60)) return 'Parcelas: de 1 a 60.';
    const sp=readSplit(k=>fd.get(k),amount); if(sp.error) return sp.error;
    const rec={id:e?e.id:uid(),desc,kind,amount,method:fd.get('method'),date,cat:fd.get('cat'),who:sp.parts?'':(fd.get('who')||''),n:kind==='parcelado'?n:1,end:kind==='fixo'?end:''};
    if(sp.parts){rec.split=sp.parts;rec.splitMode=sp.mode;}
    if(e&&e.bill) rec.bill=e.bill;
    if(e) S.expenses[S.expenses.indexOf(e)]=rec; else S.expenses.push(rec);
    learnCat(S,desc,rec.cat); S.last={method:rec.method,cat:rec.cat};
    commit();
  },onDelete:e?()=>{S.expenses=S.expenses.filter(x=>x.id!==e.id);for(const m of [S.paid,S.settled])Object.keys(m).forEach(k=>{if(k.startsWith(e.id+'#'))delete m[k];});commit();}:null});
  /* ao escolher dividir, já marca "Eu" e a pessoa do campo "De quem é" (ou a primeira cadastrada) */
  const form=modalEl.querySelector('form');
  form.addEventListener('change',ev=>{
    if(ev.target.name!=='smode'||ev.target.value==='none') return;
    const boxes=splitPeople().map((p,i)=>form.elements['sp'+i]);
    if(boxes.filter(b=>b.checked).length>=2) return;
    boxes[0].checked=true;
    const who=form.elements.who.value, idx=who?splitPeople().findIndex(p=>p.id===who):-1;
    const other=idx>0?idx:(boxes.length>1?1:-1); if(other>0) boxes[other].checked=true;
    form.dispatchEvent(new Event('input',{bubbles:true}));
  });
}
async function readText(file){
  const buf=await file.arrayBuffer();
  try{return new TextDecoder('utf-8',{fatal:true}).decode(buf);}
  catch(e){return new TextDecoder('windows-1252').decode(buf);}
}
function impForm(presetCard){
  if(!S.cards.length){toast('Cadastre um cartão antes de importar uma fatura.');cardForm();return;}
  let rawRows=null, parsed=null, dupes=new Set();
  const body=`
    <div class="two">
      ${field('Cartão',`<select name="card">${opts(S.cards.map(c=>[c.id,c.name]),presetCard||S.cards[0].id)}</select>`)}
      ${field('Mês da fatura',`<input name="bill" type="month" value="${esc(sel)}">`)}
    </div>
    ${field('Arquivo da fatura (CSV ou OFX)',`<input type="file" id="impfile" accept=".csv,.ofx,.txt,text/csv">`,'Baixe a fatura em CSV ou OFX no app ou site do banco. Todas as compras entram no mês escolhido.')}
    ${field('Compras de',`<select name="who">${opts(whoOpts(),'')}</select>`,'Vale para todas as linhas. Você ajusta cada compra na prévia.')}
    ${field('Compras aparecem como',`<select name="sign">${opts([['auto','Detectar automaticamente'],['pos','Valores positivos'],['neg','Valores negativos']],'auto')}</select>`,'Pagamentos e créditos da fatura são ignorados.')}
    <div id="imp" aria-live="polite"></div>`;
  openModal({title:'Importar fatura (CSV ou OFX)',submit:'Importar',body,onSubmit:fd=>{
    if(!parsed) return 'Escolha um arquivo CSV com a fatura.';
    const card=fd.get('card'), bill=fd.get('bill');
    if(!bill) return 'Informe o mês da fatura.';
    const add=[];
    parsed.rows.forEach((r,i)=>{if(fd.get('r'+i)) add.push({id:uid(),desc:r.desc,kind:'avista',amount:r.amount,method:card,date:r.date||bill+'-01',cat:fd.get('c'+i)||r.cat,who:fd.get('w'+i)||'',n:1,end:'',bill});});
    if(!add.length) return 'Marque ao menos uma compra para importar.';
    add.forEach(x=>learnCat(S,x.desc,x.cat));
    S.expenses.push(...add); sel=bill; filter='todos';
    commit(); goTab('mes'); toast(add.length+' compra'+(add.length===1?'':'s')+' importada'+(add.length===1?'':'s')+' na fatura de '+mShort(bill)+'.');
  }});
  const form=modalEl.querySelector('form'), box=form.querySelector('#imp');
  const updTotal=()=>{
    if(!parsed) return; let n=0,t=0;
    parsed.rows.forEach((r,i)=>{const c=form.elements['r'+i];if(c&&c.checked){n++;t+=r.amount;}});
    const el=form.querySelector('#imp-t'); if(el) el.innerHTML=`<b>${n}</b> de ${parsed.rows.length} marcadas · <b class="num">${money(r2(t))}</b>`;
  };
  const show=()=>{
    if(!rawRows) return;
    const bill=form.elements.bill.value||sel, card=form.elements.card.value;
    parsed=parseFatura(rawRows,bill,form.elements.sign.value,S.catMem);
    if(parsed.error){box.innerHTML=`<p class="err">${esc(parsed.error)}</p>`;parsed=null;return;}
    dupes=new Set(S.expenses.filter(e=>e.bill).map(e=>impKey(e.method,e.bill,e.date,e.desc,e.amount)));
    let nd=0;
    const rowsH=parsed.rows.map((r,i)=>{
      const dup=dupes.has(impKey(card,bill,r.date||bill+'-01',r.desc,r.amount)); if(dup) nd++;
      return `<div class="irow"><input class="chk" type="checkbox" name="r${i}" ${dup?'':'checked'} aria-label="Importar ${esc(r.desc)}"><div><div class="d">${esc(r.desc)}</div><div class="sub"><span>${r.date?dm(r.date):'sem data'}</span><select name="c${i}" aria-label="Categoria de ${esc(r.desc)}">${opts(CATS.map(c=>[c,c]),r.cat)}</select><select name="w${i}" aria-label="De quem é ${esc(r.desc)}">${opts(whoOpts(),form.elements.who.value)}</select>${dup?'<span class="pill warn">já importada</span>':''}</div></div><b class="num">${money(r.amount)}</b></div>`;
    }).join('');
    box.innerHTML=`<div class="imp"><div class="imp-s"><span id="imp-t"></span><br><span class="muted">${parsed.skipped?parsed.skipped+' linha'+(parsed.skipped===1?'':'s')+' ignorada'+(parsed.skipped===1?'':'s')+' (pagamentos e créditos). ':''}${nd?nd+' já importada'+(nd===1?'':'s')+' antes, desmarcada'+(nd===1?'':'s')+'.':''}</span></div>${rowsH}</div>`;
    updTotal();
  };
  form.querySelector('#impfile').addEventListener('change',async ev=>{
    const f=ev.target.files[0]; if(!f) return; setErr('');
    try{const txt=await readText(f);rawRows=isOfx(txt)?parseOfx(txt):parseCsv(txt);show();}catch(e){setErr('Não consegui ler o arquivo. Confirme que é um CSV ou OFX.');}
  });
  form.addEventListener('change',ev=>{
    const n=ev.target.name||'';
    if(n==='sign'||n==='bill'||n==='card'||n==='who') show(); else if(/^r\d+$/.test(n)) updTotal();
  });
}
function personForm(id){
  const p=id?personOf(id):null; const d=p||{name:'',color:SWATCH[S.people.length%SWATCH.length]};
  const body=`${field('Nome',`<input name="name" value="${esc(d.name)}" maxlength="30" placeholder="Ex.: Cristina">`)}
    <fieldset><legend>Cor da etiqueta</legend><div class="seg" style="border:0;gap:8px;margin-top:6px">${SWATCH.map(s=>`<label style="flex:0 0 36px"><input type="radio" name="color" value="${s}" ${s===d.color?'checked':''}><span style="background:${s};height:36px;padding:0;border-radius:10px;border:3px solid var(--surface)" aria-label="Cor ${s}"></span></label>`).join('')}</div></fieldset>`;
  openModal({title:p?'Editar pessoa':'Nova pessoa',body,onSubmit:fd=>{
    const name=String(fd.get('name')).trim(); if(!name) return 'Informe o nome.';
    if(S.people.some(x=>x!==p&&noAcc(x.name)===noAcc(name))) return 'Já existe uma pessoa com esse nome.';
    const rec={id:p?p.id:'pe'+uid(),name,color:fd.get('color')||SWATCH[0]};
    if(p) S.people[S.people.indexOf(p)]=rec; else S.people.push(rec);
    commit();
  },onDelete:p?()=>{if(S.expenses.some(e=>e.who===p.id||(e.split||[]).some(x=>x.who===p.id)))return 'Há lançamentos com esta etiqueta. Mude a pessoa deles antes de excluir.';S.people=S.people.filter(x=>x.id!==p.id);if(pfilter===p.id)pfilter='todos';commit();}:null});
}
function summaryText(pid){
  const p=personOf(pid), ch=inMonth(sel).filter(c=>c.who===pid);
  const lines=ch.map(c=>`- ${c.e.desc}${c.e.kind==='parcelado'?` (${c.i+1}/${c.n})`:''}: ${money(c.amount)}${activeSplit(c.e)?` (sua parte de ${money(c.full)})`:''}`);
  return `${p.name}, gastos de ${mShort(sel)}:\n${lines.join('\n')}\nTotal: ${money(r2(ch.reduce((s,c)=>s+c.amount,0)))}`;
}
async function copySummary(pid){
  const text=summaryText(pid);
  try{await navigator.clipboard.writeText(text);toast('Resumo copiado.');}
  catch(e){openModal({title:'Resumo para enviar',submit:'Fechar',body:`<textarea class="copy" readonly aria-label="Resumo">${esc(text)}</textarea>`,onSubmit:()=>{}});const t=modalEl.querySelector('textarea');if(t){t.focus();t.select();}}
}
function cardForm(id){
  const c=id?cardOf(id):null; const d=c||{name:'',limit:'',closing:5,due:12,color:SWATCH[S.cards.length%SWATCH.length]};
  const body=`${field('Nome do cartão',`<input name="name" value="${esc(d.name)}" maxlength="30" placeholder="Ex.: Nubank">`)}
    ${field('Limite total',`<input name="limit" inputmode="decimal" value="${d.limit===''?'':fmtIn(d.limit)}" placeholder="0,00">`)}
    <div class="two">${field('Dia de fechamento',`<input name="closing" type="number" min="1" max="31" value="${d.closing}">`,'Compras depois desse dia vão para a fatura seguinte.')}${field('Dia de vencimento',`<input name="due" type="number" min="1" max="31" value="${d.due}">`)}</div>
    <fieldset><legend>Cor</legend><div class="seg" style="border:0;gap:8px;margin-top:6px">${SWATCH.map(s=>`<label style="flex:0 0 36px"><input type="radio" name="color" value="${s}" ${s===d.color?'checked':''}><span style="background:${s};height:36px;padding:0;border-radius:10px;border:3px solid var(--surface)" aria-label="Cor ${s}"></span></label>`).join('')}</div></fieldset>`;
  openModal({title:c?'Editar cartão':'Novo cartão',body,onSubmit:fd=>{
    const name=String(fd.get('name')).trim(), limit=parseMoney(fd.get('limit')), closing=parseInt(fd.get('closing')), due=parseInt(fd.get('due'));
    if(!name) return 'Dê um nome ao cartão.'; if(!(limit>0)) return 'Informe o limite.';
    if(!(closing>=1&&closing<=31)||!(due>=1&&due<=31)) return 'Dias de 1 a 31.';
    const rec={id:c?c.id:'c'+uid(),name,limit,closing,due,color:fd.get('color')||SWATCH[0]};
    if(c) S.cards[S.cards.indexOf(c)]=rec; else S.cards.push(rec);
    commit();
  },onDelete:c?()=>{if(S.expenses.some(e=>e.method===c.id))return 'Há lançamentos neste cartão. Mude a forma de pagamento deles antes de excluir.';S.cards=S.cards.filter(x=>x.id!==c.id);commit();}:null});
}
function incForm(id){
  const i=id?S.income.find(x=>x.id===id):null; const d=i||{desc:'',amount:'',kind:'mensal',month:sel,day:5};
  const body=`${field('Descrição',`<input name="desc" value="${esc(d.desc)}" maxlength="60" placeholder="Ex.: Salário">`)}
    ${field('Valor',`<input name="amount" inputmode="decimal" value="${d.amount===''?'':fmtIn(d.amount)}" placeholder="0,00">`)}
    <fieldset><legend>Frequência</legend>${seg('kind',[['mensal','Todo mês'],['unica','Só uma vez']],d.kind)}</fieldset>
    <div id="w-month">${field('Mês',`<input name="month" type="month" value="${esc(d.month||sel)}">`)}</div>`;
  openModal({title:i?'Editar renda':'Nova renda',body,onChange:f=>{f.querySelector('#w-month').hidden=f.elements.kind.value!=='unica';},onSubmit:fd=>{
    const desc=String(fd.get('desc')).trim(), amount=parseMoney(fd.get('amount')), kind=fd.get('kind');
    if(!desc) return 'Dê um nome à renda.'; if(!(amount>0)) return 'Informe um valor maior que zero.';
    if(kind==='unica'&&!fd.get('month')) return 'Informe o mês.';
    const rec={id:i?i.id:uid(),desc,amount,kind,month:kind==='unica'?fd.get('month'):'',day:d.day||5};
    if(i) S.income[S.income.indexOf(i)]=rec; else S.income.push(rec);
    commit();
  },onDelete:i?()=>{S.income=S.income.filter(x=>x.id!==i.id);commit();}:null});
}
function projForm(id){
  const p=id?S.projects.find(x=>x.id===id):null; const d=p||{name:'',target:'',deadline:dateOf(addM(CUR,12),1),monthly:''};
  const body=`${field('Nome do projeto',`<input name="name" value="${esc(d.name)}" maxlength="50" placeholder="Ex.: Reserva de emergência">`)}
    <div class="two">${field('Valor da meta',`<input name="target" inputmode="decimal" value="${d.target===''?'':fmtIn(d.target)}" placeholder="0,00">`)}${field('Prazo',`<input name="deadline" type="month" value="${esc(d.deadline?d.deadline.slice(0,7):'')}">`)}</div>
    ${field('Aporte mensal planejado',`<input name="monthly" inputmode="decimal" value="${d.monthly===''?'':fmtIn(d.monthly)}" placeholder="0,00">`,'Quanto da renda de cada mês vai para este projeto.')}
    ${p?'':field('Já guardado (opcional)',`<input name="initial" inputmode="decimal" placeholder="0,00">`)}`;
  openModal({title:p?'Editar projeto':'Novo projeto',body,onSubmit:fd=>{
    const name=String(fd.get('name')).trim(), target=parseMoney(fd.get('target')), dl=fd.get('deadline'), monthly=fd.get('monthly')?parseMoney(fd.get('monthly')):0;
    if(!name) return 'Dê um nome ao projeto.'; if(!(target>0)) return 'Informe o valor da meta.'; if(isNaN(monthly)||monthly<0) return 'Aporte mensal inválido.';
    const rec={id:p?p.id:'p'+uid(),name,target,deadline:dl?dl+'-01':'',monthly,contribs:p?p.contribs:[]};
    if(!p){const ini=fd.get('initial')?parseMoney(fd.get('initial')):0;if(ini>0)rec.contribs.push({id:uid(),date:todayStr(),amount:ini,note:'Saldo inicial'});}
    if(p) S.projects[S.projects.indexOf(p)]=rec; else S.projects.push(rec);
    commit();
  },onDelete:p?()=>{S.projects=S.projects.filter(x=>x.id!==p.id);commit();}:null});
}
function contribForm(pid,sign){
  const p=S.projects.find(x=>x.id===pid); if(!p) return;
  const body=`${field(sign>0?'Quanto guardar':'Quanto retirar',`<input name="amount" inputmode="decimal" placeholder="0,00">`)}${field('Data',`<input name="date" type="date" value="${todayStr()}">`)}${field('Anotação (opcional)',`<input name="note" maxlength="60" placeholder="${sign>0?'Ex.: 13º salário':'Ex.: Emergência no carro'}">`)}`;
  openModal({title:(sign>0?'Guardar em ':'Retirar de ')+p.name,body,submit:sign>0?'Guardar':'Retirar',onSubmit:fd=>{
    const v=parseMoney(fd.get('amount')); if(!(v>0)) return 'Informe um valor maior que zero.';
    if(!/^\d{4}-\d{2}-\d{2}$/.test(fd.get('date'))) return 'Informe a data.';
    p.contribs.push({id:uid(),date:fd.get('date'),amount:r2(v*sign),note:String(fd.get('note')).trim()}); commit();
  }});
}

/* ---- export / import ---- */
async function saveFile(filename,data){
  const d=await use('downloads');
  if(!d){toast('Exportar não está disponível aqui.');return;}
  try{await d.save({filename,data});toast('Arquivo pronto.');}
  catch(e){if(e&&e.code==='declined')return;toast('Não consegui salvar o arquivo.');}
}
function exportCsv(){
  const q=s=>'"'+String(s).replace(/"/g,'""')+'"';
  const rows=[['Mês','Descrição','Categoria','De quem','Pagamento','Tipo','Parcela','Valor','Pago']];
  inMonth(sel).forEach(c=>rows.push([sel,c.e.desc,c.e.cat,pName(c.who),methodName(c.e.method),KIND[c.e.kind],c.e.kind==='parcelado'?`${c.i+1}/${c.n}`:'',fmtIn(c.amount),paid(c)?'sim':'não']));
  saveFile('caixa-'+sel+'.csv','﻿'+rows.map(r=>r.map(q).join(';')).join('\n'));
}

/* ---- events ---- */
function goTab(name){
  tab=TABS.includes(name)?name:'painel';
  try{if(location.hash!=='#'+tab) location.hash=tab;}catch(e){}
  render(); try{window.scrollTo(0,0);}catch(e){}
}
document.addEventListener('click',ev=>{
  const link=ev.target.closest('a[href^="#"]');
  if(link){ev.preventDefault();goTab(link.getAttribute('href').slice(1));return;}
  const t=ev.target.closest('[data-action]'); if(!t) return;
  const a=t.dataset.action, id=t.dataset.id;
  switch(a){
    case 'close': closeModal(); break;
    case 'account': openAccount(); break;
    case 'quick': quickForm(); break;
    case 'budgets': budgetsForm(); break;
    case 'notif': enableNotif(); break;
    case 'conflict-remote': resolveConflict(false); break;
    case 'auth-up': signUp(); break;
    case 'prev': sel=addM(sel,-1); render(); break;
    case 'next': sel=addM(sel,1); render(); break;
    case 'today': sel=CUR; render(); break;
    case 'goto': sel=t.dataset.ym; goTab('mes'); break;
    case 'filter': filter=t.dataset.f; render(); break;
    case 'pfilter': pfilter=t.dataset.f; render(); break;
    case 'new-person': personForm(); break;
    case 'edit-person': personForm(id); break;
    case 'copy-summary': copySummary(id); break;
    case 'settle-month': {const ch=inMonth(sel).filter(c=>c.who===id);const all=ch.length&&ch.every(c=>S.settled[c.key]);ch.forEach(c=>{S.settled[c.key]=!all;});commit();break;}
    case 'new-exp': expForm(null,t.dataset.kind); break;
    case 'edit-exp': expForm(id); break;
    case 'imp-fatura': impForm(id); break;
    case 'new-card': cardForm(); break;
    case 'edit-card': cardForm(id); break;
    case 'new-inc': incForm(); break;
    case 'edit-inc': incForm(id); break;
    case 'new-proj': projForm(); break;
    case 'edit-proj': projForm(id); break;
    case 'contrib': contribForm(id,Number(t.dataset.s)); break;
    case 'del-contrib': {const p=S.projects.find(x=>x.id===t.dataset.pid);if(p){p.contribs=p.contribs.filter(c=>c.id!==id);commit();}break;}
    case 'end-fixo': {const e=S.expenses.find(x=>x.id===id);if(e){e.end=CUR;commit();toast('Encerrado: vale até '+mShort(CUR)+'.');}break;}
    case 'pay-card': inMonth(sel).filter(c=>c.e.method===id).forEach(c=>{S.paid[c.pkey]=t.dataset.v==='1';}); commit(); break;
    case 'clear-demo': confirmModal('Limpar exemplos','Isso remove todos os dados de exemplo e deixa o app vazio para você começar.','Limpar',()=>{S=emptyState();commit();}); break;
    case 'reset': confirmModal('Apagar tudo','Isso apaga cartões, lançamentos, renda e projetos. Faça um backup antes, se quiser guardar.','Apagar tudo',()=>{S=emptyState();commit();}); break;
    case 'export-csv': exportCsv(); break;
    case 'export-json': saveFile('meu-caixa-backup.json',JSON.stringify(S,null,2)); break;
    case 'import': document.getElementById('fileIn').click(); break;
  }
});
document.addEventListener('change',ev=>{
  const t=ev.target;
  if(t.dataset&&t.dataset.action==='paid'){S.paid[t.dataset.key]=t.checked;commit();}
  if(t.dataset&&t.dataset.action==='settled'){S.settled[t.dataset.key]=t.checked;commit();}
});
document.getElementById('fileIn').addEventListener('change',ev=>{
  const f=ev.target.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=()=>{try{const o=JSON.parse(r.result);if(!o||!Array.isArray(o.expenses)||!Array.isArray(o.cards))throw new Error('x');
    S=ensureState(Object.assign(emptyState(),o,{demo:false}));commit();toast('Backup restaurado.');}catch(e){toast('Arquivo inválido. Use um backup JSON do Meu Caixa.');}};
  r.readAsText(f); ev.target.value='';
});
document.addEventListener('keydown',ev=>{if(ev.key==='Escape')closeModal();});
const TABS=['painel','mes','cartoes','parcelas','pessoas','fixos','projetos'];
function route(){const h=location.hash.replace('#','');tab=TABS.includes(h)?h:'painel';render();}
window.addEventListener('hashchange',route);

route();
window.addEventListener("load",()=>{initCloud();notifyDues();});
if("serviceWorker" in navigator&&location.protocol!=="file:"){window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));}
