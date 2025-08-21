module.exports = async function handler(req, res) {
  const { code, error } = req.query;
  
  console.log('Callback received:', { code: !!code, error });
  
  if (error) {
    console.error('OAuth error:', error);
    return res.redirect(`/?error=${encodeURIComponent(error)}`);
  }
  
  if (code) {
    console.log('Authorization code received, redirecting...');
    // Make sure code is passed in URL
    return res.redirect(`/?code=${encodeURIComponent(code)}`);
  }
  
  console.error('No code or error received');
  res.redirect('/?error=missing_code');
};