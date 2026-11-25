# 01 — Research and Constraints

## 1. Purpose and Scope
This specification defines the hardware, runtime, and platform constraints for **SecureKey**, an offline-capable TOTP 2FA Mini Program for **Amazfit GTR 4 new** and **Amazfit GTR 4** paired with the **Zepp App on iOS**.

## 2. Local Toolchain Verification
Verified on the development host (macOS):
- Node.js: `v24.22.1`
- npm: `11.19.1`
- `@zeppos/zeus-cli`: `v1.9.3` (includes `@zeppos/zpm` `v3.5.0`)
- No Zepp OS Desktop Simulator is installed under `/Applications` on this host (`zeus dev` requires installing the external simulator app).

Run `.agents/scripts/setup-env.sh` to verify toolchain availability.

## 3. Target Hardware and `app.json` Schema
Supported targets in `app.json` (`configVersion: "v2"`, `appId: 20401`, current version `1.0.10` / `code: 11`; Settings still blocked on iPhone — see `06-known-issues-and-handoff.md`):

| Target Key | Model(s) | `deviceSource` | Screen | Design Width | OS / API Compatibility |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `gtr4new` (primary) | Amazfit GTR 4 new | `9437441` | `480x480` | `466` | Zepp OS 1.0 / API `1.0.0` |
| `gtr4` | GTR 4 / W / Limited | `7930112`, `7930113`, `7864577` | `466x466` | `466` | Zepp OS 1.0 / API `1.0.0` |

- `runtime.apiVersion`: `compatible: "1.0.0"`, `target: "1.0.0"`, `minVersion: "1.0.0"`.
- **Important API 1.0 Constraint:** `@zos/*` v2/v3 modules and `@zeppos/zml` are NOT available on GTR 4 new (`deviceSource: 9437441`, API `1.0`). Device and Side Service code therefore uses native Zepp OS 1.0 globals (`hmUI`, `hmApp`, `hmFS`, `hmSensor`, `hmSetting`, `hmBle`) and bundled `shared/message.js` (`MessageBuilder`) + `shared/device-polyfill.js`.

## 4. Watch Runtime and Cryptography Constraints
Zepp OS executes Device App code on **QuickJS**:
- No Node.js `crypto`, `Buffer`, or Web Crypto (`crypto.subtle`).
- No native clipboard API on GTR 4 (detail screen therefore has no copy action).
- `shared/totp.js` implements pure-JS Base32, SHA-1, SHA-256, SHA-512 (32-bit `[hi, lo]` arithmetic without `BigInt`), HMAC, HOTP, and TOTP (`6`/`8` digits, `30`/`60`s).
- `SHA256_K` and padding arrays avoid `Uint32Array` where unnecessary (`Array` used for SHA-1/256/512 work buffers), and lookup tables use `{}` instead of `Object.create(null)`.
- **Performance rule on GTR 4 new:** Screen 1 (`page/index.js`) computes **zero** TOTP codes and runs **zero** tick timers so scrolling stays fluid; TOTP computation runs only on Screen 2 (`page/detail.js`) for the single active account when opened, switched, or crossing a period boundary.

## 5. iOS Zepp App Constraints and Empirical Findings
1. **No camera/photo picker inside Settings WebView:** Decoded via companion local web tool (`tools/qr-importer.html` served by `.agents/scripts/qr-import-server.sh` on port `8787`) using `jsQR`, supporting single/multiple screenshots and Safari copy-paste OR Side Service HTTP `fetch({ url: '${baseUrl}/api/pending' })`.
2. **Restricted Settings runtime (`AppSettingsPage` on Zepp App iOS `side-4.3.0-release.1-403`):**
   - Settings runs in an isolated WebView/JS runtime without console logging visible in Zepp App dev logs (`settingsApp` only logs `readyStateChanged` `opened`/`closed` RPC notifications).
   - Uncaught exceptions or unsupported UI primitives in `setting/index.js` produce a **blank white screen** silently.
   - Official `os1.0/app/todo-list/setting/index.js` proves `View`, `TextInput` (with `onChange`, without `disabled: true`), and `Button` (`{ fontSize, borderRadius, background, color }`).
   - See `06-known-issues-and-handoff.md` for full regression history and open iOS Settings troubleshooting status.
