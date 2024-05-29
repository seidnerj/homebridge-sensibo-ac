// eslint-disable-next-line no-unused-vars
const homebridge = require('homebridge')
// eslint-disable-next-line no-unused-vars
const SensiboACPlatform = require('../sensibo/SensiboACPlatform')
const AirConditioner = require('./../homekit/AirConditioner')
const AirPurifier = require('./../homekit/AirPurifier')
const AirQualitySensor = require('./../homekit/AirQualitySensor')
const ClimateReactSwitch = require('./../homekit/ClimateReactSwitch')
const HumiditySensor = require('./../homekit/HumiditySensor')
const OccupancySensor = require('./../homekit/OccupancySensor')
const RoomSensor = require('./../homekit/RoomSensor')
const SyncButton = require('./../homekit/SyncButton')

/**
 * @param {SensiboACPlatform} platform
 * @return {Function}
 */
module.exports = (platform) => {
	return () => {
		platform.devices.forEach(discoveredDevice => {
			if (platform.ignoreHomeKitDevices && discoveredDevice.homekitSupported) {
				platform.easyDebug(`Ignoring Homekit supported device: ${discoveredDevice.id}`)

				return
			}

			if (!discoveredDevice.remoteCapabilities) {
				platform.easyDebug(`Ignoring as no remote capabilities available for device: ${discoveredDevice.id}`)

				return
			}

			// Add AirConditioner
			// TODO: tidy productModel matching
			if (['sky','skyv2','skyplus','air','airq'].includes(discoveredDevice.productModel)
					|| discoveredDevice.productModel.includes('air')
					|| discoveredDevice.productModel.includes('sky')) {
				const airConditionerIsNew = !platform.activeAccessories.find(accessory => {
					return accessory.type === 'AirConditioner' && accessory.id === discoveredDevice.id
				})

				platform.easyDebug(`Device: ${discoveredDevice.id}, Model: ${discoveredDevice.productModel}, airConditionerIsNew: ${airConditionerIsNew}`)

				if (airConditionerIsNew) {
					// TODO: What if the air conditioner isn't needed at all (all services disabled)? Do we still push it?
					// 		 What about airConditioner variable for other accessories?
					const airConditioner = new AirConditioner(discoveredDevice, platform)

					platform.activeAccessories.push(airConditioner)

					// Add external Humidity Sensor if enabled
					if (platform.externalHumiditySensor) {
						const humiditySensor = new HumiditySensor(airConditioner, platform)

						platform.activeAccessories.push(humiditySensor)
					}

					// TODO: make if statements single line?
					// Add external Air Quality Sensor if available
					if (['airq'].includes(discoveredDevice.productModel)) {
						// Check that at least one of AirQuality or CarbonDioxide sensor is enabled before creating
						if (!platform.disableAirQuality || !platform.disableCarbonDioxide) {
							// TODO: check for a better way to get measurements
							airConditioner.measurements = discoveredDevice.measurements
							const airQualitySensor = new AirQualitySensor(airConditioner, platform)

							platform.activeAccessories.push(airQualitySensor)
						}
					}

					// Add separate Sync Button if enabled
					if (platform.enableSyncButton && !platform.syncButtonInAccessory) {
						const syncButton = new SyncButton(airConditioner, platform)

						platform.activeAccessories.push(syncButton)
					}

					// Add Climate React Switch if enabled
					if (platform.enableClimateReactSwitch && !platform.climateReactSwitchInAccessory) {
						const climateReactSwitch = new ClimateReactSwitch(airConditioner, platform)

						platform.activeAccessories.push(climateReactSwitch)
					}
				}
			}

			// ------------------------------------------------------------------------------------------------ //

			// Add AirPurifier
			if (['pure'].includes(discoveredDevice.productModel)) {
				const airPurifierIsNew = !platform.activeAccessories.find(accessory => {
					return accessory.type === 'AirPurifier' && accessory.id === discoveredDevice.id
				})

				platform.easyDebug(`Device: ${discoveredDevice.id}, airPurifierIsNew: ${airPurifierIsNew}`)

				if (airPurifierIsNew) {
					const airPurifier = new AirPurifier(discoveredDevice, platform)

					platform.activeAccessories.push(airPurifier)

					// Check that at least one of AirQuality or CarbonDioxide sensor is enabled before creating
					if (!platform.disableAirQuality || !platform.disableCarbonDioxide) {
						// TODO: check for a better way to get measurements
						airPurifier.measurements = discoveredDevice.measurements
						const airQualitySensor = new AirQualitySensor(airPurifier, platform)

						platform.activeAccessories.push(airQualitySensor)
					}
				}
			}

			// Add Sensibo Room Sensors if exists
			if (discoveredDevice.motionSensors && Array.isArray(discoveredDevice.motionSensors)) {
				discoveredDevice.motionSensors.forEach(sensor => {
					const roomSensorIsNew = !platform.activeAccessories.find(accessory => {
						return accessory.type === 'RoomSensor' && accessory.id === sensor.id
					})

					platform.easyDebug(`Device: ${discoveredDevice.id}, roomSensorIsNew: ${roomSensorIsNew}`)

					if (roomSensorIsNew) {
						const roomSensor = new RoomSensor(sensor, discoveredDevice, platform)

						platform.activeAccessories.push(roomSensor)
					}
				})
			}

			// Add Occupancy Sensor if enabled
			if (platform.enableOccupancySensor && !platform.locations.includes(discoveredDevice.location.id)) {
				platform.locations.push(discoveredDevice.location.id)
				const occupancySensor = new OccupancySensor(discoveredDevice, platform)

				platform.activeAccessories.push(occupancySensor)
			}
		})

		// find devices to remove
		/** @type {homebridge.PlatformAccessory[]} */
		const accessoriesToRemove = []

		platform.cachedAccessories.forEach(cachedAccessory => {
			if (!cachedAccessory.context.type) {
				platform.easyDebug(`Old cached accessory to be removed, name: ${cachedAccessory.displayName}`)
				accessoriesToRemove.push(cachedAccessory)
			}

			const isActive = platform.activeAccessories.find(activeAccessory => {
				return cachedAccessory.UUID === activeAccessory.UUID
			})

			if (!isActive) {
				// TODO: should we remove non-active accessories immediately? see also AirQualitySensor below
				platform.easyDebug(`Accessory type: ${cachedAccessory.context.type}, Name: ${cachedAccessory.displayName}, not in activeAccessories[]`)
			}

			let deviceExists, sensorExists, locationExists

			switch(cachedAccessory.context.type) {
				case 'AirConditioner':
				// TODO: tidy productModel matching
					deviceExists = platform.devices.find(device => {
						return device.id === cachedAccessory.context.deviceId
								&& device.remoteCapabilities
								&& (['sky','skyv2','skyplus','air','airq'].includes(device.productModel)
									|| device.productModel.includes('air')
									|| device.productModel.includes('sky'))
					})
					if (!deviceExists) {
						platform.easyDebug(`Cached ${cachedAccessory.context.type} accessory to be removed, name: ${cachedAccessory.displayName}`)
						accessoriesToRemove.push(cachedAccessory)
					}
					break

				case 'AirPurifier':
					deviceExists = platform.devices.find(device => {
						return device.id === cachedAccessory.context.deviceId && device.remoteCapabilities && device.productModel === 'pure'
					})
					if (!deviceExists) {
						platform.easyDebug(`Cached ${cachedAccessory.context.type} accessory to be removed, name: ${cachedAccessory.displayName}`)
						accessoriesToRemove.push(cachedAccessory)
					}
					break

				case 'AirQualitySensor':
					deviceExists = platform.devices.find(device => {
						return device.id === cachedAccessory.context.deviceId && device.remoteCapabilities && ['pure','airq'].includes(device.productModel)
					})
					// TODO: should disabled check be moved out? see also isActive above
					if (!deviceExists || (deviceExists && platform.disableAirQuality && platform.disableCarbonDioxide)) {
						platform.easyDebug(`Cached ${cachedAccessory.context.type} accessory to be removed, name: ${cachedAccessory.displayName}`)
						accessoriesToRemove.push(cachedAccessory)
					}
					break

				case 'RoomSensor':
					deviceExists = platform.devices.find(device => {
						return device.id === cachedAccessory.context.deviceId
					})
					if (!deviceExists || !Array.isArray(deviceExists.motionSensors)) {
						platform.easyDebug(`Cached ${cachedAccessory.context.type} accessory to be removed, name: ${cachedAccessory.displayName}`)
						accessoriesToRemove.push(cachedAccessory)
					} else {
						sensorExists = deviceExists.motionSensors.find(sensor => {
							return sensor.id === cachedAccessory.context.sensorId
						})
						if (!sensorExists) {
							platform.easyDebug(`Cached ${cachedAccessory.context.type} accessory to be removed, name: ${cachedAccessory.displayName}`)
							accessoriesToRemove.push(cachedAccessory)
						}
					}
					break

				case 'HumiditySensor':
					deviceExists = platform.devices.find(device => {
						return device.id === cachedAccessory.context.deviceId && device.remoteCapabilities
					})
					if (!deviceExists || !platform.externalHumiditySensor) {
						platform.easyDebug(`Cached ${cachedAccessory.context.type} accessory to be removed, name: ${cachedAccessory.displayName}`)
						accessoriesToRemove.push(cachedAccessory)
					}
					break

				case 'SyncButton':
					deviceExists = platform.devices.find(device => {
						return device.id === cachedAccessory.context.deviceId && device.remoteCapabilities
					})

					if (!deviceExists || !platform.enableSyncButton || platform.syncButtonInAccessory) {
						platform.easyDebug(`Cached ${cachedAccessory.context.type} accessory to be removed, name: ${cachedAccessory.displayName}`)
						accessoriesToRemove.push(cachedAccessory)
					}
					break

				case 'ClimateReact':
				case 'ClimateReactSwitch':
					deviceExists = platform.devices.find(device => {
						return device.id === cachedAccessory.context.deviceId && device.remoteCapabilities
					})

					if (!deviceExists || !platform.enableClimateReactSwitch || platform.climateReactSwitchInAccessory) {
						platform.easyDebug(`Cached ${cachedAccessory.context.type} accessory to be removed, name: ${cachedAccessory.displayName}`)
						accessoriesToRemove.push(cachedAccessory)
					}
					break

				case 'OccupancySensor':
					locationExists = platform.devices.find(device => {
						return device.location.id === cachedAccessory.context.locationId
					})

					if (!locationExists || !platform.enableOccupancySensor) {
						platform.easyDebug(`Cached ${cachedAccessory.context.type} accessory to be removed, name: ${cachedAccessory.displayName}`)
						accessoriesToRemove.push(cachedAccessory)
						// TODO: check why platform.locations is updated below
						platform.locations = platform.locations.filter(location => {
							return location !== cachedAccessory.context.locationId
						})
					}
					break

				default:
					platform.log.info(`Cached ${cachedAccessory.context.type} accessory, name: ${cachedAccessory.displayName}, did not match Switch, not removed`)
			}
		})

		if (accessoriesToRemove.length) {
			platform.easyDebug('Unregistering Unnecessary Cached Devices:')
			platform.easyDebug(accessoriesToRemove)

			// unregistering accessories
			platform.api.unregisterPlatformAccessories(platform.pluginName, platform.platformName, accessoriesToRemove)

			// remove from cachedAccessories
			platform.cachedAccessories = platform.cachedAccessories.filter(cachedAccessory => {
				return !accessoriesToRemove.find(accessory => {
					return accessory.UUID === cachedAccessory.UUID
				})
			})

			// remove from activeAccessories
			platform.activeAccessories = platform.activeAccessories.filter(activeAccessory => {
				return !accessoriesToRemove.find(accessory => {
					return accessory.UUID === activeAccessory.UUID
				})
			})
		}
	}
}