

const { OAuth } = require('oauth');
const fetch = require('node-fetch');

const oauth = new OAuth(
  'https://api.login.yahoo.com/oauth/v2/get_request_token',
  'https://api.login.yahoo.com/oauth/v2/get_token',
  process.env.YAHOO_CLIENT_ID,
  process.env.YAHOO_CLIENT_SECRET,
  '1.0A',
  null,
  'HMAC-SHA1'
);

module.exports = async function handler(req, res) {

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { accessToken, accessTokenSecret, week } = req.query;
    
    if (!accessToken || !accessTokenSecret) {
      return res.status(400).json({ 
        error: 'Access tokens required. Please authenticate first.' 
      });
    }

    const leagueId = process.env.LEAGUE_ID;
    const currentWeek = week || getCurrentNFLWeek();
    
    // Yahoo Fantasy API endpoints
    const leagueUrl = `https://fantasysports.yahooapis.com/fantasy/v2/league/nfl.l.${leagueId}`;
    const standingsUrl = `https://fantasysports.yahooapis.com/fantasy/v2/league/nfl.l.${leagueId}/standings`;
    const matchupsUrl = `https://fantasysports.yahooapis.com/fantasy/v2/league/nfl.l.${leagueId}/scoreboard;week=${currentWeek}`;

    // Fetch league info
    const leagueData = await makeYahooRequest(leagueUrl, accessToken, accessTokenSecret);
    const standingsData = await makeYahooRequest(standingsUrl, accessToken, accessTokenSecret);
    const matchupsData = await makeYahooRequest(matchupsUrl, accessToken, accessTokenSecret);

    // Parse the XML response (Yahoo returns XML)
    const parsedData = parseYahooResponse({
      league: leagueData,
      standings: standingsData,
      matchups: matchupsData,
      week: currentWeek
    });

    res.json(parsedData);
  } catch (error) {
    console.error('League data error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch league data',
      details: error.message
    });
  }
}

async function makeYahooRequest(url, accessToken, accessTokenSecret) {
  return new Promise((resolve, reject) => {
    oauth.get(url, accessToken, accessTokenSecret, (error, data) => {
      if (error) {
        reject(error);
      } else {
        resolve(data);
      }
    });
  });
}

function parseYahooResponse(data) {
  // Note: This is a simplified parser. Yahoo returns complex XML.
  // In production, you'd use a proper XML parser like 'xml2js'
  
  try {
    // Extract league name
    const leagueNameMatch = data.league.match(/<name>(.*?)<\/name>/);
    const leagueName = leagueNameMatch ? leagueNameMatch[1] : 'NFL League';

    // Extract current week's high scorer (simplified)
    // This would need proper XML parsing for production
    const teams = [];
    
    // Mock data structure for now - replace with actual XML parsing
    return {
      leagueName,
      currentWeek: data.week,
      lastUpdated: new Date().toISOString(),
      weeklyWinner: {
        team: "Team Name", // Extract from matchups
        manager: "Manager Name",
        score: 0, // Extract from matchups
        week: data.week
      },
      standings: teams,
      rawData: {
        // Include raw data for debugging
        league: data.league.substring(0, 500) + '...',
        standings: data.standings.substring(0, 500) + '...',
        matchups: data.matchups.substring(0, 500) + '...'
      }
    };
  } catch (error) {
    return {
      error: 'Failed to parse Yahoo response',
      rawData: data
    };
  }
}

function getCurrentNFLWeek() {
  // Simple logic to determine current NFL week
  // NFL season typically starts first week of September
  const now = new Date();
  const seasonStart = new Date('2024-09-05'); // Adjust for 2024 season
  const weeksSinceStart = Math.floor((now - seasonStart) / (7 * 24 * 60 * 60 * 1000));
  return Math.max(1, Math.min(18, weeksSinceStart + 1));
}