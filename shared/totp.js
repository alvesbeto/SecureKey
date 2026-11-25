const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const BASE32_LOOKUP = (() => {
  const map = {}
  for (let i = 0; i < BASE32_ALPHABET.length; i += 1) {
    map[BASE32_ALPHABET[i]] = i
  }
  return map
})()

export function decodeBase32(input) {
  const cleaned = String(input || '')
    .toUpperCase()
    .replace(/[\s\-]+/g, '')
    .replace(/=+$/g, '')

  if (!cleaned.length) {
    throw new Error('Base32 secret is empty.')
  }

  let bits = 0
  let value = 0
  const out = []

  for (let i = 0; i < cleaned.length; i += 1) {
    const ch = cleaned[i]
    const symbol = BASE32_LOOKUP[ch]
    if (symbol === undefined) {
      throw new Error(`Invalid Base32 character: ${ch}`)
    }
    value = (value << 5) | symbol
    bits += 5
    if (bits >= 8) {
      bits -= 8
      out.push((value >>> bits) & 0xff)
    }
  }

  return new Uint8Array(out)
}

export function encodeBase32(bytes) {
  if (!bytes || !bytes.length) {
    return ''
  }
  let bits = 0
  let value = 0
  let out = ''

  for (let i = 0; i < bytes.length; i += 1) {
    value = (value << 8) | (bytes[i] & 0xff)
    bits += 8
    while (bits >= 5) {
      bits -= 5
      out += BASE32_ALPHABET[(value >>> bits) & 0x1f]
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f]
  }
  return out
}

function rotr32(n, bits) {
  return (n >>> bits) | (n << (32 - bits))
}

function rotl32(n, bits) {
  return (n << bits) | (n >>> (32 - bits))
}

function writeUInt32BE(arr, offset, val) {
  arr[offset] = (val >>> 24) & 0xff
  arr[offset + 1] = (val >>> 16) & 0xff
  arr[offset + 2] = (val >>> 8) & 0xff
  arr[offset + 3] = val & 0xff
}

function readUInt32BE(arr, offset) {
  return (
    ((arr[offset] << 24) |
      (arr[offset + 1] << 16) |
      (arr[offset + 2] << 8) |
      arr[offset + 3]) >>>
    0
  )
}

function padMessage64(bytes) {
  const bitLen = bytes.length * 8
  const rem = (bytes.length + 9) % 64
  const padZeroBytes = rem === 0 ? 0 : 64 - rem
  const padded = new Array(bytes.length + 1 + padZeroBytes + 8).fill(0)
  for (let i = 0; i < bytes.length; i += 1) {
    padded[i] = bytes[i] & 0xff
  }
  padded[bytes.length] = 0x80

  const highBits = Math.floor(bitLen / 0x100000000)
  const lowBits = bitLen >>> 0
  writeUInt32BE(padded, padded.length - 8, highBits)
  writeUInt32BE(padded, padded.length - 4, lowBits)
  return padded
}

export function sha1(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  const msg = padMessage64(bytes)
  const w = new Array(80)

  let h0 = 0x67452301
  let h1 = 0xefcdab89
  let h2 = 0x98badcfe
  let h3 = 0x10325476
  let h4 = 0xc3d2e1f0

  for (let offset = 0; offset < msg.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = readUInt32BE(msg, offset + i * 4)
    }
    for (let i = 16; i < 80; i += 1) {
      w[i] = rotl32(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1)
    }

    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4

    for (let i = 0; i < 80; i += 1) {
      let f
      let k
      if (i < 20) {
        f = (b & c) | (~b & d)
        k = 0x5a827999
      } else if (i < 40) {
        f = b ^ c ^ d
        k = 0x6ed9eba1
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d)
        k = 0x8f1bbcdc
      } else {
        f = b ^ c ^ d
        k = 0xca62c1d6
      }

      const temp = (rotl32(a, 5) + f + e + k + w[i]) >>> 0
      e = d
      d = c
      c = rotl32(b, 30) >>> 0
      b = a
      a = temp
    }

    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
  }

  const out = new Uint8Array(20)
  writeUInt32BE(out, 0, h0)
  writeUInt32BE(out, 4, h1)
  writeUInt32BE(out, 8, h2)
  writeUInt32BE(out, 12, h3)
  writeUInt32BE(out, 16, h4)
  return out
}

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]

