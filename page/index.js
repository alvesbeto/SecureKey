import { getInitials } from './../shared/totp'
import { hashPin } from './../shared/schema'
import {
  loadWatchVault,
  saveWatchVault,
  createChunkReceiver,
  loadLockState,
  touchUnlockTimestamp,
  isPinRequired
} from './../utils/storage'
import { getWatchUtcMs } from './../utils/time'

// Zepp design: avoid RGB channels in 1..46; list item spacing 8px (self-checklist).
const COLOR_BG = 0x000000
const COLOR_CARD_BG = 0x3a3a40
const COLOR_KEY_BG = 0x3a3a42
const COLOR_KEY_PRESS = 0x52525a
const COLOR_TEXT_PRIMARY = 0xffffff
const COLOR_TEXT_SECONDARY = 0x8e8e93
const COLOR_TEXT_MUTED = 0x636366
const COLOR_ACCENT_CYAN = 0x00e5ff
const COLOR_ALERT_CORAL = 0xff5a5f

function getGlobalData() {
  const app = getApp()
  return app && app._options && app._options.globalData
}

function getMessageBuilder() {
  const gd = getGlobalData()
  return gd && gd.messageBuilder
}

const LIST_CONFIG = {
  x: px(34),
  y: px(114),
  w: px(398),
  h: px(326),
  item_height: px(88),
  item_space: px(8),
  item_config: [
    {
      type_id: 1,
      item_bg_color: COLOR_CARD_BG,
      item_bg_radius: px(22),
      text_view: [
        {
          x: px(14),
          y: px(18),
          w: px(52),
          h: px(52),
          key: 'initials',
          color: COLOR_ACCENT_CYAN,
          text_size: px(22),
          align_h: hmUI.align.CENTER_H,
          align_v: hmUI.align.CENTER_V
        },
        {
          x: px(74),
          y: px(14),
          w: px(282),
          h: px(32),
          key: 'issuer',
          color: COLOR_TEXT_PRIMARY,
          text_size: px(23),
          align_h: hmUI.align.LEFT,
          align_v: hmUI.align.CENTER_V
        },
        {
          x: px(74),
          y: px(46),
          w: px(282),
          h: px(26),
          key: 'account',
          color: COLOR_TEXT_SECONDARY,
          text_size: px(17),
          align_h: hmUI.align.LEFT,
          align_v: hmUI.align.CENTER_V
        },
        {
          x: px(360),
          y: px(22),
          w: px(28),
          h: px(44),
          key: 'arrow',
          color: COLOR_TEXT_MUTED,
          text_size: px(22),
          align_h: hmUI.align.CENTER_H,
          align_v: hmUI.align.CENTER_V
        }
      ],
      text_view_count: 4,
      item_height: px(88)
    }
  ],
  item_config_count: 1
}

