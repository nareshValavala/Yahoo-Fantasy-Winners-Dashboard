module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const clientId = process.env.YAHOO_CLIENT_ID;
    
    if (!clientId) {
      return res.status(500).json({ error: 'Yahoo Client ID not configured' });
    }

    // Use environment variable or construct from request headers
    const redirectUri = process.env.YAHOO_REDIRECT_URI || 
      `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/auth/callback`;
    
    const scope = 'fspt-w'; // Fantasy Sports Read/Write
    
    const authUrl = `https://api.login.yahoo.com/oauth2/request_auth?` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=${scope}&` +
      `language=en-us`;

    res.json({ authUrl });
    
  } catch (error) {
    console.error('Auth init error:', error);
    res.status(500).json({ error: 'Failed to initialize authentication' });
  }
};