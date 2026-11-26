import { gettext } from 'i18n'
import {
  VAULT_STORAGE_KEY,
  PIN_TIMEOUT_OPTIONS,
  createEmptyVault,
  getAccountDedupeKey,
  hashPin,
  mergeUniqueAccounts,
  normalizeAccount,
  normalizePinLock,
  normalizeVault
} from './../shared/schema'

// Keep Settings on proven iOS-safe primitives only:
// View + TextInput (always with onChange) + Button.
// No Section / Text / Select (1.1.2 hid PIN on device).

const STATUS_BANNER_KEY = 'securekey_status_banner'
const SYNC_NONCE_KEY = 'securekey_sync_nonce'
const IMPORT_REQ_KEY = 'securekey_import_req'
const QR_FETCH_REQ_KEY = 'securekey_qr_fetch_req'
const QR_URL_KEY = 'sk_f_qr_url'
const PIN_DRAFT_KEY = 'sk_f_pin'
const URI_DRAFT_KEY = 'sk_f_uri'
const ISSUER_KEY = 'sk_f_issuer'
const ACCOUNT_KEY = 'sk_f_account'
const SECRET_KEY = 'sk_f_secret'

function readVault(storage) {
  try {
    const raw = storage.getItem(VAULT_STORAGE_KEY)
    if (!raw) {
      return createEmptyVault(0)
    }
    return normalizeVault(JSON.parse(raw))
  } catch (err) {
    return createEmptyVault(0)
  }
}

function writeVault(storage, vault) {
  const next = normalizeVault({
    ...vault,
    revision: Date.now()
  })
  storage.setItem(VAULT_STORAGE_KEY, JSON.stringify(next))
  return next
}

function getStr(storage, key, fallback) {
  try {
    const val = storage.getItem(key)
    return typeof val === 'string' ? val : fallback
  } catch (err) {
    return fallback
  }
}

function setStr(storage, key, val) {
  storage.setItem(key, String(val || ''))
}

function setBanner(storage, text) {
  setStr(storage, STATUS_BANNER_KEY, text)
}

function isLikelyBase32(secret) {
  const clean = String(secret || '')
    .toUpperCase()
    .replace(/[\s\-=]+/g, '')
  return clean.length >= 8 && /^[A-Z2-7]+$/.test(clean)
}

function parseSimpleOtpAuth(uri) {
  const text = String(uri || '').trim()
  if (!/^otpauth:\/\/totp\//i.test(text)) {
    return null
  }
  const withoutScheme = text.replace(/^otpauth:\/\/totp\//i, '')
  const q = withoutScheme.indexOf('?')
  const labelPart = decodeURIComponent(q === -1 ? withoutScheme : withoutScheme.slice(0, q))
  const query = q === -1 ? '' : withoutScheme.slice(q + 1)
  const params = {}
  const pairs = query.split('&')
  for (let i = 0; i < pairs.length; i += 1) {
    const pair = pairs[i]
    if (!pair) continue
    const eq = pair.indexOf('=')
    const key = decodeURIComponent(eq === -1 ? pair : pair.slice(0, eq)).toLowerCase()
    const val = decodeURIComponent(eq === -1 ? '' : pair.slice(eq + 1))
    if (key !== '__proto__' && key !== 'constructor' && key !== 'prototype') {
      params[key] = val
    }
  }
  if (!params.secret) {
    return null
  }
  const colon = labelPart.indexOf(':')
  const labelIssuer = colon === -1 ? '' : labelPart.slice(0, colon).trim()
  const account = colon === -1 ? labelPart.trim() : labelPart.slice(colon + 1).trim()
  const issuer = String(params.issuer || labelIssuer || account || 'Conta').trim()
  return normalizeAccount({
    issuer,
    account: account === issuer ? '' : account,
    secret: params.secret,
    algorithm: params.algorithm || 'SHA1',
    digits: Number(params.digits || 6),
    period: Number(params.period || 30)
  })
}

function findTimeoutLabel(timeoutSec) {
  const value = String(timeoutSec)
  for (let i = 0; i < PIN_TIMEOUT_OPTIONS.length; i += 1) {
    if (PIN_TIMEOUT_OPTIONS[i].value === value) {
      return PIN_TIMEOUT_OPTIONS[i].name
    }
  }
  return `${timeoutSec}s`
}

function nextTimeoutSec(current) {
  const values = []
  for (let i = 0; i < PIN_TIMEOUT_OPTIONS.length; i += 1) {
    values.push(Number(PIN_TIMEOUT_OPTIONS[i].value))
  }
  const cur = typeof current === 'number' && current >= 0 ? current : 60
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] === cur) {
      return values[(i + 1) % values.length]
    }
  }
  return 60
}

