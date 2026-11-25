# 05 — Test and Deployment Plan

## 1. Automated Host Checks
Run inside `/Users/beto/.gemini/antigravity/scratch/securekey`:
1. `npm test` (runs `node .agents/scripts/verify-totp.js`): validates RFC 6238 SHA-1/SHA-256/SHA-512 vectors, Base32, `otpauth://`, Google `otpauth-migration://` protobuf decoding, JSON/`sk-b64:` backups, and `pinLock` normalization/hash consistency.
2. `./.agents/scripts/build-and-preview.sh` (runs `verify-totp.js` + `zeus build -t "gtr4new,gtr4"`): builds production `.zab` under `dist/`, resizing icon assets and compiling device JS via `qjsc`.
3. WebKit `JavaScriptCore` (`jsc`) smoke test on the extracted `app-side.zip -> setting.js` from `dist/*.zab`: verifies `setting.js` loads with mocked `HmUtils`/`AppSettingsPage`/`View`/`TextInput`/`Button`, writes `0` keys in `build()`, and handles interactive PIN + backup flows cleanly.

## 2. Deployment to Amazfit GTR 4 new / GTR 4 (iOS)
### Option A — QR Code (`zeus preview`)
1. Run `./.agents/scripts/build-and-preview.sh preview` (`zeus preview -t gtr4new`).
2. Before reinstalling after Settings changes, **uninstall the previous SecureKey Mini Program** in Zepp App iOS and force-close/reopen Zepp App to avoid stale `settingsApp` WebView caching.
3. Open **Profile > Developer Mode > Scan** in Zepp App and install.

### Option B — Direct Bridge (`zeus bridge`)
1. Enable Developer Mode & Bridge in Zepp App using the **same Zepp account** (not just email via Google SSO; password login required for `zeus login`).
2. Run `./.agents/scripts/build-and-preview.sh bridge` (restart `zeus bridge` whenever `i18n` or settings assets change).
3. At `bridge$`, run `connect` then `install -t gtr4new`. Watch bridge output for `readyStateChanged` (`settingsApp`) and `settingsChanged` RPC events.

## 3. Local Google Authenticator QR Bridge
1. Run `./.agents/scripts/qr-import-server.sh` (serves `tools/qr-importer.html` on port `8787`, e.g. `http://192.168.18.168:8787`).
2. Open that URL in iPhone Safari, select the Google Authenticator QR screenshot(s), and either **Enviar para Servidor Local** (then tap **Buscar QR do Servidor Local** in Zepp Settings) or **Copiar URI(s)** and paste into Settings.

## 4. Device Validation Checklist
- [x] Watch installs cleanly and displays circular purple padlock icon (`92px`/`124px`).
- [x] Watch Screen 1 loads synced keys (`5 chaves protegidas`), no top header, smooth scrolling, PIN keypad gate.
- [x] Watch Screen 2 renders circular visor, accurate TOTP codes, cyan->coral shift at `<= 10s`, and gesture navigation (`UP`/`DOWN`/`LEFT`).
- [x] **RESOLVED:** iOS Settings works on `1.1.0` / `appId 20411`. Keep lean Settings; restore extra UI only without crypto imports in `setting/index.js`.
