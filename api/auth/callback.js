// api/auth/callback.js
export default function handler(req, res) {
  res.setHeader('Content-Type', 'text/html');
  res.send(`
    <script>
      window.opener.postMessage(window.location.search, '*');
      window.close();
    </script>
  `);
}
