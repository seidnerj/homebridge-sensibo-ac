// eslint-disable-next-line no-unused-vars
const homebridge = require('homebridge')
// eslint-disable-next-line no-unused-vars
const SensiboACPlatform = require('../sensibo/SensiboACPlatform')
const Classes = require('../classes')
const SensiboAccessory = require('./SensiboAccessory')
const unified = require('../sensibo/unified')

class RoomSensor extends SensiboAccessory {

	/**
	 * @param {import('../types').Device} device
	 * @param {SensiboACPlatform} platform
	 */
	constructor(sensor, device, platform) {
		const sensorInfo = unified.getSensorInfo(sensor)
		const deviceInfo = unified.getDeviceInfo(device)
		const namePrefix = deviceInfo.room.name
		const nameSuffix = 'Sensor'
		const type = 'RoomSensor'

		super(platform, sensorInfo.id, namePrefix, nameSuffix, type, '')

		/** @type {typeof homebridge.Service} */
		this.Service = platform.api.hap.Service
		/** @type {typeof homebridge.Characteristic} */
		this.Characteristic = platform.api.hap.Characteristic
		/** @type {string} */
		this.FAHRENHEIT_UNIT = platform.FAHRENHEIT_UNIT

		this.Utils = require('../sensibo/Utils')(this, platform)

		this.deviceId = deviceInfo.id
		this.productModel = sensorInfo.productModel
		this.serial = sensorInfo.serial
		this.appId = deviceInfo.appId
		this.manufacturer = deviceInfo.manufacturer
		this.room = deviceInfo.room
		this.temperatureUnit = deviceInfo.temperatureUnit
		this.usesFahrenheit = this.temperatureUnit === this.FAHRENHEIT_UNIT

		/** @type {ProxyHandler<Classes.InternalSensorState>} */
		const StateHandler = require('./StateHandler')(this, platform)
		const state = unified.getSensorState(sensor)

		this.cachedState.devices[this.id] = state
		/** @type {Classes.InternalSensorState} */
		this.state = new Proxy(state, StateHandler)
		this.StateManager = require('./StateManager')(this, platform)

		/** @type {undefined|homebridge.PlatformAccessory} */
		this.platformAccessory = platform.cachedAccessories.find(accessory => {
			return accessory.UUID === this.UUID
		})

		if (!this.platformAccessory) {
			this.log.info(`Creating New ${platform.platformName} ${this.type} Accessory in the ${this.room.name}`)
			this.platformAccessory = new this.api.platformAccessory(this.name, this.UUID)
			this.platformAccessory.context.type = this.type
			this.platformAccessory.context.sensorId = this.id
			this.platformAccessory.context.deviceId = this.deviceId

			platform.cachedAccessories.push(this.platformAccessory)

			// register the accessory
			this.api.registerPlatformAccessories(platform.pluginName, platform.platformName, [this.platformAccessory])
		}

		if (platform.enableHistoryStorage) {
			const fakeGatoHistoryService = require('fakegato-history')(this.api)

			this.loggingService = new fakeGatoHistoryService('weather', this.platformAccessory, {
				storage: 'fs',
				path: platform.persistPath
			})
		}

		this.platformAccessory.context.roomName = this.room.name

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

		this.addMotionSensor()
		this.addTemperatureSensor()
		// TODO: don't add humidity if disabled
		this.addHumiditySensor()
	}

	addMotionSensor() {
		this.easyDebug(`${this.name} - Adding MotionSensorService`)

		this.MotionSensorService = this.platformAccessory.getService(this.Service.MotionSensor)
		if (!this.MotionSensorService) {
			this.MotionSensorService = this.platformAccessory.addService(this.Service.MotionSensor, this.room.name + ' Motion Sensor', this.type)
		}

		this.MotionSensorService.getCharacteristic(this.Characteristic.MotionDetected)
			.on('get', this.StateManager.get.MotionDetected)

		this.MotionSensorService.getCharacteristic(this.Characteristic.StatusLowBattery)
			.on('get', this.StateManager.get.StatusLowBattery)
	}

	addTemperatureSensor() {
		this.easyDebug(`${this.name} - Adding TemperatureSensorService`)

		this.TemperatureSensorService = this.platformAccessory.getService(this.Service.TemperatureSensor)
		if (!this.TemperatureSensorService) {
			this.TemperatureSensorService = this.platformAccessory.addService(this.Service.TemperatureSensor, this.name + ' Temperature', 'TemperatureSensor')
		}

		this.TemperatureSensorService.getCharacteristic(this.Characteristic.CurrentTemperature)
			.setProps({
				minValue: -100,
				maxValue: 100,
				minStep: 0.1
			})
			.on('get', this.StateManager.get.CurrentTemperature)

		this.TemperatureSensorService.getCharacteristic(this.Characteristic.StatusLowBattery)
			.on('get', this.StateManager.get.StatusLowBattery)
	}

	addHumiditySensor() {
		this.easyDebug(`${this.name} - Adding HumiditySensorService`)

		this.HumiditySensorService = this.platformAccessory.getService(this.Service.HumiditySensor)
		if (!this.HumiditySensorService) {
			this.HumiditySensorService = this.platformAccessory.addService(this.Service.HumiditySensor, this.name + ' Humidity', 'HumiditySensor')
		}

		this.HumiditySensorService.getCharacteristic(this.Characteristic.CurrentRelativeHumidity)
			.on('get', this.StateManager.get.CurrentRelativeHumidity)

		this.HumiditySensorService.getCharacteristic(this.Characteristic.StatusLowBattery)
			.on('get', this.StateManager.get.StatusLowBattery)
	}

	updateHomeKit() {
		if (!(this.state instanceof Classes.InternalSensorState)) {
			// TODO: log warning
			return
		}

		// log new state with FakeGato
		if (this.loggingService) {
			this.loggingService.addEntry({
				time: Math.floor((new Date()).getTime()/1000),
				temp: this.state.currentTemperature,
				humidity: this.state.relativeHumidity
			})
		}

		// update measurements
		this.Utils.updateValue('MotionSensorService', 'MotionDetected', this.state.motionDetected)
		this.Utils.updateValue('TemperatureSensorService', 'CurrentTemperature', this.state.currentTemperature)
		this.Utils.updateValue('HumiditySensorService', 'CurrentRelativeHumidity', this.state.relativeHumidity)

		// update Low Battery Status
		this.Utils.updateValue('MotionSensorService', 'StatusLowBattery', this.Characteristic.StatusLowBattery[this.state.lowBattery])
		this.Utils.updateValue('TemperatureSensorService', 'StatusLowBattery', this.Characteristic.StatusLowBattery[this.state.lowBattery])
		this.Utils.updateValue('HumiditySensorService', 'StatusLowBattery', this.Characteristic.StatusLowBattery[this.state.lowBattery])

		// cache last state to storage
		this.storage.setItem('state', this.cachedState)
	}

}

module.exports = RoomSensor