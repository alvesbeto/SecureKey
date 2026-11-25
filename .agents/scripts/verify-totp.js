#!/usr/bin/env node
import assert from 'node:assert/strict'
import {
  decodeBase32,
  encodeBase32,
  sha1,
  sha256,
  sha512,
  generateHOTP,
  generateTOTP,
  formatOtpCode,
  getInitials
} from '../../shared/totp.js'
import { normalizeVault, hashPin } from '../../shared/schema.js'
import { isPinRequired } from '../../utils/storage.js'
import {
  parseOtpAuthUri,
  parseGoogleMigrationUri,
  exportBackupJson,
  exportBackupBase64,
  parseImportInput,
  encodeBase64,
  utf8ToBytes
} from '../../shared/otpauth.js'

// RFC 6238 Appendix B test secrets (ASCII "12345678901234567890" + extended for SHA256/SHA512).
const SECRET_20 = utf8ToBytes('12345678901234567890')
const SECRET_32 = utf8ToBytes('12345678901234567890123456789012')
const SECRET_64 = utf8ToBytes('1234567890123456789012345678901234567890123456789012345678901234')

const RFC6238_VECTORS = [
  { time: 59, sha1: '94287082', sha256: '46119246', sha512: '90693936' },
  { time: 1111111109, sha1: '07081804', sha256: '68084774', sha512: '25091201' },
  { time: 1111111111, sha1: '14050471', sha256: '67062674', sha512: '99943326' },
  { time: 1234567890, sha1: '89005924', sha256: '91819424', sha512: '93441116' },
  { time: 2000000000, sha1: '69279037', sha256: '90698825', sha512: '38618901' },
  { time: 20000000000, sha1: '65353130', sha256: '77737706', sha512: '47863826' }
]

