// One-time local setup script. Run this yourself (never in CI) to get a
// Yahoo refresh_token, which you then save as the YAHOO_REFRESH_TOKEN
// GitHub Actions secret. Your client secret never leaves your machine.
//
// Usage (reads YAHOO_CLIENT_ID / YAHOO_CLIENT_SECRET from a .env file in the
// project root if present, otherwise from already-exported env vars):
//   node scripts/bootstrap-auth.mjs
//
// Before running: add http://localhost:8080/callback as a Redirect URI on
// your Yahoo app (developer.yahoo.com/apps). Yahoo allows localhost
// redirect URIs without domain verification, unlike "oob" or real domains.

import http from "http";
import { URL } from "url";

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

const PORT = Number(process.env.YAHOO_OAUTH_PORT) || 8080;
const REDIRECT_URI = process.env.YAHOO_REDIRECT_URI || `http://localhost:${PORT}/callback`;

const authUrl =
  `https://api.login.yahoo.com/oauth2/request_auth?` +
  `client_id=${encodeURIComponent(YAHOO_CLIENT_ID)}&` +
  `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
  `response_type=code&` +
  `scope=fspt-r&` +
  `language=en-us`;

console.log(`Make sure ${REDIRECT_URI} is registered as a Redirect URI on your Yahoo app.\n`);
console.log("Open this URL, log in, and authorize the app:\n");
console.log(authUrl + "\n");
console.log(`Waiting for the redirect back to ${REDIRECT_URI} ...`);

const code = await new Promise((resolve, reject) => {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname !== "/callback") {
      res.writeHead(404).end();
      return;
    }

    const authCode = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      error
        ? `<h2>Authorization failed: ${error}</h2><p>You can close this tab and check the terminal.</p>`
        : `<h2>Authorized!</h2><p>You can close this tab and go back to the terminal.</p>`
    );

    server.close();
    if (error) reject(new Error(error));
    else resolve(authCode);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      reject(
        new Error(
          `Port ${PORT} is already in use. Set YAHOO_OAUTH_PORT to a free port, ` +
            `register http://localhost:<port>/callback on the Yahoo app, and try again.`
        )
      );
    } else {
      reject(err);
    }
  });

  server.listen(PORT);
});

console.log("\nGot the authorization code. Exchanging it for tokens...\n");

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

console.log("Success! Save this as the YAHOO_REFRESH_TOKEN GitHub Actions secret:\n");
console.log(tokenData.refresh_token);
console.log(
  "\n(The access_token above is short-lived and not needed — the workflow refreshes it automatically each run.)"
);
