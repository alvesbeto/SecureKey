import { encodeBase32, decodeBase32 } from './totp.js'
import {
  normalizeAccount,
  VALID_ALGORITHMS,
  VALID_DIGITS,
  VALID_PERIODS
} from './schema.js'

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const B64_LOOKUP = (() => {
  const map = {}
  for (let i = 0; i < B64_ALPHABET.length; i += 1) {
    map[B64_ALPHABET[i]] = i
  }
  return map
})()

export function decodeBase64(input) {
  let clean = String(input || '')
    .trim()
    .replace(/ /g, '+')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .replace(/[\r\n\t]+/g, '')

  while (clean.length % 4 !== 0) {
    clean += '='
  }

  const out = []
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = B64_LOOKUP[clean[i]] !== undefined ? B64_LOOKUP[clean[i]] : 0
    const c1 = B64_LOOKUP[clean[i + 1]] !== undefined ? B64_LOOKUP[clean[i + 1]] : 0
    const p2 = clean[i + 2] === '='
    const p3 = clean[i + 3] === '='
    const c2 = p2 ? 0 : B64_LOOKUP[clean[i + 2]] !== undefined ? B64_LOOKUP[clean[i + 2]] : 0
    const c3 = p3 ? 0 : B64_LOOKUP[clean[i + 3]] !== undefined ? B64_LOOKUP[clean[i + 3]] : 0

    const triple = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3
    out.push((triple >>> 16) & 0xff)
    if (!p2) out.push((triple >>> 8) & 0xff)
    if (!p3) out.push(triple & 0xff)
  }
  return new Uint8Array(out)
}

export function encodeBase64(bytes) {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const hasB1 = i + 1 < bytes.length
    const hasB2 = i + 2 < bytes.length
    const b1 = hasB1 ? bytes[i + 1] : 0
    const b2 = hasB2 ? bytes[i + 2] : 0

    const triple = (b0 << 16) | (b1 << 8) | b2
    out += B64_ALPHABET[(triple >>> 18) & 0x3f]
    out += B64_ALPHABET[(triple >>> 12) & 0x3f]
    out += hasB1 ? B64_ALPHABET[(triple >>> 6) & 0x3f] : '='
    out += hasB2 ? B64_ALPHABET[triple & 0x3f] : '='
  }
  return out
}

export function utf8ToBytes(str) {
  const out = []
  for (let i = 0; i < str.length; i += 1) {
    let code = str.charCodeAt(i)
    if (code < 0x80) {
      out.push(code)
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      const next = str.charCodeAt(i + 1)
      code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00)
      i += 1
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      )
    } else {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    }
  }
  return new Uint8Array(out)
}

export function bytesToUtf8(bytes) {
  let out = ''
  let i = 0
  while (i < bytes.length) {
    const b0 = bytes[i]
    if (b0 < 0x80) {
      out += String.fromCharCode(b0)
      i += 1
    } else if ((b0 & 0xe0) === 0xc0 && i + 1 < bytes.length) {
      const cp = ((b0 & 0x1f) << 6) | (bytes[i + 1] & 0x3f)
      out += String.fromCharCode(cp)
      i += 2
    } else if ((b0 & 0xf0) === 0xe0 && i + 2 < bytes.length) {
      const cp = ((b0 & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f)
      out += String.fromCharCode(cp)
      i += 3
    } else if ((b0 & 0xf8) === 0xf0 && i + 3 < bytes.length) {
      let cp =
        ((b0 & 0x07) << 18) |
        ((bytes[i + 1] & 0x3f) << 12) |
        ((bytes[i + 2] & 0x3f) << 6) |
        (bytes[i + 3] & 0x3f)
      cp -= 0x10000
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff))
      i += 4
    } else {
      i += 1
    }
  }
  return out
}

function parseQueryString(queryStr) {
  const params = {}
  if (!queryStr) return params
  const pairs = queryStr.split('&')
  for (let i = 0; i < pairs.length; i += 1) {
    const part = pairs[i]
    if (!part) continue
    const eqIdx = part.indexOf('=')
    const rawKey = eqIdx === -1 ? part : part.slice(0, eqIdx)
    const rawVal = eqIdx === -1 ? '' : part.slice(eqIdx + 1)
    const key = decodeURIComponent(rawKey).toLowerCase()
    const val = decodeURIComponent(rawVal)
    if (key !== '__proto__' && key !== 'constructor' && key !== 'prototype') {
      params[key] = val
    }
  }
  return params
}

