// eslint-disable-next-line no-unused-vars
const homebridge = require('homebridge')
// eslint-disable-next-line no-unused-vars
const SensiboACPlatform = require('../sensibo/SensiboACPlatform')
// eslint-disable-next-line no-unused-vars
const SensiboAccessory = require('./SensiboAccessory')
const Classes = require('../classes')
const AirConditioner = require('./AirConditioner')
const RoomSensor = require('./RoomSensor')

// TODO: perhaps make this a class?
/**
 * @param {SensiboAccessory} device
 * @param {SensiboACPlatform} platform
 */
module.exports = (device, platform) => {
	/** @type {typeof homebridge.Characteristic} */
	this.Characteristic = platform.api.hap.Characteristic
	const easyDebug = platform.easyDebug
	const enableClimateReactAutoSetup = platform.enableClimateReactAutoSetup

	/**
	 * @param {number} value
	 */
	this.toFahrenheit = function(value) {
		return Math.round((value * 1.8) + 32)
	}

	/**
	 *
	 * @param {homebridge.CharacteristicValue} characteristic
	 */
	this.characteristicToMode = function (characteristic) {
		switch (characteristic) {
			case this.Characteristic.TargetHeaterCoolerState.AUTO:
				return 'AUTO'

			case this.Characteristic.TargetHeaterCoolerState.COOL:
				return 'COOL'

			case this.Characteristic.TargetHeaterCoolerState.HEAT:
				return 'HEAT'
		}
	}

	// TODO: do we need this? Why would 'value' ever be outside correct range?
	/**
	 *
	 * @param {homebridge.Service} service
	 * @param {string} characteristic
	 * @returns
	 */
	this.sanitize = function(service, characteristic, value) {
		const minAllowed = service.getCharacteristic(this.Characteristic[characteristic]).props.minValue
		const maxAllowed = service.getCharacteristic(this.Characteristic[characteristic]).props.maxValue
		const validValues = service.getCharacteristic(this.Characteristic[characteristic]).props.validValues
		const currentValue = service.getCharacteristic(this.Characteristic[characteristic]).value

		if (value !== 0 && (typeof(value) === 'undefined' || !value)) {
			return currentValue
		}

		if (validValues && !validValues.includes(value)) {
			return currentValue
		}

		if (minAllowed && value < minAllowed) {
			return currentValue
		}

		if (maxAllowed && value > maxAllowed) {
			return currentValue
		}

		return value
	}

	/**
	 *
	 * @param {AirConditioner} device
	 * @param {boolean} enableClimateReactAutoSetup
	 */
	this.updateClimateReact = function(device, enableClimateReactAutoSetup) {
		if (!enableClimateReactAutoSetup) {
			return
		}

		// If nothing has changed should we skip...? Like we do in StateHandler for SET?

		if (!(device.state instanceof Classes.InternalAcState)) {
			// TODO: log warning
			return
		}

		const smartModeState = device.state.smartMode

		smartModeState.type = 'temperature'
		smartModeState.highTemperatureWebhook = null
		smartModeState.lowTemperatureWebhook = null

		if (device.state.mode === 'COOL') {
			smartModeState.highTemperatureThreshold = device.state.targetTemperature + (device.usesFahrenheit ? 1.8 : 1)
			smartModeState.highTemperatureState = {
				on: true,
				targetTemperature: device.state.targetTemperature,
				temperatureUnit: device.temperatureUnit,
				mode: device.state.mode,
				fanSpeed: device.state.fanSpeed,
				swing: device.state.verticalSwing,
				horizontalSwing: device.state.horizontalSwing,
				light: device.state.light ? 'on' : 'off'
			}

			smartModeState.lowTemperatureThreshold = device.state.targetTemperature - (device.usesFahrenheit ? 1.8 : 1)
			smartModeState.lowTemperatureState = {
				on: false,
				targetTemperature: device.state.targetTemperature,
				temperatureUnit: device.temperatureUnit,
				mode: device.state.mode,
				fanSpeed: device.state.fanSpeed,
				swing: device.state.verticalSwing,
				horizontalSwing: device.state.horizontalSwing,
				light: device.state.light ? 'on' : 'off'
			}
		} else if (device.state.mode === 'HEAT') {
			smartModeState.highTemperatureThreshold = device.state.targetTemperature + (device.usesFahrenheit ? 1.8 : 1)
			smartModeState.highTemperatureState = {
				on: false,
				targetTemperature: device.state.targetTemperature,
				temperatureUnit: device.temperatureUnit,
				mode: device.state.mode,
				fanSpeed: device.state.fanSpeed,
				swing: device.state.verticalSwing,
				horizontalSwing: device.state.horizontalSwing,
				light: device.state.light ? 'on' : 'off'
			}

			smartModeState.lowTemperatureThreshold = device.state.targetTemperature - (device.usesFahrenheit ? 1.8 : 1)
			smartModeState.lowTemperatureState = {
				on: true,
				targetTemperature: device.state.targetTemperature,
				temperatureUnit: device.temperatureUnit,
				mode: device.state.mode,
				fanSpeed: device.state.fanSpeed,
				swing: device.state.verticalSwing,
				horizontalSwing: device.state.horizontalSwing,
				light: device.state.light ? 'on' : 'off'
			}
		}

		// StateHandler is invoked as a Proxy, and therefore overwrites/intercepts the default get()/set() commands [traps]
		// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy

		// NOTE: device.state is of "type" StateHandler. When one of its properties is "set" (e.g. device.state.<property> = <val>),
		//       that's where we actually send commands to the appropriate Sensibo devices. If a property is not set, the aformentioned
		//       code will not execute and the changes would not take effect.
		//
		//       For example, if we set a property of smartMode directly, e.g. device.state.smartMode.enabled = true, StateHandler's
		//       setter will not get called and so any changes will not take effect. This is why we MUST update a device's property as
		//       a whole, and do it only once (otherwise's the setter will get called multiple times which will send repeated commands
		//       to the Sensibo devices).
		device.state.smartMode = smartModeState
	}

	return {

		get: {
			// TODO: refactor this similar to PureActive below?
			/** @param {homebridge.CharacteristicGetCallback} callback */
			ACActive: (callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					// TODO: log warning
					return
				}

				const active = device.state.active
				const mode = device.state.mode

				if (!active || mode === 'FAN' || mode === 'DRY') {
					easyDebug(device.name, '(GET) - AC Active State: false')

					callback(null, 0)
				} else {
					easyDebug(device.name, '(GET) - AC Active State: true')

					callback(null, 1)
				}
			},

			/** @param {homebridge.CharacteristicGetCallback} callback */
			PureActive: (callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					// TODO: log warning
					return
				}

				const active = device.state.active

				easyDebug(`${device.name} (GET) - Pure Active State: ${active}`)

				callback(null, active ? 1 : 0)
			},

			/** @param {homebridge.CharacteristicGetCallback} callback */
			CurrentAirPurifierState: (callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					// TODO: log warning
					return
				}
				const active = device.state.active

				easyDebug(`${device.name} (GET) - Pure Current State: ${active ? 'PURIFYING_AIR' : 'INACTIVE'}`)

				callback(null, active ? 2 : 0)
			},

			/** @param {homebridge.CharacteristicGetCallback} callback */
			TargetAirPurifierState: (callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					// TODO: log warning
					return
				}

				const pureBoost = device.state.pureBoost

				easyDebug(`${device.name} (GET) - Pure Target State (Boost): ${pureBoost ? 'AUTO' : 'MANUAL'}`)

				callback(null, pureBoost ? 1 : 0)
			},

			/** @param {homebridge.CharacteristicGetCallback} callback */
			CurrentHeaterCoolerState: (callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					// TODO: log warning
					return
				}

				const active = device.state.active
				const mode = device.state.mode
				const targetTemp = device.state.targetTemperature
				const currentTemp = device.state.currentTemperature

				easyDebug(device.name, '(GET) - Current HeaterCooler State:', active ? mode : 'OFF')

				if (!active || mode === 'FAN' || mode === 'DRY') {
					callback(null, this.Characteristic.CurrentHeaterCoolerState.INACTIVE)
				} else if (mode === 'COOL') {
					callback(null, this.Characteristic.CurrentHeaterCoolerState.COOLING)
				} else if (mode === 'HEAT') {
					callback(null, this.Characteristic.CurrentHeaterCoolerState.HEATING)
				} else if (currentTemp > targetTemp) {
					callback(null, this.Characteristic.CurrentHeaterCoolerState.COOLING)
				} else {
					callback(null, this.Characteristic.CurrentHeaterCoolerState.HEATING)
				}
			},

			/** @param {homebridge.CharacteristicGetCallback} callback */
			TargetHeaterCoolerState: (callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					easyDebug(device.name, `(GET) - Target HeaterCooler State: ${device.state} is not an instance of InternalAcState!`)

					return
				}

				if (!(device instanceof AirConditioner)) {
					easyDebug(device.name, `(GET) - Target HeaterCooler State: ${device.name} is not an instance of AirConditioner!`)

					return
				}

				const active = device.state.active
				const mode = device.state.mode

				easyDebug(device.name, '(GET) - Target HeaterCooler State:', active ? mode : 'OFF')
				if (!active || mode === 'FAN' || mode === 'DRY') {
					const lastMode = device.HeaterCoolerService.getCharacteristic(this.Characteristic.TargetHeaterCoolerState).value

					callback(null, lastMode)
				} else {
					callback(null, this.sanitize(device.HeaterCoolerService, 'TargetHeaterCoolerState', this.Characteristic.TargetHeaterCoolerState[mode]))
				}
			},

			/** @param {homebridge.CharacteristicGetCallback} callback */
			CurrentTemperature: (callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					easyDebug(device.name, `(GET) - Current Temperature State: ${device.state} is not an instance of InternalAcState!`)

					return
				}

				if (!(device instanceof AirConditioner || device instanceof RoomSensor)) {
					easyDebug(device.name, `(GET) - Current Temperature State: ${device.name} is not an instance of AirConditioner or RoomSensor!`)

					return
				}

				const currentTemp = device.state.currentTemperature

				if (device.usesFahrenheit) {
					easyDebug(device.name, '(GET) - Current Temperature:', this.toFahrenheit(currentTemp) + 'ºF')
				} else {
					easyDebug(device.name, '(GET) - Current Temperature:', currentTemp + 'ºC')
				}

				callback(null, currentTemp)
			},

			/** @param {homebridge.CharacteristicGetCallback} callback */
			CoolingThresholdTemperature: (callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					easyDebug(device.name, `(GET) - Target Cooling Temperature: ${device.state} is not an instance of InternalAcState!`)

					return
				}

				if (!(device instanceof AirConditioner)) {
					easyDebug(device.name, `(GET) - Target Cooling Temperature: ${device.name} is not an instance of AirConditioner!`)

					return
				}

				const targetTemp = this.sanitize(device.HeaterCoolerService, 'CoolingThresholdTemperature', device.state.targetTemperature)

				if (device.usesFahrenheit) {
					easyDebug(device.name, '(GET) - Target Cooling Temperature:', this.toFahrenheit(targetTemp) + 'ºF')
				} else {
					easyDebug(device.name, '(GET) - Target Cooling Temperature:', targetTemp + 'ºC')
				}

				callback(null, targetTemp)
			},

			/** @param {homebridge.CharacteristicGetCallback} callback */
			HeatingThresholdTemperature: (callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					easyDebug(device.name, `(GET) - Target Heating Temperature: ${device.state} is not an instance of InternalAcState!`)

					return
				}

				if (!(device instanceof AirConditioner)) {
					easyDebug(device.name, `(GET) - Target Heating Temperature: ${device.name} is not an instance of AirConditioner!`)

					return
				}

				const targetTemp = this.sanitize(device.HeaterCoolerService, 'HeatingThresholdTemperature', device.state.targetTemperature)

				if (device.usesFahrenheit) {
					easyDebug(device.name, '(GET) - Target Heating Temperature:', this.toFahrenheit(targetTemp) + 'ºF')
				} else {
					easyDebug(device.name, '(GET) - Target Heating Temperature:', targetTemp + 'ºC')
				}

				callback(null, targetTemp)
			},

			/** @param {homebridge.CharacteristicGetCallback} callback */
			TemperatureDisplayUnits: (callback) => {
				if (!(device instanceof AirConditioner || device instanceof RoomSensor)) {
					easyDebug(device.name, `(GET) - Temperature Display Units: ${device.name} is not an instance of AirConditioner or RoomSensor!`)

					return
				}

				easyDebug(device.name, '(GET) - Temperature Display Units:', device.temperatureUnit)

				callback(null, device.usesFahrenheit ? this.Characteristic.TemperatureDisplayUnits.FAHRENHEIT : this.Characteristic.TemperatureDisplayUnits.CELSIUS)
			},

			/** @param {homebridge.CharacteristicGetCallback} callback */
			CurrentRelativeHumidity: (callback) => {
				if (!(device.state instanceof Classes.InternalAcState || device.state instanceof Classes.InternalSensorState)) {
					easyDebug(device.name, `(GET) - Current Relative Humidity: ${device.state} is not an instance of InternalAcState!`)

					return
				}

				easyDebug(device.name, '(GET) - Current Relative Humidity:', device.state.relativeHumidity, '%')

				callback(null, device.state.relativeHumidity)
			},

			/** @param {homebridge.CharacteristicGetCallback} callback */
			ACSwing: (callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					easyDebug(device.name, `(GET) - AC Swing: ${device.state} is not an instance of InternalAcState!`)

					return
				}

				const swing = device.state.verticalSwing

				easyDebug(device.name, '(GET) - AC Swing:', swing)

				callback(null, this.Characteristic.SwingMode[swing])
			},

			/** @param {homebridge.CharacteristicGetCallback} callback */
			ACRotationSpeed: (callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					easyDebug(device.name, `(GET) - AC Rotation Speed: ${device.state} is not an instance of InternalAcState!`)

					return
				}

				const fanSpeed = device.state.fanSpeed ?? 0

				easyDebug(device.name, '(GET) - AC Rotation Speed:', fanSpeed + '%')

				callback(null, fanSpeed)
			},

			/** @param {homebridge.CharacteristicGetCallback} callback */
			PureRotationSpeed: (callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					easyDebug(device.name, `(GET) - Pure Rotation Speed: ${device.state} is not an instance of InternalAcState!`)

					return
				}

				const fanSpeed = device.state.fanSpeed

				easyDebug(device.name, '(GET) - Pure Rotation Speed:', fanSpeed + '%')

				callback(null, fanSpeed)
			},

			// FILTER
			/** @param {homebridge.CharacteristicGetCallback} callback */
			FilterChangeIndication: (callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					easyDebug(device.name, `(GET) - Filter Change Indication: ${device.state} is not an instance of InternalAcState!`)

					return
				}

				const filterChange = device.state.filterChange

				easyDebug(device.name, '(GET) - Filter Change Indication:', filterChange)

				callback(null, this.Characteristic.FilterChangeIndication[filterChange])
			},

			/** @param {homebridge.CharacteristicGetCallback} callback */
			FilterLifeLevel: (callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					easyDebug(device.name, `(GET) - Filter Life Level: ${device.state} is not an instance of InternalAcState!`)

					return
				}

				const filterLifeLevel = device.state.filterLifeLevel

				easyDebug(device.name, '(GET) - Filter Life Level:', filterLifeLevel + '%')

				callback(null, filterLifeLevel)
			},

			// FAN
			/** @param {homebridge.CharacteristicGetCallback} callback */
			FanActive: (callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					easyDebug(device.name, `(GET) - Fan Active State: ${device.state} is not an instance of InternalAcState!`)

					return
				}

				const active = device.state.active
				const mode = device.state.mode

				if (!active || mode !== 'FAN') {
					easyDebug(device.name, '(GET) - Fan Active State: false')

					callback(null, 0)
				} else {
					easyDebug(device.name, '(GET) - Fan Active State: true')

					callback(null, 1)
				}
			},

			/** @param {homebridge.CharacteristicGetCallback} callback */
			FanSwing: (callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					easyDebug(device.name, `(GET) - Fan Swing: ${device.state} is not an instance of InternalAcState!`)

					return
				}

				const swing = device.state.verticalSwing

				easyDebug(device.name, '(GET) - Fan Swing:', swing)

				callback(null, this.Characteristic.SwingMode[swing])
			},

			/** @param {homebridge.CharacteristicGetCallback} callback */
			FanRotationSpeed: (callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					easyDebug(device.name, `(GET) - Fan Rotation Speed: ${device.state} is not an instance of InternalAcState!`)

					return
				}

				const fanSpeed = device.state.fanSpeed

				easyDebug(device.name, '(GET) - Fan Rotation Speed:', fanSpeed + '%')

				callback(null, fanSpeed)
			},

			// DEHUMIDIFIER
			/** @param {homebridge.CharacteristicGetCallback} callback */
			DryActive: (callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					// TODO: log warning
					return
				}

				const active = device.state.active
				const mode = device.state.mode

				if (!active || mode !== 'DRY') {
					easyDebug(device.name, '(GET) - Dry Active State: false')

					callback(null, 0)
				} else {
					easyDebug(device.name, '(GET) - Dry Active State: true')

					callback(null, 1)
				}
			},

			/** @param {homebridge.CharacteristicGetCallback} callback */
			CurrentHumidifierDehumidifierState: (callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					// TODO: log warning
					return
				}

				const active = device.state.active
				const mode = device.state.mode

				if (!active || mode !== 'DRY') {
					easyDebug(device.name, '(GET) - Dry Current Dehumidifier State: INACTIVE')

					callback(null, this.Characteristic.CurrentHumidifierDehumidifierState.INACTIVE)
				} else {
					easyDebug(device.name, '(GET) - Dry Current Dehumidifier State: DEHUMIDIFYING')

					callback(null, this.Characteristic.CurrentHumidifierDehumidifierState.DEHUMIDIFYING)
				}
			},

			/** @param {homebridge.CharacteristicGetCallback} callback */
			TargetHumidifierDehumidifierState: (callback) => {
				easyDebug(device.name, '(GET) - Target Dehumidifier State: DEHUMIDIFIER')

				callback(null, this.Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER)
			},

			/** @param {homebridge.CharacteristicGetCallback} callback */
			DryRotationSpeed: (callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					// TODO: log warning
					return
				}

				const fanSpeed = device.state.fanSpeed

				easyDebug(device.name, '(GET) - Dry Rotation Speed:', fanSpeed + '%')

				callback(null, fanSpeed)
			},

			/** @param {homebridge.CharacteristicGetCallback} callback */
			DrySwing: (callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					// TODO: log warning
					return
				}

				const swing = device.state.verticalSwing

				easyDebug(device.name, '(GET) - Dry Swing:', swing)

				callback(null, this.Characteristic.SwingMode[swing])
			},

			// ROOM SENSOR
			/** @param {homebridge.CharacteristicGetCallback} callback */
			MotionDetected: (callback) => {
				if (!(device.state instanceof Classes.InternalSensorState)) {
					// TODO: log warning
					return
				}

				const motionDetected = device.state.motionDetected

				easyDebug(device.name, '(GET) - Motion Detected:', motionDetected)

				callback(null, motionDetected)
			},

			/** @param {homebridge.CharacteristicGetCallback} callback */
			StatusLowBattery: (callback) => {
				if (!(device.state instanceof Classes.InternalSensorState)) {
					// TODO: log warning
					return
				}

				const lowBattery = device.state.lowBattery

				easyDebug(device.name, '(GET) - Status Low Battery:', lowBattery)

				callback(null, this.Characteristic.StatusLowBattery[lowBattery])
			},

			// HORIZONTAL SWING
			/** @param {homebridge.CharacteristicGetCallback} callback */
			HorizontalSwing: (callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					// TODO: log warning
					return
				}

				const horizontalSwing = device.state.horizontalSwing

				easyDebug(device.name, '(GET) - Horizontal Swing:', horizontalSwing)

				callback(null, horizontalSwing === 'SWING_ENABLED')
			},

			// AIR CONDITIONER/PURIFIER LIGHT
			/** @param {homebridge.CharacteristicGetCallback} callback */
			LightSwitch: (callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					// TODO: log warning
					return
				}

				const light = device.state.light

				easyDebug(device.name, '(GET) - Light:', light ? 'ON' : 'OFF')

				callback(null, light)
			},

			// CLIMATE REACT
			/** @param {homebridge.CharacteristicGetCallback} callback */
			ClimateReactSwitch: (callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					// TODO: log warning
					return
				}

				const smartModeEnabled = device.state.smartMode.enabled

				easyDebug(device.name, '(GET) - Climate React Enabled Switch:', smartModeEnabled)

				callback(null, smartModeEnabled)
			},

			// OCCUPANCY SENSOR
			/** @param {homebridge.CharacteristicGetCallback} callback */
			OccupancyDetected: (callback) => {
				if (!(device.state instanceof Classes.InternalOccupancyState)) {
					// TODO: log warning
					return
				}

				const occupancy = device.state.occupancy

				easyDebug(device.name, '(GET) Occupancy Detected:', occupancy)

				callback(null, this.Characteristic.OccupancyDetected[occupancy])
			},

			// Air Quality
			/** @param {homebridge.CharacteristicGetCallback} callback */
			AirQuality: (callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					// TODO: log warning
					return
				}

				const airQuality = device.state.airQuality

				easyDebug(device.name, '(GET) - Air Quality:', airQuality)

				callback(null, airQuality)
			},

			/** @param {homebridge.CharacteristicGetCallback} callback */
			VOCDensity: (callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					// TODO: log warning
					return
				}

				const VOCDensity = device.state.VOCDensity

				easyDebug(device.name, '(GET) - Volatile Organic Compound Density:', VOCDensity)

				callback(null, VOCDensity)
			},

			/** @param {homebridge.CharacteristicGetCallback} callback */
			CarbonDioxideDetected: (callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					// TODO: log warning
					return
				}

				const carbonDioxideDetected = device.state.carbonDioxideDetected

				easyDebug(device.name, '(GET) - Carbon Dioxide Detected:', carbonDioxideDetected)

				callback(null, carbonDioxideDetected)
			},

			/** @param {homebridge.CharacteristicGetCallback} callback */
			CarbonDioxideLevel: (callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					// TODO: log warning
					return
				}

				const carbonDioxideLevel = device.state.carbonDioxideLevel

				easyDebug(device.name, '(GET) - Carbon Dioxide Level:', carbonDioxideLevel)

				callback(null, carbonDioxideLevel)
			},

			/** @param {homebridge.CharacteristicGetCallback} callback */
			SyncButton: (callback) => {
				easyDebug(device.name, '(GET) - Sync Button, no state change')

				callback(null, false)
			}
		},

		set: {
			/**
			 * @param {homebridge.CharacteristicValue} value
			 * @param {homebridge.CharacteristicGetCallback} callback
			 */
			ACActive: (value, callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					// TODO: log warning
					return
				}

				if (!(device instanceof AirConditioner)) {
					easyDebug(device.name, `(SET) - AC Active State: ${device.name} is not an instance of AirConditioner!`)

					return
				}

				value = !!value
				easyDebug(device.name, '(SET) - AC Active State:', value)

				if (value) {
					device.state.active = true
					const lastMode = device.HeaterCoolerService.getCharacteristic(this.Characteristic.TargetHeaterCoolerState).value
					const mode = this.characteristicToMode(lastMode)

					easyDebug(device.name, '(SET) - HeaterCooler State:', mode)
					device.state.mode = mode
				} else if (device.state.mode === 'COOL' || device.state.mode === 'HEAT' || device.state.mode === 'AUTO') {
					device.state.active = false
				}

				this.updateClimateReact(device, enableClimateReactAutoSetup)

				callback()
			},

			/**
			 * @param {homebridge.CharacteristicValue} value
			 * @param {homebridge.CharacteristicGetCallback} callback
			 */
			PureActive: (value, callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					// TODO: log warning
					return
				}

				value = !!value
				easyDebug(device.name, '(SET) - Pure Active State:', value)
				device.state.active = value

				if (device instanceof AirConditioner) {
					this.updateClimateReact(device, enableClimateReactAutoSetup)
				} else {
					easyDebug(device.name, `(SET) - Pure Active State: ${device.name} device is not an instance of AirConditioner, skipping climate react auto setup.`)
				}

				callback()
			},

			/**
			 * @param {homebridge.CharacteristicValue} value
			 * @param {homebridge.CharacteristicGetCallback} callback
			 */
			TargetHeaterCoolerState: (value, callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					// TODO: log warning
					return
				}

				const mode = this.characteristicToMode(value)

				easyDebug(device.name, '(SET) - Target HeaterCooler State:', mode)
				device.state.mode = mode
				device.state.active = true
				if (device instanceof AirConditioner) {
					this.updateClimateReact(device, enableClimateReactAutoSetup)
				} else {
					easyDebug(device.name, `(SET) - Target HeaterCooler State: ${device.name} device is not an instance of AirConditioner, skipping climate react auto setup.`)
				}

				callback()
			},

			/**
			 * @param {number} targetTemp
			 * @param {homebridge.CharacteristicGetCallback} callback
			 */
			CoolingThresholdTemperature: (targetTemp, callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					// TODO: log warning
					return
				}

				if (!(device instanceof AirConditioner)) {
					easyDebug(device.name, `(SET) - Target Cooling Temperature: ${device.name} is not an instance of AirConditioner!`)

					return
				}

				if (device.usesFahrenheit) {
					easyDebug(device.name, '(SET) - Target Cooling Temperature:', this.toFahrenheit(targetTemp) + 'ºF')
				} else {
					easyDebug(device.name, '(SET) - Target Cooling Temperature:', targetTemp + 'ºC')
				}

				const lastMode = device.HeaterCoolerService.getCharacteristic(this.Characteristic.TargetHeaterCoolerState).value
				const mode = this.characteristicToMode(lastMode)

				device.state.targetTemperature = targetTemp
				// TODO: do we need the below? Does it turn the unit on if it's currently off?
				easyDebug(device.name, '(SET) - Target HeaterCooler State:', mode)
				device.state.active = true
				device.state.mode = mode

				this.updateClimateReact(device, enableClimateReactAutoSetup)

				callback()
			},

			/**
			 * @param {number} targetTemp
			 * @param {homebridge.CharacteristicGetCallback} callback
			 */
			HeatingThresholdTemperature: (targetTemp, callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					// TODO: log warning
					return
				}

				if (!(device instanceof AirConditioner)) {
					easyDebug(device.name, `(SET) - AC Active State: ${device.name} is not an instance of AirConditioner!`)

					return
				}

				if (device.usesFahrenheit) {
					easyDebug(device.name, '(SET) - Target Heating Temperature:', this.toFahrenheit(targetTemp) + 'ºF')
				} else {
					easyDebug(device.name, '(SET) - Target Heating Temperature:', targetTemp + 'ºC')
				}

				const lastMode = device.HeaterCoolerService.getCharacteristic(this.Characteristic.TargetHeaterCoolerState).value
				const mode = this.characteristicToMode(lastMode)

				device.state.targetTemperature = targetTemp
				easyDebug(device.name, '(SET) - HeaterCooler State:', mode)
				device.state.active = true
				device.state.mode = mode

				this.updateClimateReact(device, enableClimateReactAutoSetup)

				callback()
			},

			/**
			 * @param {homebridge.CharacteristicValue} value
			 * @param {homebridge.CharacteristicGetCallback} callback
			 */
			ACSwing: (value, callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					// TODO: log warning
					return
				}

				if (!(device instanceof AirConditioner)) {
					easyDebug(device.name, `(SET) - HeaterCooler State: ${device.name} is not an instance of AirConditioner!`)

					return
				}

				value = value === this.Characteristic.SwingMode.SWING_ENABLED ? 'SWING_ENABLED' : 'SWING_DISABLED'
				easyDebug(device.name, '(SET) - AC Swing:', value)
				device.state.verticalSwing = value

				const lastMode = device.HeaterCoolerService.getCharacteristic(this.Characteristic.TargetHeaterCoolerState).value
				const mode = this.characteristicToMode(lastMode)

				easyDebug(device.name, '(SET) - HeaterCooler State:', mode)
				device.state.active = true
				device.state.mode = mode

				this.updateClimateReact(device, enableClimateReactAutoSetup)

				callback()
			},

			/**
			 * @param {homebridge.CharacteristicValue} value
			 * @param {homebridge.CharacteristicGetCallback} callback
			 */
			ACRotationSpeed: (value, callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					// TODO: log warning
					return
				}

				if (!(device instanceof AirConditioner)) {
					easyDebug(device.name, `(SET) - AC Rotation Speed: ${device.name} is not an instance of AirConditioner!`)

					return
				}
				if (!(typeof(value) == 'number')) {
					easyDebug(device.name, `(SET) - AC Rotation Speed: ${value} is not of type number!`)

					return
				}

				easyDebug(device.name, '(SET) - AC Rotation Speed:', value + '%')
				device.state.fanSpeed = value

				const lastMode = device.HeaterCoolerService.getCharacteristic(this.Characteristic.TargetHeaterCoolerState).value
				const mode = this.characteristicToMode(lastMode)

				easyDebug(device.name, '(SET) - HeaterCooler State:', mode)
				device.state.active = true
				device.state.mode = mode

				this.updateClimateReact(device, enableClimateReactAutoSetup)

				callback()
			},

			/**
			 * @param {homebridge.CharacteristicValue} value
			 * @param {homebridge.CharacteristicGetCallback} callback
			 */
			PureRotationSpeed: (value, callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					// TODO: log warning
					return
				}

				if (value) {
					easyDebug(device.name, '(SET) - Pure Rotation Speed:', value + '%')

					if (typeof(value) == 'number') {
						device.state.fanSpeed = value
					} else {
						// TODO: log warning
					}

					device.state.active = true
				} else {
					device.state.active = false
				}
				if (device instanceof AirConditioner) {
					this.updateClimateReact(device, enableClimateReactAutoSetup)
				} else {
					easyDebug(device.name, `(SET) - Pure Rotation Speed: ${device.name} device is not an instance of AirConditioner, skipping climate react auto setup.`)
				}

				callback()
			},

			// FILTER
			/**
			 * @param {homebridge.CharacteristicValue} value
			 * @param {homebridge.CharacteristicGetCallback} callback
			 */
			ResetFilterIndication: (value, callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					// TODO: log warning
					return
				}

				easyDebug(device.name, '(SET) - Filter Change Indication: RESET')
				device.state.filterChange = 'FILTER_OK'
				device.state.filterLifeLevel = 100

				callback()
			},

			// FAN
			/**
			 * @param {homebridge.CharacteristicValue} value
			 * @param {homebridge.CharacteristicGetCallback} callback
			 */
			FanActive: (value, callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					// TODO: log warning
					return
				}

				value = !!value
				easyDebug(device.name, '(SET) - Fan state Active:', value)

				if (value) {
					easyDebug(device.name, '(SET) - Mode to: FAN')
					device.state.mode = 'FAN'

					device.state.active = true
				} else if (device.state.mode === 'FAN') {
					device.state.active = false
				}

				callback()
			},

			/**
			 * @param {homebridge.CharacteristicValue} value
			 * @param {homebridge.CharacteristicGetCallback} callback
			 */
			FanSwing: (value, callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					// TODO: log warning
					return
				}

				value = value === this.Characteristic.SwingMode.SWING_ENABLED ? 'SWING_ENABLED' : 'SWING_DISABLED'
				easyDebug(device.name, '(SET) - Fan Swing:', value)
				device.state.verticalSwing = value
				device.state.active = true
				easyDebug(device.name, '(SET) - Mode to: FAN')
				device.state.mode = 'FAN'

				callback()
			},

			/**
			 * @param {homebridge.CharacteristicValue} value
			 * @param {homebridge.CharacteristicGetCallback} callback
			 */
			FanRotationSpeed: (value, callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					// TODO: log warning
					return
				}

				easyDebug(device.name, '(SET) - Fan Rotation Speed:', value + '%')
				if (typeof(value) == 'number') {
					device.state.fanSpeed = value
				} else {
					// TODO: log warning
				}

				device.state.active = true
				easyDebug(device.name, '(SET) - Mode to: FAN')
				device.state.mode = 'FAN'

				callback()
			},

			// DEHUMIDIFIER
			/**
			 * @param {homebridge.CharacteristicValue} value
			 * @param {homebridge.CharacteristicGetCallback} callback
			 */
			DryActive: (value, callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					// TODO: log warning
					return
				}

				value = !!value
				easyDebug(device.name, '(SET) - Dry state Active:', value)
				if (value) {
					device.state.active = true
					easyDebug(device.name, '(SET) - HeaterCooler State: DRY')
					device.state.mode = 'DRY'
				} else if (device.state.mode === 'DRY') {
					device.state.active = false
				}

				callback()
			},

			/**
			 * @param {homebridge.CharacteristicValue} value
			 * @param {homebridge.CharacteristicGetCallback} callback
			 */
			TargetHumidifierDehumidifierState: (value, callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					// TODO: log warning
					return
				}

				device.state.active = true
				easyDebug(device.name, '(SET) - HeaterCooler State: DRY')
				device.state.mode = 'DRY'

				callback()
			},

			/**
			 * @param {homebridge.CharacteristicValue} value
			 * @param {homebridge.CharacteristicGetCallback} callback
			 */
			DrySwing: (value, callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					// TODO: log warning
					return
				}

				value = value === this.Characteristic.SwingMode.SWING_ENABLED ? 'SWING_ENABLED' : 'SWING_DISABLED'
				easyDebug(device.name, '(SET) - Dry Swing:', value)
				device.state.verticalSwing = value

				device.state.active = true
				easyDebug(device.name + ' -> Setting Mode to: DRY')
				device.state.mode = 'DRY'

				callback()
			},

			/**
			 * @param {homebridge.CharacteristicValue} value
			 * @param {homebridge.CharacteristicGetCallback} callback
			 */
			DryRotationSpeed: (value, callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					// TODO: log warning
					return
				}

				easyDebug(device.name, '(SET) - Dry Rotation Speed:', value + '%')
				if (typeof(value) == 'number') {
					device.state.fanSpeed = value
				} else {
					// TODO: log warning
				}

				device.state.active = true
				easyDebug(device.name + ' -> Setting Mode to: DRY')
				device.state.mode = 'DRY'

				callback()
			},

			// HORIZONTAL SWING
			/**
			 * @param {homebridge.CharacteristicValue} value
			 * @param {homebridge.CharacteristicGetCallback} callback
			 */
			HorizontalSwing: (value, callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					// TODO: log warning
					return
				}

				value = value ? 'SWING_ENABLED' : 'SWING_DISABLED'
				easyDebug(device.name, '(SET) - Horizontal Swing Swing:', value)
				device.state.horizontalSwing = value

				if (device instanceof AirConditioner) {
					this.updateClimateReact(device, enableClimateReactAutoSetup)
				} else{
					easyDebug(device.name, `(SET) - Horizontal Swing Swing: ${device.name} device is not an instance of AirConditioner, skipping climate react auto setup.`)
				}

				callback()
			},

			// AIR CONDITIONER/PURIFIER LIGHT
			/**
			 * @param {homebridge.CharacteristicValue} value
			 * @param {homebridge.CharacteristicGetCallback} callback
			 */
			LightSwitch: (value, callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					// TODO: log warning
					return
				}

				easyDebug(device.name, '(SET) - Light to', value ? 'ON' : 'OFF')

				if (typeof(value) == 'boolean') {
					device.state.light = value
				} else {
					// TODO: log warning
				}

				if (device instanceof AirConditioner) {
					this.updateClimateReact(device, enableClimateReactAutoSetup)
				} else {
					easyDebug(device.name, `(SET) - Light: ${device.name} device is not an instance of AirConditioner, skipping climate react auto setup.`)
				}

				callback()
			},

			// AC SYNC BUTTON
			// TODO: should be moved to be a 'set' in StateHanlder line 33
			/**
			 * @param {homebridge.CharacteristicValue} value
			 * @param {homebridge.CharacteristicGetCallback} callback
			 */
			SyncButton: (value, callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					// TODO: log warning
					return
				}

				if (value) {
					easyDebug(device.name, '(SYNC) - AC Active State:', device.state.active)
					device.state.syncState()
				}

				callback()
			},

			// CLIMATE REACT
			/**
			 * @param {homebridge.CharacteristicValue} value
			 * @param {homebridge.CharacteristicGetCallback} callback
			 */
			ClimateReactSwitch: (value, callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					// TODO: log warning
					return
				}

				easyDebug(device.name, '(SET) - Climate React Enabled Switch:', value)
				const smartModeState = device.state.smartMode

				smartModeState.enabled = !!value

				// NOTE: we must set the 'smartMode' property directly (and NOT for example like so: device.state.smartMode.enabled = true),
				//       otherwise the StateHandler's setter code will not be executed and any changes will not take effect.
				device.state.smartMode = smartModeState

				callback()
			},

			// PURE BOOST
			/**
			 * @param {homebridge.CharacteristicValue} value
			 * @param {homebridge.CharacteristicGetCallback} callback
			 */
			TargetAirPurifierState: (value, callback) => {
				if (!(device.state instanceof Classes.InternalAcState)) {
					// TODO: log warning
					return
				}

				const pureBoost = !!value

				easyDebug(device.name, '(SET) - Pure Target State (Boost):', pureBoost ? 'AUTO' : 'MANUAL')
				device.state.pureBoost = pureBoost

				callback()
			}
		}

	}
}