Page({
  state: {
    vault: null,
    countWidget: null,
    syncStatusWidget: null,
    scrollList: null,
    emptyGroup: null,
    lockGroup: null,
    pinDotsWidget: null,
    pinHintWidget: null,
    pinEntry: '',
    isLocked: false,
    chunkReceiver: null,
    onCallHandler: null
  },

  onInit() {
    this.state.chunkReceiver = createChunkReceiver()
    const gd = getGlobalData()
    this.state.vault = (gd && gd.vault) || loadWatchVault()

    const mb = getMessageBuilder()
    if (mb) {
      this.state.onCallHandler = ({ payload: buf }) => {
        try {
          const req = mb.buf2Json(buf)
          const nextVault = this.state.chunkReceiver.handleMessage(req)
          if (nextVault) {
            this.applySyncedVault(nextVault, true)
          }
        } catch (err) {
          this.setSyncHint('Erro ao receber chaves')
        }
      }
      mb.on('call', this.state.onCallHandler)
    }

    this.pullVaultFromPhone(true)
  },

  build() {
    hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: 0,
      y: 0,
      w: px(466),
      h: px(466),
      color: COLOR_BG
    })

    hmUI.createWidget(hmUI.widget.TEXT, {
      x: px(68),
      y: px(34),
      w: px(330),
      h: px(36),
      text: 'Autenticadores',
      text_size: px(28),
      color: COLOR_TEXT_PRIMARY,
      align_h: hmUI.align.CENTER_H,
      align_v: hmUI.align.CENTER_V
    })

    this.state.countWidget = hmUI.createWidget(hmUI.widget.TEXT, {
      x: px(68),
      y: px(72),
      w: px(330),
      h: px(22),
      text: this.formatCountLabel(0),
      text_size: px(17),
      color: COLOR_TEXT_SECONDARY,
      align_h: hmUI.align.CENTER_H,
      align_v: hmUI.align.CENTER_V
    })

    this.state.syncStatusWidget = hmUI.createWidget(hmUI.widget.TEXT, {
      x: px(96),
      y: px(95),
      w: px(274),
      h: px(16),
      text: '',
      text_size: px(13),
      color: COLOR_TEXT_MUTED,
      align_h: hmUI.align.CENTER_H,
      align_v: hmUI.align.CENTER_V
    })

    this.syncLockAndRender()
  },

  onResume() {
    const gd = getGlobalData()
    const globalVault = gd && gd.vault
    if (globalVault && globalVault.revision !== (this.state.vault && this.state.vault.revision)) {
      this.state.vault = globalVault
    }
    this.syncLockAndRender()
  },

  onPause() {
    this.recordUnlockedActivity()
  },

  onDestroy() {
    this.recordUnlockedActivity()
    const mb = getMessageBuilder()
    if (mb && this.state.onCallHandler) {
      mb.off('call', this.state.onCallHandler)
      this.state.onCallHandler = null
    }
    if (this.state.chunkReceiver) {
      this.state.chunkReceiver.reset()
    }
  },

  recordUnlockedActivity() {
    const gd = getGlobalData()
    const pinLock = this.state.vault && this.state.vault.pinLock
    if (gd && gd.sessionUnlocked && pinLock && pinLock.enabled && pinLock.pinHash) {
      touchUnlockTimestamp(pinLock.pinHash, getWatchUtcMs())
    }
  },

  syncLockAndRender() {
    const gd = getGlobalData()
    const nowMs = getWatchUtcMs()
    const lockState = loadLockState()
    const sessionUnlocked = Boolean(gd && gd.sessionUnlocked)
    const required = isPinRequired(this.state.vault, lockState, sessionUnlocked, nowMs)

    if (required) {
      if (gd) {
        gd.sessionUnlocked = false
      }
      this.state.isLocked = true
      this.state.pinEntry = ''
      if (this.state.scrollList) {
        this.state.scrollList.setProperty(hmUI.prop.VISIBLE, false)
      }
      this.showEmptyState(false)
      this.showLockScreen(true)
      return
    }

    if (gd) {
      gd.sessionUnlocked = true
    }
    this.state.isLocked = false
    this.recordUnlockedActivity()
    this.showLockScreen(false)
    this.renderVaultList()
  },

  showLockScreen(visible) {
    if (!visible) {
      if (this.state.lockGroup) {
        this.state.lockGroup.setProperty(hmUI.prop.VISIBLE, false)
      }
      return
    }

    if (!this.state.lockGroup) {
      const group = hmUI.createWidget(hmUI.widget.GROUP, {
        x: 0,
        y: 0,
        w: px(466),
        h: px(466)
      })

      group.createWidget(hmUI.widget.FILL_RECT, {
        x: 0,
        y: 0,
        w: px(466),
        h: px(466),
        color: COLOR_BG
      })

      group.createWidget(hmUI.widget.TEXT, {
        x: px(83),
        y: px(32),
        w: px(300),
        h: px(30),
        text: 'SECUREKEY PIN',
        text_size: px(20),
        color: COLOR_ACCENT_CYAN,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.CENTER_V
      })

      this.state.pinDotsWidget = group.createWidget(hmUI.widget.TEXT, {
        x: px(83),
        y: px(66),
        w: px(300),
        h: px(42),
        text: '',
        text_size: px(32),
        char_space: 6,
        color: COLOR_TEXT_PRIMARY,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.CENTER_V
      })

      this.state.pinHintWidget = group.createWidget(hmUI.widget.TEXT, {
        x: px(83),
        y: px(108),
        w: px(300),
        h: px(22),
        text: 'Digite seu PIN',
        text_size: px(15),
        color: COLOR_TEXT_SECONDARY,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.CENTER_V
      })

      const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '<']
      const startX = 89
      const startY = 140
      const btnW = 88
      const btnH = 56
      const gapX = 12
      const gapY = 10

      for (let i = 0; i < keys.length; i += 1) {
        const label = keys[i]
        const col = i % 3
        const row = Math.floor(i / 3)
        const bx = startX + col * (btnW + gapX)
        const by = startY + row * (btnH + gapY)
        const isAction = label === 'C' || label === '<'

        group.createWidget(hmUI.widget.BUTTON, {
          x: px(bx),
          y: px(by),
          w: px(btnW),
          h: px(btnH),
          radius: px(16),
          normal_color: isAction ? 0x14161a : COLOR_KEY_BG,
          press_color: COLOR_KEY_PRESS,
          color: isAction ? COLOR_TEXT_SECONDARY : COLOR_TEXT_PRIMARY,
          text_size: px(24),
          text: label,
          click_func: () => {
            this.handlePinKey(label)
          }
        })
      }

      this.state.lockGroup = group
    } else {
      this.state.lockGroup.setProperty(hmUI.prop.VISIBLE, true)
    }

    this.updatePinDisplay('Digite seu PIN', COLOR_TEXT_SECONDARY)
  },

  updatePinDisplay(hintText, hintColor) {
    const pinLock = (this.state.vault && this.state.vault.pinLock) || {}
    const targetLen = pinLock.pinLength || 4
    const enteredLen = this.state.pinEntry.length
    let dots = ''
    for (let i = 0; i < targetLen; i += 1) {
      dots += i < enteredLen ? '●' : '○'
    }
    if (this.state.pinDotsWidget) {
      this.state.pinDotsWidget.setProperty(hmUI.prop.TEXT, dots)
    }
    if (this.state.pinHintWidget && hintText) {
      this.state.pinHintWidget.setProperty(hmUI.prop.MORE, {
        text: hintText,
        color: hintColor || COLOR_TEXT_SECONDARY
      })
    }
  },

  handlePinKey(key) {
    const pinLock = (this.state.vault && this.state.vault.pinLock) || {}
    const targetLen = pinLock.pinLength || 4

    if (key === 'C') {
      this.state.pinEntry = ''
      this.updatePinDisplay('Digite seu PIN', COLOR_TEXT_SECONDARY)
      return
    }
    if (key === '<') {
      this.state.pinEntry = this.state.pinEntry.slice(0, -1)
      this.updatePinDisplay('Digite seu PIN', COLOR_TEXT_SECONDARY)
      return
    }
    if (this.state.pinEntry.length >= targetLen) {
      return
    }

    this.state.pinEntry += key
    this.updatePinDisplay('Digite seu PIN', COLOR_TEXT_SECONDARY)

    if (this.state.pinEntry.length === targetLen) {
      const enteredHash = hashPin(this.state.pinEntry)
      if (enteredHash === pinLock.pinHash) {
        const gd = getGlobalData()
        if (gd) {
          gd.sessionUnlocked = true
        }
        touchUnlockTimestamp(pinLock.pinHash, getWatchUtcMs())
        this.state.pinEntry = ''
        this.state.isLocked = false
        this.showLockScreen(false)
        this.renderVaultList()
      } else {
        this.state.pinEntry = ''
        this.updatePinDisplay('PIN incorreto', COLOR_ALERT_CORAL)
      }
    }
  },

  formatCountLabel(count) {
    if (count === 1) {
      return '1 chave protegida'
    }
    return `${count} chaves protegidas`
  },

  setSyncHint(text) {
    if (this.state.syncStatusWidget) {
      this.state.syncStatusWidget.setProperty(hmUI.prop.TEXT, text || '')
    }
  },

  applySyncedVault(incomingVault, sendAck = true) {
    const currentRev = (this.state.vault && this.state.vault.revision) || 0
    const currentLen = (this.state.vault && this.state.vault.accounts && this.state.vault.accounts.length) || 0
    if (incomingVault.revision >= currentRev || incomingVault.accounts.length !== currentLen) {
      const saved = saveWatchVault(incomingVault)
      this.state.vault = saved
      const gd = getGlobalData()
      if (gd) {
        gd.vault = saved
      }
      this.syncLockAndRender()
      this.setSyncHint('Sincronizado')
      const mb = getMessageBuilder()
      if (sendAck && mb) {
        mb.call({
          method: 'SYNC_ACK',
          params: {
            revision: saved.revision,
            count: saved.accounts.length,
            syncedAt: Date.now()
          }
        })
      }
    }
  },

  pullVaultFromPhone(silent = false) {
    const mb = getMessageBuilder()
    if (!mb) {
      return
    }
    const clientRevision = (this.state.vault && this.state.vault.revision) || 0
    if (!silent) {
      this.setSyncHint('Sincronizando...')
    }
    mb.request({
      method: 'SYNC_PULL',
      params: { clientRevision }
    })
      .then((res) => {
        const data = (res && res.result) || res
        if (data && data.vault) {
          this.applySyncedVault(data.vault, true)
          if (!silent) {
            hmUI.showToast({ text: 'Chaves atualizadas' })
          }
        } else {
          this.setSyncHint('')
        }
      })
      .catch(() => {
        this.setSyncHint('Modo offline')
        if (!silent) {
          hmUI.showToast({ text: 'Sem conexao BLE; modo offline' })
        }
      })
  },

  buildListItems(accounts) {
    return accounts.map((item) => ({
      initials: getInitials(item.issuer, item.account),
      issuer: item.issuer,
      account: item.account || `${item.digits} dig · ${item.period}s`,
      arrow: '>'
    }))
  },

  renderVaultList() {
    if (this.state.isLocked) {
      return
    }
    const accounts = (this.state.vault && this.state.vault.accounts) || []

    if (this.state.countWidget) {
      this.state.countWidget.setProperty(hmUI.prop.TEXT, this.formatCountLabel(accounts.length))
    }

    if (accounts.length === 0) {
      if (this.state.scrollList) {
        this.state.scrollList.setProperty(hmUI.prop.VISIBLE, false)
      }
      this.showEmptyState(true)
      return
    }

    this.showEmptyState(false)
    const dataList = this.buildListItems(accounts)
    const typeConfig = [{ start: 0, end: dataList.length - 1, type_id: 1 }]

    if (this.state.scrollList) {
      this.state.scrollList.setProperty(hmUI.prop.VISIBLE, true)
      this.state.scrollList.setProperty(hmUI.prop.UPDATE_DATA, {
        data_array: dataList,
        data_count: dataList.length,
        data_type_config: typeConfig,
        data_type_config_count: 1,
        on_page: 1
      })
    } else {
      this.state.scrollList = hmUI.createWidget(hmUI.widget.SCROLL_LIST, {
        ...LIST_CONFIG,
        data_array: dataList,
        data_count: dataList.length,
        data_type_config: typeConfig,
        data_type_config_count: 1,
        on_page: 1,
        item_click_func: (_list, index) => {
          const currentAccounts = (this.state.vault && this.state.vault.accounts) || []
          const selected = currentAccounts[index]
          if (selected) {
            this.openDetail(selected.id)
          }
        }
      })
    }
  },

  showEmptyState(visible) {
    if (!visible) {
      if (this.state.emptyGroup) {
        this.state.emptyGroup.setProperty(hmUI.prop.VISIBLE, false)
      }
      return
    }

    if (this.state.emptyGroup) {
      this.state.emptyGroup.setProperty(hmUI.prop.VISIBLE, true)
      return
    }

    const box = hmUI.createWidget(hmUI.widget.GROUP, {
      x: px(44),
      y: px(136),
      w: px(378),
      h: px(214)
    })

    box.createWidget(hmUI.widget.FILL_RECT, {
      x: 0,
      y: 0,
      w: px(378),
      h: px(214),
      radius: px(24),
      color: COLOR_CARD_BG
    })

    box.createWidget(hmUI.widget.STROKE_RECT, {
      x: 0,
      y: 0,
      w: px(378),
      h: px(214),
      radius: px(24),
      line_width: 1,
      color: 0x262629
    })

    box.createWidget(hmUI.widget.TEXT, {
      x: px(24),
      y: px(22),
      w: px(330),
      h: px(32),
      text: 'Nenhuma chave configurada',
      text_size: px(22),
      color: COLOR_TEXT_PRIMARY,
      align_h: hmUI.align.CENTER_H,
      align_v: hmUI.align.CENTER_V
    })

    box.createWidget(hmUI.widget.TEXT, {
      x: px(24),
      y: px(58),
      w: px(330),
      h: px(66),
      text: 'Abra o Zepp App no iPhone, entre em SecureKey > Configuracoes e adicione suas chaves.',
      text_size: px(17),
      color: COLOR_TEXT_SECONDARY,
      align_h: hmUI.align.CENTER_H,
      align_v: hmUI.align.CENTER_V,
      text_style: hmUI.text_style.WRAP
    })

    box.createWidget(hmUI.widget.BUTTON, {
      x: px(69),
      y: px(140),
      w: px(240),
      h: px(52),
      radius: px(26),
      normal_color: 0x2563eb,
      press_color: 0x1d4ed8,
      color: COLOR_TEXT_PRIMARY,
      text_size: px(20),
      text: 'Sincronizar',
      click_func: () => {
        this.pullVaultFromPhone(false)
      }
    })

    this.state.emptyGroup = box
  },

  openDetail(accountId) {
    const gd = getGlobalData()
    if (gd) {
      gd.selectedAccountId = accountId
    }
    hmApp.gotoPage({
      url: 'page/detail',
      param: JSON.stringify({ id: accountId })
    })
  }
})
