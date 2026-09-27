import SensiboAccessory from './SensiboAccessory.js'

let Characteristic, Service

class SyncButton extends SensiboAccessory {

	constructor(airConditioner, platform) {
		super(platform)

		Service = platform.api.hap.Service
		Characteristic = platform.api.hap.Characteristic

		this.log = airConditioner.log
		this.api = airConditioner.api
		this.id = airConditioner.id
		this.model = airConditioner.model + '_sync'
		this.serial = airConditioner.serial + '_sync'
		this.manufacturer = airConditioner.manufacturer
		this.roomName = airConditioner.roomName
		this.name = this.roomName + ' AC Sync'
		this.type = 'SyncButton'

		this.state = airConditioner.state
		this.stateManager = airConditioner.stateManager

		this.loadAccessory(platform, this.id + '_sync', { deviceId: this.id }, `Creating New ${platform.PLATFORM_NAME} ${this.type} Accessory in the ${this.roomName}`)

		// This isn't with the others above as roomName can change
		this.accessory.context.roomName = this.roomName

		this.addInformationService()

		this.addSyncButtonService()
	}

	addSyncButtonService() {
		this.log.easyDebug(`${this.name} - Adding SyncButtonService`)

		this.SyncButtonService = this.accessory.getService(Service.Switch)
		if (!this.SyncButtonService) {
			this.SyncButtonService = this.accessory.addService(Service.Switch, this.name, this.type)
		}

		this.SyncButtonService.getCharacteristic(Characteristic.On)
			.on('get', this.stateManager.get.SyncButton)
			// TODO: see if below annoymous function can be moved to StateManager.js
			.on('set', (state, callback) => {
				this.stateManager.set.SyncButton(state, callback)
				setTimeout(() => {
					// TODO: move to Utils?
					this.SyncButtonService.getCharacteristic(Characteristic.On).updateValue(0)
				}, 1000)
			})
	}

}

export default SyncButton
