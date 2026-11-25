import { MessageBuilder } from './../shared/message'
import {
  VAULT_STORAGE_KEY,
  SYNC_STATUS_STORAGE_KEY,
  BLE_SINGLE_LIMIT_BYTES,
  BLE_CHUNK_SIZE_CHARS,
  createEmptyVault,
  normalizeVault,
  getUtf8ByteLength
} from './../shared/schema'
import { parseImportInput } from './../shared/otpauth'

const QR_FETCH_REQ_KEY = 'securekey_qr_fetch_req'
const IMPORT_REQ_KEY = 'securekey_import_req'
const STATUS_BANNER_KEY = 'securekey_status_banner'

const messageBuilder = new MessageBuilder()

function readStoredVault() {
  try {
    const raw = settings.settingsStorage.getItem(VAULT_STORAGE_KEY)
    if (!raw) {
      return createEmptyVault(0)
    }
    return normalizeVault(JSON.parse(raw))
  } catch (err) {
    return createEmptyVault(0)
  }
}

function writeSyncStatus(statusObj) {
  try {
    settings.settingsStorage.setItem(SYNC_STATUS_STORAGE_KEY, JSON.stringify(statusObj))
  } catch (err) {
    // Ignore storage write failure.
  }
}

function pushVaultToWatch(vault) {
  try {
    const serialized = JSON.stringify(vault)
    if (getUtf8ByteLength(serialized) <= BLE_SINGLE_LIMIT_BYTES) {
      messageBuilder.call({
        method: 'SYNC_VAULT',
        params: { vault }
      })
      return
    }

    const totalChunks = Math.ceil(serialized.length / BLE_CHUNK_SIZE_CHARS)
    const transferId = `tx_${Date.now()}`

    messageBuilder.call({
      method: 'SYNC_CHUNK_BEGIN',
      params: {
        transferId,
        revision: vault.revision,
        totalChunks,
        totalLength: serialized.length
      }
    })

    for (let i = 0; i < totalChunks; i += 1) {
      const start = i * BLE_CHUNK_SIZE_CHARS
      const chunk = serialized.slice(start, start + BLE_CHUNK_SIZE_CHARS)
      messageBuilder.call({
        method: 'SYNC_CHUNK_DATA',
        params: {
          transferId,
          index: i,
          chunk
        }
      })
    }

    messageBuilder.call({
      method: 'SYNC_CHUNK_END',
      params: { transferId }
    })
  } catch (err) {
    writeSyncStatus({
      state: 'error',
      message: err && err.message ? err.message : 'BLE sync failed',
      syncedAt: Date.now()
    })
  }
}

function setUiBanner(banner) {
  try {
    settings.settingsStorage.setItem(STATUS_BANNER_KEY, String(banner || ''))
  } catch (err) {
    // Ignore UI banner error.
  }
}

function handleImportPayload(rawReq) {
  try {
    const req = typeof rawReq === 'string' ? JSON.parse(rawReq) : rawReq
    const payload = String((req && req.payload) || rawReq || '').trim()
    if (!payload) {
      setUiBanner('Payload de importacao vazio.')
      return
    }
    const parsed = parseImportInput(payload)
    if (!parsed.accounts.length) {
      setUiBanner('Nenhuma chave TOTP encontrada no texto.')
      return
    }
    const vault = readStoredVault()
    const nextVault = normalizeVault({
      ...vault,
      revision: Date.now(),
      accounts: [...vault.accounts, ...parsed.accounts]
    })
    settings.settingsStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(nextVault))
    const warn = parsed.warnings && parsed.warnings.length
      ? ` (${parsed.warnings.length} aviso(s))`
      : ''
    setUiBanner(`${parsed.accounts.length} chave(s) importada(s)${warn}.`)
  } catch (err) {
    setUiBanner(
      `Erro ao importar: ${err && err.message ? err.message : 'falha no parse'}`
    )
  }
}

