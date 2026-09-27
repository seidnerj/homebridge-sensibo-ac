import Utils from '../sensibo/Utils.js'
import SensiboAccessory from './SensiboAccessory.js'

let Characteristic, Service

class ClimateReactSwitch extends SensiboAccessory {

	constructor(airConditioner, platform) {
		super(platform)

		Service = platform.api.hap.Service
		Characteristic = platform.api.hap.Characteristic

		this.Utils = Utils(this, platform)

		this.log = airConditioner.log
		this.api = airConditioner.api
		this.id = airConditioner.id
		this.model = airConditioner.model + '_CR'
		this.serial = airConditioner.serial + '_CR'
		this.manufacturer = airConditioner.manufacturer
		this.roomName = airConditioner.roomName
		this.name = this.roomName + ' ClimateReact'
		this.type = 'ClimateReactSwitch'

		this.state = airConditioner.state
		this.stateManager = airConditioner.stateManager

		this.loadAccessory(platform, this.id + '_CR', { deviceId: this.id }, `Creating New ${platform.PLATFORM_NAME} ${this.type} Accessory in the ${this.roomName}`)

		// This isn't with the others above as roomName can change
		this.accessory.context.roomName = this.roomName

		this.addInformationService()

		this.addClimateReactSwitchService()
	}

	addClimateReactSwitchService() {
		this.log.easyDebug(`${this.name} - Adding ClimateReactSwitchService`)

		this.ClimateReactSwitchService = this.accessory.getService(this.name)
		if (!this.ClimateReactSwitchService) {
			this.ClimateReactSwitchService = this.accessory.addService(Service.Switch, this.name, this.type)
		}

		this.ClimateReactSwitchService.getCharacteristic(Characteristic.On)
			.on('get', this.stateManager.get.ClimateReactSwitch)
			.on('set', this.stateManager.set.ClimateReactSwitch)
	}

	updateHomeKit() {
		const smartModeEnabledState = this.state?.smartMode?.enabled ?? false

		// update Climate React Service
		this.Utils.updateValue('ClimateReactSwitchService', 'On', smartModeEnabledState)
	}

}

export default ClimateReactSwitch
