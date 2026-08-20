# 𝑺𝑲𝒀𝑳𝑨𝑹 𝑿𝑫 Pairing Portal

A responsive public pairing portal for Skylar XD. The landing page follows a warm dark, editorial visual direction and uses the supplied portrait background bundled as the small `background.jpg` asset.

## Pairing endpoint

The browser posts to `/api/pairing` with the following JSON payload:

```json
{ "phone": "254712345678", "botType": "skylar" }
```

The endpoint may respond immediately with `pairing_code`, `pairingCode`, or `code`, or it may return a request identifier such as `request_id`. For asynchronous responses, the browser polls `/api/pairing?requestId=...` until a code is available.

To use another endpoint without rebuilding the site, define `window.SKYLAR_PAIRING_ENDPOINT` before loading `script.js`:

```html
<script>window.SKYLAR_PAIRING_ENDPOINT = 'https://your-pairing-service.example/api/pairing';</script>
<script src="./script.js" defer></script>
```

The current static repository intentionally keeps the endpoint contract explicit. If no live endpoint is available, the interface presents a Telegram fallback instead of showing a false success state.

## Local preview

Serve the folder with any static server, for example:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Deploying on Vercel

Import `blacklorddev15/skylar` into Vercel as a static project. No build command is required; the project root is the repository root and the output directory is `.`. The supplied portrait is a small 78 KB asset committed as `background.jpg` so the public Vercel deployment renders it without relying on an expiring upload URL.
