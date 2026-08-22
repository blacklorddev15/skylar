export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const adminPassword = String(process.env.ADMIN_PASSWORD || process.env.API_SECRET || '').trim();

  // Website authentication is independent of the bot backend’s uptime.
  if (body.action === 'login' || body.action === 'admin_login') {
    const suppliedPassword = String(body.password || '').trim();
    if (!adminPassword) return res.status(503).json({ error: 'Website admin authentication is not configured.' });
    if (suppliedPassword !== adminPassword) return res.status(401).json({ error: 'Incorrect admin password.' });
    return res.status(200).json({ success: true, authenticated: true, backendOnline: null });
  }

  const backendUrl = process.env.BACKEND_API_URL || 'https://skylar-api.mzazi.shop';
  try {
    const response = await fetch(`${backendUrl}/api/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-secret': process.env.API_SECRET || '',
      },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'Bot backend is currently offline.' });
  }
}
