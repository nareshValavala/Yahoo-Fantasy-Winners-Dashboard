const axios = require('axios');
const qs = require('querystring');

module.exports = async function handler(req, res) {
  const { method, query } = req;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') return res.status(200).end();

  const clientId = process.env.YAHOO_CLIENT_ID;
  const clientSecret = process.env.YAHOO_CLIENT_SECRET;
  
  // Use environment variable or construct from request headers
  const redirectUri = process.env.YAHOO_REDIRECT_URI || 
    `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/auth/callback`;

  try {
    // Step 1: Redirect user to Yahoo login
    if (query.step === 'init') {
      const authUrl = `https://api.login.yahoo.com/oauth2/request_auth?` +
        `client_id=${clientId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=fspt-w&` + // Changed from fspt-r to fspt-w for read/write access
        `language=en-us`;

      return res.json({ authUrl, message: 'Visit the authUrl to authorize the app' });
    }

    // Step 2: Exchange code for access token
    if (query.step === 'verify') {
      const { code } = query;
      if (!code) return res.status(400).json({ error: 'Missing code parameter' });

      const tokenResponse = await axios.post(
        'https://api.login.yahoo.com/oauth2/get_token',
        qs.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          code,
          grant_type: 'authorization_code'
        }),
        { 
          headers: { 
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
          } 
        }
      );

      const { access_token, refresh_token, expires_in } = tokenResponse.data;

      return res.json({
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresIn: expires_in,
        message: 'Authentication successful! Store these tokens securely.'
      });
    }

    return res.status(400).json({ error: 'Invalid step parameter' });
  } catch (err) {
    console.error('Auth error:', err.response?.data || err.message);
    res.status(500).json({ 
      error: 'Authentication failed', 
      details: err.response?.data || err.message 
    });
  }
};