// eslint-disable-next-line no-unused-vars
const homebridge = require('homebridge')
// eslint-disable-next-line no-unused-vars
const SensiboACPlatform = require('../sensibo/SensiboACPlatform')
// eslint-disable-next-line no-unused-vars
const AirConditioner = require('./AirConditioner')
const Classes = require('../classes')
const SensiboAccessory = require('./SensiboAccessory')

class HumiditySensor extends SensiboAccessory {

	/**
	 * @param {AirConditioner} device
	 * @param {SensiboACPlatform} platform
	 */
	constructor(device, platform) {
		const namePrefix = device.room.name
		const nameSuffix = 'Humidity'
		const type = 'HumiditySensor'

		super(platform, device.id, namePrefix, nameSuffix, type, '_humidity')

		/** @type {typeof homebridge.Service} */
		this.Service = platform.api.hap.Service
		/** @type {typeof homebridge.Characteristic} */
		this.Characteristic = platform.api.hap.Characteristic

		this.productModel = device.productModel + '_humidity'
		this.serial = device.serial + '_humidity'
		this.manufacturer = device.manufacturer
		this.room = device.room

		/** @type {Classes.InternalAcState} */
		this.state = device.state
		this.StateManager = device.StateManager

		this.platformAccessory = platform.cachedAccessories.find(accessory => {
			return accessory.UUID === this.UUID
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

		if (platform.enableHistoryStorage) {
			const fakeGatoHistoryService = require('fakegato-history')(this.api)

			this.loggingService = new fakeGatoHistoryService('weather', this.platformAccessory, {
				storage: 'fs',
				path: platform.persistPath
			})
		}

		this.platformAccessory.context.roomName = this.room.name

		let informationService = this.platformAccessory.getService(this.Service.AccessoryInformation)

		if (!informationService) {
			informationService = this.platformAccessory.addService(this.Service.AccessoryInformation)
		}

		informationService
			.setCharacteristic(this.Characteristic.Manufacturer, this.manufacturer)
			.setCharacteristic(this.Characteristic.Model, this.productModel)
			.setCharacteristic(this.Characteristic.SerialNumber, this.serial)

		this.addHumiditySensorService()
	}

	addHumiditySensorService() {
		this.easyDebug(`${this.name} - Adding HumiditySensorService`)

		this.HumiditySensorService = this.platformAccessory.getService(this.Service.HumiditySensor)
		if (!this.HumiditySensorService) {
			this.HumiditySensorService = this.platformAccessory.addService(this.Service.HumiditySensor, this.name, this.type)
		}

		this.HumiditySensorService.getCharacteristic(this.Characteristic.CurrentRelativeHumidity)
			.on('get', this.StateManager.get.CurrentRelativeHumidity)
	}

	updateHomeKit() {
		if (!(this.state instanceof Classes.InternalAcState)) {
			// TODO: log warning
			return
		}

		// log new state with FakeGato
		if (this.loggingService) {
			this.loggingService.addEntry({
				time: Math.floor((new Date()).getTime()/1000),
				humidity: this.state.relativeHumidity
			})
		}

		this.Utils.updateValue('HumiditySensorService', 'CurrentRelativeHumidity', this.state.relativeHumidity)
	}

}

module.exports = HumiditySensor