import fakegato from 'fakegato-history'

/**
 * What every accessory of the plugin shares: finding or registering its PlatformAccessory, the information service and
 * FakeGato history. Subclasses set type, name, manufacturer, model and serial before calling these.
 */
class SensiboAccessory {

	/**
	 * @param {Object} platform  the SensiboACPlatform
	 */
	constructor(platform) {
		this.log = platform.log
		this.api = platform.api

		// Set by the subclass constructor after super()
		/** @type {string} */
		this.name = undefined
		/** @type {string} */
		this.type = undefined
		/** @type {string} */
		this.manufacturer = undefined
		/** @type {string} */
		this.model = undefined
		/** @type {string} */
		this.serial = undefined
	}

	/**
	 * Sets this.UUID and this.accessory, taking the accessory from the Homebridge cache or creating and registering it
	 * @param   {Object}  platform         the SensiboACPlatform
	 * @param   {string}  uuidSeed         what the accessory UUID is generated from
	 * @param   {Object}  context          ids stored in a new accessory's context, next to its type
	 * @param   {string}  creationMessage  logged when a new accessory is created
	 * @returns {void}
	 */
	loadAccessory(platform, uuidSeed, context, creationMessage) {
		this.UUID = this.api.hap.uuid.generate(uuidSeed)
		this.accessory = platform.cachedAccessories.find(accessory => {
			return accessory.UUID === this.UUID
		})

		if (!this.accessory) {
			this.log.info(creationMessage)
			this.accessory = new this.api.platformAccessory(this.name, this.UUID)
			this.accessory.context.type = this.type
			Object.assign(this.accessory.context, context)

			platform.cachedAccessories.push(this.accessory)

			// register the accessory
			this.api.registerPlatformAccessories(platform.PLUGIN_NAME, platform.PLATFORM_NAME, [this.accessory])
		}
	}

	/**
	 * Adds FakeGato history to the accessory when enableHistoryStorage is on
	 * @param   {Object}  platform  the SensiboACPlatform
	 * @param   {string}  type      the FakeGato history type, e.g. 'weather' or 'room2'
	 * @returns {void}
	 */
	addHistoryService(platform, type) {
		if (platform.enableHistoryStorage) {
			const FakeGatoHistoryService = fakegato(this.api)

			this.loggingService = new FakeGatoHistoryService(type, this.accessory, {
				log: this.log,
				storage: 'fs',
				path: platform.persistPath
			})
		}
	}

	/**
	 * Sets manufacturer, model and serial on the accessory information service, adding the service if missing
	 * @returns {void}
	 */
	addInformationService() {
		const {
			Characteristic, Service
		} = this.api.hap
		let informationService = this.accessory.getService(Service.AccessoryInformation)

		if (!informationService) {
			informationService = this.accessory.addService(Service.AccessoryInformation)
		}

		informationService
			.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
			.setCharacteristic(Characteristic.Model, this.model)
			.setCharacteristic(Characteristic.SerialNumber, this.serial)
	}

}

export default SensiboAccessory
