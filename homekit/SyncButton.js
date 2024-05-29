// eslint-disable-next-line no-unused-vars
const homebridge = require('homebridge')
// eslint-disable-next-line no-unused-vars
const SensiboACPlatform = require('../sensibo/SensiboACPlatform')
// eslint-disable-next-line no-unused-vars
const AirConditioner = require('./AirConditioner')
// eslint-disable-next-line no-unused-vars
const Classes = require('../classes')
const SensiboAccessory = require('./SensiboAccessory')

class SyncButton extends SensiboAccessory {

	/**
	 * @param {AirConditioner} airConditioner
	 * @param {SensiboACPlatform} platform
	 */
	constructor(airConditioner, platform) {
		const namePrefix = airConditioner.room.name
		const nameSuffix = 'AC Sync'
		const type = 'SyncButton'

		super(platform, airConditioner.id, namePrefix, nameSuffix, type, '_sync')

		/** @type {typeof homebridge.Service} */
		this.Service = platform.api.hap.Service
		/** @type {typeof homebridge.Characteristic} */
		this.Characteristic = platform.api.hap.Characteristic

		this.productModel = airConditioner.productModel + '_sync'
		this.serial = airConditioner.serial + '_sync'
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

		this.addSyncButtonService()
	}

	addSyncButtonService() {
		this.easyDebug(`${this.name} - Adding SyncButtonService`)

		this.SyncButtonService = this.platformAccessory.getService(this.Service.Switch)
		if (!this.SyncButtonService) {
			this.SyncButtonService = this.platformAccessory.addService(this.Service.Switch, this.name, this.type)
		}

		this.SyncButtonService.getCharacteristic(this.Characteristic.On)
			.on('get', this.StateManager.get.SyncButton)
			// TODO: see if below annoymous function can be moved to StateManager.js
			.on('set', (state, callback) => {
				this.StateManager.set.SyncButton(state, callback)
				setTimeout(() => {
					// TODO: updateValue via this.Utils.updateValue?
					this.SyncButtonService.getCharacteristic(this.Characteristic.On).updateValue(0)
				}, 1000)
			})
	}

}

module.exports = SyncButton