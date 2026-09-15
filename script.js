const PAIRING_ENDPOINT = window.SKYLAR_PAIRING_ENDPOINT || '/api/pair';
const TELEGRAM_URL = 'https://t.me/blacklordProjects_bot?start=skylar';

const form = document.querySelector('#pair-form, #pairForm');
const phoneInput = document.querySelector('#phone, #phoneNumber');
const submitButton = document.querySelector('#submit-button, #submitBtn');
const statusBox = document.querySelector('#status-box, #statusBox');
const codeBox = document.querySelector('#code-box, #codeResultBox');
const codeValue = document.querySelector('#code-value, #pairingCodeDisplay');
const copyCodeButton = document.querySelector('#copy-code');
const fallbackBox = document.querySelector('#fallback-box');
const readyFooter = document.querySelector('#readyFooterText');
const activationKeyInput = document.querySelector('#activation-key');
const activationKeyGroup = document.querySelector('#activation-key-group');

const countryModal = document.querySelector('#countryModal');
const countryDisplay = document.querySelector('#countryDisplay');
const countrySearch = document.querySelector('#countrySearch');
const countryList = document.querySelector('#countryList');
const prefixInput = document.querySelector('#prefixInput');
const prefixDisplay = document.querySelector('#prefixDisplay');

let pollTimer = 0;
let isPremium = window.localStorage?.getItem('skylar_mode') === 'premium';

function reveal(element) {
  if (!element) return;
  element.hidden = false;
  element.classList.remove('hidden');
  element.style.removeProperty('display');
}

function conceal(element) {
  if (!element) return;
  element.hidden = true;
  element.classList.add('hidden');
}

function setStatus(message, tone = '') {
  if (!statusBox) return;
  statusBox.textContent = message || '';
  statusBox.className = `status-box${tone ? ` ${tone}` : ''}`;
  if (message) reveal(statusBox);
  else conceal(statusBox);
}

function setBusy(busy) {
  if (!submitButton) return;
  submitButton.disabled = busy;
  const label = submitButton.querySelector('span:first-child');
  if (label) label.textContent = busy ? 'Requesting code…' : 'Generate pairing code';
  else if (!busy) submitButton.textContent = 'Generate Pairing Code';
}

function normalizePhone(value) {
  return String(value || '').replace(/[^0-9]/g, '');
}

/* ── country picker ──────────────────────────────────────────────
   The dial code is chosen from countries.json rather than typed, so the number
   sent to the gateway is always a full international one. The prefix box stays
   editable for codes people know by heart: typing one that matches the list
   selects that country and fills its name into the trigger.

   The list is fetched once and shared. countries.json writes the NANP
   territories as "+1-268", "+1-876" and so on, so codes are normalised to
   digits — otherwise Jamaica, Barbados and nine others become unselectable. */
let countries = [];
let visibleCountries = [];
let selectedCountry = null;
let countriesPromise = null;

function loadCountries() {
  if (countriesPromise) return countriesPromise;

  countriesPromise = fetch('./countries.json')
    .then((response) => (response.ok ? response.json() : []))
    .then((list) => {
      countries = Array.isArray(list)
        ? list
            .map((entry) => {
              const digits = String(entry && entry.code ? entry.code : '').replace(/[^0-9]/g, '');
              if (!entry || typeof entry.name !== 'string' || !digits) return null;
              return { name: entry.name, flag: entry.flag || '', code: `+${digits}` };
            })
            .filter(Boolean)
        : [];
    })
    .catch(() => { countries = []; })
    .then(() => {
      renderCountryList(countries);
      return countries;
    });

  return countriesPromise;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderCountryList(list) {
  if (!countryList) return;
  visibleCountries = list;
  if (!list.length) {
    countryList.innerHTML = '<div class="country-empty">No countries available.</div>';
    return;
  }
  // Options carry the index into visibleCountries rather than the record itself, so
  // a country name containing an apostrophe cannot break the markup.
  countryList.innerHTML = list
    .map((country, index) => `<button type="button" class="country-option" data-index="${index}">`
      + `<span class="flag">${escapeHtml(country.flag)}</span>`
      + `<span class="cname">${escapeHtml(country.name)}</span>`
      + `<span class="ccode">${escapeHtml(country.code)}</span>`
      + '</button>')
    .join('');
}

function filterCountries(query) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) {
    renderCountryList(countries);
    return;
  }
  const digits = needle.replace(/[^0-9]/g, '');
  renderCountryList(countries.filter((country) => {
    if (country.name.toLowerCase().includes(needle)) return true;
    if (digits && country.code.replace(/[^0-9]/g, '').includes(digits)) return true;
    return false;
  }));
}

