# 03 — UI and UX Specification (Amazfit GTR 4 new / GTR 4 and iOS Zepp App)

## 1. Visual Design System and App Icon
- **Design Width:** `466` (`px()` scales 1:1 on `466x466` GTR 4 and up to `480x480` on GTR 4 new).
- **App Icon (`assets/gtr4new/icon.png`, `assets/gtr4/icon.png`):** `248x248` RGBA circular purple icon with solid white outer border (`(255,255,255,255)`), transparent outer corners, and white open padlock containing a purple fingerprint. `zeus build` resizes to `92px` (`gtr4new`) and `124px` (`gtr4`) in `.tga` format.

### Color Tokens
| Token | Hex | Purpose |
| :--- | :--- | :--- |
| `BG_OLED` | `#000000` | Pure black OLED background |
| `CARD_BG` | `#141416` | List row / PIN keypad surface |
| `OUTER_TRACK` | `#1C1E24` | Outer circular ring track |
| `ACCENT_CYAN` | `#00E5FF` | Account title, initials, countdown ring & `XXs` pill (`> 10s`) |
| `ALERT_CORAL` | `#FF5A5F` | Expiring countdown ring, title, & `XXs` pill (`<= 10s`) |
| `TEXT_PRIMARY` | `#FFFFFF` | Headings, issuer names, and OTP digits |
| `TEXT_SECONDARY` | `#8E8E93` | Account labels and `1 / N` indicator |
| `TEXT_MUTED` | `#636366` | Chevrons and secondary hints |

## 2. Screen 1 — Authenticator List & PIN Lock (`page/index.js`)
1. **No top header bar:** Top `SECUREKEY` + `HH:MM` header was intentionally removed per user request.
2. **Summary header (`y: 36..108`):** `Autenticadores` + `{N} chaves protegidas` + sync status label (`Local` / `Sincronizado`).
3. **Scrollable List (`hmUI.widget.SCROLL_LIST` at `y: 114, h: 326`):** `88px` tall cards (`10px` gap) showing initials (`getInitials`), issuer, account subtitle, and `>`. Tapping opens `page/detail` with `selectedAccountId`. Zero TOTP hashes are computed on Screen 1.
4. **Watch PIN Lock Screen (`lockGroup`):**
   - Shown on Screen 1 when `pinLock.enabled` is true and `isPinRequired(...)` returns true (first open, PIN hash mismatch, or elapsed inactivity > `pinLock.timeoutSec`; `timeoutSec === 0` locks every cold session).
   - 3x4 numeric keypad (`1..9`, `Apagar`, `0`, `Limpar`) accepting 4–6 digit PINs; displays masked dots (`*`) and unlocks automatically when `hashPin(pinEntry) === vault.pinLock.pinHash`, updating `securekey_lock.json` (`touchUnlockTimestamp`) and `sessionUnlocked = true`.
   - Switching to Screen 2 also verifies lock state via `enforceLockIfNeeded()` on `onResume()` and redirects back to Screen 1 if expired while paused.

## 3. Screen 2 — Real-Time Visor (`page/detail.js`)
**Zero touch buttons** remain on Screen 2; navigation is strictly gesture-based:
1. Full-perimeter outer countdown ring (`ARC` background `#1C1E24` + foreground arc, `radius: 214`, `line_width: 8`) + inner bezel ring (`radius: 196`).
2. Centered `issuer` (`y: 116`, `#00E5FF` or `#FF5A5F` when `remaining <= 10s`).
3. Centered `account` subtitle (`y: 156`).
4. Giant centered formatted OTP code (`y: 192`, `text_size: 54`, `char_space: 3`).
5. Rounded countdown pill (`y: 286`, `88x36`, `{remaining}s`).
6. Passive position indicator (`y: 344`, `{idx + 1} / {total}`).
7. **Gesture Navigation (`hmApp.registerGestureEvent`):**
   - `UP`: Previous key (`stepAccount(-1)` with wrap-around).
   - `DOWN`: Next key (`stepAccount(1)` with wrap-around).
   - `LEFT`: Return to list (`hmApp.goBack()`).
   - `RIGHT`: Unhandled (`return false`) so system default back gesture works normally.
   - Screen wake is extended (`setPageBrightTime`, `pauseDropWristScreenOff`) while active and restored on `onPause`/`onDestroy`.

## 4. iOS Companion Settings UI (`setting/index.js`) — Current `1.0.9` Design
Rewritten to use **only** the `os1.0/app/todo-list` primitive subset (`View`, `TextInput`, `Button`, plus `import { gettext } from 'i18n'`):
- Zero `Section`, `Text`, `Select`, `Toggle`, `Link`, `placeholder`, `multiline`, `disabled: true`, or `TextInput` without `onChange`.
- Cards implemented:
  1. **Sync & UTC Offset:** Sync trigger, `+1s` UTC increment, reset UTC to `0`.
  2. **Watch PIN Configuration:** Set 4–6 digit PIN, cycle inactivity timeout (`0s`, `30s`, `60s`, `300s`, `900s`, `1800s`), remove PIN.
  3. **QR / URI Import:** Local QR bridge URL fetch (`handleQrBridgeFetch`), paste `otpauth://` or `otpauth-migration://`.
  4. **Manual Key Form:** Add/edit issuer, account, Base32 secret, cycle digits (`6`/`8`), cycle period (`30`/`60`), cycle HMAC (`SHA1`/`SHA256`/`SHA512`), cycle badge color.
  5. **Saved Accounts List:** Reorder (`Subir`/`Descer`), load into form (`Editar`), delete (`Excluir`).
  6. **Backup & Restore:** Export JSON or `sk-b64:` Base64; import merge or replace.
- **Status:** Verified in WebKit `jsc` (`1.0.9`), **not yet verified non-blank on user's physical iPhone**.
