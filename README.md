# Nutri (alpha)

Nutrition tracking with barcode scanning, a product database, and charts. Whoop data is simulated by a built-in mock API.

## Stack
- **Server:** Node 18+, Express, MongoDB (Mongoose), JWT, Google OAuth 2.0 / OpenID Connect (Passport)
- **Client:** React + Vite, Chart.js (react-chartjs-2), ZXing barcode scanning
- **External:** Open Food Facts for barcode lookups. Results are cached in our product DB.

## Run locally
```bash
docker compose up -d                 # MongoDB on :27017
cp server/.env.example server/.env   # set JWT_SECRET; Google creds optional
npm install
npm run seed                         # sample products
npm run dev                          # API :5000, web :5173
```
Google sign-in shows up only when `GOOGLE_CLIENT_ID`/`SECRET` are set. Authorized redirect URI:
`http://localhost:5000/api/auth/google/callback`. Email/password login always works.

Camera scanning needs HTTPS or `localhost`. To test on a phone, use an HTTPS tunnel, or type the barcode in by hand.

## Test on your phone (iPhone)
The camera (barcode and label scanning) needs HTTPS, so open the app on your phone through an HTTPS tunnel:
```bash
npm run dev          # terminal 1
npm run tunnel       # terminal 2: prints https://<random>.trycloudflare.com  (needs cloudflared on PATH)
```
On the iPhone, open the URL in **Safari** → Share → **Add to Home Screen**. Nutri then runs full-screen like an app.
- The quick-tunnel URL changes every time it restarts. For a permanent address, use a named Cloudflare tunnel (needs a domain) or a free ngrok static domain, or deploy (see below).
- The tunnel only works while your laptop is on and running the app.
- Whoop keeps syncing server-side. Reconnecting Whoop from the phone needs the tunnel URL + `/api/whoop/callback` registered as a Redirect URI in the Whoop dashboard, and `WHOOP_REDIRECT_URI`/`CLIENT_URL` set to it.
- Internal names (database `fullcoach`, token-encryption label) intentionally keep the old name, so existing data and Whoop tokens keep working.

## API
| Method | Path | Notes |
|---|---|---|
| POST | /api/auth/register, /api/auth/login | email/password → JWT |
| GET | /api/auth/google | OAuth 2.0 / OIDC flow |
| GET/PUT | /api/auth/me, /api/auth/preferences | profile, macro goals |
| GET | /api/products?search= | text search |
| GET | /api/products/barcode/:code | local DB, then Open Food Facts |
| POST | /api/products | user-submitted product |
| GET/POST/PATCH/DELETE | /api/nutrition | food log; `planned: true` = meal plan |
| GET | /api/nutrition/summary?days=7&tz= | per-day totals for charts |
| GET | /api/whoop/status | connection state, last sync |
| POST | /api/whoop/connect | returns Whoop authorize URL |
| GET | /api/whoop/callback | OAuth redirect target (register this at Whoop) |
| POST | /api/whoop/sync `{days}` | manual sync |
| DELETE | /api/whoop/connection?purge=true | revoke at Whoop; optionally delete synced data |
| GET | /api/whoop/days?days=14 | per-day data: real if connected, mock otherwise |

## Whoop integration (API v2)
1. Go to https://developer-dashboard.whoop.com, sign in with your Whoop account, and create a Team and an App.
   - Scopes: `read:recovery read:cycles read:sleep read:workout read:profile`. The app always requests `offline` so it gets a refresh token.
   - Redirect URI: `http://localhost:5000/api/whoop/callback`
