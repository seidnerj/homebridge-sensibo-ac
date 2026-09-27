import StateHandler from './StateHandler.js'
import StateManager from './StateManager.js'
import Utils from '../sensibo/Utils.js'
import SensiboAccessory from './SensiboAccessory.js'

let Characteristic, Service

class OccupancySensor extends SensiboAccessory {

	constructor(device, platform) {
		super(platform)

		Service = platform.api.hap.Service
		Characteristic = platform.api.hap.Characteristic

		this.Utils = Utils(this, platform)

		const deviceInfo = this.Utils.deviceInformation(device)
		const locationInfo = this.Utils.locationInformation(device.location)

		this.storage = platform.storage
		this.cachedState = platform.cachedState
		this.id = locationInfo.id
		this.model = deviceInfo.model + '_occupancy'
		this.serial = locationInfo.id
		this.manufacturer = deviceInfo.manufacturer
		this.locationName = locationInfo.name
		this.name = this.locationName + ' Occupancy'
		this.type = 'OccupancySensor'

		this.state = this.cachedState.occupancy[this.id] = this.Utils.occupancyStateFromDeviceLocation(device.location)
		this.state = new Proxy(this.state, StateHandler(this, platform))
		this.stateManager = StateManager(this, platform)

		this.loadAccessory(platform, this.id, { locationId: this.id }, `Creating New ${platform.PLATFORM_NAME} ${this.type} Accessory at ${this.locationName}`)

		// This isn't with the others above as roomName can change
		this.accessory.context.locationName = this.locationName

		this.addInformationService()

		this.addOccupancySensor()
	}

	addOccupancySensor() {
		this.log.easyDebug(`${this.name} - Adding OccupancySensorService`)

		this.OccupancySensorService = this.accessory.getService(Service.OccupancySensor)
		if (!this.OccupancySensorService) {
			this.OccupancySensorService = this.accessory.addService(Service.OccupancySensor, this.name, this.type)
		}

		this.OccupancySensorService.getCharacteristic(Characteristic.OccupancyDetected)
			.on('get', this.stateManager.get.OccupancyDetected)
	}

	updateHomeKit() {
		// update measurements
		this.Utils.updateValue('OccupancySensorService', 'OccupancyDetected', Characteristic.OccupancyDetected[this.state.occupancy])

		// cache last state to storage
		this.storage.setItem('state', this.cachedState)
	}

}

export default OccupancySensor
