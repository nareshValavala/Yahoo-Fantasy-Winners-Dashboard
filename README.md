# Yahoo Fantasy NFL Tracker

A fully automated, free dashboard for league **529714**: weekly high-score winners and each team's accumulated cash, computed straight from Yahoo's scores — no manual entry.

**How it works:** a GitHub Actions job runs every Tuesday and Wednesday morning, refreshes a Yahoo API token, pulls standings + weekly scores, computes winners/cash, and commits the result to [`data/league.json`](data/league.json). The static site in [`index.html`](index.html) just reads that file — no server, no database, hosted free on GitHub Pages.

## One-time setup

### 1. Create a Yahoo app

- Go to https://developer.yahoo.com/apps/ and create an app.
- Enable **Fantasy Sports** with **Read** access.
- Set the redirect URI to `oob` (out-of-band — Yahoo displays the code on screen instead of redirecting to a server).
- Note the **Client ID** and **Client Secret**.

### 2. Get a refresh token (run locally, once)

This step needs to happen on your machine so your client secret never leaves it:

```bash
npm install
YAHOO_CLIENT_ID=xxx YAHOO_CLIENT_SECRET=yyy node scripts/bootstrap-auth.mjs
```

Open the printed URL, log in to Yahoo, authorize the app, and paste the code it shows you back into the terminal. The script prints a `refresh_token` at the end.

### 3. Add GitHub Actions secrets

In the repo: **Settings → Secrets and variables → Actions → New repository secret**. Add:

- `YAHOO_CLIENT_ID`
- `YAHOO_CLIENT_SECRET`
- `YAHOO_REFRESH_TOKEN` (from step 2)

### 4. Enable GitHub Pages

**Settings → Pages → Source: Deploy from a branch → Branch: `main` / `root`**.

### 5. Run the workflow once

**Actions tab → Update League Data → Run workflow**. This populates `data/league.json` for the first time. After that it runs automatically every Tuesday/Wednesday morning.

### 6. Create your admin token (for editing dues on the live site)

The dashboard is read-only for everyone except you. To get editable "Paid?" checkboxes:

1. Go to https://github.com/settings/personal-access-tokens/new (fine-grained tokens).
2. **Repository access** → Only select repositories → this repo.
3. **Permissions** → Repository permissions → set **Contents: Read and write** and **Actions: Read and write**. Leave everything else as No access.
4. Generate the token and copy it.
5. On the live site, paste it into the **Admin** bar at the top and click **Unlock Admin**.

The token is stored only in your own browser's `localStorage` — it's never sent anywhere except directly from your browser to GitHub's API, and never committed to the repo. Toggling a "Paid?" checkbox commits the change to `config/teams.json` and triggers an on-demand run of the workflow, so the public page catches up within a minute or two. If the token ever leaks or you're done using it, revoke it from the same GitHub settings page.

## Payouts

Configured in [`config/payouts.json`](config/payouts.json):

| Category | Amount |
|---|---|
| Weekly high score (weeks 1-14) | $20/week |
| 1st place | $400 |
| 2nd place | $200 |
| 3rd place | $120 |

Placement cash is only credited once Yahoo marks the season `is_finished`. To change these amounts, edit the JSON file and either wait for the next scheduled run or trigger the workflow manually.

## Notes

- If Yahoo ever rotates the refresh token, the workflow logs a warning with the new value — update the `YAHOO_REFRESH_TOKEN` secret if that happens.
- A tied weekly high score splits that week's prize evenly between the tied teams.
- Next season: update `LEAGUE_ID` in `.github/workflows/update-league-data.yml` if Yahoo assigns a new league ID.
