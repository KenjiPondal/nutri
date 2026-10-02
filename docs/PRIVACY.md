# Nutri Privacy Policy

_Last updated: October 2, 2026_

Nutri is a nutrition-coaching app in private alpha. It is invite-only and used by its developer and a few (fewer than 10) invited testers.

**Not medical advice.** Nutri gives general nutrition guidance. It is not a medical device and does not diagnose or treat any condition. Consult a doctor or registered dietitian before changing your diet, especially if you are pregnant or breastfeeding, under 18, have a medical condition, or have a history of disordered eating.

## What we collect
- **Account info:** your name, email address, and password (stored as a one-way hash). If you sign in with Google: your name, email, and profile picture.
- **Nutrition data you enter:** foods, quantities, meals, planned meals, notes, and nutrition goals.
- **Products you add:** product names, barcodes, and nutrition facts. Products you add are visible to other Nutri users.
- **WHOOP data (only if you connect your WHOOP account):** recovery, heart rate variability, resting heart rate, SpO2, skin temperature, sleep, strain, energy expenditure, workouts, and your basic WHOOP profile (name and email).

## How we use it
Only to show you your own data: dashboards, charts, and comparisons between your nutrition and your WHOOP metrics. We do **not** sell your data, share it with third parties, use it for advertising, or use it to train AI models.

## Third parties
- **WHOOP:** we read your data through WHOOP's official API, only after you authorize it. You can disconnect at any time.
- **Open Food Facts:** when you search brands or scan an unknown barcode, the search text or barcode (nothing about you) is sent to Open Food Facts. Branded product data is from Open Food Facts under the Open Database License (ODbL); generic foods are from USDA FoodData Central (public domain).
- **Hosting:** Render (application) and MongoDB Atlas (database).
- **Google:** only if you choose "Continue with Google" to sign in.

## Storage and security
Data is stored in a MongoDB Atlas database. All traffic uses HTTPS. Passwords are hashed with bcrypt and WHOOP access tokens are encrypted at rest (AES-256-GCM). Sign-in attempts are rate-limited.

## Your choices
- **Disconnect WHOOP:** use "Disconnect" in the app. This revokes our access at WHOOP, and you can choose to delete all synced WHOOP data at the same time.
- **Export your data:** Account & data → *Export my data* downloads everything as JSON.
- **Delete your account:** Account & data → *Delete my account* permanently removes your data immediately and revokes WHOOP access. You can also email us.

## Contact
Questions or deletion requests: **pondaljuan@gmail.com**
