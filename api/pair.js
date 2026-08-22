let totalPairs = 1650;
const startedAt = Date.now();

let currentConfig = {
  panelDomain: process.env.PANEL_DOMAIN || 'https://pterodactyl.mzazi.shop',
  serverIp: process.env.SERVER_IP || process.env.BACKEND_API_URL || '139.59.111.210',
  serverPort: process.env.SERVER_PORT || '25572',
  premiumMode: process.env.PREMIUM_MODE === 'true',
  adminPassword: process.env.ADMIN_PASSWORD || 'skylar10',
};

const generatedKeys = new Set(['SKYLAR-PRO-2026']);

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Password, x-api-secret');
}

function cleanBackendUrl() {
  const host = String(currentConfig.serverIp || '').trim();
  const port = String(currentConfig.serverPort || '').trim();
  if (/^https?:\/\//i.test(host)) return host.replace(/\/$/, '');
  return `http://${host}:${port}`.replace(/\/$/, '');
}

function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method === 'GET' && req.query?.stats === '1') {
    const uptimeSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;
    return res.status(200).json({
      status: 'online',
      uptime: `${hours}h ${minutes}m ${seconds}s`,
      pairedCount: totalPairs,
      premiumMode: currentConfig.premiumMode,
      panelDomain: currentConfig.panelDomain,
      serverIp: currentConfig.serverIp,
      serverPort: currentConfig.serverPort,
    });
  }

  const body = req.method === 'POST' ? readBody(req) : (req.query || {});
  const action = body.action;

  if (req.method === 'POST' && action === 'admin_login') {
    const pass = body.password || '';
    if (pass === currentConfig.adminPassword || pass === process.env.API_SECRET) {
      return res.status(200).json({ success: true, config: { ...currentConfig, adminPassword: undefined } });
    } else {
      return res.status(401).json({ error: 'Invalid admin passcode. Try skylar10.' });
    }
  }

  if (req.method === 'POST' && action === 'update_settings') {
    const authHeader = req.headers['x-admin-password'] || req.headers['x-api-secret'] || body.password;
    if (authHeader !== currentConfig.adminPassword && authHeader !== process.env.API_SECRET) {
      return res.status(401).json({ error: 'Unauthorized admin access.' });
    }

    if (body.panelDomain !== undefined) currentConfig.panelDomain = String(body.panelDomain).trim();
    if (body.serverIp !== undefined) currentConfig.serverIp = String(body.serverIp).trim();
    if (body.serverPort !== undefined) currentConfig.serverPort = String(body.serverPort).trim();
    if (typeof body.premiumMode === 'boolean') currentConfig.premiumMode = body.premiumMode;

    return res.status(200).json({
      success: true,
      message: 'Skylar panel settings updated successfully.',
      config: { ...currentConfig, adminPassword: undefined },
    });
  }

  if (req.method === 'POST' && action === 'generate_key') {
    const authHeader = req.headers['x-admin-password'] || req.headers['x-api-secret'] || body.password;
    if (authHeader !== currentConfig.adminPassword && authHeader !== process.env.API_SECRET) {
      return res.status(401).json({ error: 'Unauthorized admin access.' });
    }
    const newKey = `SKL-PRO-${Math.random().toString(36).substring(2, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    generatedKeys.add(newKey);
    return res.status(200).json({ success: true, key: newKey, keys: Array.from(generatedKeys) });
  }

  const phone = String(body.phone || body.phoneNumber || '').replace(/\D/g, '');
  const activationKey = String(body.activationKey || body.key || '').trim();

  if (currentConfig.premiumMode && (!activationKey || !generatedKeys.has(activationKey))) {
    return res.status(403).json({ error: 'Premium mode is active. A valid activation key from the admin panel is required.' });
  }

  if (phone.length < 7) {
    return res.status(400).json({ error: 'Enter a valid international WhatsApp number.' });
  }

  const backendUrl = cleanBackendUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const upstream = await fetch(`${backendUrl}/api/pair`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-secret': process.env.API_SECRET || currentConfig.adminPassword,
      },
      body: JSON.stringify({ phone, ...body }),
      signal: controller.signal,
    });
    const upstreamBody = await upstream.text();
    if (upstream.ok) totalPairs += 1;
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    return res.status(upstream.status).send(upstreamBody);
  } catch {
    return res.status(502).json({ error: 'Skylar backend is unreachable. Check the server IP, allocation port, and that the backend is running.' });
  } finally {
    clearTimeout(timeout);
  }
}