function selectCountry(country) {
  if (!country) return;
  selectedCountry = country;
  if (prefixInput) prefixInput.value = country.code;
  if (prefixDisplay) prefixDisplay.textContent = country.code;
  if (countryDisplay) {
    countryDisplay.innerHTML = `<span class="sel-flag">${escapeHtml(country.flag)}</span>`
      + `<span class="sel-name">${escapeHtml(`${country.name} (${country.code})`)}</span>`;
  }
  closeCountryModal();
  phoneInput?.focus();
}

function openCountryModal() {
  if (!countryModal) return;
  reveal(countryModal);
  if (countrySearch) countrySearch.value = '';
  filterCountries('');
  loadCountries();
  window.setTimeout(() => countrySearch?.focus(), 60);
}

function closeCountryModal() {
  conceal(countryModal);
}

function onPrefixInput(value) {
  let digits = String(value || '').replace(/[^0-9+]/g, '');
  if (digits && !digits.startsWith('+')) digits = `+${digits}`;
  if (digits.length > 6) digits = digits.slice(0, 6);
  if (prefixInput) prefixInput.value = digits;
  if (prefixDisplay) prefixDisplay.textContent = digits || '+';
  if (digits.length >= 2) {
    const match = countries.find((country) => country.code === digits);
    if (match) selectedCountry = match;
  } else {
    selectedCountry = null;
  }
}

// Dial code + local number, with any leading 0 dropped from the local part.
function composePhone() {
  const prefix = normalizePhone(prefixInput?.value);
  const local = normalizePhone(phoneInput?.value).replace(/^0+/, '');
  return prefix + local;
}

countryList?.addEventListener('click', (event) => {
  const option = event.target.closest('.country-option');
  if (!option) return;
  selectCountry(visibleCountries[Number(option.dataset.index)]);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && countryModal && !countryModal.hidden) closeCountryModal();
});

// index.html calls these from inline onclick / oninput handlers.
window.openCountryModal = openCountryModal;
window.closeCountryModal = closeCountryModal;
window.filterCountries = filterCountries;
window.onPrefixInput = onPrefixInput;

loadCountries();

function showFallback() {
  if (!fallbackBox) return;
  reveal(fallbackBox);
  const link = fallbackBox.querySelector('a');
  if (link) link.href = TELEGRAM_URL;
}

function showCode(code) {
  if (!codeValue || !codeBox) {
    showFailure('Pairing code received, but the page could not render it. Please refresh and try again.');
    return;
  }
  codeValue.textContent = String(code).replace(/\s+/g, '').toUpperCase();
  reveal(codeBox);
  setStatus('Pairing code generated successfully. It is ready to use in WhatsApp.', 'success');
  if (readyFooter) readyFooter.textContent = 'Pairing code ready. Enter it in WhatsApp Linked Devices.';
  window.clearInterval(pollTimer);
  setBusy(false);
}

function showFailure(message) {
  setStatus(message || 'The pairing gateway is currently unavailable.', 'error');
  if (readyFooter) readyFooter.textContent = 'Pairing is currently offline. Please try again later.';
  setBusy(false);
  showFallback();
  window.clearInterval(pollTimer);
}

async function readJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The pairing gateway returned an error.');
  return data;
}

async function pollPairing(requestId) {
  try {
    const response = await fetch(`${PAIRING_ENDPOINT}?requestId=${encodeURIComponent(requestId)}`, {
      headers: { Accept: 'application/json' },
    });
    const data = await readJson(response);
    const pairing = data.pairing || data;
    const code = pairing.pairing_code || pairing.pairingCode || pairing.code;
    if (code) {
      showCode(code);
      return true;
    }
    const state = String(pairing.status || '').toLowerCase();
    if (['failed', 'expired', 'cancelled', 'error'].includes(state)) {
      showFailure('WhatsApp could not complete this request. Please try again with the number in international format.');
      return true;
    }
    setStatus('Skylar is preparing your WhatsApp pairing code…');
  } catch (error) {
    console.warn('Pairing status request failed:', error);
  }
  return false;
}

function syncPublicMode() {
  if (activationKeyGroup) {
    if (isPremium) reveal(activationKeyGroup);
    else conceal(activationKeyGroup);
  }
}

