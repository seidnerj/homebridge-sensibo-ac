// eslint-disable-next-line no-unused-vars
const SensiboACPlatform = require('./SensiboACPlatform')
const Classes = require('../classes')
const unified = require('./unified')

/**
 * @param {any[]} handledLocations
 * @param {SensiboACPlatform} platform
 * @param {import('../types').Device} device
 */
async function refreshDeviceState(handledLocations, platform, device) {
	const airConditioner = platform.activeAccessories.find(accessory => {
		return accessory.type === 'AirConditioner' && accessory.id === device.id
	})

	// Update Air Conditioner state in cache + HomeKit
	if (airConditioner) {
		if (!(airConditioner.state instanceof Classes.InternalAcState)) {
			// TODO: log warning
			return
		}

		platform.easyDebug(`Updating AC state in Cache + HomeKit for ${device.id}`)
		airConditioner.state.update(unified.getAcState(device))

		// Update Climate React Switch state in HomeKit
		const climateReactSwitch = platform.activeAccessories.find(accessory => {
			return (accessory.type === 'ClimateReactSwitch') && accessory.id === device.id
		})

		if (climateReactSwitch) {
			platform.easyDebug(`Updating Climate React Switch state in HomeKit for ${device.id}`)
			climateReactSwitch.updateHomeKit()
		}

		// TODO: implement - fetch all events since last timestame, find latest THRESHOLD_CROSSED event. If exists, re-issue latest command.
		//       this should mostly take care of the scenario when the AC did not receive the climate react command of on/off but believes it did.
		// const airConditionerEvents = await platform.sensiboApi.getDeviceEvents(device.id)
	}

	// ------------------------------------------------------------------------------------------- //

	const airPurifier = platform.activeAccessories.find(accessory => {
		return accessory.type === 'AirPurifier' && accessory.id === device.id
	})

	// Update Air Purifier state in cache + HomeKit
	if (airPurifier) {
		if (!(airPurifier.state instanceof Classes.InternalAcState)) {
			// TODO: log warning
			return
		}

		platform.easyDebug(`Updating Pure state in cache + HomeKit for for ${device.id}`)
		airPurifier.state.update(unified.getAcState(device))
	}

	// ------------------------------------------------------------------------------------------- //

	const airQualitySensor = platform.activeAccessories.find(accessory => {
		return accessory.type === 'AirQualitySensor' && accessory.id === device.id
	})

	// Update Air Quality Sensor state in cache + HomeKit
	if (airQualitySensor) {
		if (!(airQualitySensor.state instanceof Classes.InternalAcState)) {
			// TODO: log warning
			return
		}

		platform.easyDebug(`Updating Air Quality Sensor state in cache + HomeKit for for ${device.id}`)
		airQualitySensor.state.update(unified.getAirQualityState(device, platform))
	}

	// ------------------------------------------------------------------------------------------- //

	// Update Humidity Sensor state in cache + HomeKit
	const humiditySensor = platform.activeAccessories.find(accessory => {
		return accessory.type === 'HumiditySensor' && accessory.id === device.id
	})

	if (humiditySensor) {
		platform.easyDebug(`Updating Humidity Sensor state in HomeKit for ${device.id}`)
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

				platform.easyDebug(`Updating Room Sensor state in cache + HomeKit for ${device.id}`)
				roomSensor.state.update(unified.getSensorState(sensor))
			}
		})
	}

	// ------------------------------------------------------------------------------------------- //

	// Update Occupancy Sensor state in cache + HomeKit
	const occupancySensorForDeviceLocation = platform.activeAccessories.find(accessory => {
		return accessory.type === 'OccupancySensor' && accessory.id === device.location.id
	})

	if (occupancySensorForDeviceLocation && !handledLocations.includes(occupancySensorForDeviceLocation.id)) {
		handledLocations.push(occupancySensorForDeviceLocation.id)
		platform.easyDebug(`Updating Occupancy state in cache + HomeKit for ${device.id}`)
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
					platform.easyDebug('<<<< ---- Refresh State FAILED! ---- >>>>')
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