// eslint-disable-next-line no-unused-vars
const SensiboACPlatform = require('../sensibo/SensiboACPlatform')
// eslint-disable-next-line no-unused-vars
const Classes = require('../classes')
// eslint-disable-next-line no-unused-vars
const homebridge = require('homebridge')
// eslint-disable-next-line no-unused-vars
const storage = require('node-persist')
const minDate = new Date('0001-01-01T00:00:00Z')

class SensiboAccessory {

	/**
	 * @param {SensiboACPlatform} platform
	 * @param {string} id
	 * @param {string} namePrefix
	 * @param {string} nameSuffix
	 * @param {string} type
	 * @param {string} uuidSuffix
	 */
	constructor(platform, id, namePrefix, nameSuffix, type, uuidSuffix) {
		/** @type {SensiboACPlatform} */
		this.platform = platform
		/** @type {homebridge.Logging} */
		this.log = platform.log
		/** @type {homebridge.API} */
		this.api = platform.api
		/** @type {storage.LocalStorage} */
		this.storage = platform.storage
		/** @type {import('../types').PlatformState} */
		this.cachedState = platform.cachedState
		/** @type {(...content: any[]) => void} */
		this.easyDebugInfo = platform.easyDebugInfo

		this.Utils = require('../sensibo/Utils')(this, platform)

		/** @type {string} */
		this.id = id
		/** @type {string} */
		this.name = `${namePrefix} ${nameSuffix}`
		/** @type {type} */
		this.type = type
		/** @type {string} */
		this.UUID = this.api.hap.uuid.generate(id + uuidSuffix)
		/** @type {Date} */
		this.lastStateRefresh = minDate

		// FIXME: this is populated by the subclass but should probably be moved here
		/** @type {Classes.InternalAcState|Classes.InternalOccupancyState|Classes.InternalSensorState|Classes.InternalAirQualitySensorState|Classes.InternalAirPurifierState} */
		this.state = null
	}

	updateHomeKit() {
	}

}

module.exports = SensiboAccessory