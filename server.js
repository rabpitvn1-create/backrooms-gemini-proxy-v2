// backrooms-gemini-proxy-v2: Game Master proxy for the Backrooms game.
// POST /chat -> Gemini via its OpenAI-compatible endpoint, rotating through
// GEMINI_KEYS on 429/503 (exhausted/overloaded) and 401/403 (dead key).
// Keys live ONLY in the Render env var GEMINI_KEYS
// (comma-separated) — never in this repo.
const http = require('http');
const PORT = process.env.PORT || 10000;
const BASE = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/$/, '');
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const KEYS = (process.env.GEMINI_KEYS || '').split(',').map((k) => k.trim()).filter(Boolean);
let nextKey = 0;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

  if (req.method === 'GET' && req.url === '/') return send(200, { ok: true, service: 'backrooms-gemini-proxy-v2' });
  if (req.method === 'GET' && req.url === '/health') return send(200, { ok: true });

  if (req.method === 'POST' && req.url === '/chat') {
    if (!KEYS.length) return send(503, { error: { message: 'No Gemini keys configured' } });
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 1000000) req.destroy(); });
    req.on('end', async () => {
      try {
        const j = JSON.parse(body || '{}');
        const payload = {
          model: j.model || MODEL,
          messages: j.messages || [],
          temperature: j.temperature,
          max_tokens: j.max_tokens,
          response_format: j.response_format,
        };
        // Let callers cap thinking tokens (e.g. reasoning_effort 'minimal'/'low').
        if (j.reasoning_effort) payload.reasoning_effort = j.reasoning_effort;
        // Try each key once, starting round-robin. 429/503 = exhausted/overloaded,
        // 401/403 = dead key — rotate past all of them.
        const start = nextKey % KEYS.length;
        let lastStatus = 503;
        let lastData = { error: { message: 'All Gemini keys exhausted' } };
        let first429 = null;
        for (let i = 0; i < KEYS.length; i++) {
          const key = KEYS[(start + i) % KEYS.length];
          const r = await fetch(BASE + '/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
            body: JSON.stringify(payload),
          });
          const data = await r.json().catch(() => ({ error: { message: 'Upstream non-JSON response', status: r.status } }));
          if (r.status !== 429 && r.status !== 503 && r.status !== 401 && r.status !== 403) {
            nextKey = (start + i + 1) % KEYS.length;
            return send(r.status, data);
          }
          if (r.status === 429 && !first429) first429 = { status: r.status, data };
          lastStatus = r.status;
          lastData = data;
        }
        // Prefer 429 when any key hit quota, so the client retries later.
        if (first429) return send(429, first429.data);
        return send(lastStatus, lastData);
      } catch (e) {
        return send(502, { error: { message: String(e).slice(0, 200) } });
      }
    });
    return;
  }
  return send(404, { error: { message: 'Not found' } });
});
server.listen(PORT, () => console.log('gemini proxy listening on', PORT));
