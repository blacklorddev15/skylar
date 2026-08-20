const PAIRING_ENDPOINT = window.SKYLAR_PAIRING_ENDPOINT || '/api/pairing';
const TELEGRAM_URL = 'https://t.me/blacklordProjects_bot?start=skylar';

const form = document.querySelector('#pair-form');
const phoneInput = document.querySelector('#phone');
const submitButton = document.querySelector('#submit-button');
const statusBox = document.querySelector('#status-box');
const codeBox = document.querySelector('#code-box');
const codeValue = document.querySelector('#code-value');
const copyCodeButton = document.querySelector('#copy-code');
const fallbackBox = document.querySelector('#fallback-box');
let pollTimer;
let currentRequestId;

function setStatus(message, tone = '') {
  statusBox.hidden = !message;
  statusBox.className = `status-box${tone ? ` ${tone}` : ''}`;
  statusBox.textContent = message;
}

function setBusy(busy) {
  submitButton.disabled = busy;
  submitButton.querySelector('span:first-child').textContent = busy ? 'Requesting code…' : 'Generate pairing code';
}

function normalizePhone(value) {
  return value.replace(/[^0-9]/g, '');
}

function showFallback() {
  fallbackBox.hidden = false;
  const link = fallbackBox.querySelector('a');
  if (link) link.href = TELEGRAM_URL;
}

function showCode(code) {
  codeValue.textContent = String(code).replace(/\s+/g, '').toUpperCase();
  codeBox.hidden = false;
  setStatus('Pairing code generated successfully. It is ready to use in WhatsApp.', 'success');
  clearInterval(pollTimer);
  setBusy(false);
}

function showFailure(message) {
  setStatus(message, 'error');
  setBusy(false);
  showFallback();
  clearInterval(pollTimer);
}

async function readJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The pairing gateway returned an error.');
  return data;
}

async function pollPairing(requestId) {
  try {
    const response = await fetch(`${PAIRING_ENDPOINT}?requestId=${encodeURIComponent(requestId)}`, { headers: { Accept: 'application/json' } });
    const data = await readJson(response);
    const pairing = data.pairing || data;
    if (pairing.pairing_code || pairing.pairingCode || pairing.code) {
      showCode(pairing.pairing_code || pairing.pairingCode || pairing.code);
      return;
    }
    const state = String(pairing.status || '').toLowerCase();
    if (['failed', 'expired', 'cancelled', 'error'].includes(state)) {
      showFailure('WhatsApp could not complete this request. Please try again with the number in international format.');
      return;
    }
    setStatus('Skylar is preparing your WhatsApp pairing code…');
  } catch (error) {
    console.warn('Pairing status request failed:', error);
  }
}

const activationKeyInput = document.querySelector('#activation-key');
const activationKeyGroup = document.querySelector('#activation-key-group');

// Check localStorage for admin licensing mode
let isPremium = localStorage.getItem('skylar_mode') === 'premium';

function syncPublicMode() {
  if (isPremium) {
    activationKeyGroup.hidden = false;
  } else {
    activationKeyGroup.hidden = true;
  }
}

