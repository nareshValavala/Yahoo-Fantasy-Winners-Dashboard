// Runs on a schedule via .github/workflows/update-league-data.yml
// Refreshes the Yahoo access token, pulls standings + weekly scores, and
// writes the computed result to data/league.json for the static site to read.

import YahooFantasy from "yahoo-fantasy";
import { readFile, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

try {
  process.loadEnvFile(path.join(rootDir, ".env")); // for local runs; CI sets these via secrets
} catch {
  // no .env file — fine in CI, where the workflow sets these directly
}

const {
  YAHOO_CLIENT_ID,
  YAHOO_CLIENT_SECRET,
  YAHOO_REFRESH_TOKEN,
  LEAGUE_ID = "529714",
  GAME_KEY = "nfl",
} = process.env;

if (!YAHOO_CLIENT_ID || !YAHOO_CLIENT_SECRET || !YAHOO_REFRESH_TOKEN) {
  console.error(
    "Missing YAHOO_CLIENT_ID, YAHOO_CLIENT_SECRET, or YAHOO_REFRESH_TOKEN environment variables."
  );
  process.exit(1);
}

const payouts = JSON.parse(
  await readFile(path.join(rootDir, "config", "payouts.json"), "utf8")
);

const duesConfig = JSON.parse(
  await readFile(path.join(rootDir, "config", "teams.json"), "utf8")
);
const duesByTeamName = new Map(duesConfig.teams.map((t) => [t.team, t]));

// Must match the redirect URI used in bootstrap-auth.mjs when the current
// refresh token was issued (not actually used for refresh-token requests,
// but kept consistent just in case).
const REDIRECT_URI = process.env.YAHOO_REDIRECT_URI || "http://localhost:8080/callback";

const yf = new YahooFantasy(
  YAHOO_CLIENT_ID,
  YAHOO_CLIENT_SECRET,
  (tokenData) => {
    if (tokenData.refresh_token && tokenData.refresh_token !== YAHOO_REFRESH_TOKEN) {
      console.warn(
        "\nYahoo issued a NEW refresh_token. Update the YAHOO_REFRESH_TOKEN GitHub secret to:\n" +
          tokenData.refresh_token +
          "\n"
      );
    }
  },
  REDIRECT_URI
);

yf.setRefreshToken(YAHOO_REFRESH_TOKEN);

await new Promise((resolve, reject) => {
  yf.refreshToken((err) => (err ? reject(err) : resolve()));
});

const leagueKey = `${GAME_KEY}.l.${LEAGUE_ID}`;

const leagueStandings = await yf.league.standings(leagueKey);

const teams = leagueStandings.standings.map((team) => {
  const dues = duesByTeamName.get(team.name);
  return {
    teamKey: team.team_key,
    name: team.name,
    manager: dues?.manager || team.managers?.[0]?.nickname || "Unknown",
    draftPosition: dues?.draftPosition ?? null,
    duesPaid: dues?.paid ?? null,
    rank: team.standings?.rank != null ? Number(team.standings.rank) : null,
    wins: Number(team.standings?.outcome_totals?.wins || 0),
    losses: Number(team.standings?.outcome_totals?.losses || 0),
    ties: Number(team.standings?.outcome_totals?.ties || 0),
    pointsFor: Number(team.standings?.points_for || 0),
  };
});

const currentWeek = Number(leagueStandings.current_week);
const startWeek = Number(leagueStandings.start_week || 1);
const isFinished = Boolean(Number(leagueStandings.is_finished));

const weeklyWinners = [];
const weeklyCashByTeam = {};
const weeklyWinsByTeam = {};

const lastWeeklyPrizeWeek = Math.min(currentWeek, payouts.weeklyPrizeWeeks);
for (let week = startWeek; week <= lastWeeklyPrizeWeek; week++) {
  const scoreboard = await yf.league.scoreboard(leagueKey, week);
  const matchups = scoreboard.scoreboard.matchups;

  if (!matchups.length || !matchups.every((m) => m.status === "postevent")) {
    continue; // week hasn't finished scoring yet
  }

  const weekTeams = matchups.flatMap((m) =>
    m.teams.map((t) => ({
      teamKey: t.team_key,
      name: t.name,
      manager: t.managers?.[0]?.nickname || "Unknown",
      score: Number(t.points?.total || 0),
    }))
  );

  const topScore = Math.max(...weekTeams.map((t) => t.score));
  const topTeams = weekTeams.filter((t) => t.score === topScore);
  const prizeEach = payouts.weeklyPrize / topTeams.length;

  for (const t of topTeams) {
    weeklyWinners.push({
      week,
      teamName: t.name,
      manager: t.manager,
      score: t.score,
      prize: prizeEach,
      tied: topTeams.length > 1,
    });
    weeklyCashByTeam[t.teamKey] = (weeklyCashByTeam[t.teamKey] || 0) + prizeEach;
    weeklyWinsByTeam[t.teamKey] = (weeklyWinsByTeam[t.teamKey] || 0) + 1;
  }
}

const placementCashByTeam = {};
if (isFinished) {
  for (const team of teams) {
    const prize = payouts.placementPrizes[String(team.rank)];
    if (prize) placementCashByTeam[team.teamKey] = prize;
  }
}

const rosterByTeam = {};
for (const team of teams) {
  const teamWithRoster = await yf.roster.fetch(team.teamKey);
  rosterByTeam[team.teamKey] = (teamWithRoster.roster || []).map((p) => ({
    name: p.name?.full || "Unknown",
    position: p.selected_position || p.display_position || "—",
    nflTeam: (p.editorial_team_abbr || "").toUpperCase(),
    status: p.status || null,
  }));
}

const teamsWithCash = teams
  .map((team) => {
    const weeklyCash = weeklyCashByTeam[team.teamKey] || 0;
    const placementCash = placementCashByTeam[team.teamKey] || 0;
    const weeklyWins = weeklyWinsByTeam[team.teamKey] || 0;
    const roster = rosterByTeam[team.teamKey] || [];
    return { ...team, weeklyWins, weeklyCash, placementCash, totalCash: weeklyCash + placementCash, roster };
  })
  .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));

weeklyWinners.sort((a, b) => b.week - a.week);

const paidCount = duesConfig.teams.filter((t) => t.paid).length;

const output = {
  dataSource: "yahoo",
  leagueName: leagueStandings.name,
  leagueKey,
  season: leagueStandings.season,
  currentWeek,
  isFinished,
  lastUpdated: new Date().toISOString(),
  payouts,
  dues: {
    buyInPerTeam: duesConfig.buyInPerTeam,
    totalExpected: duesConfig.buyInPerTeam * duesConfig.teams.length,
    totalCollected: duesConfig.buyInPerTeam * paidCount,
  },
  teams: teamsWithCash,
  weeklyWinners,
};

await writeFile(
  path.join(rootDir, "data", "league.json"),
  JSON.stringify(output, null, 2) + "\n"
);

console.log(
  `Updated data/league.json — week ${currentWeek}, ${weeklyWinners.length} weekly winner entries recorded.`
);
