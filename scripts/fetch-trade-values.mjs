// Fetches player trade values from Dynasty Daddy's public, documented,
// no-key-required API (https://dynasty-daddy.com/help/api-documentation)
// and writes data/trade-values.json, keyed by Yahoo player id so the UI can
// join it against roster data. Per their docs, this runs at most once a day
// to respect their "cache responses, don't hammer the servers" request --
// their values only update a few times a day anyway.
//
// Usage: node scripts/fetch-trade-values.mjs

import { writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

// This is a standard (non-superflex, non-dynasty) redraft league.
const res = await fetch("https://api.dynasty-daddy.com/api/v1/values/redraft", {
  headers: { "User-Agent": "Mozilla/5.0 (compatible; league-tracker-bot/1.0)" },
});

if (!res.ok) {
  console.error(`Failed to fetch trade values: HTTP ${res.status}`);
  process.exit(1);
}

const players = await res.json();

const byYahooId = {};
for (const p of players) {
  if (!p.yahoo_id) continue;
  byYahooId[p.yahoo_id] = {
    tradeValue: p.trade_value,
    positionRank: p.position_rank,
    overallRank: p.overall_rank,
  };
}

await writeFile(
  path.join(rootDir, "data", "trade-values.json"),
  JSON.stringify(byYahooId, null, 2) + "\n"
);

console.log(`Wrote data/trade-values.json for ${Object.keys(byYahooId).length} players.`);