export function sha256(input) {
  const bytes = input
  const msg = padMessage64(bytes)
  const w = new Array(64)

  let h0 = 0x6a09e667
  let h1 = 0xbb67ae85
  let h2 = 0x3c6ef372
  let h3 = 0xa54ff53a
  let h4 = 0x510e527f
  let h5 = 0x9b05688c
  let h6 = 0x1f83d9ab
  let h7 = 0x5be0cd19

  for (let offset = 0; offset < msg.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = readUInt32BE(msg, offset + i * 4)
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }

    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    let f = h5
    let g = h6
    let h = h7

    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0
      const S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) >>> 0

      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }

    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
    h5 = (h5 + f) >>> 0
    h6 = (h6 + g) >>> 0
    h7 = (h7 + h) >>> 0
  }

  const out = new Array(32)
  writeUInt32BE(out, 0, h0)
  writeUInt32BE(out, 4, h1)
  writeUInt32BE(out, 8, h2)
  writeUInt32BE(out, 12, h3)
  writeUInt32BE(out, 16, h4)
  writeUInt32BE(out, 20, h5)
  writeUInt32BE(out, 24, h6)
  writeUInt32BE(out, 28, h7)
  return out
}

const SHA512_K = [
  0x428a2f98, 0xd728ae22, 0x71374491, 0x23ef65cd, 0xb5c0fbcf, 0xec4d3b2f, 0xe9b5dba5, 0x8189dbbc,
  0x3956c25b, 0xf348b538, 0x59f111f1, 0xb605d019, 0x923f82a4, 0xaf194f9b, 0xab1c5ed5, 0xda6d8118,
  0xd807aa98, 0xa3030242, 0x12835b01, 0x45706fbe, 0x243185be, 0x4ee4b28c, 0x550c7dc3, 0xd5ffb4e2,
  0x72be5d74, 0xf27b896f, 0x80deb1fe, 0x3b1696b1, 0x9bdc06a7, 0x25c71235, 0xc19bf174, 0xcf692694,
  0xe49b69c1, 0x9ef14ad2, 0xefbe4786, 0x384f25e3, 0x0fc19dc6, 0x8b8cd5b5, 0x240ca1cc, 0x77ac9c65,
  0x2de92c6f, 0x592b0275, 0x4a7484aa, 0x6ea6e483, 0x5cb0a9dc, 0xbd41fbd4, 0x76f988da, 0x831153b5,
  0x983e5152, 0xee66dfab, 0xa831c66d, 0x2db43210, 0xb00327c8, 0x98fb213f, 0xbf597fc7, 0xbeef0ee4,
  0xc6e00bf3, 0x3da88fc2, 0xd5a79147, 0x930aa725, 0x06ca6351, 0xe003826f, 0x14292967, 0x0a0e6e70,
  0x27b70a85, 0x46d22ffc, 0x2e1b2138, 0x5c26c926, 0x4d2c6dfc, 0x5ac42aed, 0x53380d13, 0x9d95b3df,
  0x650a7354, 0x8baf63de, 0x766a0abb, 0x3c77b2a8, 0x81c2c92e, 0x47edaee6, 0x92722c85, 0x1482353b,
  0xa2bfe8a1, 0x4cf10364, 0xa81a664b, 0xbc423001, 0xc24b8b70, 0xd0f89791, 0xc76c51a3, 0x0654be30,
  0xd192e819, 0xd6ef5218, 0xd6990624, 0x5565a910, 0xf40e3585, 0x5771202a, 0x106aa070, 0x32bbd1b8,
  0x19a4c116, 0xb8d2d0c8, 0x1e376c08, 0x5141ab53, 0x2748774c, 0xdf8eeb99, 0x34b0bcb5, 0xe19b48a8,
  0x391c0cb3, 0xc5c95a63, 0x4ed8aa4a, 0xe3418acb, 0x5b9cca4f, 0x7763e373, 0x682e6ff3, 0xd6b2b8a3,
  0x748f82ee, 0x5defb2fc, 0x78a5636f, 0x43172f60, 0x84c87814, 0xa1f0ab72, 0x8cc70208, 0x1a6439ec,
  0x90befffa, 0x23631e28, 0xa4506ceb, 0xde82bde9, 0xbef9a3f7, 0xb2c67915, 0xc67178f2, 0xe372532b,
  0xca273ece, 0xea26619c, 0xd186b8c7, 0x21c0c207, 0xeada7dd6, 0xcde0eb1e, 0xf57d4f7f, 0xee6ed178,
  0x06f067aa, 0x72176fba, 0x0a637dc5, 0xa2c898a6, 0x113f9804, 0xbef90dae, 0x1b710b35, 0x131c471b,
  0x28db77f5, 0x23047d84, 0x32caab7b, 0x40c72493, 0x3c9ebe0a, 0x15c9bebc, 0x431d67c4, 0x9c100d4c,
  0x4cc5d4be, 0xcb3e42b6, 0x597f299c, 0xfc657e2a, 0x5fcb6fab, 0x3ad6faec, 0x6c44198c, 0x4a475817
]

