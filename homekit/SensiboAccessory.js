// eslint-disable-next-line no-unused-vars
const SensiboACPlatform = require('../sensibo/SensiboACPlatform')
// eslint-disable-next-line no-unused-vars
const Classes = require('../classes')

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
		this.easyDebug = platform.easyDebug
		this.log = platform.log
		this.api = platform.api
		this.storage = platform.storage
		this.cachedState = platform.cachedState

		this.id = id
		this.name = `${namePrefix} ${nameSuffix}`
		this.type = type
		this.UUID = this.api.hap.uuid.generate(id + uuidSuffix)

		// FIXME: this is populated by the subclass but should probably be moved here
		/** @type {Classes.InternalAcState|Classes.InternalOccupancyState|Classes.InternalSensorState} */
		this.state = null
	}

	updateHomeKit() {
	}

}

module.exports = SensiboAccessory