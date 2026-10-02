# Deploying Nutri (free): GitHub + MongoDB Atlas + Render

## 1. GitHub (code)
1. Create a **private** repo named `nutri` on github.com (no README/license; it must be empty).
2. On your laptop:
   ```bash
   cd ~/FullCoach
   git remote add origin https://github.com/<your-username>/nutri.git
   git push -u origin main
   ```

## 2. MongoDB Atlas (database, free M0)
1. cloud.mongodb.com → create a free **M0** cluster (pick a region near you, e.g. Frankfurt).
2. **Database Access** → add a user with a password (letters and numbers only avoids URL-encoding issues).
3. **Network Access** → *Allow access from anywhere* (`0.0.0.0/0`). Render's free plan has no fixed IP.
4. **Connect → Drivers** → copy the connection string and add the database name before `?`:
   `mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/nutri?retryWrites=true&w=majority`
5. Copy your local data into it:
   ```bash
   TARGET_URI="mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/nutri?retryWrites=true&w=majority" npm run migrate
   ```

## 3. Render (app, free)
1. render.com → sign in with GitHub → **New → Blueprint** → pick the `nutri` repo. It reads `render.yaml`.
2. Fill in the secret env vars:
   | Key | Value |
   |---|---|
   | `MONGODB_URI` | the Atlas string from step 2 |
   | `JWT_SECRET` | **same value** as in `server/.env` (keeps you logged in) |
   | `TOKEN_ENCRYPTION_KEY` | **same value** as in `server/.env` (otherwise the stored Whoop tokens can't be decrypted) |
   | `WHOOP_CLIENT_ID` / `WHOOP_CLIENT_SECRET` | same as `server/.env` |
   | `CLIENT_URL` | your Render URL, e.g. `https://nutri-abcd.onrender.com` |
   | `WHOOP_REDIRECT_URI` | `https://nutri-abcd.onrender.com/api/whoop/callback` |

   Print the local values with: `grep -E "JWT_SECRET|TOKEN_ENCRYPTION_KEY|WHOOP_CLIENT" server/.env`
3. If you only learn the URL after the first deploy, set `CLIENT_URL` / `WHOOP_REDIRECT_URI` then and click **Manual Deploy**.

## 4. Whoop dashboard
Add `https://nutri-abcd.onrender.com/api/whoop/callback` as a **Redirect URI** on your Whoop app. Keep the localhost one for local development.

## 5. Avoid a Whoop token clash (important)
Whoop refresh tokens are single-use. After migrating, the laptop and Render hold the **same** tokens, and whichever refreshes first breaks the other.
- Stop the local app (`npm run dev`) once Render is live, or point your local `.env` at a separate local database.
- **Don't press "Disconnect" on the laptop copy.** That revokes the token at Whoop for both.
- If Whoop ever shows "reconnect needed", click **Reconnect** on the Render site.

## 6. iPhone
Open the Render URL in Safari → Share → **Add to Home Screen**. Delete the old tunnel icon.

## Free-tier behaviour
- The app **sleeps after 15 min idle**; the first open after that takes ~30–60 s. Whoop re-syncs automatically when you open the app.
- Every `git push` to `main` redeploys automatically.
- Atlas M0: 512 MB storage, plenty for this app.
