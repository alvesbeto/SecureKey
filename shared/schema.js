export const SCHEMA_VERSION = 1

export const BADGE_COLORS = [
  { name: 'Slate', hex: '#1E293B' },
  { name: 'Blue', hex: '#2563EB' },
  { name: 'Indigo', hex: '#4F46E5' },
  { name: 'Purple', hex: '#7C3AED' },
  { name: 'Emerald', hex: '#059669' },
  { name: 'Amber', hex: '#D97706' },
  { name: 'Rose', hex: '#E11D48' },
  { name: 'Cyan', hex: '#0891B2' }
]

export const VALID_ALGORITHMS = ['SHA1', 'SHA256', 'SHA512']
export const VALID_DIGITS = [6, 8]
export const VALID_PERIODS = [30, 60]

export const VAULT_STORAGE_KEY = 'securekey_vault'
export const SYNC_STATUS_STORAGE_KEY = 'securekey_sync_status'
export const VAULT_FILE_NAME = 'securekey_vault.json'
export const LOCK_FILE_NAME = 'securekey_lock.json'
export const BLE_SINGLE_LIMIT_BYTES = 3072
export const BLE_CHUNK_SIZE_CHARS = 2048

export const PIN_TIMEOUT_OPTIONS = [
  { name: 'Sempre ao abrir', value: '0' },
  { name: '30 segundos', value: '30' },
  { name: '1 minuto (Padrao)', value: '60' },
  { name: '5 minutos', value: '300' },
  { name: '15 minutos', value: '900' },
  { name: '30 minutos', value: '1800' }
]

export function pickColorForIssuer(issuer = '') {
  let hash = 0
  const text = String(issuer || 'SecureKey')
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  }
  return BADGE_COLORS[hash % BADGE_COLORS.length].hex
}

export function normalizeHexColor(color, fallbackIssuer = '') {
  if (typeof color === 'string') {
    const clean = color.trim()
    if (/^#[0-9a-fA-F]{6}$/.test(clean)) {
      return clean.toUpperCase()
    }
    if (/^[0-9a-fA-F]{6}$/.test(clean)) {
      return `#${clean.toUpperCase()}`
    }
  }
  return pickColorForIssuer(fallbackIssuer)
}

export function hexColorToInt(hex) {
  const clean = normalizeHexColor(hex).slice(1)
  return parseInt(clean, 16)
}

export function generateAccountId(seed = '') {
  const rand = Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0')
  const tail = String(seed || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toLowerCase()
  return `sk_${Date.now()}_${tail || 'k'}${rand}`
}

export function normalizeBase32String(secret) {
  return String(secret || '')
    .toUpperCase()
    .replace(/[\s\-=]+/g, '')
}

export function normalizeAccount(raw = {}, now = Date.now()) {
  const issuer = String(raw.issuer || raw.name || 'Conta')
    .trim()
    .slice(0, 40)
  const account = String(raw.account || raw.label || '')
    .trim()
    .slice(0, 64)
  const secret = normalizeBase32String(raw.secret)
  const digitsNum = Number(raw.digits)
  const digits = VALID_DIGITS.includes(digitsNum) ? digitsNum : 6
  const periodNum = Number(raw.period)
  const period = VALID_PERIODS.includes(periodNum) ? periodNum : 30
  const algoUpper = String(raw.algorithm || 'SHA1').toUpperCase()
  const algorithm = VALID_ALGORITHMS.includes(algoUpper) ? algoUpper : 'SHA1'
  const color = normalizeHexColor(raw.color, issuer)

  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : generateAccountId(issuer),
    issuer: issuer || 'Conta',
    account,
    secret,
    digits,
    period,
    algorithm,
    color,
    updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : now
  }
}

export function normalizePinLock(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const pinHash = typeof src.pinHash === 'string' ? src.pinHash.trim() : ''
  const enabled = Boolean(src.enabled) && pinHash.length > 0
  const pinLengthNum = Number(src.pinLength)
  const pinLength =
    Number.isFinite(pinLengthNum) && pinLengthNum >= 4 && pinLengthNum <= 6
      ? Math.trunc(pinLengthNum)
      : enabled
      ? 4
      : 0
  const timeoutNum = Number(src.timeoutSec)
  const timeoutSec =
    Number.isFinite(timeoutNum) && timeoutNum >= 0 ? Math.trunc(timeoutNum) : 60
  return {
    enabled,
    pinHash: enabled ? pinHash : '',
    pinLength,
    timeoutSec
  }
}

