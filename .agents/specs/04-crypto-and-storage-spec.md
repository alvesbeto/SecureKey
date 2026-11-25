# 04 — Cryptography and Storage Specification

## 1. Base32 Decoder and Encoder (RFC 4648)
`shared/totp.js` implements:
- `decodeBase32(secret)`: Case-insensitive, strips whitespace/hyphens/`=`, validates against `ABCDEFGHIJKLMNOPQRSTUVWXYZ234567`, emits `Uint8Array`, throws on empty or invalid input. Uses plain `{}` lookup (`BASE32_LOOKUP`, no `Object.create(null)`).
- `encodeBase32(bytes)`: Encodes binary secrets extracted from Google Authenticator protobuf payloads back into canonical uppercase Base32.

## 2. Hash Functions and HMAC (`shared/totp.js`)
Pure-JS implementations compatible with QuickJS and Zepp iOS WebView:
- **SHA-1:** 160-bit digest, 64-byte block.
- **SHA-256:** 256-bit digest, 64-byte block (`SHA256_K` stored as plain JS `Array`, not `Uint32Array`).
- **SHA-512:** 512-bit digest, 128-byte block using 32-bit `[hi, lo]` pairs (no `BigInt`).
- **HMAC:** RFC 2104 over `SHA1`, `SHA256`, `SHA512`.

## 3. HOTP (RFC 4226) and TOTP (RFC 6238)
- Computes `nowSec = Math.floor(utcMs / 1000) + timeOffsetSec` and `counter = Math.floor(nowSec / period)`.
- Returns `{ code, formatted, remaining, period, counter }` where `formatted` splits 6-digit codes into `"XXX XXX"` and 8-digit codes into `"XXXX XXXX"`.

## 4. Watch PIN Hashing (`shared/schema.js`)
- `hashPin(pin)` was moved from `shared/totp.js` to `shared/schema.js` and replaced SHA-256 with a lightweight pure-ES5 128-bit integer mixing hash (`h1..h4` using 16-bit split `mul32` + rotations, formatted as 32 lowercase hex chars).
- Both watch (`page/index.js`) and Settings (`setting/index.js`) share `hashPin()` so hashes always match across phone and watch without needing SHA-256 inside `setting/index.js` or Screen 1.

## 5. URI, Protobuf Migration, and Backup Parsers (`shared/otpauth.js`)
- **`otpauth://totp/...`:** Parses label (`Issuer:Account` or `Account`), `secret`, `issuer`, `algorithm`, `digits`, `period` using plain string parsing (`parseQueryString` uses plain `{}` with prototype key guard, no `URL` constructor and no `Object.create(null)`).
- **`otpauth-migration://offline?data=...`:** Decodes Base64 (`B64_LOOKUP` using `{}`) and protobuf `MigrationPayload` -> `OtpParameters` (secret, name, issuer, algorithm, digits, TOTP/HOTP type).
- **JSON / Base64 Backup:** `exportBackupJson`, `exportBackupBase64` (`sk-b64:` prefix), and `parseImportInput` (auto-detects JSON, `sk-b64:`, or multi-line `otpauth://` / `otpauth-migration://`).

## 6. Watch Local Storage (`utils/storage.js`)
- `securekey_vault.json`: Vault accounts + `timeOffsetSec` + `pinLock` + `revision`.
- `securekey_lock.json`: `{ lastActiveAt, pinHash }` for PIN timeout tracking across page navigation and app reopen (`isPinRequired`).