function rotr64(hi, lo, bits) {
  if (bits < 32) {
    return [
      ((hi >>> bits) | (lo << (32 - bits))) >>> 0,
      ((lo >>> bits) | (hi << (32 - bits))) >>> 0
    ]
  }
  const b = bits - 32
  return [
    ((lo >>> b) | (hi << (32 - b))) >>> 0,
    ((hi >>> b) | (lo << (32 - b))) >>> 0
  ]
}

function shr64(hi, lo, bits) {
  return [hi >>> bits, ((lo >>> bits) | (hi << (32 - bits))) >>> 0]
}

function add64(aHi, aLo, bHi, bLo) {
  const lo = (aLo >>> 0) + (bLo >>> 0)
  const carry = lo > 0xffffffff ? 1 : 0
  const hi = (aHi + bHi + carry) >>> 0
  return [hi, lo >>> 0]
}

export function sha512(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  const bitLen = bytes.length * 8
  const rem = (bytes.length + 17) % 128
  const padZeroBytes = rem === 0 ? 0 : 128 - rem
  const msg = new Uint8Array(bytes.length + 1 + padZeroBytes + 16)
  msg.set(bytes, 0)
  msg[bytes.length] = 0x80
  writeUInt32BE(msg, msg.length - 8, Math.floor(bitLen / 0x100000000))
  writeUInt32BE(msg, msg.length - 4, bitLen >>> 0)

  const H = [
    0x6a09e667, 0xf3bcc908,
    0xbb67ae85, 0x84caa73b,
    0x3c6ef372, 0xfe94f82b,
    0xa54ff53a, 0x5f1d36f1,
    0x510e527f, 0xade682d1,
    0x9b05688c, 0x2b3e6c1f,
    0x1f83d9ab, 0xfb41bd6b,
    0x5be0cd19, 0x137e2179
  ]

  const wHi = new Array(80)
  const wLo = new Array(80)

  for (let offset = 0; offset < msg.length; offset += 128) {
    for (let i = 0; i < 16; i += 1) {
      wHi[i] = readUInt32BE(msg, offset + i * 8)
      wLo[i] = readUInt32BE(msg, offset + i * 8 + 4)
    }

    for (let i = 16; i < 80; i += 1) {
      const a0 = rotr64(wHi[i - 15], wLo[i - 15], 1)
      const a1 = rotr64(wHi[i - 15], wLo[i - 15], 8)
      const a2 = shr64(wHi[i - 15], wLo[i - 15], 7)
      const s0Hi = (a0[0] ^ a1[0] ^ a2[0]) >>> 0
      const s0Lo = (a0[1] ^ a1[1] ^ a2[1]) >>> 0

      const b0 = rotr64(wHi[i - 2], wLo[i - 2], 19)
      const b1 = rotr64(wHi[i - 2], wLo[i - 2], 61)
      const b2 = shr64(wHi[i - 2], wLo[i - 2], 6)
      const s1Hi = (b0[0] ^ b1[0] ^ b2[0]) >>> 0
      const s1Lo = (b0[1] ^ b1[1] ^ b2[1]) >>> 0

      let sum = add64(wHi[i - 16], wLo[i - 16], s0Hi, s0Lo)
      sum = add64(sum[0], sum[1], wHi[i - 7], wLo[i - 7])
      sum = add64(sum[0], sum[1], s1Hi, s1Lo)
      wHi[i] = sum[0]
      wLo[i] = sum[1]
    }

    let aHi = H[0], aLo = H[1]
    let bHi = H[2], bLo = H[3]
    let cHi = H[4], cLo = H[5]
    let dHi = H[6], dLo = H[7]
    let eHi = H[8], eLo = H[9]
    let fHi = H[10], fLo = H[11]
    let gHi = H[12], gLo = H[13]
    let hHi = H[14], hLo = H[15]

    for (let i = 0; i < 80; i += 1) {
      const e1 = rotr64(eHi, eLo, 14)
      const e2 = rotr64(eHi, eLo, 18)
      const e3 = rotr64(eHi, eLo, 41)
      const S1Hi = (e1[0] ^ e2[0] ^ e3[0]) >>> 0
      const S1Lo = (e1[1] ^ e2[1] ^ e3[1]) >>> 0

      const chHi = ((eHi & fHi) ^ (~eHi & gHi)) >>> 0
      const chLo = ((eLo & fLo) ^ (~eLo & gLo)) >>> 0

      let t1 = add64(hHi, hLo, S1Hi, S1Lo)
      t1 = add64(t1[0], t1[1], chHi, chLo)
      t1 = add64(t1[0], t1[1], SHA512_K[i * 2], SHA512_K[i * 2 + 1])
      t1 = add64(t1[0], t1[1], wHi[i], wLo[i])

      const a1 = rotr64(aHi, aLo, 28)
      const a2 = rotr64(aHi, aLo, 34)
      const a3 = rotr64(aHi, aLo, 39)
      const S0Hi = (a1[0] ^ a2[0] ^ a3[0]) >>> 0
      const S0Lo = (a1[1] ^ a2[1] ^ a3[1]) >>> 0

      const majHi = ((aHi & bHi) ^ (aHi & cHi) ^ (bHi & cHi)) >>> 0
      const majLo = ((aLo & bLo) ^ (aLo & cLo) ^ (bLo & cLo)) >>> 0
      const t2 = add64(S0Hi, S0Lo, majHi, majLo)

      hHi = gHi; hLo = gLo
      gHi = fHi; gLo = fLo
      fHi = eHi; fLo = eLo
      const newE = add64(dHi, dLo, t1[0], t1[1])
      eHi = newE[0]; eLo = newE[1]
      dHi = cHi; dLo = cLo
      cHi = bHi; cLo = bLo
      bHi = aHi; bLo = aLo
      const newA = add64(t1[0], t1[1], t2[0], t2[1])
      aHi = newA[0]; aLo = newA[1]
    }

    const vars = [
      [aHi, aLo], [bHi, bLo], [cHi, cLo], [dHi, dLo],
      [eHi, eLo], [fHi, fLo], [gHi, gLo], [hHi, hLo]
    ]
    for (let j = 0; j < 8; j += 1) {
      const updated = add64(H[j * 2], H[j * 2 + 1], vars[j][0], vars[j][1])
      H[j * 2] = updated[0]
      H[j * 2 + 1] = updated[1]
    }
  }

  const out = new Uint8Array(64)
  for (let i = 0; i < 16; i += 1) {
    writeUInt32BE(out, i * 4, H[i])
  }
  return out
}

