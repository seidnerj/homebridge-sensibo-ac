import Utils from '../sensibo/Utils.js'
import SensiboAccessory from './SensiboAccessory.js'

let Characteristic, Service

class HumiditySensor extends SensiboAccessory {

	constructor(airConditioner, platform) {
		super(platform)

		Service = platform.api.hap.Service
		Characteristic = platform.api.hap.Characteristic

		this.Utils = Utils(this, platform)

		this.log = airConditioner.log
		this.api = airConditioner.api
		this.id = airConditioner.id
		this.model = airConditioner.model + '_humidity'
		this.serial = airConditioner.serial + '_humidity'
		this.manufacturer = airConditioner.manufacturer
		this.roomName = airConditioner.roomName
		this.name = this.roomName + ' Humidity'
		this.type = 'HumiditySensor'

		this.state = airConditioner.state
		this.stateManager = airConditioner.stateManager

		this.loadAccessory(platform, this.id + '_humidity', { deviceId: this.id }, `Creating New ${platform.PLATFORM_NAME} ${this.type} Accessory in the ${this.roomName}`)

		// This isn't with the others above as roomName can change
		this.accessory.context.roomName = this.roomName

		this.addHistoryService(platform, 'weather')

		this.addInformationService()

		this.addHumiditySensorService()
	}

	addHumiditySensorService() {
		this.log.easyDebug(`${this.name} - Adding HumiditySensorService`)

		this.HumiditySensorService = this.accessory.getService(Service.HumiditySensor)
		if (!this.HumiditySensorService) {
			this.HumiditySensorService = this.accessory.addService(Service.HumiditySensor, this.name, this.type)
		}

		this.HumiditySensorService.getCharacteristic(Characteristic.CurrentRelativeHumidity)
			.on('get', this.stateManager.get.CurrentRelativeHumidity)
	}

	updateHomeKit() {
		// log new state with FakeGato
		if (this.loggingService) {
			this.log.easyDebug(`${this.name} - Making FakeGato log entry`)

			this.loggingService.addEntry({
				time: Math.floor((new Date()).getTime() / 1000),
				humidity: this.state.relativeHumidity
			})
		}

		this.Utils.updateValue('HumiditySensorService', 'CurrentRelativeHumidity', this.state.relativeHumidity)
	}

}

export default HumiditySensor