syncPublicMode();
window.addEventListener('storage', () => {
  isPremium = localStorage.getItem('skylar_mode') === 'premium';
  syncPublicMode();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearInterval(pollTimer);
  codeBox.hidden = true;
  fallbackBox.hidden = true;
  const phone = normalizePhone(phoneInput.value);
  if (phone.length < 8 || phone.length > 15) {
    setStatus('Enter a valid international number using 8–15 digits.', 'error');
    return;
  }

  const activationKey = activationKeyInput ? activationKeyInput.value.trim() : '';
  if (isPremium && !activationKey) {
    setStatus('Premium Mode requires a valid activation key.', 'error');
    return;
  }

  setBusy(true);
  setStatus('Contacting the Skylar XD pairing gateway…');
  try {
    const response = await fetch(PAIRING_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ phone, botType: 'skylar', activationKey, mode: isPremium ? 'premium' : 'free' }),
    });
    const data = await readJson(response);
    const pairing = data.pairing || data;
    if (pairing.pairing_code || pairing.pairingCode || pairing.code) {
      showCode(pairing.pairing_code || pairing.pairingCode || pairing.code);
      return;
    }
    currentRequestId = pairing.request_id || pairing.requestId || data.request_id || data.requestId;
    if (!currentRequestId) throw new Error('The gateway accepted the request but did not return a tracking ID.');
    setStatus('Request queued. Waiting for WhatsApp to prepare your code…');
    pollTimer = window.setInterval(() => pollPairing(currentRequestId), 2200);
    await pollPairing(currentRequestId);
  } catch (error) {
    showFailure(error.message || 'The pairing gateway is currently unavailable.');
  }
});

copyCodeButton.addEventListener('click', async () => {
  const code = codeValue.textContent.trim();
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    copyCodeButton.textContent = 'Copied';
    window.setTimeout(() => { copyCodeButton.textContent = 'Copy code'; }, 1500);
  } catch {
    setStatus('Select and copy the pairing code manually.', 'error');
  }
});

phoneInput.addEventListener('input', () => {
  phoneInput.value = phoneInput.value.replace(/[^0-9\s]/g, '');
});

// Admin & Licensing Mode Management
const modeBadge = document.querySelector('#mode-badge');
const modeFreeBtn = document.querySelector('#mode-free-btn');
const modePremiumBtn = document.querySelector('#mode-premium-btn');
const adminActionTitle = document.querySelector('#admin-action-title');
const adminActionDesc = document.querySelector('#admin-action-desc');
const generateKeyBtn = document.querySelector('#generate-key-btn');
const keyOutputBox = document.querySelector('#key-output-box');
const generatedKeyText = document.querySelector('#generated-key-text');
const copyKeyBtn = document.querySelector('#copy-key-btn');

let isPremiumMode = false;

function updateLicensingMode(premium) {
  isPremiumMode = premium;
  if (isPremiumMode) {
    modeBadge.textContent = 'PREMIUM MODE';
    modeBadge.style.color = '#ffcca7';
    modePremiumBtn.classList.add('active');
    modeFreeBtn.classList.remove('active');
    adminActionTitle.textContent = 'Admin-Only Key Generation';
    adminActionDesc.textContent = 'In Premium Mode, users must enter a valid activation key. Only authorized administrators can generate new keys here.';
    generateKeyBtn.textContent = 'Generate Premium Key ↗';
  } else {
    modeBadge.textContent = 'FREE MODE';
    modeBadge.style.color = '';
    modeFreeBtn.classList.add('active');
    modePremiumBtn.classList.remove('active');
    adminActionTitle.textContent = 'Key Generation & Status';
    adminActionDesc.textContent = 'In Free Mode, anyone can generate a session activation token or pair directly.';
    generateKeyBtn.textContent = 'Generate Activation Key ↗';
  }
  keyOutputBox.hidden = true;
}

modeFreeBtn.addEventListener('click', () => updateLicensingMode(false));
modePremiumBtn.addEventListener('click', () => updateLicensingMode(true));

generateKeyBtn.addEventListener('click', () => {
  const prefix = isPremiumMode ? 'SKXD-PREM-2026' : 'SKXD-FREE-2026';
  const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
  const key = `${prefix}-${randomSuffix}`;
  generatedKeyText.textContent = key;
  keyOutputBox.hidden = false;
});

copyKeyBtn.addEventListener('click', async () => {
  const key = generatedKeyText.textContent.trim();
  if (!key) return;
  try {
    await navigator.clipboard.writeText(key);
    copyKeyBtn.textContent = 'Copied';
    window.setTimeout(() => { copyKeyBtn.textContent = 'Copy Key'; }, 1500);
  } catch {
    // fallback
  }
});