2. Put the Client ID and Secret in `server/.env` (`WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, `WHOOP_REDIRECT_URI`).
3. Restart the server, open Overview, and click **Connect** at the bottom. The last 30 days are backfilled.
   After that, the server re-syncs the last 3 days every `WHOOP_SYNC_MINUTES` (default 30).

New apps are on Whoop's **Sandbox** tier, which allows up to 10 members with no approval. See Whoop's App Approval docs for higher tiers.

How it works:
- `services/whoopClient.js` handles OAuth, token refresh, paging and 429 backoff. Refreshes for a user run one at a time, because each refresh invalidates the previous refresh token.
- `services/whoopSync.js` stores one `WhoopDay` per cycle, keyed by the cycle's local start date. Naps are excluded from sleep, and workouts are attached to the cycle they started in.
- Tokens are encrypted at rest with AES-256-GCM (`TOKEN_ENCRYPTION_KEY`).
- `/api/mock/whoop/*` still exists. `/api/whoop/days` uses the mock when no account is connected.
- No webhooks yet; they need a public HTTPS URL. Polling covers a single user.

## Fuel Score (`server/src/services/fuelScore.js`)
A 0–100 daily score that weighs **how much** you ate and **what** you ate:

| Component | Max | Rule |
|---|---|---|
| Energy balance | 25 | Intake vs target. Target = Whoop calories burned × goal (lose 0.85 / maintain 1 / gain 1.1). Today uses the 7-day average burn; with no Whoop data it falls back to the calorie goal. Full points within ±7%, zero at ±35%. While the day is in progress, only going over is penalized. |
| Protein | 15 | vs protein goal |
| Whole foods | 25 | Share of calories from whole/minimally processed foods vs ultra-processed (NOVA 1–4) |
| Plants | 15 | Servings of vegetables, fruit and legumes (80 g each), target 5 |
| Fiber | 10 | vs 14 g per 1000 kcal (min 25 g) |
| Limits | 10 | Saturated fat <10% kcal, added sugar <10% kcal, sodium <2300 mg |

NOVA comes from Open Food Facts when available; otherwise it's estimated from the food group (`utils/foodQuality.js`).
`services/coach.js` turns the score into up to 4 specific tips (naming the foods responsible), ranked by points lost and including Whoop context (low recovery, under-fueling on high-strain days).
API: `GET /api/fuel/day?date=&tz=`, `GET /api/fuel/history?days=&tz=`.

## Product database
- **Plain foods:** about 12.5k generic foods from USDA FoodData Central (SR Legacy + FNDDS, public domain), with household portions ("1 cup", "1 steak"), food group, estimated NOVA level and micronutrients. Import or refresh with `npm run import:usda --workspace=server` (downloads ~17 MB, cached in `~/.cache/fullcoach`).
- **Search ranking:** plain, simple names where the query is the main food come first. Ultra-processed and restaurant entries rank lower, and foods you've logged before get promoted. If no food matches every word, search falls back to any word and weights the last word (the food itself) more.
- **Brands:** searched separately in Open Food Facts (`GET /api/products/external`). It uses their newer search API and falls back to the legacy one; picking a result imports it.
- Unknown barcode: take a photo of the nutrition label. Tesseract.js reads it in the browser and `client/src/utils/labelParser.js` parses EU/US/Spanish labels, including the common OCR mistake of reading "g" as "9". The user reviews the values and saves; the product is shared (source `label`, unverified) so the next scan of that barcode is instant.

## Saved meals & meal prep (`/api/dishes`)
- A dish stores the ingredients for the whole batch, plus how many `portions` it makes and an optional `cookedWeight`.
- `POST /api/dishes/:id/log { mealType, portions | grams, days: [{ date, planned }] }` logs it on up to 31 days at once. Future days are saved as planned.
- Each serving becomes one entry per ingredient, all sharing `dish.group`, so the Fuel Score sees the real ingredients. `PATCH` or `DELETE /api/nutrition/group/:group` marks a serving eaten or removes it as a unit.

## Goals & weekly review
- **Objectives** (`/api/objectives`): weight, protein, plants, ultra-processed share, Fuel score and recovery. Each type has one active objective, measured over the last 7 complete days and compared with the 7 before.
- **Weight goal:** manual weigh-ins (`/api/objectives/weighins`), smoothed as a 7-day average. It's converted into a daily calorie adjustment (7,700 kcal per kg) at a safe pace: losing ≤1% of body weight per week (max 1 kg), gaining ≤0.5 kg per week, deficit ≤25%, intake never below 1,200 kcal. Unsafe deadlines are capped and shown with a realistic finish date.
- **Weekly review** (`GET /api/fuel/weekly`): Fuel score trend explained by the component that moved most, recovery trend, food → next-day recovery patterns over 4 weeks, objectives that are behind, and logging consistency. Recovery-based insights only appear with real Whoop data, never with simulated data.
- Like the daily coach, it's entirely rule-based (`services/weekly.js`), with no AI.

## Scaling notes
- `NutritionEntry` is indexed `{user, date}`. `{ user: 'hashed' }` works as a shard key.
- Products use a text index. For a large catalog, move to Atlas Search or Elasticsearch.
- Macros are computed server-side from the product, so logged values stay consistent.

## Not done yet
No automated test suite in the repo (the Whoop integration was tested by hand against a fake Whoop server), no rate limiting, no app refresh tokens, and no product moderation. Products added by users are visible to everyone and unverified.
