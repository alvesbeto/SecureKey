# SecureKey

**Offline TOTP authenticator for Amazfit GTR 4 — managed from the Zepp App on iOS, no App Store companion required.**

SecureKey is a Zepp OS mini program that generates RFC 6238 one-time passwords on the watch itself. Keys are configured in the Zepp App Settings UI, synced over BLE, then work fully offline using the watch RTC. Import accounts from Google Authenticator (`otpauth://` and `otpauth-migration://`), protect the watch app with an optional PIN, and keep a pure-JS crypto stack that runs inside QuickJS.

| Item | Value |
| --- | --- |
| Version | `1.2.2` (`code: 22`) |
| `appId` | **`20421`** (do not reuse `20401` / `20411` — iOS Settings caches by appId) |
| Targets | `gtr4new` (`9437441`), `gtr4` (`7930112` / `7930113` / `7864577`) |
| Settings runtime | API `1.0` / `configVersion: v2` |

## Features

- **On-watch TOTP:** SHA1 / SHA256 / SHA512, 6 or 8 digits, 30 or 60 second periods — offline after sync.
- **GTR 4 UI:** authenticator list + detail visor (optional watch PIN, swipe + crown navigation).
- **iOS companion (Zepp Settings + Side Service):** paste URIs, import Google Authenticator migration payloads, add keys manually, reorder accounts, configure watch PIN, sync over BLE.
- **Watch PIN only:** Settings in Zepp never asks for a PIN. Default lock asks again if the last watch unlock was more than **1 minute** ago.
- **Local QR bridge:** decode Google Authenticator export screenshots in Safari via `tools/qr-importer.html`.

---

## Build prerequisites

### Software

1. **macOS** (Zeus CLI / development).
2. **Node.js** **v20+** (tested with `v24.22.1`) and **npm**.
3. Global **`@zeppos/zeus-cli`** (`zeus`).
4. Zepp developer login when the CLI prompts (`zeus login`).
5. **Zepp App on iPhone** with **Developer Mode** enabled, same Wi‑Fi as the Mac.
6. **Amazfit GTR 4** or **GTR 4 new** paired in Zepp App.

### Environment setup

```bash
cd /path/to/securekey

# Checks Node/npm, installs zeus if missing, runs npm install
./.agents/scripts/setup-env.sh
```

Manual equivalent:

```bash
npm install -g @zeppos/zeus-cli
npm install
zeus status   # optional
```

Project deps (`package.json`): `@zeppos/device-types`, `jsqr` (QR decoder used by `tools/`).

---

## Build, test, and install

### 1. Unit tests (TOTP / parsers)

```bash
npm test
# or
node .agents/scripts/verify-totp.js
```

### 2. Build the `.zab` package

```bash
./.agents/scripts/build-and-preview.sh
# or
npm run build
```

Output: `dist/20421-SecureKey-*.zab` (targets `gtr4new` + `gtr4`). The script **deletes** previous `.zab` / `.zpk` files in `dist/` before building. `dist/` and `*.zab` are gitignored (Zepp sample convention).

### 3. Install on the watch via iPhone

**Option A — QR preview (recommended):**

```bash
./.agents/scripts/build-and-preview.sh preview
# rebuilds the .zab, then opens the QR (zeus preview -t gtr4new)
```

1. Force-quit **Zepp App** on iPhone.
2. **Uninstall every** old SecureKey entry in Zepp (`20401` / `20411` / prior builds).
3. Zepp → Developer Mode → scan the terminal QR.
4. Confirm install on the GTR 4.
5. Open SecureKey → Settings. The title should show **`SecureKey 1.2.2 / appId 20421`**, plus **Fetch keys from local server** and **Import URI / Migration**.

If the title is still plain “SecureKey” without `1.2.2`, iOS opened a cached Settings bundle for an old appId — not the new package.

**Option B — Bridge:**

```bash
./.agents/scripts/build-and-preview.sh bridge
# at the bridge prompt: connect → install -t gtr4new
```

### 4. Open Settings

In Zepp App on iOS: **SecureKey** → settings gear (Settings App).  
Confirm version label `1.2.2 / appId 20421` and the key count / status banner.

---

