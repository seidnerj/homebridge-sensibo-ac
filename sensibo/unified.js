// eslint-disable-next-line no-unused-vars
const SensiboACPlatform = require('../sensibo/SensiboACPlatform')
const Classes = require('../classes')

module.exports = {

	/**
	 * @param {string} value
	 * @param {string[]} fanLevels
	 * @returns {number}
	 */
	fanLevelToHK: function(value, fanLevels) {
		if (value === 'auto') {
			return 0
		}

		fanLevels = fanLevels.filter(level => {
			return level !== 'auto'
		})

		const totalLevels = fanLevels.length > 0 ? fanLevels.length : 1
		const valueIndex = fanLevels.indexOf(value) + 1

		return Math.round(100 * valueIndex / totalLevels)
	},

	/**
	 * Convert degrees F to degrees C
	 * @param  {Number} degreesF The degrees in F to convert
	 * @return {Number} The degrees in C
	 */
	toCelsius: function (degreesF) {
		const degreesC = (degreesF - 32) / 1.8

		return degreesC
	},

	/**
	 * Convert degrees C to degrees F
	 * @param  {Number} degreesC The degrees in C to convert
	 * @return {Number} The degrees in F
	 */
	toFahrenheit: function (degreesC) {
		const degreesF = Math.round((degreesC * 1.8) + 32)

		return degreesF
	},

	/**
	 * @param {import('../types').Device} device
	 * @returns {import('../types').DeviceInfo}
	 */
	getDeviceInfo: function (device) {
		return {
			id: device.id,
			productModel: device.productModel,
			serial: device.serial,
			manufacturer: 'Sensibo Inc.',
			appId: 'com.sensibo.Sensibo',
			room: device.room,
			temperatureUnit: device.temperatureUnit,
			filterService: device.filtersCleaning ? true : false
		}
	},

	/**
	 * @param {import('../types').Sensor} sensor
	 * @returns {import('../types').SensorInfo}
	 */
	getSensorInfo: function (sensor) {
		return {
			id: sensor.id,
			productModel: sensor.productModel,
			serial: sensor.serial
		}
	},

	/**
	 * @param {import('../types').Location} location
	 * @returns {import('../types').LocationInfo}
	 */
	getLocationInfo: function (location) {
		return {
			id: location.id,
			name: location.name,
			serial: location.id
		}
	},

	/**
	 * @param {import('../types').Device} device
	 * @param {SensiboACPlatform} platform
	 * @returns {import('../types').Capabilities}
	 */
	getCapabilities: function (device, platform) {
		/** @type  {import('../types').Capabilities} */
		const capabilities = {}

		for (const [key, modeCapabilities] of Object.entries(device.remoteCapabilities.modes)) {
			// modeString is one of the following: COOL, HEAT, AUTO, FAN, DRY
			const modeString = key.toUpperCase()
			/** @type {import('../types').Mode} */
			const mode = {}

			capabilities[modeString] = mode

			if (!['DRY','FAN'].includes(modeString)) {
				mode.homeKitSupported = true
			}

			platform.easyDebugInfo(`${device.room.name} - Mode: ${modeString} - Temperature scales:`)
			platform.easyDebugInfo(`C:\n${JSON.stringify(modeCapabilities.temperatures.C, null, 4)}`)
			platform.easyDebugInfo(`F:\n${JSON.stringify(modeCapabilities.temperatures.F, null, 4)}`)

			if (modeCapabilities.temperatures.C || modeCapabilities.temperatures.F) {
				mode.temperatures = {}
			}

			// set min & max temperatures
			if (modeCapabilities.temperatures?.C) {
				mode.temperatures.C = {
					min: Math.min(...modeCapabilities.temperatures.C.values),
					max: Math.max(...modeCapabilities.temperatures.C.values)
				}
			}

			// TODO: check if we actually need F, does Sensibo always return C if it has F?
			if (modeCapabilities.temperatures?.F) {
				mode.temperatures.F = {
					min: Math.min(...modeCapabilities.temperatures.F.values),
					max: Math.max(...modeCapabilities.temperatures.F.values)
				}
			}

			// set fanSpeeds
			if (modeCapabilities.fanLevels && modeCapabilities.fanLevels.length) {
				mode.fanSpeeds = modeCapabilities.fanLevels

				// set AUTO fanSpeed
				if (mode.fanSpeeds.includes('auto')) {
					mode.autoFanSpeed = true
				} else {
					mode.autoFanSpeed = false
				}
			}

			// set vertical swing
			if (modeCapabilities.swing) {
				if (modeCapabilities.swing.includes('both')) {
					mode.horizontalSwing = true
					mode.verticalSwing = true
					mode.threeDimensionalSwing = true
				} else {
					if (modeCapabilities.swing.includes('rangeFull')) {
						mode.verticalSwing = true
						mode.threeDimensionalSwing = false
					}

					if (modeCapabilities.swing.includes('horizontal')) {
						mode.horizontalSwing = true
						mode.threeDimensionalSwing = false
					}
				}
			}

			// set horizontal swing
			if (!capabilities[modeString].horizontalSwing &&
				modeCapabilities.horizontalSwing &&
				modeCapabilities.horizontalSwing.includes('rangeFull')) {
				mode.horizontalSwing = true
			}

			// set light
			if (modeCapabilities.light) {
				mode.light = true
			}

			platform.easyDebugInfo(`${device.room.name} - Mode: ${modeString}, Capabilities:`)
			platform.easyDebugInfo(JSON.stringify(mode, null, 4))
		}

		return capabilities
	},

	/**
	 * @param {import('../types').Device} device
	 * @returns {import('../types').InternalSmartModeState}
	 */
	getInternalSmartModeState: function (device)  {
		/** @type {null|import('../types').InternalSmartModeState} */
		let smartModeState = null

		if (device.smartMode) {
			/** @type {null|import('../types').InternalSmartModeTempratureState} */
			let highTemperatureState = null
			/** @type {null|import('../types').InternalSmartModeTempratureState} */
			let lowTemperatureState = null

			if (device.smartMode.highTemperatureState && device.smartMode.lowTemperatureState) {
				const highTemperatureStateFanSpeed = this.getFanSpeedForFanLevel(device, device.smartMode.highTemperatureState.mode, device.smartMode.highTemperatureState.fanLevel)
				const highTemperatureInternalSwingState = this.getInternalSwingStateFromInternalSwingValues(device.smartMode.highTemperatureState.swing, device.smartMode.highTemperatureState.horizontalSwing)

				highTemperatureState = {
					on: device.smartMode.highTemperatureState.on,
					light: device.smartMode.highTemperatureState.light,
					temperatureUnit: device.smartMode.highTemperatureState.temperatureUnit,
					fanSpeed: highTemperatureStateFanSpeed,
					mode: device.smartMode.highTemperatureState.mode.toUpperCase(),
					targetTemperature: device.smartMode.highTemperatureState.targetTemperature,
					swing: highTemperatureInternalSwingState.verticalSwing,
					horizontalSwing: highTemperatureInternalSwingState.horizontalSwing
				}

				const lowTemperatureStateFanSpeed = this.getFanSpeedForFanLevel(device, device.smartMode.lowTemperatureState.mode, device.smartMode.lowTemperatureState.fanLevel)
				const lowTemperatureInternalSwingState = this.getInternalSwingStateFromInternalSwingValues(device.smartMode.lowTemperatureState.swing, device.smartMode.lowTemperatureState.horizontalSwing)

				lowTemperatureState = {
					on: device.smartMode.lowTemperatureState.on,
					light: device.smartMode.lowTemperatureState.light,
					temperatureUnit: device.smartMode.lowTemperatureState.temperatureUnit,
					fanSpeed: lowTemperatureStateFanSpeed,
					mode: device.smartMode.lowTemperatureState.mode.toUpperCase(),
					targetTemperature: device.smartMode.lowTemperatureState.targetTemperature,
					swing: lowTemperatureInternalSwingState.verticalSwing,
					horizontalSwing: lowTemperatureInternalSwingState.horizontalSwing
				}
			}

			/** @type {import('../types').InternalSmartModeState} */
			smartModeState = {
				enabled: device.smartMode.enabled,
				type: device.smartMode.type,
				highTemperatureState: highTemperatureState,
				highTemperatureThreshold: device.smartMode.highTemperatureThreshold,
				highTemperatureWebhook: device.smartMode.highTemperatureWebhook,
				lowTemperatureState: lowTemperatureState,
				lowTemperatureThreshold: device.smartMode.lowTemperatureThreshold,
				lowTemperatureWebhook: device.smartMode.lowTemperatureWebhook
			}
		}

		return smartModeState
	},

	/**
	 * @param {import('../types').Device} device
	 * @returns {import('../types').InternalFilterState}
	 */
	getInternalFilterState: function (device)  {
		let filterChange = null
		let filterLifeLevel = null

		if (device.filtersCleaning) {
			filterChange = device.filtersCleaning.shouldCleanFilters ? 'CHANGE_FILTER' : 'FILTER_OK'
			const acOnSecondsSinceLastFiltersClean = device.filtersCleaning.acOnSecondsSinceLastFiltersClean
			const filtersCleanSecondsThreshold = device.filtersCleaning.filtersCleanSecondsThreshold

			if (acOnSecondsSinceLastFiltersClean > filtersCleanSecondsThreshold) {
				filterLifeLevel = 0
			} else {
				filterLifeLevel = 100 - Math.floor(acOnSecondsSinceLastFiltersClean / filtersCleanSecondsThreshold * 100)
			}
		}

		return {
			filterChange: filterChange,
			filterLifeLevel: filterLifeLevel
		}
	},

	/**
	 * @param {import('../types').Device} device
	 * @returns {import('../types').InternalSwingState}
	 */
	getInternalSwingState: function (device) {
		return this.getInternalSwingStateFromAcState(device.acState)
	},

	/**
	 * @param {import('../types').AcState} acState
	 * @returns {import('../types').InternalSwingState}
	 */
	getInternalSwingStateFromAcState: function (acState) {
		return this.getInternalSwingStateFromInternalSwingValues(acState.swing, acState.horizontalSwing)
	},

	/**
	 * @param {string} swing
	 * @param {string} horizontalSwing
	 * @returns {import('../types').InternalSwingState}
	 */
	getInternalSwingStateFromInternalSwingValues: function (swing, horizontalSwing) {
		let internalHorizontalSwingValue = 'SWING_DISABLED'
		let internalVerticalSwingValue = 'SWING_DISABLED'

		if (swing) {
			if (swing === 'rangeFull') {
				internalVerticalSwingValue = 'SWING_ENABLED'
			} else if (swing === 'horizontal') {
				internalHorizontalSwingValue = 'SWING_ENABLED'
			} else if (swing === 'both') {
				internalHorizontalSwingValue = 'SWING_ENABLED'
				internalVerticalSwingValue = 'SWING_ENABLED'
			}
		}

		if (horizontalSwing && horizontalSwing === 'rangeFull') {
			internalHorizontalSwingValue = 'SWING_ENABLED'
		}

		return {
			horizontalSwing: internalHorizontalSwingValue,
			verticalSwing: internalVerticalSwingValue
		}
	},

	/**
	 * @param {import('../types').Device} device
	 * @returns {null|number}
	 */
	getFanSpeed: function (device) {
		return this.getFanSpeedFromAcState(device, device.acState)
	},

	/**
	 * @param {import('../types').Device} device
	 * @param {import('../types').AcState} acState
	 * @returns {null|number}
	 */
	getFanSpeedFromAcState: function (device, acState) {
		return this.getFanSpeedForFanLevel(device, acState.mode, acState.fanLevel)
	},

	/**
	 * @param {import('../types').Device} device
	 * @param {string} mode
	 * @param {string} fanLevel
	 * @returns {null|number}
	 */
	getFanSpeedForFanLevel: function (device, mode, fanLevel) {
		let fanSpeed = null
		const modeCapabilities = device.remoteCapabilities.modes[mode]

		if (modeCapabilities.fanLevels && modeCapabilities.fanLevels.length) {
			fanSpeed = this.fanLevelToHK(fanLevel, modeCapabilities.fanLevels) || 0
		}

		return fanSpeed
	},

	/**
	 * @param {import('../types').Device} device
	 * @returns {Classes.InternalAcState}
	 */
	getInternalAcState: function (device) {
		const internalSmartModeState = this.getInternalSmartModeState(device)
		const internalFilterState = this.getInternalFilterState(device)
		const internalSwingState = this.getInternalSwingState(device)
		const fanSpeed = this.getFanSpeed(device)
		const resultingInternalAcState = new Classes.InternalAcState(
			device.acState.on,
			device.acState.mode.toUpperCase(),
			device.acState.targetTemperature ? device.acState.temperatureUnit === 'C' ? device.acState.targetTemperature : this.toCelsius(device.acState.targetTemperature) : null,
			device.measurements.temperature,
			device.measurements.humidity,
			internalSmartModeState,
			device.acState.light && device.acState.light !== 'off',
			device.pureBoostConfig && device.pureBoostConfig.enabled,
			internalFilterState.filterChange,
			internalFilterState.filterLifeLevel,
			internalSwingState.horizontalSwing,
			internalSwingState.verticalSwing,
			fanSpeed
		)

		return resultingInternalAcState
	},

	/**
	 * @param {import('../types').Device} device
	 * @param {SensiboACPlatform} platform
	 * @returns {Classes.InternalAirPurifierState}
	 */
	getInternalAirPurifierState: function (device, platform) {
		const internalSmartModeState = this.getInternalSmartModeState(device)
		const internalFilterState = this.getInternalFilterState(device)
		const internalSwingState = this.getInternalSwingState(device)
		const fanSpeed = this.getFanSpeed(device)
		const airQualityState = this.getAirQualityState(device, platform)
		const resultingInternalAirPurifierState = new Classes.InternalAirPurifierState(
			device.acState.on,
			device.acState.mode.toUpperCase(),
			device.acState.targetTemperature ? device.acState.temperatureUnit === 'C' ? device.acState.targetTemperature : this.toCelsius(device.acState.targetTemperature) : null,
			device.measurements.temperature,
			device.measurements.humidity,
			internalSmartModeState,
			device.acState.light && device.acState.light !== 'off',
			device.pureBoostConfig && device.pureBoostConfig.enabled,
			internalFilterState.filterChange,
			internalFilterState.filterLifeLevel,
			internalSwingState.horizontalSwing,
			internalSwingState.verticalSwing,
			fanSpeed,
			airQualityState.airQuality,
			airQualityState.VOCDensity,
			airQualityState.carbonDioxideDetected,
			airQualityState.carbonDioxideLevel
		)

		return resultingInternalAirPurifierState
	},

	/**
	 * @param {import('../types').Device} device
	 * @param {SensiboACPlatform} platform
	 * @returns {Classes.InternalAirQualitySensorState}
	 */
	getAirQualityState: function (device, platform) {
		// convert ppb to μg/m3
		let VOCDensity = Math.round(device.measurements.tvoc * 4.57)
		let airQuality = device.measurements?.pm25 ?? 0
		let carbonDioxideLevel = null
		let carbonDioxideDetected = null

		VOCDensity = VOCDensity < platform.VOCDENSITY_MAX ? VOCDensity : platform.VOCDENSITY_MAX

		if (device.measurements?.tvoc && device.measurements.tvoc > 0) {
			if (airQuality !== 0) {
				// don't overwrite airQuality if already retrieved from Sensibo
			} else if (device.measurements.tvoc > 1500) {
				airQuality = 5
			} else if (device.measurements.tvoc > 1000) {
				airQuality = 4
			} else if (device.measurements.tvoc > 500) {
				airQuality = 3
			} else if (device.measurements.tvoc > 250) {
				airQuality = 2
			} else {
				airQuality = 1
			}
		}

		if (device.measurements?.co2 && device.measurements.co2 > 0) {
			carbonDioxideLevel = device.measurements.co2
			carbonDioxideDetected = device.measurements.co2 < platform.carbonDioxideAlertThreshold ? 0 : 1
		}

		const state = new Classes.InternalAirQualitySensorState(
			airQuality,
			VOCDensity,
			carbonDioxideDetected,
			carbonDioxideLevel
		)

		return state
	},

	/**
	 * @param {import('../types').Sensor} sensor
	 * @returns {Classes.InternalSensorState}
	 */
	getSensorState: function (sensor) {
		const state = {
			motionDetected: sensor.measurements.motion,
			currentTemperature: sensor.measurements.temperature,
			relativeHumidity: sensor.measurements.humidity,
			lowBattery: sensor.measurements.batteryVoltage > 100 ? 'BATTERY_LEVEL_NORMAL' : 'BATTERY_LEVEL_LOW',
			update: null
		}

		return state
	},

	/**
	 * @param {import('../types').Location} location
	 * @returns {Classes.InternalOccupancyState}
	 */
	getOccupancyState: function (location) {
		const state = {
			occupancy: (location.occupancy === 'me' || location.occupancy === 'someone') ? 'OCCUPANCY_DETECTED' : 'OCCUPANCY_NOT_DETECTED',
			update: null
		}

		return state
	}

}