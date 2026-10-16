// Vercel serverless function: StudyFlow online kompilyator (hozircha faqat C++).
// Kod bizning serverda EMAS, Judge0 xavfsiz "sandbox" xizmatida ishga tushadi.
// Standart: ommaviy https://ce.judge0.com (bepul, kalit shart emas, ammo ishlashi kafolatlanmaydi).
// Ixtiyoriy o'zgaruvchilar (Vercel -> Environment Variables):
//   JUDGE0_URL            - boshqa Judge0 manzili (masalan o'zingizning serveringiz yoki RapidAPI)
//   JUDGE0_RAPIDAPI_KEY   - RapidAPI orqali ishlatsangiz kalit
//   JUDGE0_TOKEN          - o'z serveringiz X-Auth-Token talab qilsa
//   JUDGE0_CPP_ID         - C++ til raqamini qo'lda berish (odatda kerak emas)

const BASE = String(process.env.JUDGE0_URL || 'https://ce.judge0.com').replace(/\/+$/, '');
const MAX_CODE = 64 * 1024;
const MAX_STDIN = 16 * 1024;
const MAX_OUT = 20000;
const LANGS = { cpp: { name: 'C++', match: /^C\+\+ \(GCC/i, fallbackId: 54 } };

// --- Supabase orqali foydalanuvchini tekshirish (alohida fayl kerak emas) ---
// Vercel'da SUPABASE_URL va SUPABASE_KEY o'zgaruvchilari bo'lsa, funksiya faqat tizimga kirganlarga ishlaydi.
async function requireUser(req, res) {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = String(process.env.SUPABASE_KEY || '');
  if (!url || !key) return { ok: true, open: true };
  const m = /^Bearer\s+(.+)$/i.exec(String((req.headers && req.headers.authorization) || ''));
  if (!m) {
    res.status(401).json({ error: 'unauthorized', detail: 'Kirish talab qilinadi' });
    return null;
  }
  try {
    const r = await fetch(url + '/auth/v1/user', { headers: { apikey: key, Authorization: 'Bearer ' + m[1] } });
    if (!r.ok) {
      res.status(401).json({ error: 'unauthorized', detail: 'Sessiya yaroqsiz yoki tugagan' });
      return null;
    }
    const u = await r.json();
    return { ok: true, user: { id: u.id, email: u.email } };
  } catch (e) {
    res.status(503).json({ error: 'auth_unavailable', detail: 'Kirishni tekshirib bo‘lmadi' });
    return null;
  }
}

// --- oddiy tezlik cheklovi (har bir server nusxasi uchun; to'liq himoya emas) ---
const hits = new Map();
function limited(id) {
  const now = Date.now();
  const arr = (hits.get(id) || []).filter((t) => now - t < 60000);
  if (arr.length >= 10) { hits.set(id, arr); return true; }
  arr.push(now);
  hits.set(id, arr);
  if (hits.size > 5000) hits.clear();
  return false;
}

function headers() {
  const h = { 'Content-Type': 'application/json' };
  if (process.env.JUDGE0_RAPIDAPI_KEY) {
    h['X-RapidAPI-Key'] = process.env.JUDGE0_RAPIDAPI_KEY;
    try { h['X-RapidAPI-Host'] = new URL(BASE).host; } catch (e) {}
  }
  if (process.env.JUDGE0_TOKEN) h['X-Auth-Token'] = process.env.JUDGE0_TOKEN;
  return h;
}

async function timed(url, opt, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, Object.assign({}, opt, { signal: ctl.signal })); }
  finally { clearTimeout(t); }
}

