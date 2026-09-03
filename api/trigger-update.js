// Vercel serverless function: lets anyone click "Refresh Now" on the site
// without needing a GitHub personal access token in their own browser.
// The actual GitHub token lives only here, server-side, as a Vercel
// environment variable -- never sent to the client.
//
// Requires a GITHUB_TOKEN env var on the Vercel project (a token with
// Actions: read/write on this repo) and a redeploy after adding it.

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'GITHUB_TOKEN is not configured on this Vercel project.' });
  }

  const response = await fetch(
    'https://api.github.com/repos/nareshValavala/Yahoo-Fantasy-Winners-Dashboard/actions/workflows/update-league-data.yml/dispatches',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    }
  );

  if (!response.ok) {
    const details = await response.text();
    return res.status(502).json({ error: `GitHub dispatch failed (HTTP ${response.status})`, details });
  }

  res.status(200).json({
    ok: true,
    message: 'Update triggered. Check the "✓ Live from Yahoo" badge in a minute or two — ' +
      'it only succeeds once Yahoo API access is approved; until then this run is expected to fail.',
  });
};
