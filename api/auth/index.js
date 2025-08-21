

const { OAuth } = require('oauth');
const oauth = new OAuth(
   'https://api.login.yahoo.com/oauth2/request_auth',
  'https://api.login.yahoo.com/oauth2/get_token',
  process.env.YAHOO_CLIENT_ID,
  process.env.YAHOO_CLIENT_SECRET,
  '1.0A',
  `${process.env.VERCEL_URL || 'http://localhost:3000'}/api/auth/callback`,
  'HMAC-SHA1'
);

module.exports = async function handler(req, res) {

  const { method, query } = req;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (query.step === 'init') {
      // Step 1: Get request token
      return new Promise((resolve) => {
        oauth.getOAuthRequestToken((error, oauthToken, oauthTokenSecret) => {
          if (error) {
            console.error('OAuth request token error:', error);
            return res.status(500).json({ error: 'Failed to get request token' });
          }

          // Store token secret (in production, use a database)
          // For now, we'll return it to be stored client-side temporarily
          const authUrl = `https://api.login.yahoo.com/oauth/v2/request_auth?oauth_token=${oauthToken}`;
          
          res.json({
            authUrl,
            oauthToken,
            oauthTokenSecret,
            message: 'Visit the authUrl to authorize, then return with the verifier'
          });
          resolve();
        });
      });
    }

    if (query.step === 'verify') {
      // Step 2: Exchange verifier for access token
      const { oauth_token, oauth_verifier, oauth_token_secret } = query;
      
      return new Promise((resolve) => {
        oauth.getOAuthAccessToken(
          oauth_token,
          oauth_token_secret,
          oauth_verifier,
          (error, oauthAccessToken, oauthAccessTokenSecret) => {
            if (error) {
              console.error('OAuth access token error:', error);
              return res.status(500).json({ error: 'Failed to get access token' });
            }

            res.json({
              accessToken: oauthAccessToken,
              accessTokenSecret: oauthAccessTokenSecret,
              message: 'Authentication successful! Store these tokens securely.'
            });
            resolve();
          }
        );
      });
    }

    res.status(400).json({ error: 'Invalid step parameter' });
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}