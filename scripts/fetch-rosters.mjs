// Fetches team rosters from Fantasy Helper's public roster pages
// (https://fantasyhelper.net/Yahoo/<gameId>.l.<leagueId>/<gameId>.l.<leagueId>.t.<n>/roster)
// and writes data/rosters.json. Unlike scores/standings, these specific pages are
// viewable without logging in -- confirmed by checking multiple teams directly --
// so this is a legitimate stopgap for roster display until Yahoo API access is
// approved. It does NOT touch scores, standings, or matchup results, which stay
// on manual entry since every source for that data requires a real login.
//
// Usage: node scripts/fetch-rosters.mjs

import { readFile, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

const GAME_ID = process.env.FANTASYHELPER_GAME_ID || "470";
const LEAGUE_ID = process.env.LEAGUE_ID || "529714";

const teamsConfig = JSON.parse(
  await readFile(path.join(rootDir, "config", "teams.json"), "utf8")
);

function decodeHtmlEntities(str) {
  return str
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseRosterHtml(html) {
  const cards = html.split('<div class="d-flex justify-content-between">').slice(1);

  return cards
    .map((chunk) => {
      const posMatch = chunk.match(/roster-position[\s\S]*?<h5[^>]*>\s*([^<]+?)\s*<\/h5>/);
      const nameMatch = chunk.match(/<h5 class="mb-0 d-flex">\s*([^<]+?)\s*<\/h5>/);
      const teamPosMatch = chunk.match(
        /<small class="text-nowrap ms-2 text-end">\s*<p class="mb-1">([^<]*)<\/p>\s*<p class="mb-0">([^<]*)<\/p>/
      );
      const statusMatch = chunk.match(/data-bs-content="([^"]+)"/);

      if (!nameMatch) return null;

      return {
        name: decodeHtmlEntities(nameMatch[1].trim()),
        position: posMatch ? posMatch[1].trim() : (teamPosMatch ? teamPosMatch[2].split(",")[0].trim() : "—"),
        nflTeam: teamPosMatch ? teamPosMatch[1].trim().toUpperCase() : "",
        status: statusMatch ? decodeHtmlEntities(statusMatch[1].trim()) : null,
      };
    })
    .filter(Boolean);
}

const rosters = {};

for (const team of teamsConfig.teams) {
  if (!team.fantasyHelperTeamId) {
    console.warn(`Skipping ${team.team} -- no fantasyHelperTeamId configured.`);
    continue;
  }

  const url = `https://fantasyhelper.net/Yahoo/${GAME_ID}.l.${LEAGUE_ID}/${GAME_ID}.l.${LEAGUE_ID}.t.${team.fantasyHelperTeamId}/roster`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; league-tracker-bot/1.0)" },
  });

  if (!res.ok) {
    console.warn(`Failed to fetch roster for ${team.team}: HTTP ${res.status}`);
    continue;
  }

  const html = await res.text();
  rosters[team.team] = parseRosterHtml(html);
  console.log(`${team.team}: ${rosters[team.team].length} players`);
}

await writeFile(
  path.join(rootDir, "data", "rosters.json"),
  JSON.stringify(rosters, null, 2) + "\n"
);

console.log(`\nWrote data/rosters.json for ${Object.keys(rosters).length} teams.`);
