const path = require('path')
const homebridge = require('homebridge')
// eslint-disable-next-line no-unused-vars
const SensiboAccessory = require('../homekit/SensiboAccessory')
const sensiboApi = require('./api')
const syncHomeKitCache = require('./syncHomeKitCache')
const refreshState = require('./refreshState')
const storage = require('node-persist')
const packageInfo = require('./../package.json')
const pluginName = packageInfo.name
const platformName = packageInfo.platformName

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
		const configForLogging = { ...config }

		if (configForLogging.apiKey) {
			configForLogging.apiKey = '[REDACTED]'
		}
		if (configForLogging.password) {
			configForLogging.password = '[REDACTED]'
		}

		JSON.stringify(configForLogging, null, 2).split('\n').forEach(line => {
			log.debug(line)
		})

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
		this.debug = config['debug'] != null ? config['debug'] : false

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
		this.name = config['name'] != null ? config['name'] : platformName
		/** @type {boolean} */
		this.allowRepeatedCommands = config['allowRepeatedCommands'] != null ? config['allowRepeatedCommands'] : false
		/** @type {number} */
		this.carbonDioxideAlertThreshold = config['carbonDioxideAlertThreshold'] != null ? config['carbonDioxideAlertThreshold'] : 1500
		/** @type {boolean} */
		this.climateReactSwitchInAccessory = config['climateReactSwitchInAccessory'] != null ? config['climateReactSwitchInAccessory'] : false
		/** @type {boolean} */
		this.disableAirQuality = config['disableAirQuality'] != null ? config['disableAirQuality'] : false
		/** @type {boolean} */
		this.disableCarbonDioxide = config['disableCarbonDioxide'] != null ? config['disableCarbonDioxide'] : false
		/** @type {any[]} */
		this.devicesToExclude = config['devicesToExclude'] != null ? config['devicesToExclude'] : []
		/** @type {boolean} */
		this.disableDry = config['disableDry'] != null ? config['disableDry'] : false
		/** @type {boolean} */
		this.disableFan = config['disableFan'] != null ? config['disableFan'] : false
		/** @type {boolean} */
		this.disableHorizontalSwing = config['disableHorizontalSwing'] != null ? config['disableHorizontalSwing'] : false
		/** @type {boolean} */
		this.disableHumidity = config['disableHumidity'] != null ? config['disableHumidity'] : false
		/** @type {boolean} */
		this.disableLightSwitch = config['disableLightSwitch'] != null ? config['disableLightSwitch'] : false
		/** @type {boolean} */
		this.disableVerticalSwing = config['disableVerticalSwing'] != null ? config['disableVerticalSwing'] : false
		/** @type {boolean} */
		this.enableClimateReactAutoSetup = config['enableClimateReactAutoSetup'] != null ? config['enableClimateReactAutoSetup'] : false
		/** @type {number} */
		this.climateReactAutoSetupOffset = config['climateReactAutoSetupOffset'] != null ? config['climateReactAutoSetupOffset'] : 0
		/** @type {number} */
		this.positiveClimateReactAutoSetupMultiplier = config['positiveClimateReactAutoSetupMultiplier'] != null ? config['positiveClimateReactAutoSetupMultiplier'] : 1
		/** @type {number} */
		this.negativeClimateReactAutoSetupMultiplier = config['negativeClimateReactAutoSetupMultiplier'] != null ? config['negativeClimateReactAutoSetupMultiplier'] : 1
		/** @type {boolean} */
		this.enableClimateReactSwitch = config['enableClimateReactSwitch'] != null ? config['enableClimateReactSwitch'] : false
		/** @type {boolean} */
		this.enableRepeatClimateReactAction = config['enableRepeatClimateReactAction'] != null ? config['enableRepeatClimateReactAction'] : false
		/** @type {number} */
		this.commandRepeatCount = config['commandRepeatCount'] != null ? config['commandRepeatCount'] : 1
		/** @type {number} */
		this.commandRepeatDelay = config['commandRepeatDelay'] != null ? config['commandRepeatDelay'] : 1000
		/** @type {boolean} */
		this.enableHistoryStorage = config['enableHistoryStorage'] != null ? config['enableHistoryStorage'] : false
		/** @type {boolean} */
		this.enableOccupancySensor = config['enableOccupancySensor'] != null ? config['enableOccupancySensor'] : false
		/** @type {boolean} */
		this.enableSyncButton = config['enableSyncButton'] != null ? config['enableSyncButton'] : false
		/** @type {boolean} */
		this.ignoreHomeKitDevices = config['ignoreHomeKitDevices'] != null ? config['ignoreHomeKitDevices'] : false
		/** @type {boolean} */
		this.syncButtonInAccessory = config['syncButtonInAccessory'] != null ? config['syncButtonInAccessory'] : false
		/** @type {boolean} */
		this.externalHumiditySensor = config['externalHumiditySensor'] != null ? config['externalHumiditySensor'] : false
		/** @type {any[]} */
		this.locationsToInclude = config['locationsToInclude'] != null ? config['locationsToInclude'] : []
		/** @type {import('../types').Device[]} */
		this.devices = []

		if (this.disableDry || this.disableFan) {
			this.log.info('The disableDry and disableFan options have been deprecated, please use modesToExclude instead. See README.md for more details.')
		}

		/** @type {string[]} */
		this.modesToExclude = config['modesToExclude'] != null ? config['modesToExclude'].map(mode => {
			return mode.toUpperCase()
		}) : []

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

		// Log all resolved configuration properties
		const resolvedConfig = {
			pluginName: this.pluginName,
			platformName: this.platformName,
			debug: this.debug,
			apiKey: this.apiKey ? '[REDACTED]' : undefined,
			username: this.username,
			password: this.password ? '[REDACTED]' : undefined,
			name: this.name,
			allowRepeatedCommands: this.allowRepeatedCommands,
			carbonDioxideAlertThreshold: this.carbonDioxideAlertThreshold,
			climateReactSwitchInAccessory: this.climateReactSwitchInAccessory,
			disableAirQuality: this.disableAirQuality,
			disableCarbonDioxide: this.disableCarbonDioxide,
			devicesToExclude: this.devicesToExclude,
			disableDry: this.disableDry,
			disableFan: this.disableFan,
			disableHorizontalSwing: this.disableHorizontalSwing,
			disableHumidity: this.disableHumidity,
			disableLightSwitch: this.disableLightSwitch,
			disableVerticalSwing: this.disableVerticalSwing,
			enableClimateReactAutoSetup: this.enableClimateReactAutoSetup,
			climateReactAutoSetupOffset: this.climateReactAutoSetupOffset,
			positiveClimateReactAutoSetupMultiplier: this.positiveClimateReactAutoSetupMultiplier,
			negativeClimateReactAutoSetupMultiplier: this.negativeClimateReactAutoSetupMultiplier,
			enableClimateReactSwitch: this.enableClimateReactSwitch,
			enableRepeatClimateReactAction: this.enableRepeatClimateReactAction,
			enableHistoryStorage: this.enableHistoryStorage,
			enableOccupancySensor: this.enableOccupancySensor,
			enableSyncButton: this.enableSyncButton,
			ignoreHomeKitDevices: this.ignoreHomeKitDevices,
			syncButtonInAccessory: this.syncButtonInAccessory,
			externalHumiditySensor: this.externalHumiditySensor,
			locationsToInclude: this.locationsToInclude,
			modesToExclude: this.modesToExclude,
			disableAirConditioner: this.disableAirConditioner,
			persistPath: this.persistPath,
			pollingInterval: this.pollingInterval,
			refreshDelay: this.refreshDelay,
			repeatClimateReactActionMinGapMilliseconds: this.repeatClimateReactActionMinGapMilliseconds
		}

		JSON.stringify(resolvedConfig, null, 2).split('\n').forEach(line => {
			log.debug(line)
		})

		// define debug method to output debug logs when enabled in the config
		// TODO: add a "dev" mode to the logger?
		// TODO: support warning/error etc. in addition to the default "info" level
		// this.loggger.devDebug?
		/**
		 * @param {homebridge.LogLevel} level
		 * @param  {...any} content
		 */
		this.easyDebug = (level, ...content) => {
			if (this.debug) {
				this.log.log(level, content.reduce((previous, current) => {
					return previous + ' ' + current
				}))
			} else {
				// I think this bubbles up to "platform" and then logs iff the homebridge debug log is enabled?
				this.log.debug(content.reduce((previous, current) => {
					return previous + ' ' + current
				}))
			}
		}

		this.easyDebugInfo = (...content) => {
			this.easyDebug(homebridge.LogLevel.INFO, ...content)
		}

		this.easyDebugError = (...content) => {
			this.easyDebug(homebridge.LogLevel.ERROR, ...content)
		}

		this.easyDebugWarning = (...content) => {
			this.easyDebug(homebridge.LogLevel.WARN, ...content)
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