async function handlePairing(event) {
  event?.preventDefault?.();
  window.clearInterval(pollTimer);
  conceal(codeBox);
  conceal(fallbackBox);

  const prefix = normalizePhone(prefixInput?.value);
  if (!prefix) {
    setStatus('Select your country first — that is what sets the dial code.', 'error');
    return false;
  }

  const phone = composePhone();
  if (phone.length < 8 || phone.length > 15) {
    setStatus('Enter a valid international number using 8–15 digits.', 'error');
    return false;
  }

  const activationKey = activationKeyInput?.value.trim() || '';
  if (isPremium && !activationKey) {
    setStatus('Premium Mode requires a valid activation key.', 'error');
    return false;
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
    const code = pairing.pairing_code || pairing.pairingCode || pairing.code;
    if (code) {
      showCode(code);
      return false;
    }

    const requestId = pairing.request_id || pairing.requestId || data.request_id || data.requestId;
    if (!requestId) throw new Error('The gateway accepted the request but did not return a tracking ID.');
    setStatus('Request queued. Waiting for WhatsApp to prepare your code…');
    await pollPairing(requestId);
    pollTimer = window.setInterval(() => pollPairing(requestId), 2200);
  } catch (error) {
    showFailure(error.message || 'The pairing gateway is currently unavailable.');
  }
  return false;
}

async function copyCode() {
  const code = codeValue?.textContent.trim() || '';
  if (!code || code.includes('----')) return;
  try {
    await navigator.clipboard.writeText(code);
    if (copyCodeButton) {
      copyCodeButton.textContent = 'Copied';
      window.setTimeout(() => { copyCodeButton.textContent = 'Copy code'; }, 1500);
    }
  } catch {
    setStatus('Select and copy the pairing code manually.', 'error');
  }
}

window.handlePairing = handlePairing;
window.copyCode = copyCode;
syncPublicMode();
window.addEventListener('storage', () => {
  isPremium = window.localStorage?.getItem('skylar_mode') === 'premium';
  syncPublicMode();
});

if (form) {
  form.removeAttribute('onsubmit');
  form.addEventListener('submit', handlePairing);
}

if (phoneInput) {
  phoneInput.addEventListener('input', () => {
    phoneInput.value = phoneInput.value.replace(/[^0-9\s]/g, '');
  });
}

if (copyCodeButton) copyCodeButton.addEventListener('click', copyCode);

// Optional licensing controls are present only on newer admin-enabled pages.
const modeBadge = document.querySelector('#mode-badge');
const modeFreeBtn = document.querySelector('#mode-free-btn');
const modePremiumBtn = document.querySelector('#mode-premium-btn');
const adminActionTitle = document.querySelector('#admin-action-title');
const adminActionDesc = document.querySelector('#admin-action-desc');
const generateKeyBtn = document.querySelector('#generate-key-btn');
const keyOutputBox = document.querySelector('#key-output-box');
const generatedKeyText = document.querySelector('#generated-key-text');
const copyKeyBtn = document.querySelector('#copy-key-btn');

function updateLicensingMode(premium) {
  if (modeBadge) modeBadge.textContent = premium ? 'PREMIUM MODE' : 'FREE MODE';
  modePremiumBtn?.classList.toggle('active', premium);
  modeFreeBtn?.classList.toggle('active', !premium);
  if (adminActionTitle) adminActionTitle.textContent = premium ? 'Admin-Only Key Generation' : 'Key Generation & Status';
  if (adminActionDesc) adminActionDesc.textContent = premium
    ? 'In Premium Mode, users must enter a valid activation key. Only authorized administrators can generate new keys here.'
    : 'In Free Mode, anyone can generate an activation token or pair directly.';
  if (generateKeyBtn) generateKeyBtn.textContent = premium ? 'Generate Premium Key ↗' : 'Generate Activation Key ↗';
  conceal(keyOutputBox);
}

modeFreeBtn?.addEventListener('click', () => updateLicensingMode(false));
modePremiumBtn?.addEventListener('click', () => updateLicensingMode(true));
generateKeyBtn?.addEventListener('click', () => {
  const prefix = modePremiumBtn?.classList.contains('active') ? 'SKXD-PREM-2026' : 'SKXD-FREE-2026';
  if (generatedKeyText) generatedKeyText.textContent = `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  reveal(keyOutputBox);
});
copyKeyBtn?.addEventListener('click', async () => {
  if (!generatedKeyText) return;
  try { await navigator.clipboard.writeText(generatedKeyText.textContent.trim()); } catch {}
});
