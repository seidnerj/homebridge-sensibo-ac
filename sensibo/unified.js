// eslint-disable-next-line no-unused-vars
const SensiboACPlatform = require('../sensibo/SensiboACPlatform')
const Classes = require('../classes')

/**
 * @param {string} value
 * @param {string[]} fanLevels
 * @returns {number}
 */
function fanLevelToHK(value, fanLevels) {
	if (value === 'auto') {
		return 0
	}

	fanLevels = fanLevels.filter(level => {
		return level !== 'auto'
	})

	const totalLevels = fanLevels.length > 0 ? fanLevels.length : 1
	const valueIndex = fanLevels.indexOf(value) + 1

	return Math.round(100 * valueIndex / totalLevels)
}

// TODO: use Utils version instead
/**
 * @param {number} value
 * @returns {number}
 */
function toCelsius(value) {
	return (value - 32) / 1.8
}

// TODO: move all functions below to Utils
module.exports = {

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

			platform.easyDebug(`${device.room.name} - Mode: ${modeString} - Temperature scales, C: ${'C' in modeCapabilities.temperatures} F: ${'F' in modeCapabilities.temperatures}`)

			if ('C' in modeCapabilities.temperatures || 'F' in modeCapabilities.temperatures) {
				mode.temperatures = {}
			}

			// set min & max temperatures
			if (modeCapabilities.temperatures?.C) {
				mode.temperatures.C = {
					min: Math.min(...modeCapabilities.temperatures.C.values),
					max: Math.max(...modeCapabilities.temperatures.C.values)
				}
			}

			// TODO: check if we actaully need F, does Sensibo always return C if it has F?
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
			if (!capabilities[modeString].horizontalSwing && modeCapabilities.horizontalSwing && modeCapabilities.horizontalSwing.includes('rangeFull')) {
				mode.horizontalSwing = true
			}

			// set light
			if (modeCapabilities.light) {
				mode.light = true
			}

			platform.easyDebug(`${device.room.name} - Mode: ${modeString}, Capabilities: `)
			platform.easyDebug(mode)
		}

		return capabilities
	},

	/**
	 * @param {import('../types').Device} device
	 * @returns {import('../types').FilterState}
	 */
	getFilterState: function (device)  {
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
	 * @returns {import('../types').SwingState}
	 */
	getSwingState: function (device) {
		let horizontalSwing = 'SWING_DISABLED'
		let verticalSwing = 'SWING_DISABLED'

		if (device.acState.swing) {
			if (device.acState.swing === 'rangeFull') {
				verticalSwing = 'SWING_ENABLED'
			} else if (device.acState.swing === 'horizontal') {
				horizontalSwing = 'SWING_ENABLED'
			} else if (device.acState.swing === 'both') {
				horizontalSwing = 'SWING_ENABLED'
				verticalSwing = 'SWING_ENABLED'
			}
		}

		if (device.acState.horizontalSwing && device.acState.horizontalSwing === 'rangeFull') {
			horizontalSwing = 'SWING_ENABLED'
		}

		return {
			horizontalSwing: horizontalSwing,
			verticalSwing: verticalSwing
		}
	},

	/**
	 * @param {import('../types').Device} device
	 * @returns {null|number}
	 */
	getFanSpeed: function (device) {
		let fanSpeed = null
		const modeCapabilities = device.remoteCapabilities.modes[device.acState.mode]

		if (modeCapabilities.fanLevels && modeCapabilities.fanLevels.length) {
			fanSpeed = fanLevelToHK(device.acState.fanLevel, modeCapabilities.fanLevels) || 0
		}

		return fanSpeed
	},

	/**
	 * @param {import('../types').Device} device
	 * @returns {Classes.InternalAcState}
	 */
	getAcState: function (device) {
		const filterState = this.getFilterState(device)
		const swingState = this.getSwingState(device)
		const fanSpeed = this.getFanSpeed(device)
		const state = new Classes.InternalAcState(
			device.acState.on,
			device.acState.mode.toUpperCase(),
			!device.acState.targetTemperature ? null : device.acState.temperatureUnit === 'C' ? device.acState.targetTemperature : toCelsius(device.acState.targetTemperature),
			device.measurements.temperature,
			device.measurements.humidity,
			{ enabled: device.smartMode.enabled },
			device.acState.light && device.acState.light !== 'off',
			device.pureBoostConfig && device.pureBoostConfig.enabled,
			filterState.filterChange,
			filterState.filterLifeLevel,
			swingState.horizontalSwing,
			swingState.verticalSwing,
			fanSpeed,
			null,
			null,
			null,
			null
		)

		return state
	},

	/**
	 * @param {import('../types').Device} device
	 * @param {SensiboACPlatform} platform
	 * @returns {Classes.InternalAcState}
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

		const state = new Classes.InternalAcState(
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
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