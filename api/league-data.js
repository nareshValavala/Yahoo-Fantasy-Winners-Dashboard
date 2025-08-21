const fetch = require('node-fetch');
const { parseStringPromise } = require('xml2js');

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { accessToken, week } = req.query;

    if (!accessToken) {
      return res.status(400).json({
        error: 'Access token required. Please authenticate first.'
      });
    }

    const leagueId = process.env.LEAGUE_ID || '1236511'; // Your league ID as fallback
    const currentWeek = week || getCurrentNFLWeek();

    // Yahoo Fantasy API endpoints
    const leagueUrl = `https://fantasysports.yahooapis.com/fantasy/v2/league/nfl.l.${leagueId}`;
    const standingsUrl = `https://fantasysports.yahooapis.com/fantasy/v2/league/nfl.l.${leagueId}/standings`;
    const matchupsUrl = `https://fantasysports.yahooapis.com/fantasy/v2/league/nfl.l.${leagueId}/scoreboard;week=${currentWeek}`;

    // Fetch data
    const [leagueData, standingsData, matchupsData] = await Promise.all([
      fetchYahooXml(leagueUrl, accessToken),
      fetchYahooXml(standingsUrl, accessToken),
      fetchYahooXml(matchupsUrl, accessToken)
    ]);

    // Parse XML to JSON
    const parsedLeague = await parseStringPromise(leagueData);
    const parsedStandings = await parseStringPromise(standingsData);
    const parsedMatchups = await parseStringPromise(matchupsData);

    const parsedData = formatYahooData(parsedLeague, parsedStandings, parsedMatchups, currentWeek);

    res.json(parsedData);
  } catch (error) {
    console.error('League data error:', error);
    res.status(500).json({
      error: 'Failed to fetch league data',
      details: error.message
    });
  }
};

async function fetchYahooXml(url, accessToken) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Yahoo API error: ${response.status} ${text}`);
  }

  return response.text();
}

function formatYahooData(league, standings, matchups, week) {
  // Simplified formatter — you can expand as needed
  const leagueName =
    league?.fantasy_content?.league?.[0]?.name?.[0] || 'NFL League';

  return {
    leagueName,
    currentWeek: week,
    lastUpdated: new Date().toISOString(),
    weeklyWinner: {
      team: 'TBD', // Extract from matchups if desired
      manager: 'TBD',
      score: 0,
      week
    },
    standings: [], // Populate from parsedStandings
    rawData: {
      league: JSON.stringify(league).substring(0, 500) + '...',
      standings: JSON.stringify(standings).substring(0, 500) + '...',
      matchups: JSON.stringify(matchups).substring(0, 500) + '...'
    }
  };
}

function getCurrentNFLWeek() {
  const now = new Date();
  const seasonStart = new Date('2025-09-04'); // Updated for 2025 season
  const weeksSinceStart = Math.floor((now - seasonStart) / (7 * 24 * 60 * 60 * 1000));
  return Math.max(1, Math.min(18, weeksSinceStart + 1));
}