// @ts-ignore
const path = require('path')
// eslint-disable-next-line no-unused-vars
const homebridge = require('homebridge')
// eslint-disable-next-line no-unused-vars
const SensiboAccessory = require('../homekit/SensiboAccessory')
const sensiboApi = require('./api')
const syncHomeKitCache = require('./syncHomeKitCache')
const refreshState = require('./refreshState')
const storage = require('node-persist')
const pluginName = require('./../package.json').name
const platformName = require('./../package.json').platformName

/**
 * @implements {homebridge.DynamicPlatformPlugin}
 */
class SensiboACPlatform {

	/**
	 * @param {homebridge.Logging} log
	 * @param {homebridge.PlatformConfig} config
	 * @param {homebridge.API} api
	 */
	constructor(log, config, api) {
		/** @type {string} */
		this.pluginName = pluginName
		/** @type {string} */
		this.platformName = platformName
		/** @type {storage.LocalStorage} */
		this.storage = storage
		/** @type {homebridge.PlatformAccessory[]} */
		this.cachedAccessories = []
		/** @type {SensiboAccessory[]} */
		this.activeAccessories = []
		/** @type {homebridge.Logging} */
		this.log = log
		/** @type {homebridge.API} */
		this.api = api
		/** @type {function} */
		this.refreshState = refreshState(this)
		/** @type {function} */
		this.syncHomeKitCache = syncHomeKitCache(this)
		/** @type {boolean} */
		this.debug = config['debug'] || false

		// ~~~~~~~~~~~~~~~~~~~~~ Sensibo Specific ~~~~~~~~~~~~~~~~~~~~~ //

		/** @type {string} */
		this.apiKey = config['apiKey']
		/** @type {string} */
		this.username = config['username']
		/** @type {string} */
		this.password = config['password']

		if (!((this.username && this.password) || this.apiKey)) {
			this.log.error('XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX  --  ERROR  --  XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX\n')
			this.log.error(`Can't start ${this.pluginName} plugin without user credentials or an API key!!!\n`)
			this.log.error('XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX\n')

			return
		}

		/** @type {string} */
		this.name = config['name'] || platformName
		/** @type {boolean} */
		this.allowRepeatedCommands = config['allowRepeatedCommands'] || false
		/** @type {number} */
		this.carbonDioxideAlertThreshold = config['carbonDioxideAlertThreshold'] || 1500
		/** @type {boolean} */
		this.climateReactSwitchInAccessory = config['climateReactSwitchInAccessory'] || false
		/** @type {boolean} */
		this.disableAirQuality = config['disableAirQuality'] || false
		/** @type {boolean} */
		this.disableCarbonDioxide = config['disableCarbonDioxide'] || false
		/** @type {any[]} */
		this.devicesToExclude = config['devicesToExclude'] || []
		/** @type {boolean} */
		this.disableDry = config['disableDry'] || false
		/** @type {boolean} */
		this.disableFan = config['disableFan'] || false
		/** @type {boolean} */
		this.disableHorizontalSwing = config['disableHorizontalSwing'] || false
		/** @type {boolean} */
		this.disableHumidity = config['disableHumidity'] || false
		/** @type {boolean} */
		this.disableLightSwitch = config['disableLightSwitch'] || false
		/** @type {boolean} */
		this.disableVerticalSwing = config['disableVerticalSwing'] || false
		/** @type {boolean} */
		this.enableClimateReactAutoSetup = config['enableClimateReactAutoSetup'] || false
		/** @type {boolean} */
		this.enableClimateReactSwitch = config['enableClimateReactSwitch'] || false
		/** @type {boolean} */
		this.enableRepeatClimateReactAction = config['enableRepeatClimateReactAction'] || false
		/** @type {boolean} */
		this.enableHistoryStorage = config['enableHistoryStorage'] || false
		/** @type {boolean} */
		this.enableOccupancySensor = config['enableOccupancySensor'] || false
		/** @type {boolean} */
		this.enableSyncButton = config['enableSyncButton'] || false
		/** @type {boolean} */
		this.ignoreHomeKitDevices = config['ignoreHomeKitDevices'] || false
		/** @type {boolean} */
		this.syncButtonInAccessory = config['syncButtonInAccessory'] || false
		/** @type {boolean} */
		this.externalHumiditySensor = config['externalHumiditySensor'] || false
		/** @type {any[]} */
		this.locationsToInclude = config['locationsToInclude'] || []
		/** @type {import('../types').Device[]} */
		this.devices = []

		if (this.disableDry || this.disableFan) {
			this.log.info('The disableDry and disableFan options have been deprecated, please use modesToExclude instead. See README.md for more details.')
		}

		/** @type {string[]} */
		this.modesToExclude = config['modesToExclude']?.map(mode => {
			return mode.toUpperCase()
		}) || []

		/** @type {boolean} */
		this.disableAirConditioner = ['AUTO','COOL','HEAT'].every(mode => {
			return this.modesToExclude.indexOf(mode) !== -1
		})

		/** @type {string} */
		this.persistPath = path.join(this.api.user.persistPath(), '/../sensibo-persist')

		/** @type {import('../types').PlatformState} */
		this.emptyState = {
			devices: {},
			sensors: {},
			occupancy: {}
		}

		/** @type {string} */
		this.CELSIUS_UNIT = 'C'
		/** @type {string} */
		this.FAHRENHEIT_UNIT = 'F'
		/** @type {number} */
		this.VOCDENSITY_MAX = 10*1000
		/** @type {any[]} */
		this.locations = []
		/** @type {number} */
		const requestedInterval = 90*1000  // requested interval is hardcoded to 90 seconds (requested by the Sensibo company)

		/** @type {number} */
		this.refreshDelay = 5*1000  // refresh delay is hardcoded to 5 seconds
		/** @type {number} */
		this.pollingInterval = requestedInterval - this.refreshDelay
		/** @type {number | null} */
		this.pollingTimeout = null
		/** @type {boolean} */
		this.processingState = false
		/** @type {boolean} */
		this.setProcessing = false
		/** @type {number} */
		this.repeatClimateReactActionMinGapMilliseconds = 45*1000  // this must be smaller than platform.requestedInterval

		// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ //

		// define debug method to output debug logs when enabled in the config
		// TODO: add a "dev" mode to the logger?
		// this.log.devDebug?
		this.easyDebug = (...content) => {
			if (this.debug) {
				this.log.info(content.reduce((previous, current) => {
					return previous + ' ' + current
				}))
			} else {
				// I think this bubbles up to "platform" and then logs iff the homebridge debug log is enabled?
				this.log.debug(content.reduce((previous, current) => {
					return previous + ' ' + current
				}))
			}
		}

		this.api.on('didFinishLaunching', async () => {
			await this.storage.init({
				dir: this.persistPath,
				forgiveParseErrors: true
			})

			/** @type {import('../types').PlatformState} */
			this.cachedState = await this.storage.getItem('state') || this.emptyState

			if (!this.cachedState.devices) {
				this.cachedState = this.emptyState
			}

			this.sensiboApi = await sensiboApi(this)

			try {
				/** @type {import('../types').Device[]} */
				this.devices = await this.sensiboApi.getAllDevices()
				await this.storage.setItem('devices', this.devices)
			} catch(err) {
				/** @type {import('../types').Device[]} */
				this.devices = await this.storage.getItem('devices') || []
				this.log.info('ERR:', err)
			}

			this.syncHomeKitCache()

			if (this.pollingInterval) {
				this.pollingTimeout = setTimeout(this.refreshState, this.pollingInterval)
			}
		})
	}

	/**
	 * @param {homebridge.PlatformAccessory} accessory
	 **/
	configureAccessory(accessory) {
		this.cachedAccessories.push(accessory)
	}

}

module.exports = SensiboACPlatform