function getHashConfig(algorithm) {
  const algo = String(algorithm || 'SHA1').toUpperCase()
  if (algo === 'SHA256') {
    return { fn: sha256, blockSize: 64 }
  }
  if (algo === 'SHA512') {
    return { fn: sha512, blockSize: 128 }
  }
  if (algo === 'SHA1') {
    return { fn: sha1, blockSize: 64 }
  }
  throw new Error(`Unsupported HMAC algorithm: ${algorithm}`)
}

export function hmac(algorithm, keyBytes, messageBytes) {
  const { fn, blockSize } = getHashConfig(algorithm)
  let key = keyBytes instanceof Uint8Array ? keyBytes : new Uint8Array(keyBytes)
  if (key.length > blockSize) {
    key = fn(key)
  }

  const paddedKey = new Uint8Array(blockSize)
  paddedKey.set(key, 0)

  const ipad = new Uint8Array(blockSize + messageBytes.length)
  const opadBase = new Uint8Array(blockSize)

  for (let i = 0; i < blockSize; i += 1) {
    ipad[i] = paddedKey[i] ^ 0x36
    opadBase[i] = paddedKey[i] ^ 0x5c
  }
  ipad.set(messageBytes, blockSize)

  const innerHash = fn(ipad)
  const outer = new Uint8Array(blockSize + innerHash.length)
  outer.set(opadBase, 0)
  outer.set(innerHash, blockSize)
  return fn(outer)
}

