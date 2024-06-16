// eslint-disable-next-line no-unused-vars
const homebridge = require('homebridge')
// eslint-disable-next-line no-unused-vars
const SensiboACPlatform = require('../sensibo/SensiboACPlatform')
// eslint-disable-next-line no-unused-vars
const AirConditioner = require('./AirConditioner')
const Classes = require('../classes')
const SensiboAccessory = require('./SensiboAccessory')

class ClimateReactSwitch extends SensiboAccessory {

	/**
	 * @param {AirConditioner} airConditioner
	 * @param {SensiboACPlatform} platform
	 */
	constructor(airConditioner, platform) {
		const namePrefix = airConditioner.room.name
		const nameSuffix = 'ClimateReact'
		const type = 'ClimateReactSwitch'

		super(platform, airConditioner.id, namePrefix, nameSuffix, type, '_CR')

		/** @type {typeof homebridge.Service} */
		this.Service = platform.api.hap.Service
		/** @type {typeof homebridge.Characteristic} */
		this.Characteristic = platform.api.hap.Characteristic

		this.productModel = airConditioner.productModel + '_CR'
		this.serial = airConditioner.serial + '_CR'
		this.manufacturer = airConditioner.manufacturer
		this.room = airConditioner.room

		/** @type {Classes.InternalAcState} */
		this.state = airConditioner.state
		this.StateManager = airConditioner.StateManager

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

		this.platformAccessory.context.roomName = this.room.name

		let informationService = this.platformAccessory.getService(this.Service.AccessoryInformation)

		if (!informationService) {
			informationService = this.platformAccessory.addService(this.Service.AccessoryInformation)
		}

		informationService
			.setCharacteristic(this.Characteristic.Manufacturer, this.manufacturer)
			.setCharacteristic(this.Characteristic.Model, this.productModel)
			.setCharacteristic(this.Characteristic.SerialNumber, this.serial)

		this.addClimateReactSwitchService()
	}

	addClimateReactSwitchService() {
		this.easyDebugInfo(`${this.name} - Adding ClimateReactSwitchService`)

		this.ClimateReactSwitchService = this.platformAccessory.getService(this.name)
		if (!this.ClimateReactSwitchService) {
			this.ClimateReactSwitchService = this.platformAccessory.addService(this.Service.Switch, this.name, this.type)
		}

		this.ClimateReactSwitchService.getCharacteristic(this.Characteristic.On)
			.on('get', this.StateManager.get.ClimateReactSwitch)
			.on('set', this.StateManager.set.ClimateReactSwitch)
	}

	updateHomeKit() {
		if (!(this.state instanceof Classes.InternalAcState)) {
			// TODO: log warning
			return
		}

		const smartModeEnabledState = this.state?.smartMode?.enabled ?? false

		// update Climate React Service
		this.Utils.updateValue('ClimateReactSwitchService', 'On', smartModeEnabledState)
	}

}

module.exports = ClimateReactSwitch