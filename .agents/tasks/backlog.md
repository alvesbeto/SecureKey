# SecureKey Backlog

## Phase 1: Environment and Research
- [x] Verify local Node.js (`v24.22.1`), npm (`11.19.1`), and `@zeppos/zeus-cli` (`1.9.3`).
- [x] Create `.agents/scripts/setup-env.sh`.
- [x] Document Zepp OS 1.0 API (`configVersion: v2`, `gtr4new` `9437441` + `gtr4` `7930112/7930113/7864577`) constraints in `01-research-and-constraints.md`.

## Phase 2: Architecture, Crypto, and UI Specs
- [x] Update `02-architecture-and-ble-protocol.md` (`MessageBuilder` BLE chunk protocol, `pinLock`, `sk_f_*` flat keys, local QR HTTP bridge).
- [x] Update `03-ui-ux-spec-gtr4-and-ios.md` (no-header list + PIN keypad, gesture-only detail visor, round purple padlock icon, `todo-list`-aligned Settings UI).
- [x] Update `04-crypto-and-storage-spec.md` (pure-JS Base32/HMAC/TOTP, ES5 `hashPin`, `LOCK_FILE_NAME`, protobuf migration).

## Phase 3: Watch & Companion Implementation
- [x] Implement pure-JS cryptography engine and `otpauth://` / `otpauth-migration://` / JSON / Base64 backup parsers (`shared/totp.js`, `shared/otpauth.js`, `shared/schema.js`).
- [x] Implement GTR 4 / GTR 4 new List Screen with PIN keypad (`page/index.js`) and gesture-navigated Visor Screen (`page/detail.js`).
- [x] Implement local Google Authenticator QR image decoder server (`tools/qr-importer.html`, `.agents/scripts/qr-import-server.sh`) and `app-side/index.js` bridge.
- [x] Generate round purple padlock+fingerprint icon (`assets/gtr4new/icon.png`, `assets/gtr4/icon.png`).
- [x] Create `.agents/scripts/verify-totp.js` and `.agents/scripts/build-and-preview.sh`.

## Phase 4: Open Blocker & Handoff Verification
- [x] Rewrite `setting/index.js` (`1.0.9`) to strict `todo-list` primitives (`View`, `TextInput` with `onChange` and zero `disabled: true`, `Button`) and verify in WebKit `jsc` + `zeus build`.
- [x] Rewrite `setting/index.js` (`1.0.10`) to Authenticator/`1.0.0` pattern (`Text`+`Select`+fewer widgets) and clear legacy `securekey_ui_state` from Side Service.
- [x] Record iPhone result for `1.0.10`: **loading → blank white**. Mark UI-primitive rewrites as exhausted in `06-known-issues-and-handoff.md`.
- [x] Attempt `1.1.0`: new `appId 20411` + lean Settings (no totp/otpauth imports; Authenticator primitives only; import via Side Service).
- [x] Verify `1.1.0` on iPhone — **WORKS**. Root cause: `20401` poison and/or heavy Settings crypto bundle.
- [ ] Optional: restore PIN / backup / edit / reorder in Settings **without** importing `totp`/`otpauth` into `setting/index.js`.
    