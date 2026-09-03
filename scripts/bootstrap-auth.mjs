// One-time local setup script. Run this yourself (never in CI) to get a
// Yahoo refresh_token, which you then save as the YAHOO_REFRESH_TOKEN
// GitHub Actions secret. Your client secret never leaves your machine.
//
// Usage (reads YAHOO_CLIENT_ID / YAHOO_CLIENT_SECRET from a .env file in the
// project root if present, otherwise from already-exported env vars):
//   node scripts/bootstrap-auth.mjs

import readline from "readline/promises";
import { stdin, stdout } from "process";

try {
  process.loadEnvFile(); // Node 20.12+/22+ — loads ./.env if present
} catch {
  // no .env file — fall back to whatever's already in the environment
}

const { YAHOO_CLIENT_ID, YAHOO_CLIENT_SECRET } = process.env;

if (!YAHOO_CLIENT_ID || !YAHOO_CLIENT_SECRET) {
  console.error(
    "Set YAHOO_CLIENT_ID and YAHOO_CLIENT_SECRET environment variables first.\n" +
      "Get them from https://developer.yahoo.com/apps/ (create an app with Fantasy Sports → Read access)."
  );
  process.exit(1);
}

const REDIRECT_URI = "oob"; // out-of-band: Yahoo shows the code on screen, no server needed

const authUrl =
  `https://api.login.yahoo.com/oauth2/request_auth?` +
  `client_id=${encodeURIComponent(YAHOO_CLIENT_ID)}&` +
  `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
  `response_type=code&` +
  `scope=fspt-r&` +
  `language=en-us`;

console.log("1. Open this URL, log in, and authorize the app:\n");
console.log(authUrl + "\n");
console.log("2. Yahoo will display a code on the page. Copy it.\n");

const rl = readline.createInterface({ input: stdin, output: stdout });
const code = (await rl.question("Paste the code here: ")).trim();
rl.close();

const tokenResponse = await fetch("https://api.login.yahoo.com/oauth2/get_token", {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    Authorization:
      "Basic " + Buffer.from(`${YAHOO_CLIENT_ID}:${YAHOO_CLIENT_SECRET}`).toString("base64"),
  },
  body: new URLSearchParams({
    grant_type: "authorization_code",
    redirect_uri: REDIRECT_URI,
    code,
  }),
});

const tokenData = await tokenResponse.json();

if (!tokenResponse.ok) {
  console.error("Token exchange failed:", tokenData);
  process.exit(1);
}

console.log("\nSuccess! Save this as the YAHOO_REFRESH_TOKEN GitHub Actions secret:\n");
console.log(tokenData.refresh_token);
console.log(
  "\n(The access_token above is short-lived and not needed — the workflow refreshes it automatically each run.)"
);
