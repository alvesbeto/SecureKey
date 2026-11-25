import './shared/device-polyfill'
import { MessageBuilder } from './shared/message'
import { loadWatchVault, saveWatchVault } from './utils/storage'

const logger = DeviceRuntimeCore.HmLogger.getLogger('securekey-app')

App({
  globalData: {
    messageBuilder: null,
    vault: null,
    selectedAccountId: null,
    sessionUnlocked: false
  },
  onCreate() {
    logger.log('SecureKey onCreate')
    const appId = typeof hmApp.packageInfo === 'function' ? hmApp.packageInfo().appId : 20421
    this.globalData.messageBuilder = new MessageBuilder({ appId })
    this.globalData.messageBuilder.connect()
    this.globalData.vault = loadWatchVault()
  },
  updateVault(nextVault) {
    this.globalData.vault = saveWatchVault(nextVault)
    return this.globalData.vault
  },
  onDestroy() {
    logger.log('SecureKey onDestroy')
    if (this.globalData.messageBuilder) {
      this.globalData.messageBuilder.disConnect()
    }
    this.globalData.selectedAccountId = null
  }
})