// Verify Base32 round-trip and normalization.
const b32Sample = encodeBase32(SECRET_20)
assert.equal(b32Sample, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
assert.deepEqual(decodeBase32('gezd gnbv-gy3t qojq gezd gnbv gy3t qojq===='), SECRET_20)

// Verify SHA-1, SHA-256, and SHA-512 empty-string digests.
function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
assert.equal(toHex(sha1(new Uint8Array(0))), 'da39a3ee5e6b4b0d3255bfef95601890afd80709')
assert.equal(
  toHex(sha256(new Uint8Array(0))),
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
)
assert.equal(
  toHex(sha512(new Uint8Array(0))),
  'cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e'
)

// Verify RFC 6238 TOTP vectors for SHA1, SHA256, and SHA512.
for (const vec of RFC6238_VECTORS) {
  const counter = Math.floor(vec.time / 30)
  assert.equal(generateHOTP(SECRET_20, counter, 8, 'SHA1'), vec.sha1, `SHA1 @ ${vec.time}`)
  assert.equal(generateHOTP(SECRET_32, counter, 8, 'SHA256'), vec.sha256, `SHA256 @ ${vec.time}`)
  assert.equal(generateHOTP(SECRET_64, counter, 8, 'SHA512'), vec.sha512, `SHA512 @ ${vec.time}`)
}

// Verify RFC 6238 6-digit TOTP with generateTOTP + countdown window.
const totpRfc6 = generateTOTP(
  {
    issuer: 'RFC6238',
    secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
    digits: 6,
    period: 30,
    algorithm: 'SHA1'
  },
  59 * 1000
)
assert.equal(totpRfc6.code, '287082')
assert.equal(totpRfc6.formatted, '287 082')
assert.equal(totpRfc6.remaining, 1)
assert.equal(totpRfc6.progressPct, 3)

const totpRes = generateTOTP(
  {
    issuer: 'GitHub',
    secret: 'JBSWY3DPEHPK3PXP',
    digits: 6,
    period: 30,
    algorithm: 'SHA1'
  },
  59 * 1000
)
assert.equal(totpRes.code, '996554')
assert.equal(totpRes.remaining, 1)
assert.equal(formatOtpCode('739425'), '739 425')
assert.equal(getInitials('GitHub'), 'GH')
assert.equal(getInitials('Figma'), 'FI')
assert.equal(getInitials('Google Cloud'), 'GC')

// Verify otpauth:// URI parser.
const parsedUri = parseOtpAuthUri(
  'otpauth://totp/GitHub:beto@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&algorithm=SHA256&digits=8&period=60'
)
assert.equal(parsedUri.issuer, 'GitHub')
assert.equal(parsedUri.account, 'beto@example.com')
assert.equal(parsedUri.secret, 'JBSWY3DPEHPK3PXP')
assert.equal(parsedUri.algorithm, 'SHA256')
assert.equal(parsedUri.digits, 8)
assert.equal(parsedUri.period, 60)

// Build synthetic Google Authenticator protobuf MigrationPayload and verify decoder.
function buildVarint(val) {
  const out = []
  let v = val >>> 0
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80)
    v >>>= 7
  }
  out.push(v)
  return out
}
function buildLenField(fieldNo, bytes) {
  return [...buildVarint((fieldNo << 3) | 2), ...buildVarint(bytes.length), ...bytes]
}
const otpEntry = new Uint8Array([
  ...buildLenField(1, Array.from(utf8ToBytes('12345678901234567890'))),
  ...buildLenField(2, Array.from(utf8ToBytes('Notion:alice@acme.io'))),
  ...buildLenField(3, Array.from(utf8ToBytes('Notion'))),
  ...buildVarint((4 << 3) | 0), 1, // SHA1
  ...buildVarint((5 << 3) | 0), 1, // 6 digits
  ...buildVarint((6 << 3) | 0), 2  // TOTP
])
const migrationPayload = new Uint8Array(buildLenField(1, Array.from(otpEntry)))
const migrationUri = `otpauth-migration://offline?data=${encodeURIComponent(encodeBase64(migrationPayload))}`
const migResult = parseGoogleMigrationUri(migrationUri)
assert.equal(migResult.accounts.length, 1)
assert.equal(migResult.accounts[0].issuer, 'Notion')
assert.equal(migResult.accounts[0].account, 'alice@acme.io')
assert.equal(migResult.accounts[0].secret, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')

// Also verify literal '+' in unescaped data= plus 10-byte negative varint batch_id.
const payloadWithNegBatchId = new Uint8Array([
  ...Array.from(migrationPayload),
  (5 << 3) | 0, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01
])
const rawB64WithPlus = encodeBase64(new Uint8Array([0xfb, 0xff, ...payloadWithNegBatchId]))
assert.ok(rawB64WithPlus.includes('+'))
const migWithPlusUri = `otpauth-migration://offline?data=${encodeBase64(payloadWithNegBatchId)}`
const migPlusResult = parseGoogleMigrationUri(migWithPlusUri)
assert.equal(migPlusResult.accounts.length, 1)
assert.equal(migPlusResult.accounts[0].issuer, 'Notion')

// Verify JSON & Base64 backup round-trip.
const jsonBackup = exportBackupJson({ timeOffsetSec: 2, accounts: [parsedUri, migResult.accounts[0]] })
const b64Backup = exportBackupBase64({ timeOffsetSec: 2, accounts: [parsedUri, migResult.accounts[0]] })
const reimportedJson = parseImportInput(jsonBackup)
const reimportedB64 = parseImportInput(b64Backup)
assert.equal(reimportedJson.accounts.length, 2)
assert.equal(reimportedJson.timeOffsetSec, 2)
assert.equal(reimportedB64.accounts.length, 2)
assert.equal(reimportedB64.accounts[1].issuer, 'Notion')

// Verify PIN hashing, vault pinLock normalization, and >60s / custom timeout locking.
const pinHash = hashPin('4829')
assert.equal(pinHash.length, 32)
assert.notEqual(pinHash, hashPin('1234'))
const lockedVault = normalizeVault({
  revision: 1,
  pinLock: { enabled: true, pinHash, pinLength: 4, timeoutSec: 60 },
  accounts: []
})
assert.equal(isPinRequired(lockedVault, { lastActiveAt: 100000, pinHash }, false, 150000), false)
assert.equal(isPinRequired(lockedVault, { lastActiveAt: 100000, pinHash }, false, 160000), false)
assert.equal(isPinRequired(lockedVault, { lastActiveAt: 100000, pinHash }, false, 160001), true)
assert.equal(isPinRequired(lockedVault, { lastActiveAt: 100000, pinHash: 'old' }, true, 100500), true)

const alwaysVault = normalizeVault({
  revision: 2,
  pinLock: { enabled: true, pinHash, pinLength: 4, timeoutSec: 0 },
  accounts: []
})
assert.equal(isPinRequired(alwaysVault, { lastActiveAt: 100000, pinHash }, false, 100001), true)
assert.equal(isPinRequired(alwaysVault, { lastActiveAt: 100000, pinHash }, true, 100001), false)

const disabledVault = normalizeVault({ revision: 3, pinLock: { enabled: false }, accounts: [] })
assert.equal(isPinRequired(disabledVault, { lastActiveAt: 0, pinHash: '' }, false, 999999), false)

console.log('ALL TOTP, PARSER & PIN LOCK TESTS PASSED')
