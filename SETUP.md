# Influencer Hub: Setup Guide

This guide has three parts:

1. [Start the platform](#1-start-the-platform) on your computer (about 10 minutes, no Meta account needed)
2. [Get every value for the `.env` file](#2-where-every-env-value-comes-from)
3. [Connect Meta (Instagram)](#3-connect-meta-instagram) to see real data instead of demo data

Do part 1 first. The platform works fully with **demo data** until you finish part 3.

> **Keep secrets secret.** `META_APP_SECRET`, `IG_ACCESS_TOKEN`, `AUTH_SECRET`, `AUTH_GOOGLE_SECRET`,
> `TOKEN_ENCRYPTION_KEY` and `CRON_SECRET` are passwords. Never paste them in chat or email, never commit
> `.env` to Git (it is already ignored), and set them in your host's settings page when you deploy.

---

## 1. Start the platform

### What you need installed
- **Node.js 20 or newer** (check with `node --version`)
- **PostgreSQL** (this computer already has version 18)

### First time only

Open a terminal in the project folder.

**Step 1. Install the code libraries**
```
npm install
```

**Step 2. Create your settings file**

> **You already have a `.env` on this computer. Skip the copy command below, or it will overwrite your settings.**
> Only run it on a new computer where no `.env` exists.

```
copy .env.example .env
```
Open `.env` and set at least these three lines for local use:
```
DATABASE_URL="postgresql://influencer@127.0.0.1:5433/influencer_hub?schema=public"
AUTH_SECRET="<paste a generated secret, see section 2>"
AUTH_DEV_LOGIN=1
```
`AUTH_DEV_LOGIN=1` lets you sign in on your own computer with any `@demokrito.com` email and no password.
It is switched off automatically when the app runs in production.

**Step 3. Start the database.** Open a **second terminal** in the project folder and run:
```
npm run db:start
```
**Leave this window open** while you work. Closing it stops the database. (Press Ctrl+C to stop it on purpose.)

> **Starting from a brand-new computer with no `.pgdata` folder?** Create the local database once:
> ```
> "C:\Program Files\PostgreSQL\18\bin\initdb.exe" -D .pgdata -U influencer --auth=trust -E UTF8 --locale=C
> npm run db:start
> ```
> then in another terminal:
> ```
> "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h 127.0.0.1 -p 5433 -U influencer -d postgres -c "CREATE DATABASE influencer_hub;"
> ```
> Or skip all that and use a free hosted database (Neon, Supabase): create one, copy its connection URL into
> `DATABASE_URL`, and ignore `npm run db:start`.

**Step 4. Create the tables** (back in the first terminal)
```
npx prisma migrate deploy
```

### Every time you work

| Terminal | Command | Leave open? |
|---|---|---|
| 1 | `npm run db:start` | Yes (the database) |
| 2 | `npm run dev` | Yes (the website) |

Then open **http://localhost:3000**, enter `it@demokrito.com` (or any `@demokrito.com` address) under
*Development login*, and press **Sign in without Google**.

### First use

1. **Import**: upload your two Excel files. Check the column matching, review the preview, then import.
2. **Influencers**: press **Fetch Instagram data**. Until you finish part 3, this loads simulated numbers and
   every page shows an orange "Demo data" banner.
3. **Dashboard**, **Influencer pages**, **Shortlist**: explore, shortlist people, add assignments, export to Excel.

### If something goes wrong

| What you see | What to do |
|---|---|
| `Can't reach database server at 127.0.0.1:5433` | The database is not running. Start it with `npm run db:start` and keep that window open. |
| Page has no colours or layout (plain text) | Stop `npm run dev` (Ctrl+C), start it again, then hard-refresh the browser (Ctrl+Shift+R). |
| `Port 3000 is in use` / "another dev server is running" | A server is already running. Use it, or close its terminal window first. |
| Sign-in says "That email isn't allowed" | Use an address ending in `@demokrito.com`. |
| `Error: DATABASE_URL is not set` | Your `.env` file is missing or in the wrong folder. It must sit next to `package.json`. |

---

## 2. Where every `.env` value comes from

Open `.env` in any text editor. Values are written as `NAME="value"`.

### Values you generate yourself (no website needed)

Run each command in a terminal and paste the single line it prints.

| Variable | Command | Used for |
|---|---|---|
| `AUTH_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` | Signs login sessions |
| `TOKEN_ENCRYPTION_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | Encrypts influencers' stored Instagram tokens. **Must be exactly 64 characters. If you lose it, connected influencers must reconnect.** |
| `CRON_SECRET` | `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"` | Protects the daily auto-refresh URL |

### Values you choose

| Variable | What to put |
|---|---|
| `DATABASE_URL` | Local: `postgresql://influencer@127.0.0.1:5433/influencer_hub?schema=public`. Hosted: the connection string from Neon or Supabase (Dashboard, then Connection details). |
| `APP_URL` | The address people use to open the platform: `http://localhost:3000` on your computer, or `https://your-app.vercel.app` once deployed. It is put inside the links you send to influencers. |
| `ALLOWED_EMAIL_DOMAIN` | `demokrito.com`. Only addresses ending in this can sign in. |
| `METRICS_PROVIDER` | `mock` = simulated demo data. `graph` = real Instagram data. Change to `graph` only after part 3. |
| `META_GRAPH_VERSION` | Leave as `v23.0` unless Meta tells you it is retired. |
| `AUTH_DEV_LOGIN` | `1` on your own computer only. Leave it out when deployed. |

### Google sign-in (needed only when you deploy; not for local use)

`AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`:

1. Go to **console.cloud.google.com** and sign in with your Demokrito Google account.
2. Create a project (top bar, *New project*), for example "Influencer Hub".
3. Open **APIs & Services, then OAuth consent screen**. Choose **Internal** (this limits it to your company).
   Fill in the app name and your email, and save.
4. Open **APIs & Services, then Credentials, then Create credentials, then OAuth client ID**.
   Application type: **Web application**.
5. Under **Authorised redirect URIs** add: `https://your-app.vercel.app/api/auth/callback/google`
   (and `http://localhost:3000/api/auth/callback/google` if you want to test Google sign-in locally).
6. Press **Create**. Copy the **Client ID** into `AUTH_GOOGLE_ID` and the **Client secret** into `AUTH_GOOGLE_SECRET`.

### Meta values

`META_APP_ID`, `META_APP_SECRET`, `IG_USER_ID`, `IG_ACCESS_TOKEN`: see part 3 below. Each step says which value it gives you.

---

## 3. Connect Meta (Instagram)

### What this gives you (read this first)

Instagram only shares data through its official API, with two levels:

| | What you get | What it needs |
|---|---|---|
| **Level 1: public lookup** | For any influencer with a **Business or Creator** account: followers, posts and reels in the last 30 days, likes and comments. | One Meta app and one token of your own (steps A to E). |
| **Level 2: influencer connects** | Adds **reach, views, saves and shares**. | The influencer opens a link you send and approves. Needs Meta **App Review** (step G). |

Influencers with **personal** accounts, or whose handle is wrong, cannot be read at all. They show as
"Not readable" in the platform. Do Level 1 first; it is enough to rank influencers by activity and engagement.

> Meta changes its screens and menu names from time to time. If a button is called something slightly
> different, follow the intent of the step. Meta's own guide, "Instagram API with Facebook Login", is the
> reference if a screen has changed.

### Step A. Prepare the Instagram account that makes the lookups

Use a company Instagram account (not a personal one).

1. In the Instagram app: **Settings, then Account type and tools, then Switch to professional account**
   (choose **Business** or **Creator**).
2. Create a **Facebook Page** for the company if you do not have one (facebook.com/pages/create).
3. **Link the Instagram account to the Facebook Page**: on the Page, **Settings, then Linked accounts, then Instagram, then Connect account**.

### Step B. Create the Meta app

1. Go to **developers.facebook.com** and sign in with the Facebook account that is an **admin of the Page**.
   Accept the developer terms if asked.
2. **My Apps, then Create app**.
3. Give it a name (for example "Demokrito Influencer Hub") and your contact email.
4. When asked what you want the app to do, choose the option for **Other / Business** and the app type **Business**.
5. Open the app. Under **Add products**, add **Instagram** (choose the version that uses **Facebook Login**,
   called "Instagram API with Facebook Login") and add **Facebook Login** (or "Facebook Login for Business").

### Step C. Get `META_APP_ID` and `META_APP_SECRET`

1. In the app, open **App settings, then Basic**.
2. Copy **App ID** into `META_APP_ID`.
3. Next to **App secret** press **Show**, enter your password, and copy it into `META_APP_SECRET`.

### Step D. Get `IG_USER_ID` and `IG_ACCESS_TOKEN`

This is the token the platform uses for public lookups. You will use Meta's **Graph API Explorer** tool
(developers.facebook.com/tools/explorer).

1. In Graph API Explorer, choose **your app** at the top right.
2. Under **User or Page**, choose **Get User Access Token**.
3. Tick these permissions: `instagram_basic`, `pages_show_list`, `pages_read_engagement`
   (add `business_management` if Meta asks for it). Press **Generate Access Token** and approve the pop-ups,
   selecting your Page and its Instagram account.
4. **Make the token long-lived.** Paste this into your browser address bar, replacing the three capitals:
   ```
   https://graph.facebook.com/v23.0/oauth/access_token?grant_type=fb_exchange_token&client_id=YOUR_APP_ID&client_secret=YOUR_APP_SECRET&fb_exchange_token=THE_TOKEN_FROM_STEP_3
   ```
   The answer contains a longer-lasting `access_token`. Copy it.
5. **Get the Page token** (the type that does not expire). In Graph API Explorer, set the token to the long-lived
   one from step 4 and call:
   ```
   GET me/accounts?fields=name,access_token,instagram_business_account
   ```
   Find your Page in the result. Copy its `access_token` into **`IG_ACCESS_TOKEN`**, and copy the `id` inside its
   `instagram_business_account` into **`IG_USER_ID`**.

   **Careful: `IG_USER_ID` is the id inside `instagram_business_account`, NOT the Page's own `id`.** An Instagram
   account id has **17 digits and starts with `17841`**. A Page id is shorter (about 15-16 digits) and will not work;
   the platform then reports "IG_USER_ID is not an Instagram account id".

   If `instagram_business_account` is missing, the Instagram account is not linked to that Page (redo Step A.3).
   After linking, **generate the token again** (steps 1 to 5), and tick the Instagram account in the permission
   pop-up, otherwise the token cannot see it.

### Step E. Test it before using it

In Graph API Explorer (using the Page token), or in your browser, request a lookup of any public Business or
Creator account, for example a well-known brand:

```
GET YOUR_IG_USER_ID?fields=business_discovery.username(instagram){followers_count,media_count}
```

If you get `followers_count` back, Level 1 works. If you get an error:

| Error | Meaning |
|---|---|
| `code 190` | The token is invalid or expired. Redo Step D. |
| `code 10` or `200` (permission) | A permission is missing. Redo Step D.3 and tick all permissions. |
| `code 110 / Invalid user id` | That username is a personal account or does not exist (not a problem with your setup). |
| `code 4`, `17`, `32` | Rate limit. Wait an hour and try again. |

### Step F. Switch the platform to real data

1. In `.env` set:
   ```
   METRICS_PROVIDER=graph
   META_APP_ID="..."
   META_APP_SECRET="..."
   IG_USER_ID="..."
   IG_ACCESS_TOKEN="..."
   TOKEN_ENCRYPTION_KEY="<64 hex characters from section 2>"
   ```
2. **Remove the simulated data** so it does not mix with real posts. In a terminal:
   ```
   "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h 127.0.0.1 -p 5433 -U influencer -d influencer_hub
   ```
   then paste:
   ```sql
   DELETE FROM "Media" WHERE id LIKE 'mock\_%';
   DELETE FROM "ProfileSnapshot";
   UPDATE "Influencer" SET "eligibility" = 'UNKNOWN', "lastSyncedAt" = NULL, "followersCount" = NULL, "mediaCount" = NULL;
   \q
   ```
3. Restart `npm run dev` (Ctrl+C, then run it again). The orange "Demo data" banner disappears.
4. Open **Influencers** and press **Fetch Instagram data**. Check the **Data coverage** panel on the Dashboard:
   it shows what share of your list is readable.
5. **Check accuracy.** Pick 2 or 3 influencers, open their page in the platform, then open their Instagram profile
   and compare the number of posts and reels in the last 30 days and a few like counts. They should match.

> **Not yet verified against a live account.** The Instagram code was tested against simulated Meta responses
> only. Do step F.5 before relying on the numbers, and tell your developer if any field or metric name has changed.

### Step G. Let influencers share reach (Level 2)

Needed only if you want real reach, views, saves and shares.

1. In the Meta app, open **Facebook Login, then Settings** and add this to **Valid OAuth Redirect URIs**
   (using your real `APP_URL`):
   ```
   https://your-app.vercel.app/api/ig/callback
   ```
2. **App Review.** In **App Review, then Permissions and features**, request **Advanced access** for:
   `instagram_basic`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`.
   Meta asks for a description, a screen recording of how you use each permission, and a privacy policy URL.
   You also need **Business Verification** (App settings, then Basic, then Business verification) with your
   company documents. **This can take days to weeks.**
3. **Until it is approved**, only people with a role on your Meta app (App roles, then Roles: add them as
   Testers) can connect. This is enough to try it with one or two friendly influencers.
4. Switch the app from **Development** to **Live** (toggle at the top of the app dashboard) after approval.
5. **Send a link:** open an influencer's page in the platform, press **Create connect link**, and send them the
   link. They open it, press **Continue with Instagram**, approve, and the page confirms "You're connected".
   Their next refresh includes real reach and insights.

The influencer must have a **Business or Creator** account linked to a **Facebook Page**. The connect page
tells them if it does not work, and the link only works for the influencer it was created for.

### Token renewal

The Page token from Step D normally does not expire, but Meta can invalidate it (for example if the Facebook
password changes or someone removes the app). If sync starts failing with "Instagram access token is invalid
or expired", repeat Step D and update `IG_ACCESS_TOKEN`. Failures are listed under **Settings, then Recent sync failures**.

---

## 4. Putting it online for the team (short version)

1. Create a hosted Postgres database (Neon or Supabase) and put its URL in `DATABASE_URL`.
   Run `npx prisma migrate deploy` once with that URL.
2. Create the Google sign-in values (section 2).
3. Import this project into **Vercel** and add all the `.env` values in **Settings, then Environment Variables**.
   Do **not** set `AUTH_DEV_LOGIN`. Set `APP_URL` to the final address.
4. Deploy. A daily refresh runs automatically at 01:00 UTC.
5. In Meta (Step G.1) and Google (section 2), add the redirect URIs that use the final address.

The README has more detail on how the daily refresh and the score work.

## Quick reference: all `.env` values

| Variable | Needed for | Where it comes from |
|---|---|---|
| `DATABASE_URL` | Always | Section 1 (local) or Neon/Supabase |
| `AUTH_SECRET` | Always | Generate (section 2) |
| `AUTH_DEV_LOGIN` | Local only | Type `1` |
| `ALLOWED_EMAIL_DOMAIN` | Always | `demokrito.com` |
| `APP_URL` | Connect links, deployment | Your site address |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Deployed sign-in | Google Cloud Console |
| `METRICS_PROVIDER` | Always | `mock` or `graph` |
| `META_APP_ID` / `META_APP_SECRET` | Real data | Meta app, Step C |
| `IG_USER_ID` / `IG_ACCESS_TOKEN` | Real data | Graph API Explorer, Step D |
| `META_GRAPH_VERSION` | Real data | Leave `v23.0` |
| `TOKEN_ENCRYPTION_KEY` | Real data | Generate (section 2) |
| `CRON_SECRET` | Deployed auto-refresh | Generate (section 2) |
