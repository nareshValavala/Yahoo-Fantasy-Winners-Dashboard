// Fetches team rosters (with player photos), team logos, and current team
// names from Fantasy Helper's public pages and writes data/rosters.json,
// keyed by fantasyHelperTeamId (stable, matches Yahoo's own team_id) rather
// than by team name -- names change when a manager renames their team, but
// the id never does. Unlike scores, standings, or matchup results -- which
// every source gates behind a real login -- these specific pages are
// viewable without logging in, confirmed by checking multiple teams
// directly. This is a stopgap for roster/branding display only, until
// Yahoo API access is approved; it does not touch scores or standings,
// which stay on manual entry.
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
      const photoUrl = photoMatch ? photoMatch[1] : null;
      // Yahoo's own player id sits in the photo URL, e.g. .../players_l/08132026/40059.1.png
      const yahooIdMatch = photoUrl ? photoUrl.match(/players_l\/\d+\/(\d+)\.\d+\.\w+$/) : null;

      if (!nameMatch) return null;

      const primaryPosition = teamPosMatch ? teamPosMatch[2].split(",")[0].trim() : null;

      return {
        name: decodeHtmlEntities(nameMatch[1].trim()),
        position: posMatch ? posMatch[1].trim() : (primaryPosition || "—"),
        primaryPosition,
        nflTeam: teamPosMatch ? teamPosMatch[1].trim().toUpperCase() : "",
        status: statusMatch ? decodeHtmlEntities(statusMatch[1].trim()) : null,
        photoUrl,
        yahooPlayerId: yahooIdMatch ? yahooIdMatch[1] : null,
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

function parseTeamName(html) {
  const match = html.match(/<h3 class="sticky-top[^"]*"[^>]*>\s*([^<]+?)\s*<\/h3>/);
  return match ? decodeHtmlEntities(match[1].trim()) : null;
}

const rosters = {};

for (const team of teamsConfig.teams) {
  if (!team.fantasyHelperTeamId) {
    console.warn(`Skipping ${team.team} -- no fantasyHelperTeamId configured.`);
    continue;
  }

  const id = String(team.fantasyHelperTeamId);
  const base = `https://fantasyhelper.net/Yahoo/${GAME_ID}.l.${LEAGUE_ID}/${GAME_ID}.l.${LEAGUE_ID}.t.${id}`;

  const [teamRes, rosterRes] = await Promise.all([
    fetch(base, { headers: FETCH_HEADERS }),
    fetch(`${base}/roster`, { headers: FETCH_HEADERS }),
  ]);

  let logoUrl = null;
  let currentName = null;
  if (teamRes.ok) {
    const teamHtml = await teamRes.text();
    logoUrl = parseTeamLogo(teamHtml);
    currentName = parseTeamName(teamHtml);
  } else {
    console.warn(`Failed to fetch team page for ${team.team}: HTTP ${teamRes.status}`);
  }

  let players = [];
  if (rosterRes.ok) {
    players = parseRosterHtml(await rosterRes.text());
  } else {
    console.warn(`Failed to fetch roster for ${team.team}: HTTP ${rosterRes.status}`);
  }

  rosters[id] = { currentName: currentName || team.team, logoUrl, players };
  console.log(
    `#${id} (${team.team}): now "${rosters[id].currentName}", ${players.length} players, logo ${logoUrl ? "found" : "missing"}`
  );
}

await writeFile(
  path.join(rootDir, "data", "rosters.json"),
  JSON.stringify(rosters, null, 2) + "\n"
);

console.log(`\nWrote data/rosters.json for ${Object.keys(rosters).length} teams.`);
