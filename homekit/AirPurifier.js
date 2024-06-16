// eslint-disable-next-line no-unused-vars
const homebridge = require('homebridge')
// eslint-disable-next-line no-unused-vars
const SensiboACPlatform = require('../sensibo/SensiboACPlatform')
const Classes = require('../classes')
const SensiboAccessory = require('./SensiboAccessory')
const unified = require('../sensibo/unified')

class AirPurifier extends SensiboAccessory {

	/**
	 * @param {import('../types').Device} device*
	 * @param {SensiboACPlatform} platform
	 */
	constructor(device, platform) {
		const deviceInfo = unified.getDeviceInfo(device)
		const namePrefix = deviceInfo.room.name
		const nameSuffix = 'Pure'
		const type = 'AirPurifier'

		super(platform, deviceInfo.id, namePrefix, nameSuffix, type, '')

		/** @type {typeof homebridge.Service} */
		this.Service = platform.api.hap.Service
		/** @type {typeof homebridge.Characteristic} */
		this.Characteristic = platform.api.hap.Characteristic

		/** @type {import('../types').Device} */
		this.device = device
		this.appId = deviceInfo.appId
		this.productModel = deviceInfo.productModel
		this.serial = deviceInfo.serial
		this.manufacturer = deviceInfo.manufacturer
		this.room = deviceInfo.room
		this.disableLightSwitch = platform.disableLightSwitch
		this.filterService = deviceInfo.filterService
		/** @type {import('../types').Capabilities} */
		this.capabilities = unified.getCapabilities(device, platform)
		/** @type {import('../types').Measurements} */
		this.measurements = undefined

		/** @type {ProxyHandler<Classes.InternalAirPurifierState>} */
		const StateHandler = require('./StateHandler')(this, platform)
		const state = unified.getInternalAirPurifierState(device, platform)

		this.cachedState.devices[this.id] = state
		/** @type {Classes.InternalAirPurifierState} */
		this.state = new Proxy(state, StateHandler)
		this.StateManager = require('./StateManager')(this, platform)

		/** @type {undefined|homebridge.PlatformAccessory} */
		this.platformAccessory = platform.cachedAccessories.find(cachedAccessory => {
			return cachedAccessory.UUID === this.UUID
		})

		if (!this.platformAccessory) {
			this.log.info(`Creating New ${platform.platformName} ${this.type} Accessory in the ${this.room.name}`)
			this.platformAccessory = new this.api.platformAccessory(this.name, this.UUID)
			this.platformAccessory.context.type = this.type
			this.platformAccessory.context.deviceId = this.id

			platform.cachedAccessories.push(this.platformAccessory)

			// register the accessory
			this.api.registerPlatformAccessories(platform.pluginName, platform.platformName, [this.platformAccessory])
		}

		// TODO: enable logging?
		// if (platform.enableHistoryStorage) {
		// 	const fakeGatoHistoryService = require('fakegato-history')(this.api)

		// 	this.loggingService = new fakeGatoHistoryService('weather', this.platformAccessory, {
		// 		storage: 'fs',
		// 		path: platform.persistPath
		// 	})
		// }

		this.platformAccessory.context.roomName = this.room.name

		/** @type {undefined|homebridge.Service} */
		let informationService = this.platformAccessory.getService(this.Service.AccessoryInformation)

		if (!informationService) {
			/** @type {homebridge.Service} */
			informationService = this.platformAccessory.addService(this.Service.AccessoryInformation)
		}

		informationService
			.setCharacteristic(this.Characteristic.Manufacturer, this.manufacturer)
			.setCharacteristic(this.Characteristic.Model, this.productModel)
			.setCharacteristic(this.Characteristic.SerialNumber, this.serial)

		this.addAirPurifierService()

		if (this.capabilities.FAN && this.capabilities.FAN.light && !this.disableLightSwitch) {
			this.addLightSwitch()
		} else {
			this.removeLightSwitch()
		}
	}

