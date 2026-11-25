# backrooms-gemini-proxy-v2

Game Master proxy (Render) for the Backrooms game. POST /chat -> Gemini via its
OpenAI-compatible endpoint, rotating through the key pool on 429/503 (and skipping
dead keys on 401/403). GET / -> {"ok":true,"service":"backrooms-gemini-proxy-v2"}.
GET /health -> {"ok":true}.

Env vars (set only in the Render dashboard, never in this repo):
- GEMINI_KEYS (required, comma-separated list of Gemini API keys)
- GEMINI_MODEL (default gemini-3.8-flash)
- GEMINI_BASE_URL (default https://generativelanguage.googleapis.com/v1beta/openai)

No dependencies; Node >= 18 (global fetch). Same /chat contract as
backrooms-premium-proxy, only the upstream differs.
