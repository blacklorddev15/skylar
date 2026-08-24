let totalPairs = 1650;
const startedAt = Date.now();

const runtimeConfig = {
  panelDomain: process.env.PANEL_DOMAIN || 'https://pterodactyl.mzazi.shop',
  serverIp: process.env.SERVER_IP || process.env.BACKEND_API_URL || '139.59.111.210',
  serverPort: process.env.SERVER_PORT || '25566',
  serverId: process.env.SERVER_ID || '',
  backendSecret: String(process.env.BACKEND_API_SECRET || process.env.API_SECRET || process.env.PANEL_API_KEY || process.env.PANEL_APIKEY || '').trim(),
  premiumMode: process.env.PREMIUM_MODE === 'true',
  adminPassword: String(process.env.ADMIN_PASSWORD || process.env.WEBSITE_ADMIN_PASSWORD || process.env.API_SECRET || '').trim(),
};

const generatedKeys = new Set(['SKYLAR-PRO-2026']);
const relayJobs = new Map();
let activeBot = null;
const RELAY_TTL_MS = 90_000;

function relayAuthorized(req) {
  const supplied = String(req.headers['x-bot-registration-secret'] || req.headers['x-api-secret'] || '').trim();
  const expected = String(process.env.API_SECRET || runtimeConfig.backendSecret || runtimeConfig.adminPassword || '').trim();
  return Boolean(expected && supplied === expected);
}

function activeBotIsOnline() {
  return Boolean(activeBot && Date.now() - activeBot.lastSeen < RELAY_TTL_MS);
}

function pruneRelayJobs() {
  const expiry = Date.now() - 120_000;
  for (const [id, job] of relayJobs) if (job.updatedAt < expiry) relayJobs.delete(id);
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Password, x-api-secret');
}

function maskSecret(value) {
  const secret = String(value || '');
  if (!secret) return 'Not configured';
  if (secret.length <= 4) return '••••';
  return secret.slice(0, 2) + '•'.repeat(Math.max(4, secret.length - 4)) + secret.slice(-2);
}

function publicConfig() {
  return {
    panelDomain: runtimeConfig.panelDomain,
    serverIp: runtimeConfig.serverIp,
    serverPort: runtimeConfig.serverPort,
    serverId: runtimeConfig.serverId,
    premiumMode: runtimeConfig.premiumMode,
    backendSecretConfigured: Boolean(runtimeConfig.backendSecret),
    backendSecretMasked: maskSecret(runtimeConfig.backendSecret),
  };
}

