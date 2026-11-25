import { decodeBase32, generateHOTP, formatOtpCode } from './../shared/totp'
import {
  loadWatchVault,
  loadLockState,
  touchUnlockTimestamp,
  isPinRequired
} from './../utils/storage'
import { getWatchUtcMs } from './../utils/time'

// Zepp color availability: avoid RGB channels in 1..46 (except pure black OLED bg).
const COLOR_BG = 0x000000
const COLOR_OUTER_TRACK = 0x3a3a42
const COLOR_INNER_TRACK = 0x2f2f36
const COLOR_CYAN = 0x00e5ff
const COLOR_CYAN_PILL_BG = 0x003e48
const COLOR_AMBER = 0xffb000
const COLOR_AMBER_PILL_BG = 0x5a3c00
const COLOR_CORAL = 0xff0030
const COLOR_CORAL_DIM = 0x680030
const COLOR_CORAL_PILL_BG = 0x580030
const COLOR_TEXT_PRIMARY = 0xffffff
const COLOR_TEXT_SECONDARY = 0x8e8e93

const OUTER_RADIUS = 214
const INNER_RADIUS = 196

Page({
  state: {
    vault: null,
    accounts: [],
    currentIndex: 0,
    issuerWidget: null,
    accountWidget: null,
    codeWidget: null,
    secPillWidget: null,
    secWidget: null,
    indexWidget: null,
    ringWidget: null,
    tickTimer: null,
    blinkTimer: null,
    blinkOn: true,
    cachedKey: '',
    cachedFormatted: '--- ---',
    lastDisplayText: '',
    lastRemaining: -1,
    lastSweep: -1,
    lastTone: null,
    spinAccum: 0
  },

  onInit(params) {
    let targetId = null
    if (typeof params === 'string' && params.trim()) {
      try {
        const parsed = JSON.parse(params)
        targetId = parsed && parsed.id
      } catch (err) {
        targetId = params
      }
    } else if (params && typeof params === 'object') {
      targetId = params.id
    }

    const app = getApp()
    const globalData = app && app._options && app._options.globalData
    if (!targetId && globalData) {
      targetId = globalData.selectedAccountId
    }

    this.state.vault = (globalData && globalData.vault) || loadWatchVault()
    if (this.enforceLockIfNeeded()) {
      return
    }
    this.state.accounts = (this.state.vault && this.state.vault.accounts) || []
    const idx = this.state.accounts.findIndex((item) => item.id === targetId)
    this.state.currentIndex = idx >= 0 ? idx : 0
  },

  build() {
    this.keepScreenAwake(true)

    hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: 0,
      y: 0,
      w: px(466),
      h: px(466),
      color: COLOR_BG
    })

    // Outer double-ring circular frame matching real-time visor style (pure swipe/gesture back navigation)
    hmUI.createWidget(hmUI.widget.ARC, {
      x: px(233 - OUTER_RADIUS),
      y: px(233 - OUTER_RADIUS),
      w: px(OUTER_RADIUS * 2),
      h: px(OUTER_RADIUS * 2),
      radius: px(OUTER_RADIUS),
      start_angle: -90,
      end_angle: 270,
      line_width: px(8),
      color: COLOR_OUTER_TRACK
    })

    hmUI.createWidget(hmUI.widget.ARC, {
      x: px(233 - INNER_RADIUS),
      y: px(233 - INNER_RADIUS),
      w: px(INNER_RADIUS * 2),
      h: px(INNER_RADIUS * 2),
      radius: px(INNER_RADIUS),
      start_angle: -90,
      end_angle: 270,
      line_width: px(2),
      color: COLOR_INNER_TRACK
    })

    this.state.ringWidget = hmUI.createWidget(hmUI.widget.ARC, {
      x: px(233 - OUTER_RADIUS),
      y: px(233 - OUTER_RADIUS),
      w: px(OUTER_RADIUS * 2),
      h: px(OUTER_RADIUS * 2),
      radius: px(OUTER_RADIUS),
      start_angle: -90,
      end_angle: 270,
      line_width: px(8),
      color: COLOR_CYAN
    })

    this.registerGestures()

    if (!this.state.accounts.length) {
      hmUI.createWidget(hmUI.widget.TEXT, {
        x: px(58),
        y: px(193),
        w: px(350),
        h: px(80),
        text: 'Nenhuma chave',
        text_size: px(24),
        color: COLOR_TEXT_SECONDARY,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.CENTER_V
      })
      return
    }

    this.state.issuerWidget = hmUI.createWidget(hmUI.widget.TEXT, {
      x: px(58),
      y: px(116),
      w: px(350),
      h: px(38),
      text: '',
      text_size: px(28),
      color: COLOR_CYAN,
      align_h: hmUI.align.CENTER_H,
      align_v: hmUI.align.CENTER_V,
      text_style: hmUI.text_style.ELLIPSIS
    })

    this.state.accountWidget = hmUI.createWidget(hmUI.widget.TEXT, {
      x: px(58),
      y: px(156),
      w: px(350),
      h: px(28),
      text: '',
      text_size: px(20),
      color: COLOR_TEXT_SECONDARY,
      align_h: hmUI.align.CENTER_H,
      align_v: hmUI.align.CENTER_V,
      text_style: hmUI.text_style.ELLIPSIS
    })

    this.state.codeWidget = hmUI.createWidget(hmUI.widget.TEXT, {
      x: px(38),
      y: px(192),
      w: px(390),
      h: px(84),
      text: '--- ---',
      text_size: px(54),
      char_space: 3,
      color: COLOR_TEXT_PRIMARY,
      align_h: hmUI.align.CENTER_H,
      align_v: hmUI.align.CENTER_V
    })

    this.state.secPillWidget = hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: px(189),
      y: px(286),
      w: px(88),
      h: px(36),
      radius: px(18),
      color: COLOR_CYAN_PILL_BG
    })

    this.state.secWidget = hmUI.createWidget(hmUI.widget.TEXT, {
      x: px(189),
      y: px(286),
      w: px(88),
      h: px(36),
      text: '30s',
      text_size: px(20),
      color: COLOR_CYAN,
      align_h: hmUI.align.CENTER_H,
      align_v: hmUI.align.CENTER_V
    })

    this.state.indexWidget = hmUI.createWidget(hmUI.widget.TEXT, {
      x: px(158),
      y: px(344),
      w: px(150),
      h: px(28),
      text: '1 / 1',
      text_size: px(18),
      color: COLOR_TEXT_SECONDARY,
      align_h: hmUI.align.CENTER_H,
      align_v: hmUI.align.CENTER_V
    })

    this.applyCurrentAccountMetadata()
    this.refreshDetail(true)
    this.startTickTimer()
  },

  onResume() {
    if (this.enforceLockIfNeeded()) {
      return
    }
    this.registerGestures()
    this.keepScreenAwake(true)
    this.refreshDetail(true)
    this.startTickTimer()
  },

  onPause() {
    this.unregisterGestures()
    this.recordUnlockedActivity()
    this.stopTickTimer()
    this.keepScreenAwake(false)
  },

  onDestroy() {
    this.unregisterGestures()
    this.recordUnlockedActivity()
    this.stopTickTimer()
    this.keepScreenAwake(false)
  },

  registerGestures() {
    this.unregisterGestures()
    this.state.spinAccum = 0

    // Device reported UP/DOWN inverted vs expected list order — swapped deltas.
    // Desired: swipe/scroll up = previous, down = next.
    if (typeof hmApp.registerGestureEvent === 'function' && hmApp.gesture) {
      hmApp.registerGestureEvent((event) => {
        if (event === hmApp.gesture.UP) {
          this.stepAccount(1)
          return true
        }
        if (event === hmApp.gesture.DOWN) {
          this.stepAccount(-1)
          return true
        }
        if (event === hmApp.gesture.LEFT) {
          hmApp.goBack()
          return true
        }
        if (event === hmApp.gesture.RIGHT) {
          return false
        }
        return false
      })
    }

    // Digital crown matches gestures: CCW/up = previous, CW/down = next.
    if (typeof hmApp.registerSpinEvent === 'function') {
      hmApp.registerSpinEvent((key, degree) => {
        const delta = Number(degree) || 0
        if (!delta) {
          return true
        }
        this.state.spinAccum += delta
        if (this.state.spinAccum >= 25) {
          this.state.spinAccum = 0
          this.stepAccount(1)
        } else if (this.state.spinAccum <= -25) {
          this.state.spinAccum = 0
          this.stepAccount(-1)
        }
        return true
      })
    }
  },

  unregisterGestures() {
    try {
      if (typeof hmApp.unregisterGestureEvent === 'function') {
        hmApp.unregisterGestureEvent()
      }
    } catch (err) {
      // Ignore if not supported or not registered.
    }
    try {
      if (typeof hmApp.unregisterSpinEvent === 'function') {
        hmApp.unregisterSpinEvent()
      }
    } catch (err) {
      // Ignore if not supported or not registered.
    }
    this.state.spinAccum = 0
  },

  enforceLockIfNeeded() {
    const app = getApp()
    const gd = app && app._options && app._options.globalData
    const lockState = loadLockState()
    const sessionUnlocked = Boolean(gd && gd.sessionUnlocked)
    if (isPinRequired(this.state.vault, lockState, sessionUnlocked, getWatchUtcMs())) {
      if (gd) {
        gd.sessionUnlocked = false
      }
      this.unregisterGestures()
      this.stopTickTimer()
      hmApp.goBack()
      return true
    }
    return false
  },

  recordUnlockedActivity() {
    const app = getApp()
    const gd = app && app._options && app._options.globalData
    const pinLock = this.state.vault && this.state.vault.pinLock
    if (gd && gd.sessionUnlocked && pinLock && pinLock.enabled && pinLock.pinHash) {
      touchUnlockTimestamp(pinLock.pinHash, getWatchUtcMs())
    }
  },

  keepScreenAwake(enable) {
    try {
      if (typeof hmApp.setScreenKeep === 'function') {
        hmApp.setScreenKeep(Boolean(enable))
      }
      if (enable && typeof hmSetting !== 'undefined' && typeof hmSetting.setBrightScreen === 'function') {
        hmSetting.setBrightScreen(60)
      }
      if (!enable && typeof hmSetting !== 'undefined' && typeof hmSetting.setBrightScreenCancel === 'function') {
        hmSetting.setBrightScreenCancel()
      }
    } catch (err) {
      // Ignore on unsupported firmware.
    }
  },

  getCurrentAccount() {
    return this.state.accounts[this.state.currentIndex] || null
  },

  stepAccount(delta) {
    const total = this.state.accounts.length
    if (total <= 1) return
    this.state.currentIndex = (this.state.currentIndex + delta + total) % total
    this.state.cachedKey = ''
    this.state.lastRemaining = -1
    this.applyCurrentAccountMetadata()
    this.refreshDetail(true)
  },

  applyCurrentAccountMetadata() {
    const item = this.getCurrentAccount()
    if (!item) return
    const total = this.state.accounts.length

    if (this.state.issuerWidget) {
      this.state.issuerWidget.setProperty(hmUI.prop.TEXT, item.issuer)
    }
    if (this.state.accountWidget) {
      this.state.accountWidget.setProperty(
        hmUI.prop.TEXT,
        item.account || `${item.algorithm} · ${item.digits} dig`
      )
    }
    if (this.state.codeWidget) {
      this.state.codeWidget.setProperty(
        hmUI.prop.TEXT_SIZE,
        item.digits === 8 ? px(42) : px(54)
      )
    }
    if (this.state.indexWidget) {
      this.state.indexWidget.setProperty(
        hmUI.prop.TEXT,
        `${this.state.currentIndex + 1} / ${total}`
      )
    }
  },

  refreshDetail(force = false) {
    const item = this.getCurrentAccount()
    if (!item) return

    const period = Number(item.period) === 60 ? 60 : 30
    const digits = Number(item.digits) === 8 ? 8 : 6
    const algorithm = String(item.algorithm || 'SHA1').toUpperCase()
    const timeOffsetSec = (this.state.vault && this.state.vault.timeOffsetSec) || 0

    const periodMs = period * 1000
    const nowMs = getWatchUtcMs() + Math.trunc(Number(timeOffsetSec) || 0) * 1000
    const nowSec = Math.floor(nowMs / 1000)
    const counter = Math.floor(nowSec / period)
    const elapsed = ((nowSec % period) + period) % period
    const remaining = period - elapsed
    const elapsedMs = ((nowMs % periodMs) + periodMs) % periodMs
    const remainingMs = periodMs - elapsedMs
    const sweep = Math.max(2, Math.round((remainingMs / periodMs) * 360))
    const cacheKey = `${item.id}:${counter}`

    // Compute cryptographic hash ONLY when opening or rolling over the 30s/60s window
    if (cacheKey !== this.state.cachedKey) {
      this.state.cachedKey = cacheKey
      try {
        const secretBytes = decodeBase32(item.secret)
        const code = generateHOTP(secretBytes, counter, digits, algorithm)
        this.state.cachedFormatted = formatOtpCode(code)
      } catch (err) {
        this.state.cachedFormatted = digits === 8 ? '---- ----' : '--- ---'
      }
    }

    const displayText = this.state.cachedFormatted
    if (force || displayText !== this.state.lastDisplayText) {
      this.state.lastDisplayText = displayText
      if (this.state.codeWidget) {
        this.state.codeWidget.setProperty(hmUI.prop.TEXT, displayText)
      }
    }

    let tone = 'cyan'
    let accentColor = COLOR_CYAN
    let pillBg = COLOR_CYAN_PILL_BG
    if (remaining <= 10) {
      tone = 'coral'
      accentColor = COLOR_CORAL
      pillBg = COLOR_CORAL_PILL_BG
    } else if (remaining <= 15) {
      tone = 'amber'
      accentColor = COLOR_AMBER
      pillBg = COLOR_AMBER_PILL_BG
    }

    const secondChanged = force || remaining !== this.state.lastRemaining
    if (secondChanged) {
      this.state.lastRemaining = remaining
      if (this.state.secWidget) {
        this.state.secWidget.setProperty(hmUI.prop.MORE, {
          text: `${remaining}s`,
          color: accentColor
        })
      }
      if (force || tone !== this.state.lastTone) {
        this.state.lastTone = tone
        if (this.state.secPillWidget) {
          this.state.secPillWidget.setProperty(hmUI.prop.MORE, {
            x: px(189),
            y: px(286),
            w: px(88),
            h: px(36),
            radius: px(18),
            color: pillBg
          })
        }
        if (this.state.issuerWidget) {
          this.state.issuerWidget.setProperty(hmUI.prop.MORE, { color: accentColor })
        }
      }
      if (tone === 'coral') {
        this.triggerSecondBlink(sweep)
      } else {
        this.stopBlinkTimer()
      }
    }

    if (this.state.ringWidget && (secondChanged || sweep !== this.state.lastSweep)) {
      this.state.lastSweep = sweep
      const ringColor = tone === 'coral' && this.state.blinkTimer ? COLOR_CORAL_DIM : accentColor
      this.state.ringWidget.setProperty(hmUI.prop.MORE, {
        end_angle: -90 + sweep,
        color: ringColor
      })
    }
  },

  triggerSecondBlink(sweep) {
    this.stopBlinkTimer()
    this.state.ringWidget.setProperty(hmUI.prop.MORE, {
      end_angle: -90 + sweep,
      color: COLOR_CORAL_DIM
    })
    this.state.blinkTimer = setTimeout(() => {
      this.state.blinkTimer = null
      if (this.state.ringWidget && this.state.lastTone === 'coral') {
        this.state.ringWidget.setProperty(hmUI.prop.MORE, {
          color: COLOR_CORAL
        })
      }
    }, 150)
  },

  stopBlinkTimer() {
    if (this.state.blinkTimer) {
      clearTimeout(this.state.blinkTimer)
      this.state.blinkTimer = null
    }
    this.state.blinkOn = true
  },

  startTickTimer() {
    this.stopTickTimer()
    this.state.tickTimer = setInterval(() => {
      this.refreshDetail(false)
    }, 50)
  },

  stopTickTimer() {
    this.stopBlinkTimer()
    if (this.state.tickTimer) {
      clearInterval(this.state.tickTimer)
      this.state.tickTimer = null
    }
  }
})