export function getAccountDedupeKey(raw) {
  const normalized = normalizeAccount(raw)
  if (!normalized.secret) {
    return ''
  }
  return `${normalized.secret}|${normalized.algorithm}|${normalized.digits}|${normalized.period}`
}

export function mergeUniqueAccounts(existingAccounts = [], incomingAccounts = []) {
  const existing = Array.isArray(existingAccounts) ? existingAccounts : []
  const incoming = Array.isArray(incomingAccounts) ? incomingAccounts : []
  const seen = {}
  const merged = []

  for (let i = 0; i < existing.length; i += 1) {
    const item = normalizeAccount(existing[i])
    if (!item.secret) continue
    const key = getAccountDedupeKey(item)
    seen[key] = item
    merged.push(item)
  }

  const added = []
  const skipped = []
  for (let i = 0; i < incoming.length; i += 1) {
    const item = normalizeAccount(incoming[i])
    if (!item.secret) continue
    const key = getAccountDedupeKey(item)
    if (Object.prototype.hasOwnProperty.call(seen, key)) {
      skipped.push(seen[key])
    } else {
      seen[key] = item
      merged.push(item)
      added.push(item)
    }
  }

  return { accounts: merged, added, skipped }
}

export function createEmptyVault(revision = 0) {
  return {
    version: SCHEMA_VERSION,
    revision,
    timeOffsetSec: 0,
    pinLock: normalizePinLock(null),
    accounts: []
  }
}

export function normalizeVault(raw) {
  if (!raw || typeof raw !== 'object') {
    return createEmptyVault(0)
  }
  const revision = Number.isFinite(Number(raw.revision)) ? Number(raw.revision) : 0
  const timeOffsetSec = Number.isFinite(Number(raw.timeOffsetSec))
    ? Math.trunc(Number(raw.timeOffsetSec))
    : 0
  const list = Array.isArray(raw.accounts) ? raw.accounts : []
  const accounts = list
    .map((item) => normalizeAccount(item, revision || Date.now()))
    .filter((item) => item.secret.length > 0)

  return {
    version: SCHEMA_VERSION,
    revision,
    timeOffsetSec,
    pinLock: normalizePinLock(raw.pinLock),
    accounts
  }
}

export function hashPin(pin) {
  const clean = String(pin || '').trim()
  if (!clean) {
    return ''
  }
  const text = `securekey-pin:${clean}`
  let h1 = 0x811c9dc5
  let h2 = 0x9e3779b9
  let h3 = 0x85ebca6b
  let h4 = 0xc2b2ae35
  const mul32 = (a, b) =>
    ((((a & 0xffff) * b) >>> 0) + ((((a >>> 16) * b) & 0xffff) << 16)) >>> 0
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i) & 0xff
    h1 = mul32(h1 ^ c, 0x01000193)
    h2 = mul32(h2 ^ (c + i), 0x85ebca6b)
    h3 = ((((h3 << 5) | (h3 >>> 27)) ^ (c * 31 + h1)) >>> 0)
    h4 = ((((h4 << 7) | (h4 >>> 25)) + h2 + c) >>> 0)
  }
  const toHex32 = (n) => {
    let s = (n >>> 0).toString(16)
    while (s.length < 8) {
      s = `0${s}`
    }
    return s
  }
  return toHex32(h1) + toHex32(h2) + toHex32(h3) + toHex32(h4)
}

export function getUtf8ByteLength(str) {
  let bytes = 0
  for (let i = 0; i < str.length; i += 1) {
    const code = str.charCodeAt(i)
    if (code < 0x80) {
      bytes += 1
    } else if (code < 0x800) {
      bytes += 2
    } else if (code >= 0xd800 && code <= 0xdbff) {
      i += 1
      bytes += 4
    } else {
      bytes += 3
    }
  }
  return bytes
}
