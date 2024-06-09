// eslint-disable-next-line no-unused-vars
const SensiboACPlatform = require('./SensiboACPlatform')
// eslint-disable-next-line no-unused-vars
const SensiboAccessory = require('../homekit/SensiboAccessory')
const Classes = require('../classes')
const unified = require('./unified')
const eventKinds = require('./eventKinds.json')
const eventReasons = require('./eventReasons.json')
const minDate = new Date('0001-01-01T00:00:00Z')

/**
 * @param {any[]} handledLocations
 * @param {SensiboACPlatform} platform
 * @param {import('../types').Device} device
 */
async function refreshDeviceState(handledLocations, platform, device) {
	/** @type {SensiboAccessory} */
	const airConditioner = platform.activeAccessories.find(accessory => {
		return accessory.type === 'AirConditioner' && accessory.id === device.id
	})

	// Update Air Conditioner state in cache + HomeKit
	if (airConditioner) {
		if (!(airConditioner.state instanceof Classes.InternalAcState)) {
			// TODO: log warning
			return
		}

		platform.easyDebug(`Updating AC state in Cache + HomeKit for ${airConditioner.name}`)
		airConditioner.state.update(unified.getAcState(device))

		// Update Climate React Switch state in HomeKit
		const climateReactSwitch = platform.activeAccessories.find(accessory => {
			return (accessory.type === 'ClimateReactSwitch') && accessory.id === device.id
		})

		if (climateReactSwitch) {
			platform.easyDebug(`Updating Climate React Switch state in HomeKit for ${climateReactSwitch.name}`)
			climateReactSwitch.updateHomeKit()
		}

		/**
		 * @param {import('../types').Event} eventA
		 * @param {import('../types').Event} eventB
		 * @param {boolean} ascending
		 */
		const compareEventsByTimestamp = function(eventA, eventB, ascending) {
			if (eventA.timestamp < eventB.timestamp) {
				if (ascending) {
					return -1
				} else {
					return 1
				}
			}

			if (eventA.timestamp > eventB.timestamp) {
				if (ascending) {
					return 1
				} else {
					return -1
				}
			}

			return 0
		}
		/**
		 * @param {import('../types').Event} eventA
		 * @param {import('../types').Event} eventB
		 */
		const compareEventsByTimestampDescending = function(eventA, eventB) {
			return compareEventsByTimestamp(eventA, eventB, false)
		}

		if (platform.enableRepeatClimateReactAction) {
			// This code should (mostly) take care of scenarios where an AC did not receive a command issued by Climate React but the system "believes"
			// it did. To decrease the likelihood of such a discrepancy persisting, we will repeat the last climate react triggered action - once.
			//
			// The logic of the code is as follows:
			// Set the AC State to the the last AC State set by Climate React if the AC State has not since been set by a non Climate React "reason"

			if (airConditioner.lastStateRefresh.getTime() == minDate.getTime()) {
				platform.easyDebug(`Repeat Climate React Action for ${airConditioner.name}: last state refresh is ${JSON.stringify(airConditioner.lastStateRefresh, null, 4)}, skipping.`)
				const updatedLastStateRefresh = new Date() // current UTC datetime

				airConditioner.lastStateRefresh = updatedLastStateRefresh
				platform.easyDebug(`Repeat Climate React Action for ${airConditioner.name}: updated last state refresh to ${JSON.stringify(airConditioner.lastStateRefresh, null, 4)}.`)
			} else {
				platform.easyDebug(`Repeat Climate React Action for ${airConditioner.name}: last state refresh is ${JSON.stringify(airConditioner.lastStateRefresh, null, 4)}, proceeding.`)
				const airConditionerEvents = await platform.sensiboApi.getDeviceEvents(device.id)

				// TODO: ensure a "stable" sort
				// NOTE: This sort is not necessarily "stable", it depends on the specific browser/node version.
				airConditionerEvents.sort(compareEventsByTimestampDescending)

				const climateReactAcStateChangeEvents = airConditionerEvents.filter((event) => {
					return (event.eventKind == eventKinds.AC_STATE.CHANGED &&
							event.details.reason == eventReasons.CLIMATE_REACT &&
							new Date(event.timestamp).getTime() >= airConditioner.lastStateRefresh.getTime())
				})
				let updatedLastStateRefresh = new Date() // current UTC datetime

				airConditioner.lastStateRefresh = updatedLastStateRefresh
				platform.easyDebug(`Repeat Climate React Action for ${airConditioner.name}: updated last state refresh to ${JSON.stringify(airConditioner.lastStateRefresh, null, 4)}.`)

				if (climateReactAcStateChangeEvents.length > 0) {
					const lastRelevantAcStateChangeEvent = climateReactAcStateChangeEvents[0]
					const lastRelevantAcStateChangeEventDate = new Date(lastRelevantAcStateChangeEvent.timestamp)
					const postLastAcStateChangeEvents = airConditionerEvents.filter((event) => {
						return (event.eventKind == eventKinds.AC_STATE.CHANGED &&
								new Date(event.timestamp).getTime() > lastRelevantAcStateChangeEventDate.getTime())
					})

					if (postLastAcStateChangeEvents.length == 0) {
						const lastRelevantAcStateChangeEventGapFromNow = updatedLastStateRefresh.getTime() - lastRelevantAcStateChangeEventDate.getTime()

						if (lastRelevantAcStateChangeEventGapFromNow < platform.repeatClimateReactActionMinGapMilliseconds) {
							updatedLastStateRefresh = lastRelevantAcStateChangeEventDate
							airConditioner.lastStateRefresh = updatedLastStateRefresh
							platform.easyDebug(`Repeat Climate React Action for ${airConditioner.name}: lastRelevantAcStateChangeEventGapFromNow is ${lastRelevantAcStateChangeEventGapFromNow} < ${platform.repeatClimateReactActionMinGapMilliseconds}, updated last state refresh to ${JSON.stringify(airConditioner.lastStateRefresh, null, 4)} and skipping.`)
						} else {
							platform.easyDebug(`Repeat Climate React Action for ${airConditioner.name}: lastRelevantAcStateChangeEvent is ${JSON.stringify(lastRelevantAcStateChangeEvent, null, 4)}, re-issuing last resulting AC State.`)

							const resultingAcState = lastRelevantAcStateChangeEvent.details.resultingAcState
							const swingState = unified.getInternalSwingStateFromAcState(resultingAcState)
							const fanSpeed = unified.getFanSpeedFromAcState(device, resultingAcState)
							const resultingInternalAcState = new Classes.InternalAcState(
								resultingAcState.on,
								resultingAcState.mode.toUpperCase(),
								!resultingAcState.targetTemperature ? null : resultingAcState.temperatureUnit === 'C' ? resultingAcState.targetTemperature : airConditioner.Utils.toCelsius(resultingAcState.targetTemperature),
								null,
								null,
								null,
								resultingAcState.light && resultingAcState.light !== 'off',
								null,
								null,
								null,
								swingState.horizontalSwing,
								swingState.verticalSwing,
								fanSpeed,
								null,
								null,
								null,
								null
							)

							// NOTE: Setting this a "special" property ("_") will trigger code in the StateHandler
							// 		 module that updates the entire state with "resultingInternalAcState" and then calls
							// 		 Sensibo's API to update the state.
							airConditioner.state['_'] = resultingInternalAcState
						}
					} else {
						platform.easyDebug(`Repeat Climate React Action for ${airConditioner.name}: postLastAcStateChangeEvents.length is "${postLastAcStateChangeEvents.length}" > 0, skipping.`)
					}
				} else {
					platform.easyDebug(`Repeat Climate React Action for ${airConditioner.name}: climateReactAcStateChangeEvents.length is "${climateReactAcStateChangeEvents.length}", skipping.`)
				}
			}
		}
	}

	// ------------------------------------------------------------------------------------------- //

	/** @type {SensiboAccessory} */
	const airPurifier = platform.activeAccessories.find(accessory => {
		return accessory.type === 'AirPurifier' && accessory.id === device.id
	})

	// Update Air Purifier state in cache + HomeKit
	if (airPurifier) {
		if (!(airPurifier.state instanceof Classes.InternalAcState)) {
			// TODO: log warning
			return
		}

		airPurifier.lastStateRefresh = new Date() // current UTC datetime

		platform.easyDebug(`Updating Pure state in cache + HomeKit for for ${airPurifier.name}`)
		airPurifier.state.update(unified.getAcState(device))
	}

	// ------------------------------------------------------------------------------------------- //

	/** @type {SensiboAccessory} */
	const airQualitySensor = platform.activeAccessories.find(accessory => {
		return accessory.type === 'AirQualitySensor' && accessory.id === device.id
	})

	// Update Air Quality Sensor state in cache + HomeKit
	if (airQualitySensor) {
		if (!(airQualitySensor.state instanceof Classes.InternalAcState)) {
			// TODO: log warning
			return
		}

		airQualitySensor.lastStateRefresh = new Date() // current UTC datetime

		platform.easyDebug(`Updating Air Quality Sensor state in cache + HomeKit for for ${airQualitySensor.name}`)
		airQualitySensor.state.update(unified.getAirQualityState(device, platform))
	}

	// ------------------------------------------------------------------------------------------- //

	// Update Humidity Sensor state in cache + HomeKit
	/** @type {SensiboAccessory} */
	const humiditySensor = platform.activeAccessories.find(accessory => {
		return accessory.type === 'HumiditySensor' && accessory.id === device.id
	})

	if (humiditySensor) {
		humiditySensor.lastStateRefresh = new Date() // current UTC datetime

		platform.easyDebug(`Updating Humidity Sensor state in HomeKit for ${humiditySensor.name}`)
		humiditySensor.updateHomeKit()
	}

	// ------------------------------------------------------------------------------------------- //

	// Update Room Sensor state in cache + HomeKit
	if (device.motionSensors && Array.isArray(device.motionSensors)) {
		// For reach of the device's motion sensors...
		device.motionSensors.forEach(sensor => {
			const roomSensor = platform.activeAccessories.find(accessory => {
				return accessory.type === 'RoomSensor' && accessory.id === sensor.id
			})

			if (roomSensor) {
				if (!(roomSensor.state instanceof Classes.InternalSensorState)) {
					// TODO: log warning
					return
				}

				roomSensor.lastStateRefresh = new Date() // current UTC datetime

				platform.easyDebug(`Updating Room Sensor state in cache + HomeKit for ${roomSensor.name}`)
				roomSensor.state.update(unified.getSensorState(sensor))
			}
		})
	}

	// ------------------------------------------------------------------------------------------- //

	// Update Occupancy Sensor state in cache + HomeKit
	/** @type {SensiboAccessory} */
	const occupancySensorForDeviceLocation = platform.activeAccessories.find(accessory => {
		return accessory.type === 'OccupancySensor' && accessory.id === device.location.id
	})

	if (occupancySensorForDeviceLocation && !handledLocations.includes(occupancySensorForDeviceLocation.id)) {
		occupancySensorForDeviceLocation.lastStateRefresh = new Date() // current UTC datetime

		handledLocations.push(occupancySensorForDeviceLocation.id)
		platform.easyDebug(`Updating Occupancy state in cache + HomeKit for ${occupancySensorForDeviceLocation.name}`)
		occupancySensorForDeviceLocation.state.update(unified.getOccupancyState(device.location))
	}
}