## Import keys from Google Authenticator

Zepp Settings on iOS **cannot** open the camera. Use one of these flows.

### Method 1 — Google Authenticator export QR (best for many accounts)

In **Google Authenticator** (iPhone or Android):

1. Menu (⋮) → **Transfer accounts** / **Export accounts**.
2. Select accounts → continue until the **export QR** appears  
   (`otpauth-migration://offline?data=...`).
3. Take a **screenshot** of the QR (or several, if Google splits pages).

On the **Mac** (same Wi‑Fi as the iPhone):

```bash
./.agents/scripts/qr-import-server.sh
# serves http://<LAN-IP>:8787
```

In **iPhone Safari**:

1. Open `http://<Mac-IP>:8787`.
2. Upload the QR screenshot(s).
3. Confirm decode (`otpauth-migration://...` or `otpauth://` list).
4. Tap **Send keys to local server** **or** **Copy URI(s)**.

In **Zepp App → SecureKey → Settings**:

- If you sent to the server: tap **Fetch keys from local server**  
  (**QR server** field = `http://<Mac-IP>:8787`).
- If you copied URIs: paste into the **otpauth:// / migration** field and tap **Import URI / Migration**.

Keys land in the phone vault; tap **Sync Watch** and open SecureKey on the GTR 4.

### Method 2 — Paste a single `otpauth://` URI

1. Get the URI (site QR or `otpauth://totp/...` text).
2. SecureKey Settings → paste into the URI field → **Import URI / Migration**.
3. **Sync Watch**.

### Method 3 — Add manually

1. Fill **Issuer**, **Account**, and **Base32 secret**.
2. Tap **Add key**.
3. **Sync Watch**.

### After sync

- On the watch: **Authenticators** list; tap an account for the live code visor.
- Codes keep working **offline** (watch RTC).
- Cross-check a code against Google Authenticator in the same 30s window.

---

## Watch PIN (via Zepp Settings)

The **WATCH PIN** block sits near the top of Settings (iOS-safe primitives: `View` / `TextInput` / `Button`).

1. Open **SecureKey → Settings** in Zepp (no PIN on the phone).
2. Enter a **new PIN (4–6 digits)** → **Save PIN** / **Reset PIN**.
3. Tap **Timeout** to cycle (default **1 minute**).
4. **Remove PIN** disables the watch lock.
5. Under **Saved keys**, use **Up** / **Down** to reorder; then **Sync Watch**.

---

## Project layout

```text
app.json          # appId 20421, targets gtr4new/gtr4, setting + app-side
setting/          # Zepp App iOS UI (lean bundle; no totp/otpauth imports)
app-side/         # BLE sync + migration/QR parse
page/             # Watch UI
shared/           # schema, totp, otpauth, MessageBuilder
tools/            # qr-importer.html + jsQR
.agents/scripts/  # setup-env, build-and-preview, qr-import-server, verify-totp
.agents/specs/    # SDD + iOS Settings blank-screen history
```

## Specs (SDD)

- [.agents/specs/01-research-and-constraints.md](.agents/specs/01-research-and-constraints.md)
- [.agents/specs/02-architecture-and-ble-protocol.md](.agents/specs/02-architecture-and-ble-protocol.md)
- [.agents/specs/03-ui-ux-spec-gtr4-and-ios.md](.agents/specs/03-ui-ux-spec-gtr4-and-ios.md)
- [.agents/specs/04-crypto-and-storage-spec.md](.agents/specs/04-crypto-and-storage-spec.md)
- [.agents/specs/05-test-and-deployment-plan.md](.agents/specs/05-test-and-deployment-plan.md)
- [.agents/specs/06-known-issues-and-handoff.md](.agents/specs/06-known-issues-and-handoff.md)

## Important notes

- **iOS Settings:** do **not** import `shared/totp.js` / `shared/otpauth.js` into `setting/index.js`. Heavy parsers stay in the Side Service / watch. `hashPin` / `pinLock` come from `shared/schema.js` only.
- **`appId` history:** `20401` / `20411` caused blank or stale Settings on iOS; current stable id is **`20421`**.
- Phone and watch need BLE (via Zepp) only for **sync**; TOTP afterward is local on the watch.