export function counterToBytes(counter) {
  const buf = new Uint8Array(8)
  const high = Math.floor(counter / 0x100000000)
  const low = counter >>> 0
  writeUInt32BE(buf, 0, high)
  writeUInt32BE(buf, 4, low)
  return buf
}

export function generateHOTP(secretBytes, counter, digits = 6, algorithm = 'SHA1') {
  const msg = counterToBytes(counter)
  const digest = hmac(algorithm, secretBytes, msg)
  const offset = digest[digest.length - 1] & 0x0f
  const binCode =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff)

  const mod = digits === 8 ? 100000000 : 1000000
  const codeNum = (binCode >>> 0) % mod
  return String(codeNum).padStart(digits, '0')
}

export function formatOtpCode(code) {
  const str = String(code || '')
  if (str.length === 8) {
    return `${str.slice(0, 4)} ${str.slice(4)}`
  }
  if (str.length === 6) {
    return `${str.slice(0, 3)} ${str.slice(3)}`
  }
  return str
}

export function maskOtpCode(digits = 6) {
  return digits === 8 ? '•••• ••••' : '••• •••'
}

export function generateTOTP(account, utcMs = Date.now(), timeOffsetSec = 0) {
  const period = Number(account.period) === 60 ? 60 : 30
  const digits = Number(account.digits) === 8 ? 8 : 6
  const algorithm = String(account.algorithm || 'SHA1').toUpperCase()
  const nowSec = Math.floor(utcMs / 1000) + Math.trunc(Number(timeOffsetSec) || 0)
  const counter = Math.floor(nowSec / period)
  const elapsed = ((nowSec % period) + period) % period
  const remaining = period - elapsed
  const progressPct = Math.max(0, Math.min(100, Math.round((remaining / period) * 100)))

  const secretBytes = decodeBase32(account.secret)
  const code = generateHOTP(secretBytes, counter, digits, algorithm)

  return {
    code,
    formatted: formatOtpCode(code),
    remaining,
    period,
    progressPct,
    counter
  }
}

export function getInitials(issuer = '', account = '') {
  const source = String(issuer || account || 'SK').trim()
  const words = source.split(/[\s\-_.@]+/).filter(Boolean)
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase()
  }
  const single = words[0] || 'SK'
  const camelCaps = single.match(/[A-Z]/g)
  if (camelCaps && camelCaps.length >= 2 && single[0] === camelCaps[0]) {
    return `${camelCaps[0]}${camelCaps[1]}`
  }
  return single.slice(0, 2).toUpperCase()
}
