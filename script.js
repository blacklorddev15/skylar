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

  setBusy(true);
  setStatus('Contacting the Skylar XD pairing gateway…');
  try {
    const response = await fetch(PAIRING_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ phone, botType: 'skylar' }),
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
