# 02 — Architecture and BLE Protocol

## 1. System Architecture
SecureKey splits execution across three environments:
1. **Settings App (`setting/index.js`):** Mobile configuration UI inside Zepp App iOS (`AppSettingsPage`). Reads and writes `props.settingsStorage`.
2. **Side Service (`app-side/index.js`):** Background companion service (`AppSideService`). Listens to `settingsStorage` `change` events, fetches pending QR payloads from the optional local HTTP bridge (`tools/qr-importer.html`), and transfers vaults over BLE via `MessageBuilder` (`shared/message.js`).
3. **Device App (`app.js`, `page/index.js`, `page/detail.js`, `utils/storage.js`, `utils/time.js`):** Watch runtime on Zepp OS 1.0 using `hmFS` for local persistence and `hmSensor.createSensor(hmSensor.id.TIME)` for UTC time.

```text
[Safari QR Tool (:8787)] --HTTP GET /api/pending--> [Side Service (app-side/index.js)]
                                                             ^
                                                             | settingsStorage
[Settings App (setting/index.js)] <--------------------------+
                                                             |
                                                    BLE (MessageBuilder)
                                                             |
                                                             v
                                      [Device App (app.js / page/*.js) <-> hmFS]
```

## 2. Canonical Vault Schema (`shared/schema.js`)
Constants exported by `shared/schema.js`:
- `SCHEMA_VERSION = 1`
- `VAULT_STORAGE_KEY = 'securekey_vault'`
- `SYNC_STATUS_STORAGE_KEY = 'securekey_sync_status'`
- `VAULT_FILE_NAME = 'securekey_vault.json'`
- `LOCK_FILE_NAME = 'securekey_lock.json'`
- `BLE_SINGLE_LIMIT_BYTES = 3072`
- `BLE_CHUNK_SIZE_CHARS = 2048`
- `PIN_TIMEOUT_OPTIONS`: `'0'` (`Sempre ao abrir`), `'30'`, `'60'` (`1 minuto (Padrao)`), `'300'`, `'900'`, `'1800'`.

```json
{
  "version": 1,
  "revision": 1732536500000,
  "timeOffsetSec": 0,
  "pinLock": {
    "enabled": false,
    "pinHash": "",
    "pinLength": 0,
    "timeoutSec": 60
  },
  "accounts": [
    {
      "id": "sk_1732536500_a1b2",
      "issuer": "GitHub",
      "account": "dev-beto",
      "secret": "JBSWY3DPEHPK3PXP",
      "digits": 6,
      "period": 30,
      "algorithm": "SHA1",
      "color": "#2563EB",
      "updatedAt": 1732536500000
    }
  ]
}
```

## 3. Settings Storage Keys (`setting/index.js` & `app-side/index.js`)
- `securekey_vault`: Canonical serialized vault JSON.
- `securekey_sync_status`: `{ state: 'syncing'|'synced'|'error', revision, count, syncedAt, message? }`.
- `securekey_sync_nonce`: Trigger key written on manual sync tap to wake Side Service `change` listener.
- `securekey_qr_fetch_req`: `{ url, nonce }` written when tapping `Buscar QR do Servidor Local`; handled by `handleQrBridgeFetch()` in `app-side/index.js`.
- `securekey_status_banner`: Status message shown in Settings after BLE/QR/form actions.
- `sk_f_*` keys (since `1.0.8`): Flat string keys replacing `securekey_ui_state` JSON (`sk_f_editing_id`, `sk_f_issuer`, `sk_f_account`, `sk_f_secret`, `sk_f_digits`, `sk_f_period`, `sk_f_algorithm`, `sk_f_color`, `sk_f_uri`, `sk_f_qr_url`, `sk_f_pin`, `sk_f_backup`).

## 4. BLE Protocol (`shared/message.js`)
| Direction | Method | Purpose | Payload |
| :--- | :--- | :--- | :--- |
| Watch -> Phone | `SYNC_PULL` | Request latest vault on watch open | `{ clientRevision }` |
| Phone -> Watch | `SYNC_VAULT` | Push full vault when UTF-8 size `<= 3072` bytes | `{ vault }` |
| Phone -> Watch | `SYNC_CHUNK_BEGIN` | Start chunked transfer (`> 3072` bytes) | `{ transferId, revision, totalChunks, totalLength }` |
| Phone -> Watch | `SYNC_CHUNK_DATA` | Transfer slice (`<= 2048` chars) | `{ transferId, index, chunk }` |
| Phone -> Watch | `SYNC_CHUNK_END` | Finalize and apply chunked vault | `{ transferId }` |
| Watch -> Phone | `SYNC_ACK` | Confirm watch persistence | `{ revision, count, syncedAt }` |

## 5. Persistence and Cleanup
- **Watch Vault:** Saved via `hmFS` (`strToBuf`/`bufToStr` UTF-16LE encoding) in `securekey_vault.json`.
- **Watch Lock State:** Saved via `hmFS` in `securekey_lock.json` (`{ lastActiveAt, pinHash }`), paired with `app.globalData.sessionUnlocked` in `app.js`.
- **Conflict Resolution:** Phone `settingsStorage` is authoritative; watch applies incoming vaults and sends `SYNC_ACK`.
- **Lifecycle Cleanup:** `app.js` calls `messageBuilder.disConnect()` in `onDestroy()`. `page/index.js` and `page/detail.js` clear timers, unregister `hmApp.registerGestureEvent`, and remove `messageBuilder` listeners appropriately.
