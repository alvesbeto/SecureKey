# 06 — Known Issues, Failed Attempts Log, and Handoff Guide

> **RESOLVED (2026-11-25 ~13:18 BRT):** iOS Settings works on **`1.1.0` / `appId 20411`**.
> **Root cause confirmed:** poisoned/sticky iOS Settings state under `appId 20401` and/or heavy `totp`+`otpauth` Settings bundle. Fix = **new appId** + **lean Settings** (no `shared/totp` / `shared/otpauth` imports; migration via Side Service).
> Keep `appId 20411`. Do not revert to `20401`. Re-add features only without pulling crypto parsers back into `setting/index.js`.
> **`1.1.2`:** Settings redesigned to official Zepp pattern (`Section`/`Text`/`Select`/`Button`); PIN section is first after sync. Watch list spacing 8px + safer card colors per design checklist.

---

## 1. Chronological Results on Physical iPhone

| Version | What changed | iPhone outcome | Why it does not count as a fix |
| :--- | :--- | :--- | :--- |
| `1.0.0` step `302` | `View` + `Text` + `TextInput` + `Select` + `Button` + `securekey_ui_state` JSON | **WORKED** | Baseline. User imported 5 accounts + synced to watch. |
| `1.0.0` step `389` | PIN UI + `??` + `hashPin` in `totp.js` | **BLANK WHITE** | First break. `??` unsupported / PIN UI introduced. |
| `1.0.1` | Removed `??`; added `state` + `renderPage` + `try/catch` | **BLANK WHITE** | RPC: `settingsApp opened (11)` then closed `(21)`. |
| `1.0.2` | Watch-only changes; Settings unchanged | **LOADING FOREVER** | Spinner never finished. |
| `1.0.3` | Removed `state`/`renderPage`; kept `Select`/`Text` | **BLANK WHITE** | Install OK; Settings still blank. |
| `1.0.4`/`1.0.5` | `hashPin` → `schema.js`; PIN `Select` → Buttons; near step-`302` UI | **BLANK WHITE** | Near-revert of working UI **still blank**. |
| `1.0.6`/`1.0.7` | `Section` + `Text` + flat `sk_f_*` keys | **BLANK WHITE** | `Section` rewrite failed. |
| `1.0.8` | Only `View`/`TextInput`/`Button`; kill some `Object.create(null)` | **BLANK WHITE** | Still had `disabled: true` / missing `onChange` on many TextInputs. |
| `1.0.9` | Strict todo-list primitives; 0 `disabled`; 0 writes in `build()`; ~18 inputs / ~35 buttons | **BLANK** (user still blocked) | Mock/jsc OK; phone still broken. |
| **`1.0.10`** | Restore `Text`+`Select`; Authenticator page methods; fewer widgets; Side Service clears `securekey_ui_state` | **LOADING → then BLANK WHITE** | UI-primitive rewrite class exhausted on `appId 20401`. |
| **`1.1.0` (current)** | **NEW:** `appId 20401→20411`; Settings without `shared/totp`/`shared/otpauth`; Authenticator primitives; import via Side Service | **WORKS ON IPHONE** | Confirmed by user 13:18 BRT. Keep this baseline. |

---

## 2. DO NOT RETRY (already failed — avoid rework)

Treat the items below as **closed negative results**. Do not spend another cycle on them unless new phone evidence contradicts this log.

### 2.1 UI / component experiments (failed)
- Removing only `??` / optional chaining from Settings.
- Adding/removing `state: {}`, `renderPage()`, wrapper `try/catch` that renders error via the same helpers.
- Near-revert to pre-PIN / step-`302`-like Settings while keeping `appId: 20401`.
- Rewrites around `Section`.
- “Only `View` + `TextInput` + `Button`” (todo-list subset) with large nested card trees.
- Fake display rows as `TextInput` (`infoRow` with label+value+noop `onChange`).
- Restoring `Text` + `Select` + Authenticator-style list + page methods (`1.0.10`).
- Reducing widget count alone (`1.0.9` → `1.0.10`) as the complete fix.
- Assuming `try/catch` in `build()` will show an error screen on iOS (catch UI also went blank historically).