function splitLabel(label) {
  const clean = decodeURIComponent(String(label || '').replace(/^\//, ''))
  const colonIdx = clean.indexOf(':')
  if (colonIdx === -1) {
    return { labelIssuer: '', account: clean.trim() }
  }
  return {
    labelIssuer: clean.slice(0, colonIdx).trim(),
    account: clean.slice(colonIdx + 1).trim()
  }
}

export function parseOtpAuthUri(uri) {
  const trimmed = String(uri || '').trim()
  if (!/^otpauth:\/\/totp\//i.test(trimmed)) {
    throw new Error('URI must start with otpauth://totp/.')
  }

  const withoutScheme = trimmed.replace(/^otpauth:\/\/totp\//i, '')
  const qIdx = withoutScheme.indexOf('?')
  const labelPart = qIdx === -1 ? withoutScheme : withoutScheme.slice(0, qIdx)
  const queryPart = qIdx === -1 ? '' : withoutScheme.slice(qIdx + 1)

  const params = parseQueryString(queryPart)
  if (!params.secret) {
    throw new Error('Missing secret parameter in otpauth URI.')
  }

  // Validate Base32 secret immediately.
  decodeBase32(params.secret)

  const { labelIssuer, account } = splitLabel(labelPart)
  const issuer = String(params.issuer || labelIssuer || account || 'Conta').trim()
  const algo = String(params.algorithm || 'SHA1').toUpperCase()
  const digits = Number(params.digits || 6)
  const period = Number(params.period || 30)

  if (!VALID_ALGORITHMS.includes(algo)) {
    throw new Error(`Unsupported algorithm: ${algo}`)
  }
  if (!VALID_DIGITS.includes(digits)) {
    throw new Error(`Unsupported digits: ${digits}`)
  }
  if (!VALID_PERIODS.includes(period)) {
    throw new Error(`Unsupported period: ${period}`)
  }

  return normalizeAccount({
    issuer,
    account: account === issuer ? '' : account,
    secret: params.secret,
    algorithm: algo,
    digits,
    period
  })
}

function readVarint(bytes, state) {
  let result = 0
  let shift = 0
  let count = 0
  while (state.pos < bytes.length) {
    const b = bytes[state.pos]
    state.pos += 1
    count += 1
    if (shift <= 49) {
      result += (b & 0x7f) * Math.pow(2, shift)
    }
    if ((b & 0x80) === 0) {
      return result
    }
    shift += 7
    if (count > 10) {
      throw new Error('Protobuf varint overflow.')
    }
  }
  throw new Error('Truncated protobuf varint.')
}

function skipProtobufField(bytes, state, wireType) {
  if (wireType === 0) {
    readVarint(bytes, state)
  } else if (wireType === 1) {
    state.pos += 8
  } else if (wireType === 2) {
    const len = readVarint(bytes, state)
    state.pos += len
  } else if (wireType === 5) {
    state.pos += 4
  } else {
    throw new Error(`Unsupported protobuf wire type: ${wireType}`)
  }
}

function parseOtpParametersMessage(bytes) {
  const state = { pos: 0 }
  let secretBytes = null
  let name = ''
  let issuer = ''
  let algoCode = 1
  let digitsCode = 1
  let typeCode = 2

  while (state.pos < bytes.length) {
    const tag = readVarint(bytes, state)
    const fieldNumber = tag >>> 3
    const wireType = tag & 0x07

    if (fieldNumber === 1 && wireType === 2) {
      const len = readVarint(bytes, state)
      secretBytes = bytes.slice(state.pos, state.pos + len)
      state.pos += len
    } else if (fieldNumber === 2 && wireType === 2) {
      const len = readVarint(bytes, state)
      name = bytesToUtf8(bytes.slice(state.pos, state.pos + len))
      state.pos += len
    } else if (fieldNumber === 3 && wireType === 2) {
      const len = readVarint(bytes, state)
      issuer = bytesToUtf8(bytes.slice(state.pos, state.pos + len))
      state.pos += len
    } else if (fieldNumber === 4 && wireType === 0) {
      algoCode = readVarint(bytes, state)
    } else if (fieldNumber === 5 && wireType === 0) {
      digitsCode = readVarint(bytes, state)
    } else if (fieldNumber === 6 && wireType === 0) {
      typeCode = readVarint(bytes, state)
    } else {
      skipProtobufField(bytes, state, wireType)
    }
  }

  return { secretBytes, name, issuer, algoCode, digitsCode, typeCode }
}

export function parseGoogleMigrationUri(uri) {
  const trimmed = String(uri || '').trim()
  if (!/^otpauth-migration:\/\/offline\?/i.test(trimmed)) {
    throw new Error('Migration URI must start with otpauth-migration://offline?.')
  }

  const qIdx = trimmed.indexOf('?')
  const params = parseQueryString(trimmed.slice(qIdx + 1))
  if (!params.data) {
    throw new Error('Missing data parameter in migration URI.')
  }

  const payloadBytes = decodeBase64(params.data)
  const state = { pos: 0 }
  const accounts = []
  const warnings = []

  const algoMap = { 0: 'SHA1', 1: 'SHA1', 2: 'SHA256', 3: 'SHA512' }
  const digitsMap = { 0: 6, 1: 6, 2: 8 }

  while (state.pos < payloadBytes.length) {
    const tag = readVarint(payloadBytes, state)
    const fieldNumber = tag >>> 3
    const wireType = tag & 0x07

    if (fieldNumber === 1 && wireType === 2) {
      const len = readVarint(payloadBytes, state)
      const entryBytes = payloadBytes.slice(state.pos, state.pos + len)
      state.pos += len
      const otp = parseOtpParametersMessage(entryBytes)

      if (otp.typeCode === 1) {
        warnings.push(`Skipped HOTP entry: ${otp.issuer || otp.name || 'unknown'}`)
        continue
      }
      if (!otp.secretBytes || !otp.secretBytes.length) {
        warnings.push(`Skipped empty secret: ${otp.issuer || otp.name || 'unknown'}`)
        continue
      }
      const algorithm = algoMap[otp.algoCode]
      if (!algorithm) {
        warnings.push(`Skipped unsupported algorithm (${otp.algoCode}): ${otp.issuer || otp.name}`)
        continue
      }

      const { labelIssuer, account } = splitLabel(otp.name)
      const finalIssuer = String(otp.issuer || labelIssuer || account || 'Conta').trim()
      accounts.push(
        normalizeAccount({
          issuer: finalIssuer,
          account: account === finalIssuer ? '' : account,
          secret: encodeBase32(otp.secretBytes),
          algorithm,
          digits: digitsMap[otp.digitsCode] || 6,
          period: 30
        })
      )
    } else {
      skipProtobufField(payloadBytes, state, wireType)
    }
  }

  return { accounts, warnings }
}

export function exportBackupJson(vault) {
  const list = vault && Array.isArray(vault.accounts) ? vault.accounts : []
  const accounts = list.map((item) => ({
    issuer: item.issuer,
    account: item.account,
    secret: item.secret,
    digits: item.digits,
    period: item.period,
    algorithm: item.algorithm,
    color: item.color
  }))

  return JSON.stringify(
    {
      format: 'securekey-backup-v1',
      exportedAt: new Date().toISOString(),
      timeOffsetSec: Number(vault && vault.timeOffsetSec) || 0,
      accounts
    },
    null,
    2
  )
}

export function exportBackupBase64(vault) {
  const json = exportBackupJson(vault)
  return `sk-b64:${encodeBase64(utf8ToBytes(json))}`
}

export function parseImportInput(rawText) {
  const text = String(rawText || '').trim()
  if (!text) {
    throw new Error('Paste a URI, migration string, or backup JSON first.')
  }

  if (/^sk-b64:/i.test(text)) {
    const decodedJson = bytesToUtf8(decodeBase64(text.slice(7)))
    return parseImportInput(decodedJson)
  }

  if (text.startsWith('{') || text.startsWith('[')) {
    const parsed = JSON.parse(text)
    const list = Array.isArray(parsed) ? parsed : parsed.accounts
    if (!Array.isArray(list)) {
      throw new Error('Backup JSON must include an accounts array.')
    }
    const accounts = []
    const warnings = []
    for (let i = 0; i < list.length; i += 1) {
      const item = list[i]
      if (!item || !item.secret) {
        warnings.push(`Skipped entry ${i + 1}: missing secret.`)
        continue
      }
      decodeBase32(item.secret)
      accounts.push(normalizeAccount(item))
    }
    return {
      accounts,
      warnings,
      timeOffsetSec: Number.isFinite(Number(parsed.timeOffsetSec))
        ? Math.trunc(Number(parsed.timeOffsetSec))
        : null
    }
  }

  const lines = text
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter(Boolean)

  const accounts = []
  const warnings = []

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (/^otpauth-migration:\/\//i.test(line)) {
      const res = parseGoogleMigrationUri(line)
      accounts.push(...res.accounts)
      warnings.push(...res.warnings)
    } else if (/^otpauth:\/\//i.test(line)) {
      accounts.push(parseOtpAuthUri(line))
    } else {
      warnings.push(`Skipped unrecognized line ${i + 1}.`)
    }
  }

  if (!accounts.length && warnings.length) {
    throw new Error(warnings[0])
  }

  return { accounts, warnings, timeOffsetSec: null }
}