	addAirPurifierService() {
		this.easyDebugInfo(`${this.name} - Adding AirPurifierService`)
		this.AirPurifierService = this.platformAccessory.getService(this.Service.AirPurifier)
		if (!this.AirPurifierService) {
			this.AirPurifierService = this.platformAccessory.addService(this.Service.AirPurifier, this.name, this.type)
		}

		this.AirPurifierService.getCharacteristic(this.Characteristic.Active)
			.on('get', this.StateManager.get.PureActive)
			.on('set', this.StateManager.set.PureActive)

		this.AirPurifierService.getCharacteristic(this.Characteristic.CurrentAirPurifierState)
			.on('get', this.StateManager.get.CurrentAirPurifierState)

		this.AirPurifierService.getCharacteristic(this.Characteristic.TargetAirPurifierState)
			.on('get', this.StateManager.get.TargetAirPurifierState)
			.on('set', this.StateManager.set.TargetAirPurifierState)

		this.AirPurifierService.getCharacteristic(this.Characteristic.RotationSpeed)
			.on('get', this.StateManager.get.PureRotationSpeed)
			.on('set', this.StateManager.set.PureRotationSpeed)

		if (this.filterService) {
			this.AirPurifierService.getCharacteristic(this.Characteristic.FilterChangeIndication)
				.on('get', this.StateManager.get.FilterChangeIndication)

			this.AirPurifierService.getCharacteristic(this.Characteristic.FilterLifeLevel)
				.on('get', this.StateManager.get.FilterLifeLevel)

			this.AirPurifierService.getCharacteristic(this.Characteristic.ResetFilterIndication)
				.on('set', this.StateManager.set.ResetFilterIndication)
		}
	}

	addLightSwitch() {
		this.easyDebugInfo(`${this.name} - Adding LightSwitchService`)

		this.PureLightSwitchService = this.platformAccessory.getService(this.room.name + ' Pure Light')
		if (!this.PureLightSwitchService) {
			this.PureLightSwitchService = this.platformAccessory.addService(this.Service.Lightbulb, this.room.name + ' Pure Light', 'PureLightSwitch')
		}

		this.PureLightSwitchService.getCharacteristic(this.Characteristic.On)
			.on('get', this.StateManager.get.LightSwitch)
			.on('set', this.StateManager.set.LightSwitch)
	}

	removeLightSwitch() {
		const LightSwitch = this.platformAccessory.getService(this.room.name + ' Pure Light')

		if (LightSwitch) {
			// remove service
			this.easyDebugInfo(`${this.name} - Removing LightSwitchService`)
			this.platformAccessory.removeService(LightSwitch)
			delete this.PureLightSwitchService
		}
	}

	updateHomeKit() {
		if (!(this.state instanceof Classes.InternalAcState)) {
			// TODO: log warning
			return
		}

		// TODO: add logging?
		// log new state with FakeGato
		// if (this.loggingService) {
		// 	this.loggingService.addEntry({
		// 		time: Math.floor((new Date()).getTime()/1000),
		// 		temp: this.state.currentTemperature,
		// 		humidity: this.state.relativeHumidity
		// 	})
		// }

		// if status is OFF, set all services to INACTIVE
		if (!this.state.active) {
			this.Utils.updateValue('AirPurifierService', 'Active', 0)
			this.Utils.updateValue('AirPurifierService', 'CurrentAirPurifierState', this.Characteristic.CurrentAirPurifierState.INACTIVE)
		} else {
			this.Utils.updateValue('AirPurifierService', 'Active', 1)
			this.Utils.updateValue('AirPurifierService', 'CurrentAirPurifierState', this.Characteristic.CurrentAirPurifierState.PURIFYING_AIR)

			// update fanSpeed for AirPurifierService
			this.Utils.updateValue('AirPurifierService', 'RotationSpeed', this.state.fanSpeed)
		}

		this.Utils.updateValue('AirPurifierService', 'TargetAirPurifierState', this.state.pureBoost ? 1 : 0)

		// update filter characteristics for AirPurifierService
		if (this.filterService) {
			this.Utils.updateValue('AirPurifierService', 'FilterChangeIndication', this.Characteristic.FilterChangeIndication[this.state.filterChange])
			this.Utils.updateValue('AirPurifierService', 'FilterLifeLevel', this.state.filterLifeLevel)
		}

		// update light switch for AirPurifierService
		if (this.PureLightSwitchService) {
			const switchValue = this.state?.light ?? false

			this.Utils.updateValue('PureLightSwitchService', 'On', switchValue)
		}

		// cache last state to storage
		this.storage.setItem('state', this.cachedState)
	}

}

module.exports = AirPurifier