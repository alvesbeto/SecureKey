import {
  VAULT_FILE_NAME,
  LOCK_FILE_NAME,
  createEmptyVault,
  normalizeVault
} from './../shared/schema.js'

function strToBuf(str) {
  const buf = new ArrayBuffer(str.length * 2)
  const view = new Uint16Array(buf)
  for (let i = 0; i < str.length; i += 1) {
    view[i] = str.charCodeAt(i)
  }
  return new Uint8Array(buf)
}

function bufToStr(buf) {
  const view = new Uint16Array(buf)
  let out = ''
  const chunkSize = 2048
  for (let i = 0; i < view.length; i += chunkSize) {
    const end = Math.min(view.length, i + chunkSize)
    const slice = []
    for (let j = i; j < end; j += 1) {
      slice.push(view[j])
    }
    out += String.fromCharCode.apply(null, slice)
  }
  return out
}

export function loadWatchVault() {
  try {
    const [stat, err] = hmFS.stat(VAULT_FILE_NAME)
    if (err !== 0 || !stat || !stat.size) {
      return createEmptyVault(0)
    }
    const dest = new Uint8Array(stat.size)
    const file = hmFS.open(VAULT_FILE_NAME, hmFS.O_RDONLY)
    hmFS.seek(file, 0, hmFS.SEEK_SET)
    hmFS.read(file, dest.buffer, 0, stat.size)
    hmFS.close(file)
    const raw = bufToStr(dest.buffer)
    if (!raw) {
      return createEmptyVault(0)
    }
    return normalizeVault(JSON.parse(raw))
  } catch (err) {
    return createEmptyVault(0)
  }
}

export function saveWatchVault(vault) {
  const normalized = normalizeVault(vault)
  const data = JSON.stringify(normalized)
  const bytes = strToBuf(data)
  const file = hmFS.open(VAULT_FILE_NAME, hmFS.O_CREAT | hmFS.O_RDWR | hmFS.O_TRUNC)
  hmFS.seek(file, 0, hmFS.SEEK_SET)
  hmFS.write(file, bytes.buffer, 0, bytes.length)
  hmFS.close(file)
  return normalized
}

export function loadLockState() {
  try {
    const [stat, err] = hmFS.stat(LOCK_FILE_NAME)
    if (err !== 0 || !stat || !stat.size) {
      return { lastActiveAt: 0, pinHash: '' }
    }
    const dest = new Uint8Array(stat.size)
    const file = hmFS.open(LOCK_FILE_NAME, hmFS.O_RDONLY)
    hmFS.seek(file, 0, hmFS.SEEK_SET)
    hmFS.read(file, dest.buffer, 0, stat.size)
    hmFS.close(file)
    const raw = bufToStr(dest.buffer)
    const parsed = raw ? JSON.parse(raw) : {}
    return {
      lastActiveAt: Number(parsed.lastActiveAt) || 0,
      pinHash: typeof parsed.pinHash === 'string' ? parsed.pinHash : ''
    }
  } catch (err) {
    return { lastActiveAt: 0, pinHash: '' }
  }
}

export function saveLockState(lockState) {
  try {
    const payload = JSON.stringify({
      lastActiveAt: Number(lockState && lockState.lastActiveAt) || 0,
      pinHash: String((lockState && lockState.pinHash) || '')
    })
    const bytes = strToBuf(payload)
    const file = hmFS.open(LOCK_FILE_NAME, hmFS.O_CREAT | hmFS.O_RDWR | hmFS.O_TRUNC)
    hmFS.seek(file, 0, hmFS.SEEK_SET)
    hmFS.write(file, bytes.buffer, 0, bytes.length)
    hmFS.close(file)
  } catch (err) {
    // Ignore storage write errors on lock state.
  }
}

export function touchUnlockTimestamp(pinHash, nowMs = Date.now()) {
  saveLockState({ lastActiveAt: nowMs, pinHash })
}

export function isPinRequired(vault, lockState, sessionUnlocked, nowMs = Date.now()) {
  const pinLock = vault && vault.pinLock
  if (!pinLock || !pinLock.enabled || !pinLock.pinHash) {
    return false
  }
  if (!lockState || lockState.pinHash !== pinLock.pinHash) {
    return true
  }
  const timeoutMs = (Number(pinLock.timeoutSec) || 0) * 1000
  if (timeoutMs === 0) {
    return !sessionUnlocked
  }
  if (!lockState.lastActiveAt) {
    return true
  }
  return nowMs - lockState.lastActiveAt > timeoutMs
}

export function createChunkReceiver() {
  let active = null

  return {
    reset() {
      active = null
    },
    handleMessage(msg) {
      if (!msg || !msg.method) {
        return null
      }
      const params = msg.params || {}

      if (msg.method === 'SYNC_VAULT') {
        active = null
        return normalizeVault(params.vault)
      }

      if (msg.method === 'SYNC_CHUNK_BEGIN') {
        active = {
          transferId: params.transferId,
          totalChunks: Number(params.totalChunks) || 0,
          chunks: new Array(Number(params.totalChunks) || 0)
        }
        return null
      }

      if (msg.method === 'SYNC_CHUNK_DATA') {
        if (!active || active.transferId !== params.transferId) {
          return null
        }
        const idx = Number(params.index)
        if (idx >= 0 && idx < active.totalChunks) {
          active.chunks[idx] = String(params.chunk || '')
        }
        return null
      }

      if (msg.method === 'SYNC_CHUNK_END') {
        if (!active || active.transferId !== params.transferId) {
          return null
        }
        const joined = active.chunks.join('')
        active = null
        return normalizeVault(JSON.parse(joined))
      }

      return null
    }
  }
}
