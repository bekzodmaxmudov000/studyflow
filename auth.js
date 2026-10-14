// Supabase orqali foydalanuvchini tekshiradi.
// Vercel'da SUPABASE_URL va SUPABASE_KEY (publishable yoki anon) o'zgaruvchilari bo'lsa,
// AI funksiyalari faqat tizimga kirgan foydalanuvchilarga ishlaydi.
// O'zgaruvchilar yo'q bo'lsa, tekshiruv o'chiq (eski ochiq holat).

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
    const r = await fetch(url + '/auth/v1/user', {
      headers: { apikey: key, Authorization: 'Bearer ' + m[1] }
    });
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

module.exports = { requireUser };