/**
 * @param {SensiboACPlatform} platform
 * @Return Function
 */
module.exports = (platform) => {
	return () => {
		if (!platform.processingState && !platform.setProcessing) {
			platform.processingState = true

			clearTimeout(platform.pollingTimeout)
			setTimeout(async () => {
				try {
					platform.easyDebug('Refreshing state...')
					platform.devices = await platform.sensiboApi.getAllDevices()
					await platform.storage.setItem('devices', platform.devices)
					platform.easyDebug('Refreshing state completed.')
				} catch(err) {
					platform.easyDebug(`<<<< ---- Refresh State FAILED! ${err} ---- >>>> `)
					platform.processingState = false

					if (platform.pollingInterval) {
						platform.easyDebug(`Will try again in ${platform.pollingInterval/1000} seconds...`)
						platform.pollingTimeout = setTimeout(platform.refreshState, platform.pollingInterval)
					}

					return
				}

				if (platform.setProcessing) {
					platform.processingState = false

					return
				}

				/** @type {any[]} */
				const handledLocations = []

				platform.devices.forEach(async device => {
					await refreshDeviceState(handledLocations, platform, device)
				})

				// register new devices & unregister removed devices
				platform.easyDebug('Syncing HomeKit Cache')
				platform.syncHomeKitCache()

				// start timeout for next polling
				if (platform.pollingInterval) {
					platform.pollingTimeout = setTimeout(platform.refreshState, platform.pollingInterval)
				}

				// block new requests for an extra "refresh delay" number of seconds
				setTimeout(() => {
					platform.processingState = false
				}, platform.refreshDelay)
			}, platform.refreshDelay)
		}
	}
}