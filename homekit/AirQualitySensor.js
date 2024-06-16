// eslint-disable-next-line no-unused-vars
const homebridge = require('homebridge')
// eslint-disable-next-line no-unused-vars
const SensiboACPlatform = require('../sensibo/SensiboACPlatform')
const Classes = require('../classes')
// eslint-disable-next-line no-unused-vars
const AirPurifier = require('./AirPurifier')
// eslint-disable-next-line no-unused-vars
const AirConditioner = require('./AirConditioner')
const SensiboAccessory = require('./SensiboAccessory')
const unified = require('../sensibo/unified')

class AirQualitySensor extends SensiboAccessory {

	/**
	 * @param {AirConditioner|AirPurifier} airConditionerOrPurifier
	 * @param {SensiboACPlatform} platform
	 */
	constructor(airConditionerOrPurifier, platform) {
		const namePrefix = airConditionerOrPurifier.room.name
		const nameSuffix = 'Air Quality'
		const type = 'AirQualitySensor'

		super(platform, airConditionerOrPurifier.id, namePrefix, nameSuffix, type, '_airQuality')

		/** @type {typeof homebridge.Service} */
		this.Service = platform.api.hap.Service
		/** @type {typeof homebridge.Characteristic} */
		this.Characteristic = platform.api.hap.Characteristic

		this.appId = 'com.sensibo.Sensibo'
		this.productModel = airConditionerOrPurifier.productModel
		this.serial = airConditionerOrPurifier.serial
		this.manufacturer = 'Sensibo Inc.'
		this.room = airConditionerOrPurifier.room
		this.disableAirQuality = platform.disableAirQuality
		this.disableCarbonDioxide = platform.disableCarbonDioxide

		/** @type {ProxyHandler<Classes.InternalAirQualitySensorState>} */
		const StateHandler = require('./StateHandler')(this, platform)
		const state = unified.getAirQualityState(airConditionerOrPurifier.device, platform)

		this.cachedState.devices[this.id] = state
		/** @type {Classes.InternalAirQualitySensorState} */
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

		if (!this.disableAirQuality) {
			this.addAirQualityService()
		} else {
			this.removeAirQualityService()
		}

		if (this.productModel === 'airq' && !this.disableCarbonDioxide) {
			this.addCarbonDioxideService()
		} else {
			this.removeCarbonDioxideService()
		}
	}

	addAirQualityService() {
		this.easyDebugInfo(`${this.name} - Adding AirQualitySensorService`)
		this.AirQualitySensorService = this.platformAccessory.getService(this.Service.AirQualitySensor)

		if (!this.AirQualitySensorService) {
			this.AirQualitySensorService = this.platformAccessory.addService(this.Service.AirQualitySensor, this.name, 'AirQualitySensor')
		}

		this.AirQualitySensorService.getCharacteristic(this.Characteristic.AirQuality)
			.on('get', this.StateManager.get.AirQuality)
		this.AirQualitySensorService.getCharacteristic(this.Characteristic.VOCDensity)
			.setProps({ maxValue: this.platform.VOCDENSITY_MAX })
			.on('get', this.StateManager.get.VOCDensity)
	}

	removeAirQualityService() {
		const AirQualitySensor = this.platformAccessory.getService('AirQualitySensor')

		if (AirQualitySensor) {
			// remove service
			this.easyDebugInfo(`${this.name} - Removing AirQualitySensorService`)
			this.platformAccessory.removeService(AirQualitySensor)
		}
	}

	addCarbonDioxideService() {
		this.easyDebugInfo(`${this.name} - Adding CarbonDioxideSensorService`)
		this.CarbonDioxideSensorService = this.platformAccessory.getService(this.Service.CarbonDioxideSensor)

		if (!this.CarbonDioxideSensorService) {
			this.CarbonDioxideSensorService = this.platformAccessory.addService(this.Service.CarbonDioxideSensor, this.name, 'CarbonDioxideSensor')
		}

		this.CarbonDioxideSensorService.getCharacteristic(this.Characteristic.CarbonDioxideDetected)
			.on('get', this.StateManager.get.CarbonDioxideDetected)
		this.CarbonDioxideSensorService.getCharacteristic(this.Characteristic.CarbonDioxideLevel)
			.on('get', this.StateManager.get.CarbonDioxideLevel)
	}

	removeCarbonDioxideService() {
		const CarbonDioxideSensor = this.platformAccessory.getService('CarbonDioxideSensor')

		if (CarbonDioxideSensor) {
			// remove service
			this.easyDebugInfo(`${this.name} - Removing CarbonDioxideSensorService`)
			this.platformAccessory.removeService(CarbonDioxideSensor)
		}
	}

	updateHomeKit() {
		if (!(this.state instanceof Classes.InternalAirPurifierState)) {
			// TODO: log warning
			return
		}

		// TODO: add logging of CO2 and VOCs?
		// log new state with FakeGato
		// if (this.loggingService) {
		// 	this.loggingService.addEntry({
		// 		time: Math.floor((new Date()).getTime()/1000),
		// 		temp: this.state.currentTemperature,
		// 		humidity: this.state.relativeHumidity
		// 	})
		// }

		if (!this.disableAirQuality) {
			this.Utils.updateValue('AirQualitySensorService', 'AirQuality', this.state.airQuality)
			this.Utils.updateValue('AirQualitySensorService', 'VOCDensity', this.state.VOCDensity)
		}

		if (!this.disableCarbonDioxide) {
			this.Utils.updateValue('CarbonDioxideSensorService', 'CarbonDioxideDetected', this.state.carbonDioxideDetected)
			this.Utils.updateValue('CarbonDioxideSensorService', 'CarbonDioxideLevel', this.state.carbonDioxideLevel)
		}

		// cache last state to storage
		this.storage.setItem('state', this.cachedState)
	}

}

module.exports = AirQualitySensor