const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64');
const unb64 = (s) => (s ? Buffer.from(String(s), 'base64').toString('utf8') : '');
const cut = (s) => (s.length > MAX_OUT ? s.slice(0, MAX_OUT) + '\n… (chiqish qisqartirildi)' : s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// C++ til raqamini Judge0'dan aniqlaymiz (eng yangi GCC), topilmasa 54
const langCache = {};
async function langId(lang) {
  const L = LANGS[lang];
  if (lang === 'cpp' && process.env.JUDGE0_CPP_ID) return { id: +process.env.JUDGE0_CPP_ID, name: 'C++' };
  const c = langCache[lang];
  if (c && Date.now() - c.t < 3600e3) return c;
  try {
    const r = await timed(BASE + '/languages', { headers: headers() }, 5000);
    if (!r.ok) throw new Error(String(r.status));
    const list = await r.json();
    const ver = (n) => ((/GCC (\d+(?:\.\d+)*)/.exec(n) || [])[1] || '0').split('.').map(Number);
    const cmp = (a, b) => { for (let i = 0; i < 3; i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d; } return 0; };
    const best = list.filter((l) => L.match.test(l.name)).sort((a, b) => cmp(ver(a.name), ver(b.name))).pop();
    if (best) return (langCache[lang] = { id: best.id, name: best.name, t: Date.now() });
  } catch (e) { /* zaxira raqam ishlatiladi */ }
  return { id: L.fallbackId, name: 'C++ (GCC)' };
}

function mapStatus(s) {
  const id = s && s.id, d = (s && s.description) || '';
  if (id === 3) return 'ok';
  if (id === 6) return 'compile_error';
  if (id === 5) return 'timeout';
  if (id >= 7 && id <= 12) return 'runtime_error';
  return 'internal';
}

let health = { t: 0, ok: null, name: null };
async function providerHealth() {
  if (Date.now() - health.t < 60000 && health.ok !== null) return health;
  try {
    const l = await langId('cpp');
    const r = await timed(BASE + '/languages', { headers: headers() }, 4000);
    health = { t: Date.now(), ok: r.ok, name: l.name };
  } catch (e) { health = { t: Date.now(), ok: false, name: null }; }
  return health;
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const h = await providerHealth();
    return res.status(200).json({
      ok: true, provider: 'judge0', languages: Object.keys(LANGS),
      providerOk: h.ok, compiler: h.name, auth: !!process.env.SUPABASE_URL
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const au = await requireUser(req, res);
  if (!au) return;

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const lang = String(body.language || 'cpp');
    if (!LANGS[lang]) return res.status(400).json({ error: 'bad_language', detail: 'Hozircha faqat C++ qo‘llab-quvvatlanadi' });
    const code = typeof body.code === 'string' ? body.code : '';
    const stdin = typeof body.stdin === 'string' ? body.stdin : '';
    if (!code.trim()) return res.status(400).json({ error: 'empty_code', detail: 'Kod bo‘sh' });
    if (Buffer.byteLength(code) > MAX_CODE) return res.status(413).json({ error: 'code_too_large', detail: 'Kod 64 KB dan oshmasligi kerak' });
    if (Buffer.byteLength(stdin) > MAX_STDIN) return res.status(413).json({ error: 'input_too_large', detail: 'Kirish ma’lumoti 16 KB dan oshmasligi kerak' });

    const who = (au.user && au.user.id) || String(((req.headers && req.headers['x-forwarded-for']) || '').split(',')[0] || 'anon');
    if (limited(who)) return res.status(429).json({ error: 'too_many', detail: 'Juda tez-tez ishga tushiryapsiz. Bir daqiqada 10 martagacha mumkin' });

    const l = await langId(lang);
    let r;
    try {
      r = await timed(BASE + '/submissions?base64_encoded=true&wait=false', {
        method: 'POST', headers: headers(),
        body: JSON.stringify({
          language_id: l.id, source_code: b64(code), stdin: b64(stdin),
          cpu_time_limit: 3, wall_time_limit: 8, memory_limit: 131072
        })
      }, 8000);
    } catch (e) {
      return res.status(502).json({ error: 'provider_unreachable', detail: 'Kompilyator xizmatiga ulanib bo‘lmadi' });
    }
    if (r.status === 429) return res.status(429).json({ error: 'provider_busy', detail: 'Kompilyator xizmati band. Birozdan keyin urinib ko‘ring' });
    if (!r.ok) return res.status(502).json({ error: 'provider_error', detail: 'Kompilyator xizmati xato berdi (' + r.status + ')' });
    const sub = await r.json();
    const token = sub && sub.token;
    if (!token) return res.status(502).json({ error: 'provider_error', detail: 'Kompilyator xizmati token qaytarmadi' });

    const fields = 'stdout,stderr,compile_output,message,status,time,memory,exit_code';
    const deadline = Date.now() + 22000;
    let out = null;
    while (Date.now() < deadline) {
      await sleep(700);
      let g;
      try { g = await timed(BASE + '/submissions/' + token + '?base64_encoded=true&fields=' + fields, { headers: headers() }, 6000); }
      catch (e) { continue; }
      if (g.status === 429) { await sleep(1200); continue; }
      if (!g.ok) return res.status(502).json({ error: 'provider_error', detail: 'Natijani olib bo‘lmadi (' + g.status + ')' });
      const j = await g.json();
      if (j && j.status && j.status.id > 2) { out = j; break; }
    }
    if (!out) return res.status(504).json({ error: 'provider_timeout', detail: 'Natija kutilgan vaqtda kelmadi. Qayta urinib ko‘ring' });

    return res.status(200).json({
      status: mapStatus(out.status),
      statusText: (out.status && out.status.description) || '',
      stdout: cut(unb64(out.stdout)),
      stderr: cut(unb64(out.stderr)),
      compileOutput: cut(unb64(out.compile_output)),
      message: cut(unb64(out.message)),
      time: out.time == null ? null : Number(out.time),
      memory: out.memory == null ? null : Number(out.memory),
      exitCode: out.exit_code == null ? null : Number(out.exit_code),
      compiler: l.name
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server_error', detail: String((e && e.message) || e).slice(0, 200) });
  }
};
