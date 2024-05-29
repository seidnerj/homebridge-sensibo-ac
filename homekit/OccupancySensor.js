// eslint-disable-next-line no-unused-vars
const homebridge = require('homebridge')
// eslint-disable-next-line no-unused-vars
const SensiboACPlatform = require('../sensibo/SensiboACPlatform')
// eslint-disable-next-line no-unused-vars
const Classes = require('../classes')
const SensiboAccessory = require('./SensiboAccessory')
const unified = require('../sensibo/unified')

class OccupancySensor extends SensiboAccessory {

	/**
	 * @param {import('../types').Device} device
	 * @param {SensiboACPlatform} platform
	 */
	constructor(device, platform) {
		const deviceInfo = unified.getDeviceInfo(device)
		const locationInfo = unified.getLocationInfo(device.location)
		const namePrefix = locationInfo.name
		const nameSuffix = 'Occupancy'
		const type = 'OccupancySensor'

		super(platform, locationInfo.id, namePrefix, nameSuffix, type, '')

		/** @type {typeof homebridge.Service} */
		this.Service = platform.api.hap.Service
		/** @type {typeof homebridge.Characteristic} */
		this.Characteristic = platform.api.hap.Characteristic

		this.Utils = require('../sensibo/Utils')(this, platform)

		this.productModel = deviceInfo.productModel + '_occupancy'
		this.serial = locationInfo.id
		this.manufacturer = deviceInfo.manufacturer
		this.locationName = locationInfo.name

		/** @type {ProxyHandler<Classes.InternalOccupancyState>} */
		const StateHandler = require('./StateHandler')(this, platform)
		const state = unified.getOccupancyState(device.location)

		this.cachedState.occupancy[this.id] = state
		/** @type {Classes.InternalOccupancyState} */
		this.state = new Proxy(state, StateHandler)
		this.StateManager = require('./StateManager')(this, platform)

		/** @type {undefined|homebridge.PlatformAccessory} */
		this.platformAccessory = platform.cachedAccessories.find(accessory => {
			return accessory.UUID === this.UUID
		})

		if (!this.platformAccessory) {
			this.log.info(`Creating New ${platform.platformName} ${this.type} Accessory at ${this.locationName}`)
			this.platformAccessory = new this.api.platformAccessory(this.name, this.UUID)
			this.platformAccessory.context.type = this.type
			this.platformAccessory.context.locationId = this.id

			platform.cachedAccessories.push(this.platformAccessory)

			// register the accessory
			this.api.registerPlatformAccessories(platform.pluginName, platform.platformName, [this.platformAccessory])
		}

		this.platformAccessory.context.locationName = this.locationName

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

		this.addOccupancySensor()
	}

	addOccupancySensor() {
		this.easyDebug(`${this.name} - Adding OccupancySensorService`)

		this.OccupancySensorService = this.platformAccessory.getService(this.Service.OccupancySensor)
		if (!this.OccupancySensorService) {
			this.OccupancySensorService = this.platformAccessory.addService(this.Service.OccupancySensor, this.name, this.type)
		}

		this.OccupancySensorService.getCharacteristic(this.Characteristic.OccupancyDetected)
			.on('get', this.StateManager.get.OccupancyDetected)
	}

	updateHomeKit() {
		// update measurements
		this.Utils.updateValue('OccupancySensorService', 'OccupancyDetected', this.Characteristic.OccupancyDetected[this.state.occupancy])

		// cache last state to storage
		this.storage.setItem('state', this.cachedState)
	}

}

module.exports = OccupancySensor