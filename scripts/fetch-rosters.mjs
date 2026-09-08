// Fetches team rosters (with player photos) and team logos from Fantasy
// Helper's public pages and writes data/rosters.json. Unlike scores,
// standings, or matchup results -- which every source gates behind a real
// login -- these specific pages are viewable without logging in, confirmed
// by checking multiple teams directly. This is a stopgap for roster/branding
// display only, until Yahoo API access is approved; it does not touch
// scores or standings, which stay on manual entry.
//
// Usage: node scripts/fetch-rosters.mjs

import { readFile, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

const GAME_ID = process.env.FANTASYHELPER_GAME_ID || "470";
const LEAGUE_ID = process.env.LEAGUE_ID || "529714";
const FETCH_HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; league-tracker-bot/1.0)" };

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
      const photoMatch = chunk.match(/class="group-item-logo[^"]*"\s+src="([^"]+)"/);

      if (!nameMatch) return null;

      return {
        name: decodeHtmlEntities(nameMatch[1].trim()),
        position: posMatch ? posMatch[1].trim() : (teamPosMatch ? teamPosMatch[2].split(",")[0].trim() : "—"),
        nflTeam: teamPosMatch ? teamPosMatch[1].trim().toUpperCase() : "",
        status: statusMatch ? decodeHtmlEntities(statusMatch[1].trim()) : null,
        photoUrl: photoMatch ? photoMatch[1] : null,
      };
    })
    .filter(Boolean);
}

function parseTeamLogo(html) {
  const managerSection = html.split(">Manager<")[1];
  if (!managerSection) return null;
  const match = managerSection.match(/<img src="([^"]+)"/);
  return match ? match[1] : null;
}

const rosters = {};

for (const team of teamsConfig.teams) {
  if (!team.fantasyHelperTeamId) {
    console.warn(`Skipping ${team.team} -- no fantasyHelperTeamId configured.`);
    continue;
  }

  const base = `https://fantasyhelper.net/Yahoo/${GAME_ID}.l.${LEAGUE_ID}/${GAME_ID}.l.${LEAGUE_ID}.t.${team.fantasyHelperTeamId}`;

  const [teamRes, rosterRes] = await Promise.all([
    fetch(base, { headers: FETCH_HEADERS }),
    fetch(`${base}/roster`, { headers: FETCH_HEADERS }),
  ]);

  let logoUrl = null;
  if (teamRes.ok) {
    logoUrl = parseTeamLogo(await teamRes.text());
  } else {
    console.warn(`Failed to fetch team page for ${team.team}: HTTP ${teamRes.status}`);
  }

  let players = [];
  if (rosterRes.ok) {
    players = parseRosterHtml(await rosterRes.text());
  } else {
    console.warn(`Failed to fetch roster for ${team.team}: HTTP ${rosterRes.status}`);
  }

  rosters[team.team] = { logoUrl, players };
  console.log(`${team.team}: ${players.length} players, logo ${logoUrl ? "found" : "missing"}`);
}

await writeFile(
  path.join(rootDir, "data", "rosters.json"),
  JSON.stringify(rosters, null, 2) + "\n"
);

console.log(`\nWrote data/rosters.json for ${Object.keys(rosters).length} teams.`);