async function handleQrBridgeFetch(rawReq) {
  try {
    const req = JSON.parse(rawReq)
    const baseUrl = String((req && req.url) || '').trim().replace(/\/+$/, '')
    if (!/^https?:\/\//i.test(baseUrl)) {
      setUiBanner('Informe uma URL valida (ex: http://192.168.x.x:8787).')
      return
    }
    const res = await fetch({
      url: `${baseUrl}/api/pending`,
      method: 'GET'
    })
    const body = typeof res.body === 'string' ? JSON.parse(res.body) : res.body
    const payload = String((body && body.payload) || '').trim()
    if (!payload) {
      setUiBanner('Nenhum QR pendente no servidor. Envie a imagem primeiro no navegador.')
      return
    }
    const parsed = parseImportInput(payload)
    if (!parsed.accounts.length) {
      setUiBanner('Nenhuma chave TOTP encontrada no QR.')
      return
    }
    const vault = readStoredVault()
    const nextVault = normalizeVault({
      ...vault,
      revision: Date.now(),
      accounts: [...vault.accounts, ...parsed.accounts]
    })
    settings.settingsStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(nextVault))
    setUiBanner(`${parsed.accounts.length} chave(s) importada(s) do QR e sincronizadas!`)
  } catch (err) {
    setUiBanner('Falha ao conectar no servidor local. Use "Copiar URI(s)" no Safari e cole abaixo.')
  }
}

AppSideService({
  onInit() {
    messageBuilder.listen(() => {})

    // Drop legacy Settings UI blob that can poison iOS settingsStorage renders.
    try {
      const legacy = settings.settingsStorage.getItem('securekey_ui_state')
      if (legacy) {
        if (typeof settings.settingsStorage.removeItem === 'function') {
          settings.settingsStorage.removeItem('securekey_ui_state')
        } else {
          settings.settingsStorage.setItem('securekey_ui_state', '')
        }
      }
    } catch (err) {
      // Ignore legacy cleanup failure.
    }

    settings.settingsStorage.addListener('change', ({ key, newValue }) => {
      if (key === QR_FETCH_REQ_KEY && newValue) {
        handleQrBridgeFetch(newValue)
        return
      }
      if (key === IMPORT_REQ_KEY && newValue) {
        handleImportPayload(newValue)
        return
      }
      if (key !== VAULT_STORAGE_KEY && key !== 'securekey_sync_nonce') {
        return
      }
      const vault = readStoredVault()
      writeSyncStatus({
        state: 'syncing',
        revision: vault.revision,
        count: vault.accounts.length,
        syncedAt: Date.now()
      })
      pushVaultToWatch(vault)
    })

    messageBuilder.on('request', (ctx) => {
      const req = messageBuilder.buf2Json(ctx.request.payload)
      if (!req || !req.method) {
        ctx.response({ data: { error: 'Invalid request' } })
        return
      }

      if (req.method === 'SYNC_PULL') {
        const vault = readStoredVault()
        const clientRevision = Number((req.params && req.params.clientRevision) || 0)
        const serialized = JSON.stringify(vault)

        if (clientRevision > 0 && clientRevision === vault.revision) {
          ctx.response({ data: { result: { upToDate: true, revision: vault.revision } } })
          return
        }

        if (getUtf8ByteLength(serialized) <= BLE_SINGLE_LIMIT_BYTES) {
          ctx.response({ data: { result: { vault } } })
          return
        }

        ctx.response({ data: { result: { chunked: true, revision: vault.revision } } })
        pushVaultToWatch(vault)
        return
      }

      ctx.response({ data: { result: { ok: true } } })
    })

    messageBuilder.on('call', ({ payload: buf }) => {
      try {
        const req = messageBuilder.buf2Json(buf)
        if (req && req.method === 'SYNC_ACK') {
          const params = req.params || {}
          writeSyncStatus({
            state: 'synced',
            revision: Number(params.revision) || 0,
            count: Number(params.count) || 0,
            syncedAt: Number(params.syncedAt) || Date.now()
          })
        }
      } catch (err) {
        // Ignore malformed call payload.
      }
    })
  },
  onRun() {},
  onDestroy() {}
})
