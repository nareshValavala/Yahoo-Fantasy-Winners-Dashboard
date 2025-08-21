const axios = require('axios');
const qs = require('querystring');

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Missing code parameter' });
    }
    
    const clientId = process.env.YAHOO_CLIENT_ID;
    const clientSecret = process.env.YAHOO_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      return res.status(500).json({ error: 'Yahoo credentials not configured' });
    }

    // Use environment variable or construct from request headers
    const redirectUri = process.env.YAHOO_REDIRECT_URI || 
      `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/auth/callback`;
    
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
    
    const tokenData = tokenResponse.data;
    
    if (!tokenResponse.status === 200) {
      throw new Error(tokenData.error_description || 'Token exchange failed');
    }
    
    res.json(tokenData);
    
  } catch (error) {
    console.error('Token exchange error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: error.response?.data?.error_description || error.message || 'Token exchange failed'
    });
  }
};