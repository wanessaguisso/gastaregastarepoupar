// Gera supabase-config.js no build do Netlify. A chave "anon" é pública por desenho;
// nunca use aqui a senha do banco nem a chave service_role.
const fs = require('fs');
const url = process.env.SUPABASE_URL || 'https://jpbfezjhtvicuusdankd.supabase.co';
const key = process.env.SUPABASE_ANON_KEY || '';
if (/service_role/i.test(key) || (key.split('.').length === 3 && /"role"\s*:\s*"service_role"/.test(Buffer.from(key.split('.')[1], 'base64url').toString()))) {
  console.error('ERRO: essa é a chave service_role. Use a chave anon public.'); process.exit(1);
}
fs.writeFileSync('supabase-config.js',
  `window.SUPABASE_URL=${JSON.stringify(url)};\nwindow.SUPABASE_ANON_KEY=${JSON.stringify(key)};\n`);
console.log(key ? 'supabase-config.js gerado com a chave anon.' : 'Sem SUPABASE_ANON_KEY: app roda só local.');