### 2.2 Crypto / shared-module experiments (failed as Settings fix)
- Moving `hashPin` out of `totp.js` into `schema.js` (non-SHA) — Settings stayed blank.
- Replacing `Object.create(null)` with `{}` in lookup tables — Settings stayed blank.
- Bundling/importing `shared/schema` + `shared/totp` + `shared/otpauth` into Settings while rewriting UI — still blank after `1.0.10`.

### 2.3 Process / install assumptions that are insufficient alone
- “Just remove `??` and rebuild.”
- “Just match todo-list primitives and it will work on `20401`.”
- “Just match Authenticator / working `1.0.0` component set and it will work on `20401`.”
- Expecting uninstall + reinstall via `zeus preview` to always clear iOS `settingsStorage` / WKWebView Settings cache for the **same** `appId`.
- Writing diagnostic keys inside `build()` (can contribute to loading loops; `1.0.2` already showed endless loading).

### 2.4 What is NOT the blocker
Do **not** “fix” Settings by regressing these verified areas:
- Watch list/detail UI, PIN keypad on watch, gesture navigation.
- BLE `MessageBuilder` sync / chunk protocol.
- Pure-JS TOTP / otpauth / migration parsers (watch side OK).
- Local QR importer (`tools/qr-importer.html` + server script).
- App icons.

---

## 3. Current strongest hypothesis (post-`1.0.10`)

`1.0.10` shows **loading then blank**. That means the Settings bundle is being opened, not ignored. Combined with `1.0.4`/`1.0.5` staying blank after a near-revert of working UI, prioritize:

1. **Poisoned or sticky `settingsStorage` / Settings WebView cache for `appId: 20401`**
   - Working session stored 5 accounts + `securekey_ui_state` + sync status under `20401`.
   - Side Service clear of `securekey_ui_state` in `1.0.10` was **not** enough.
2. **Runtime crash while evaluating or building against existing vault data**
   - Heavy `shared/otpauth.js` / `shared/totp.js` still bundled into Settings.
   - Crash may happen before a visible tree paints (loading → white).
3. Secondary: stale `zeus bridge` / Zepp App process cache (force-close + fresh bridge still required when testing).

UI component choice is no longer the primary lever.

---

## 4. Protocol status

### Confirmed fix (`1.1.0`)
- **`appId: 20411`** (do not go back to `20401`)
- Lean Settings: **no** `totp`/`otpauth` in Settings bundle
- Migration/complex import via Side Service `securekey_import_req`

### Rules when restoring features (PIN, backup, edit, reorder, etc.)
1. **Never** re-import `shared/totp.js` / `shared/otpauth.js` into `setting/index.js` — keep parsers on Side Service / watch.
2. Never write to `settingsStorage` during `build()`.
3. Prefer Authenticator primitives: `View` / `TextInput` / `Button` (add `Select`/`Text` only in small slices and verify on phone).
4. Ship one feature slice per build; if blank returns, revert that slice.

---

## 5. Environment facts to keep
- Device targets: `gtr4new` (`9437441`), `gtr4` (`7930112` / `7930113` / `7864577`).
- `app.json`: `configVersion: v2`, `runtime.apiVersion` `1.0.0`, current `1.1.0` / `code: 12`, **`appId: 20411`**.
- Zepp iOS Settings: no useful JS console; failures often look like blank white or endless loading.
- Official safe Settings primitives: todo-list template; third-party: ZoLArk173/Authenticator.

## 6. Watch files — do not regress while fixing Settings
- `page/index.js`, `page/detail.js`
- `assets/gtr4new/icon.png`, `assets/gtr4/icon.png`
- `.agents/scripts/qr-import-server.sh`, `tools/qr-importer.html`
- BLE/crypto shared modules used by the watch/side service