function getBackendBase() {
  const host = String(runtimeConfig.serverIp || '').trim();
  const port = String(runtimeConfig.serverPort || '').trim();
  if (/^https?:\/\//i.test(host)) return host.replace(/\/$/, '');
  return host ? `http://${host}${port ? ':' + port : ''}` : '';
}

function authOK(req, body) {
  const supplied = String(req.headers['x-admin-password'] || req.headers['x-api-secret'] || body.password || '').trim();
  return Boolean(runtimeConfig.adminPassword && supplied === runtimeConfig.adminPassword);
}

async function checkBackend() {
  const base = getBackendBase();
  if (!base) return { online: false, statusCode: 0, error: 'Server host/IP is not configured.' };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  let lastStatus = 0;
  try {
    for (const path of ['/api/status', '/api/health', '']) {
      try {
        const upstream = await fetch(`${base}${path}`, {
          headers: { Accept: 'application/json', ...(runtimeConfig.backendSecret ? { 'x-api-secret': runtimeConfig.backendSecret } : {}) },
          signal: controller.signal,
        });
        lastStatus = upstream.status;
        if (upstream.ok) return { online: true, statusCode: upstream.status };
      } catch {
        // Try the next conventional health path before declaring the backend offline.
      }
    }
    return { online: false, statusCode: lastStatus, error: lastStatus ? `Backend returned HTTP ${lastStatus}.` : 'Backend is offline or not reachable.' };
  } finally {
    clearTimeout(timeout);
  }
}


function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET' && req.query?.stats === '1') {
    const health = await checkBackend();
    const uptimeSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    return res.status(200).json({
      status: activeBotIsOnline() ? 'online' : (health.online ? 'online' : 'offline'),
      uptime: `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m ${uptimeSeconds % 60}s`,
      pairedCount: totalPairs,
      premiumMode: runtimeConfig.premiumMode,
      panelDomain: runtimeConfig.panelDomain,
      serverIp: runtimeConfig.serverIp,
      serverPort: runtimeConfig.serverPort,
      serverId: runtimeConfig.serverId,
      activeBot: activeBotIsOnline() ? { botId: activeBot.botId, bot: activeBot.bot, serverId: activeBot.serverId, port: activeBot.port, lastSeen: activeBot.lastSeen } : null,
    });
  }

  const body = req.method === 'POST' ? readBody(req) : (req.query || {});
  const action = body.action;
  pruneRelayJobs();

  if (req.method === 'POST' && action === 'register_bot') {
    if (!relayAuthorized(req)) return res.status(401).json({ error: 'Unauthorized bot registration.' });
    const botId = String(body.botId || body.serverId || '').trim();
    if (!botId) return res.status(400).json({ error: 'botId is required.' });
    activeBot = { botId, bot: String(body.bot || 'SKYLAR XD'), serverId: String(body.serverId || '').trim(), port: String(body.port || '').trim(), lastSeen: Date.now() };
    return res.status(200).json({ success: true, registered: true, botId });
  }

  if (req.method === 'POST' && action === 'poll_job') {
    if (!relayAuthorized(req)) return res.status(401).json({ error: 'Unauthorized bot poll.' });
    if (activeBot && body.botId && String(body.botId) !== activeBot.botId) return res.status(409).json({ error: 'Another bot is currently registered.' });
    if (activeBot) activeBot.lastSeen = Date.now();
    const job = [...relayJobs.values()].find(item => item.status === 'pending' && item.botId === (activeBot?.botId || body.botId));
    if (!job) return res.status(200).json({ success: true, job: null });
    job.status = 'claimed';
    job.updatedAt = Date.now();
    return res.status(200).json({ success: true, job });
  }

  if (req.method === 'POST' && action === 'job_result') {
    if (!relayAuthorized(req)) return res.status(401).json({ error: 'Unauthorized bot result.' });
    const job = relayJobs.get(String(body.jobId || ''));
    if (!job) return res.status(404).json({ error: 'Pairing job not found or expired.' });
    job.status = String(body.status || 'failed');
    job.code = body.code || body.rawCode || '';
    job.rawCode = body.rawCode || body.code || '';
    job.error = body.error || '';
    job.updatedAt = Date.now();
    if (activeBot) activeBot.lastSeen = Date.now();
    return res.status(200).json({ success: true, jobId: job.id });
  }

  if (req.method === 'GET' && req.query?.requestId) {
    const job = relayJobs.get(String(req.query.requestId));
    if (!job) return res.status(404).json({ error: 'Pairing request not found or expired.' });
    if (job.status === 'ready') return res.status(200).json({ success: true, pairing: { status: 'ready', code: job.code, rawCode: job.rawCode } });
    if (job.status === 'failed') return res.status(502).json({ error: job.error || 'The Skylar bot failed to generate a pairing code.' });
    return res.status(200).json({ success: true, pairing: { status: 'pending', requestId: job.id } });
  }

  if (req.method === 'POST' && (action === 'admin_login' || action === 'login')) {
    const pass = String(body.password || '').trim();
    if (!runtimeConfig.adminPassword) return res.status(503).json({ error: 'Website admin authentication is not configured.' });
    if (pass !== runtimeConfig.adminPassword) return res.status(401).json({ error: 'Incorrect admin password.' });
    return res.status(200).json({ success: true, authenticated: true, config: publicConfig() });
  }

  if (req.method === 'POST' && action === 'update_settings') {
    if (!authOK(req, body)) return res.status(401).json({ error: 'Unauthorized admin access.' });
    if (body.panelDomain !== undefined) runtimeConfig.panelDomain = String(body.panelDomain).trim();
    if (body.serverIp !== undefined) runtimeConfig.serverIp = String(body.serverIp).trim();
    if (body.serverPort !== undefined) runtimeConfig.serverPort = String(body.serverPort).trim();
    if (body.serverId !== undefined) runtimeConfig.serverId = String(body.serverId).trim();
    const newSecret = body.backendSecret ?? body.panelApiKey;
    if (newSecret !== undefined && String(newSecret).trim()) runtimeConfig.backendSecret = String(newSecret).trim();
    if (typeof body.premiumMode === 'boolean') runtimeConfig.premiumMode = body.premiumMode;
    return res.status(200).json({ success: true, message: 'Skylar Pterodactyl settings updated successfully.', config: publicConfig() });
  }

  if (req.method === 'POST' && action === 'test_connection') {
    if (!authOK(req, body)) return res.status(401).json({ error: 'Unauthorized admin access.' });
    const health = await checkBackend();
    return res.status(200).json({ success: true, backendOnline: health.online, statusCode: health.statusCode, message: health.online ? 'Backend is reachable.' : (health.error || 'Backend is offline.') });
  }

  if (req.method === 'POST' && action === 'generate_key') {
    if (!authOK(req, body)) return res.status(401).json({ error: 'Unauthorized admin access.' });
    const newKey = `SKYLAR-PRO-${Math.random().toString(36).substring(2, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    generatedKeys.add(newKey);
    return res.status(200).json({ success: true, key: newKey, keys: Array.from(generatedKeys) });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const phone = String(body.phone || body.phoneNumber || body.whatsappPhone || '').replace(/\D/g, '');
  const activationKey = String(body.activationKey || body.key || '').trim();
  if (runtimeConfig.premiumMode && (!activationKey || !generatedKeys.has(activationKey))) return res.status(403).json({ error: 'Premium mode is active. A valid activation key is required.' });
  if (phone.length < 7) return res.status(400).json({ error: 'Enter a valid international WhatsApp number.' });

  if (activeBotIsOnline()) {
    const id = `skylar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    relayJobs.set(id, { id, phone, botId: activeBot.botId, status: 'pending', createdAt: Date.now(), updatedAt: Date.now() });
    return res.status(202).json({ success: true, request_id: id, status: 'pending', message: 'Pairing request queued for the active Skylar bot.' });
  }

  const base = getBackendBase();
  if (!base) return res.status(503).json({ error: 'Backend host/IP is not configured.' });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const upstream = await fetch(`${base}/api/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(runtimeConfig.backendSecret ? { 'x-api-secret': runtimeConfig.backendSecret } : {}) },
      body: JSON.stringify({ phone, ...body }),
      signal: controller.signal,
    });
    const responseBody = await upstream.text();
    if (upstream.ok) totalPairs += 1;
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    return res.status(upstream.status).send(responseBody);
  } catch {
    return res.status(502).json({ error: 'Skylar backend is offline. Check the Pterodactyl host, allocation port, server ID, and that the backend is running.' });
  } finally { clearTimeout(timeout); }
};
