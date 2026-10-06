# Nutri: notes for coding agents

Nutri is a private alpha (fewer than 10 invited users) nutrition-coaching app that uses WHOOP data.
Live: https://nutri-5wvd.onrender.com (Render, free) · DB: MongoDB Atlas · Repo: github.com/KenjiPondal/nutri

## Workflow: "improvements"
When the owner reports issues or says "improvements":
1. Fix each item (ask only if it's genuinely ambiguous).
2. Test it: `npm run build`, plus a targeted API or browser check (Playwright lives in /tmp/opencode/shot if present).
3. Commit with a clear message, then push to `main`:
   `GIT_SSH_COMMAND="ssh -i ~/.ssh/nutri_github -o IdentitiesOnly=yes" git push origin main`
   (deploy key; never change the global git config; commit with `-c user.name="Juan Pondal" -c user.email="pondaljuan@gmail.com"`).
4. Tell the owner what changed. They redeploy on Render (Manual Deploy → latest commit), or it auto-deploys.
Before every commit, check that no secret from `server/.env` is staged.

## Stack
- `client/`: React + Vite, plain CSS (`client/src/styles/index.css`), system font, warm dark theme.
- `server/`: Express + Mongoose, ESM. Entry `server/src/index.js`.
- Local dev: `npm run dev` (API :5000, web :5173 with an `/api` proxy). Node and MongoDB binaries live in `~/.local/node` and `~/.local/mongodb`.

## Rules that matter
- **Numeric inputs:** always use `client/src/components/DecimalInput.jsx`, never `<input type="number">`. iOS keypads type "," in many regions.
- **WHOOP refresh tokens are single-use.** Only ONE running copy (Render) may hold a WHOOP connection. Never connect WHOOP from local dev against the production DB, and never "Disconnect" (revoke) from a local copy.
- Internal names `fullcoach` (local DB name, dev crypto label) are intentionally kept. Changing them breaks existing data or tokens.
- Production requires `MONGODB_URI`, `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`. Sign-up is invite-only via `ALLOWED_EMAILS`.
- Meal text parsing: AI (Gemini, `services/aiMeal.js`) when `GEMINI_API_KEY` is set, otherwise the rule-based fallback (`mealParser.js`). Nutrition numbers must always come from the DB, never from the model.
- Coaching is rule-based (`server/src/services/coach.js`, `weekly.js`). Never show recovery-based insights on simulated WHOOP data.
- Keep the medical disclaimer and the Open Food Facts (ODbL) / USDA attribution intact.
- Security middleware lives in `server/src/middleware/security.js` (sanitizer, rate limits, CSP). The CSP allows jsDelivr and tessdata for label OCR; re-test OCR after any CSP change.

## Roadmap (owner's intent)
Prove the concept with a few testers → then Garmin / Apple Health integrations → native iOS and Android apps.
