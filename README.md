# StudyFlow + Gemini (Google AI Studio)

Papka tarkibi:
- `index.html` — sayt (frontend)
- `api/quiz.js` — Gemini bilan gaplashadigan kichik server funksiyasi (Vercel)

## Ishga tushirish
1. https://aistudio.google.com/apikey sahifasida **API key** oling.
2. Papkani GitHub'ga yuklang va https://vercel.com da **New Project** orqali ulang
   (yoki papkada `npx vercel` buyrug'ini ishga tushiring).
3. Vercel: **Settings → Environment Variables** ga qo'shing:
   - `GEMINI_API_KEY` = olgan kalitingiz
   - (ixtiyoriy) `GEMINI_MODEL` = boshqa model nomi, standart: `gemini-2.5-flash`
4. **Redeploy** qiling. Saytda *AI Test* bo'limida "✨ AI ulangan: Gemini" yozuvi chiqadi.

Mahalliy sinash: `npx vercel dev` (papkada `.env` fayl yarating: `GEMINI_API_KEY=...`).

## Muhim
- Kalitni hech qachon `index.html` ichiga yozmang, faqat Environment Variables'da turadi.
- Funksiya hamma uchun ochiq, shuning uchun kalitingiz limitini Google AI Studio'da kuzatib boring.
- AI ishlamasa, sayt o'zi demo rejimga o'tadi.