function pillButton(label, bg, onClick) {
  return Button({
    label: String(label),
    style: {
      fontSize: '12px',
      borderRadius: '30px',
      background: bg,
      color: 'white',
      marginRight: '8px',
      marginTop: '6px'
    },
    onClick
  })
}

function buttonRow(buttons) {
  return View(
    {
      style: {
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: '8px'
      }
    },
    buttons
  )
}

function cardView(children) {
  return View(
    {
      style: {
        marginTop: '10px',
        padding: '10px',
        border: '1px solid #eaeaea',
        borderRadius: '6px',
        backgroundColor: 'white'
      }
    },
    children
  )
}

AppSettingsPage({
  state: {
    props: {}
  },

  setProps(props) {
    this.state.props = props
  },

  savePin() {
    const storage = this.state.props.settingsStorage
    const cleanPin = getStr(storage, PIN_DRAFT_KEY, '').trim()
    if (!/^\d{4,6}$/.test(cleanPin)) {
      setBanner(storage, 'PIN: use 4 a 6 digitos numericos.')
      return
    }
    const vault = readVault(storage)
    const timeoutSec =
      vault.pinLock && typeof vault.pinLock.timeoutSec === 'number'
        ? vault.pinLock.timeoutSec
        : 60
    writeVault(storage, {
      ...vault,
      pinLock: normalizePinLock({
        enabled: true,
        pinHash: hashPin(cleanPin),
        pinLength: cleanPin.length,
        timeoutSec
      })
    })
    setStr(storage, PIN_DRAFT_KEY, '')
    setBanner(storage, `PIN salvo. Toque Sincronizar Relogio.`)
  },

  resetPin() {
    const storage = this.state.props.settingsStorage
    const vault = readVault(storage)
    const timeoutSec =
      vault.pinLock && typeof vault.pinLock.timeoutSec === 'number'
        ? vault.pinLock.timeoutSec
        : 60
    writeVault(storage, {
      ...vault,
      pinLock: normalizePinLock({
        enabled: false,
        pinHash: '',
        pinLength: 0,
        timeoutSec
      })
    })
    setStr(storage, PIN_DRAFT_KEY, '')
    setBanner(storage, 'PIN removido. Toque Sincronizar Relogio.')
  },

  cyclePinTimeout() {
    const storage = this.state.props.settingsStorage
    const vault = readVault(storage)
    const current =
      vault.pinLock && typeof vault.pinLock.timeoutSec === 'number'
        ? vault.pinLock.timeoutSec
        : 60
    const next = nextTimeoutSec(current)
    writeVault(storage, {
      ...vault,
      pinLock: normalizePinLock({
        ...(vault.pinLock || {}),
        timeoutSec: next
      })
    })
    setBanner(storage, `Timeout PIN: ${findTimeoutLabel(next)}. Sync no relogio.`)
  },

  moveAccount(index, delta) {
    const storage = this.state.props.settingsStorage
    const vault = readVault(storage)
    const target = index + delta
    if (target < 0 || target >= vault.accounts.length) {
      return
    }
    const next = vault.accounts.slice()
    const tmp = next[index]
    next[index] = next[target]
    next[target] = tmp
    writeVault(storage, { ...vault, accounts: next })
    setBanner(storage, 'Ordem atualizada. Toque Sincronizar Relogio.')
  },

  addFromUri(val) {
    const storage = this.state.props.settingsStorage
    const text = String(val || '').trim()
    if (!text) {
      return
    }
    if (/^otpauth-migration:\/\//i.test(text) || text.indexOf('\n') !== -1) {
      storage.setItem(
        IMPORT_REQ_KEY,
        JSON.stringify({ payload: text, nonce: Date.now() })
      )
      setStr(storage, URI_DRAFT_KEY, '')
      setBanner(storage, 'Importacao enviada ao Side Service...')
      return
    }
    const account = parseSimpleOtpAuth(text)
    if (!account) {
      storage.setItem(
        IMPORT_REQ_KEY,
        JSON.stringify({ payload: text, nonce: Date.now() })
      )
      setStr(storage, URI_DRAFT_KEY, '')
      setBanner(storage, 'URI enviada ao Side Service...')
      return
    }
    const vault = readVault(storage)
    const merged = mergeUniqueAccounts(vault.accounts, [account])
    if (!merged.added.length) {
      const existing = merged.skipped[0]
      setStr(storage, URI_DRAFT_KEY, '')
      setBanner(
        storage,
        `Chave ja cadastrada ("${(existing && existing.issuer) || account.issuer}").`
      )
      return
    }
    writeVault(storage, {
      ...vault,
      accounts: merged.accounts
    })
    setStr(storage, URI_DRAFT_KEY, '')
    setBanner(storage, `Chave "${account.issuer}" adicionada.`)
  },

  addManual() {
    const storage = this.state.props.settingsStorage
    const issuer = getStr(storage, ISSUER_KEY, '').trim()
    const accountName = getStr(storage, ACCOUNT_KEY, '').trim()
    const secret = getStr(storage, SECRET_KEY, '').trim()
    if (!issuer) {
      setBanner(storage, 'Informe o Issuer.')
      return
    }
    if (!isLikelyBase32(secret)) {
      setBanner(storage, 'Segredo Base32 invalido.')
      return
    }
    const entry = normalizeAccount({
      issuer,
      account: accountName,
      secret
    })
    const vault = readVault(storage)
    const merged = mergeUniqueAccounts(vault.accounts, [entry])
    if (!merged.added.length) {
      const existing = merged.skipped[0]
      setBanner(
        storage,
        `Chave ja cadastrada ("${(existing && existing.issuer) || entry.issuer}").`
      )
      return
    }
    writeVault(storage, {
      ...vault,
      accounts: merged.accounts
    })
    setStr(storage, ISSUER_KEY, '')
    setStr(storage, ACCOUNT_KEY, '')
    setStr(storage, SECRET_KEY, '')
    setBanner(storage, `Chave "${entry.issuer}" adicionada.`)
  },

  dedupeExistingAccounts() {
    const storage = this.state.props.settingsStorage
    const vault = readVault(storage)
    const merged = mergeUniqueAccounts([], vault.accounts)
    if (!merged.skipped.length) {
      setBanner(storage, 'Nenhuma chave duplicada encontrada.')
      return
    }
    writeVault(storage, {
      ...vault,
      accounts: merged.accounts
    })
    setBanner(
      storage,
      `${merged.skipped.length} chave(s) duplicada(s) removida(s). Sync no relogio.`
    )
  },

  deleteAccount(id) {
    const storage = this.state.props.settingsStorage
    const vault = readVault(storage)
    writeVault(storage, {
      ...vault,
      accounts: vault.accounts.filter((item) => item.id !== id)
    })
    setBanner(storage, 'Chave removida.')
  },

  build(props) {
    this.setProps(props)
    const storage = props.settingsStorage
    const vault = readVault(storage)
    const banner = getStr(storage, STATUS_BANNER_KEY, '')
    const appTitle = gettext('appName') || 'SecureKey'
    const qrUrl = getStr(storage, QR_URL_KEY, '').trim() || 'http://192.168.18.168:8787'
    const pinDraft = getStr(storage, PIN_DRAFT_KEY, '')
    const pinEnabled = Boolean(vault.pinLock && vault.pinLock.enabled)
    const pinTimeout =
      vault.pinLock && typeof vault.pinLock.timeoutSec === 'number'
        ? vault.pinLock.timeoutSec
        : 60
    const pinStatus = pinEnabled
      ? `PIN ATIVO (${vault.pinLock.pinLength} dig) / ${findTimeoutLabel(pinTimeout)}`
      : `PIN DESATIVADO / timeout ${findTimeoutLabel(pinTimeout)}`

    const seenKeys = {}
    let duplicateCount = 0
    const accountRows = []
    for (let i = 0; i < vault.accounts.length; i += 1) {
      const item = vault.accounts[i]
      const dedupeKey = getAccountDedupeKey(item)
      if (dedupeKey) {
        if (Object.prototype.hasOwnProperty.call(seenKeys, dedupeKey)) {
          duplicateCount += 1
        } else {
          seenKeys[dedupeKey] = true
        }
      }
      const idx = i
      accountRows.push(
        View(
          {
            style: {
              borderBottom: '1px solid #eaeaea',
              padding: '6px 0',
              marginBottom: '8px'
            }
          },
          [
            TextInput({
              label: `${idx + 1}. ${item.issuer || 'Conta'}`,
              bold: true,
              value: item.account || 'Sem conta',
              subStyle: { color: '#333', fontSize: '14px' },
              maxLength: 200,
              onChange: () => {}
            }),
            buttonRow([
              pillButton('Subir', '#6B7280', () => this.moveAccount(idx, -1)),
              pillButton('Descer', '#6B7280', () => this.moveAccount(idx, 1)),
              pillButton('Excluir', '#D85E33', () => this.deleteAccount(item.id))
            ])
          ]
        )
      )
    }

    const pinActionButtons = [
      pillButton(pinEnabled ? 'Redefinir PIN' : 'Salvar PIN', '#409EFF', () =>
        this.savePin()
      ),
      pillButton(`Timeout: ${findTimeoutLabel(pinTimeout)}`, '#059669', () =>
        this.cyclePinTimeout()
      )
    ]
    if (pinEnabled) {
      pinActionButtons.push(
        pillButton('Remover PIN', '#D85E33', () => this.resetPin())
      )
    }

    const savedHeaderButtons =
      duplicateCount > 0
        ? buttonRow([
            pillButton(
              `Remover ${duplicateCount} duplicada(s)`,
              '#D97706',
              () => this.dedupeExistingAccounts()
            )
          ])
        : null

    return View(
      {
        style: {
          padding: '12px 20px'
        }
      },
      [
        cardView([
          TextInput({
            label: `${appTitle} 1.2.3 / appId 20421`,
            bold: true,
            value: banner
              ? banner
              : `${vault.accounts.length} chave(s). Use Buscar chaves do servidor local apos Enviar no Safari.`,
            subStyle: { color: '#666', fontSize: '13px' },
            maxLength: 200,
            onChange: () => {}
          }),
          buttonRow([
            pillButton('Sincronizar Relogio', '#111827', () => {
              storage.setItem(SYNC_NONCE_KEY, String(Date.now()))
              setBanner(storage, 'Sync enviado. Abra o SecureKey no relogio.')
            })
          ])
        ]),

        cardView([
          TextInput({
            label: 'Servidor Local QR (qr-importer)',
            bold: true,
            value: qrUrl,
            subStyle: { color: '#333', fontSize: '14px' },
            maxLength: 200,
            onChange: (val) => {
              setStr(storage, QR_URL_KEY, val)
            }
          }),
          buttonRow([
            pillButton('Buscar chaves do servidor local', '#4F46E5', () => {
              storage.setItem(
                QR_FETCH_REQ_KEY,
                JSON.stringify({ url: qrUrl, nonce: Date.now() })
              )
              setBanner(storage, 'Buscando chaves enviadas ao servidor local...')
            })
          ])
        ]),

        cardView([
          TextInput({
            label: 'Colar otpauth:// ou otpauth-migration://',
            bold: true,
            value: getStr(storage, URI_DRAFT_KEY, ''),
            subStyle: { color: '#333', fontSize: '13px' },
            onChange: (val) => {
              setStr(storage, URI_DRAFT_KEY, val)
            }
          }),
          buttonRow([
            pillButton('Importar URI / Migration', '#059669', () => {
              const text = getStr(storage, URI_DRAFT_KEY, '').trim()
              if (!text) {
                setBanner(storage, 'Cole a URI (ou use Buscar chaves do servidor local).')
                return
              }
              this.addFromUri(text)
              setStr(storage, URI_DRAFT_KEY, '')
            })
          ])
        ]),

        cardView([
          TextInput({
            label: '=== PIN DO SMARTWATCH ===',
            bold: true,
            value: pinStatus,
            subStyle: { color: '#111', fontSize: '14px' },
            maxLength: 200,
            onChange: () => {}
          }),
          TextInput({
            label: 'Novo PIN (4 a 6 digitos)',
            bold: true,
            value: pinDraft,
            subStyle: { color: '#333', fontSize: '14px' },
            maxLength: 6,
            onChange: (val) => {
              setStr(storage, PIN_DRAFT_KEY, val)
            }
          }),
          buttonRow(pinActionButtons)
        ]),

        cardView([
          TextInput({
            label: 'Issuer',
            bold: true,
            value: getStr(storage, ISSUER_KEY, ''),
            subStyle: { color: '#333', fontSize: '14px' },
            maxLength: 40,
            onChange: (val) => {
              setStr(storage, ISSUER_KEY, val)
            }
          }),
          TextInput({
            label: 'Conta',
            bold: true,
            value: getStr(storage, ACCOUNT_KEY, ''),
            subStyle: { color: '#333', fontSize: '14px' },
            maxLength: 64,
            onChange: (val) => {
              setStr(storage, ACCOUNT_KEY, val)
            }
          }),
          TextInput({
            label: 'Segredo Base32',
            bold: true,
            value: getStr(storage, SECRET_KEY, ''),
            subStyle: { color: '#333', fontSize: '14px' },
            maxLength: 256,
            onChange: (val) => {
              setStr(storage, SECRET_KEY, val)
            }
          }),
          buttonRow([
            pillButton('Adicionar chave', '#059669', () => this.addManual())
          ])
        ]),

        cardView(
          [
            TextInput({
              label: 'Chaves salvas (Subir / Descer / Excluir)',
              bold: true,
              value:
                accountRows.length > 0
                  ? `${accountRows.length} conta(s)`
                  : 'Nenhuma chave ainda',
              subStyle: { color: '#666', fontSize: '13px' },
              maxLength: 200,
              onChange: () => {}
            }),
            savedHeaderButtons
          ]
            .concat(accountRows)
            .filter(Boolean)
        )
      ]
    )
  }
})
