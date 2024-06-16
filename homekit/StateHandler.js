// eslint-disable-next-line no-unused-vars
const SensiboACPlatform = require('../sensibo/SensiboACPlatform')
// eslint-disable-next-line no-unused-vars
const SensiboAccessory = require('./SensiboAccessory')
const Classes = require('../classes')
const AirConditioner = require('./AirConditioner')
const AirPurifier = require('./AirPurifier')

/**
* @param {number} value
* @param {string[]} fanLevels
* @return {string}
*/
function HKToFanLevel(value, fanLevels) {
	let selected = 'auto'

	if (!fanLevels.includes('auto')) {
		selected = fanLevels[0]
	}

	if (value !== 0) {
		fanLevels = fanLevels.filter(level => {
			return level !== 'auto'
		})
		const totalLevels = fanLevels.length

		for (let i = 0; i < fanLevels.length; i++) {
			if (value <= Math.round(100 * (i + 1) / totalLevels)) {
				selected = fanLevels[i]
				break
			}
		}
	}

	return selected
}

/**
 * @param {import('../types').Mode} mode
 * @param {Classes.InternalAcState} state
 * @return {import('../types').SwingModes}
 */
function swingMode(mode, state) {
	const swingModes = {}

	if (mode) {
		if (mode.threeDimensionalSwing) {
			if ((state.horizontalSwing === 'SWING_ENABLED') && (state.verticalSwing === 'SWING_ENABLED')) {
				swingModes.swing = 'both'
			} else if (state.verticalSwing === 'SWING_ENABLED') {
				swingModes.swing =  'rangeFull'
			} else if (state.horizontalSwing === 'SWING_ENABLED') {
				swingModes.swing = 'horizontal'
			} else {
				swingModes.swing = 'stopped'
			}
		} else {
			if (mode.verticalSwing) {
				swingModes.swing = state.verticalSwing === 'SWING_ENABLED' ? 'rangeFull' : 'stopped'
			}

			if (mode.horizontalSwing) {
				swingModes.horizontalSwing = state.horizontalSwing === 'SWING_ENABLED' ? 'rangeFull' : 'stopped'
			}
		}
	}

	return swingModes
}

/**
* @param {AirConditioner} device
* @param {Classes.InternalAcState} internalAcState
* @return {import('../types').AcState}
*/
function sensiboFormattedACState(device, internalAcState) {
	device.easyDebugInfo(`${device.name} -> sensiboFormattedACState: internalAcState =`)
	device.easyDebugInfo(JSON.stringify(internalAcState, null, 4))

	/** @type {import('../types').Mode} */
	const mode = device.capabilities[internalAcState.mode]
	const acState = {
		on: internalAcState.active,
		mode: internalAcState.mode.toLowerCase(),
		temperatureUnit: device.temperatureUnit,
		targetTemperature: device.usesFahrenheit ? toFahrenheit(internalAcState.targetTemperature) : internalAcState.targetTemperature,
		swingModes: swingMode(mode, internalAcState)
	}

	if (device.capabilities[internalAcState.mode].fanSpeeds) {
		acState.fanLevel = HKToFanLevel(internalAcState.fanSpeed, device.capabilities[internalAcState.mode].fanSpeeds)
	}

	if (device.capabilities[internalAcState.mode].light) {
		acState.light = internalAcState.light ? 'on' : 'off'
	}

	device.easyDebugInfo(`${device.name} -> sensiboFormattedACState: acState =`)
	device.easyDebugInfo(JSON.stringify(acState, null, 4))

	return acState
}

/**
* @param {AirConditioner} device
* @param {Classes.InternalAcState} internalAcState
* @return {import('../types').ClimateReactState}
*/
function sensiboFormattedClimateReactState(device, internalAcState) {
	device.easyDebugInfo(`${device.name} -> sensiboFormattedClimateReactState: internalAcState =`)
	device.easyDebugInfo(JSON.stringify(internalAcState, null, 4))

	const smartModeState = internalAcState.smartMode
	const climateReactState = {
		enabled: smartModeState.enabled,
		type: smartModeState.type,
		highTemperatureState: {
			on: smartModeState.highTemperatureState.on,
			light: smartModeState.highTemperatureState.light ? 'on' : 'off',
			temperatureUnit: device.temperatureUnit,
			fanLevel: HKToFanLevel(internalAcState.fanSpeed, device.capabilities[internalAcState.mode].fanSpeeds),
			mode: smartModeState.highTemperatureState.mode.toLowerCase(),
			targetTemperature: smartModeState.highTemperatureState.targetTemperature
		},
		highTemperatureThreshold: smartModeState.highTemperatureThreshold,
		highTemperatureWebhook: null,
		lowTemperatureState: {
			on: smartModeState.lowTemperatureState.on,
			light: smartModeState.lowTemperatureState.light ? 'on' : 'off',
			temperatureUnit: device.temperatureUnit,
			fanLevel: HKToFanLevel(internalAcState.fanSpeed, device.capabilities[internalAcState.mode].fanSpeeds),
			mode: smartModeState.lowTemperatureState.mode.toLowerCase(),
			targetTemperature: smartModeState.lowTemperatureState.targetTemperature
		},
		lowTemperatureThreshold: smartModeState.lowTemperatureThreshold,
		lowTemperatureWebhook: null
	}
	const swingModes = swingMode(device.capabilities[internalAcState.mode], internalAcState)

	Object.assign(climateReactState.lowTemperatureState, swingModes)
	Object.assign(climateReactState.highTemperatureState, swingModes)

	device.easyDebugInfo(`${device.name} -> sensiboFormattedClimateReactState: climateReactState =`)
	device.easyDebugInfo(JSON.stringify(climateReactState, null, 4))

	return climateReactState
}

/**
 * @param {number} value
 * @returns {number}
 */
function toFahrenheit(value) {
	return Math.round((value * 1.8) + 32)
}

/**
 * @param {SensiboAccessory} device
 * @param {SensiboACPlatform} platform
 */
module.exports = (device, platform) => {
	const setTimeoutDelay = 1000
	let setTimer = null
	let preventTurningOff = false
	const easyDebugInfo = platform.easyDebugInfo
	const easyDebugError = platform.easyDebugError
	const log = platform.log

	return {
		// As StateHandler is invoked as a Proxy the below overwrites/intercepts the default get() commands [traps]
		// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy
		/**
		 * @param {Classes.InternalAcState|Classes.InternalOccupancyState|Classes.InternalSensorState|Classes.InternalAirQualitySensorState|Classes.InternalAirPurifierState} target
		 * @param {string} prop
		 * @param {any[]} args
		 */
		get: (target, prop, ...args) => {
			// check for last update and refresh state if needed
			if (!platform.setProcessing) {
				platform.refreshState()
			}

			// returns an anonymous *function* to update the state (multiple properties)
			if (prop === 'update') {
				// 'state' below is the value passed in when the update() function is called
				// see refreshState.js, e.g. airConditioner.state.update(unified.acState(device))
				/**
				 * @param {Classes.InternalAcState|Classes.InternalOccupancyState|Classes.InternalSensorState|Classes.InternalAirQualitySensorState|Classes.InternalAirPurifierState} state
				 */
				return (state) => {
					if (!platform.setProcessing) {
						Object.keys(state).forEach(key => {
							if (state[key] !== null) {
								target[key] = state[key]
							}
						})
						device.updateHomeKit()
					}
				}
			}

			// return a function that "syncs" the ac state
			// TODO: should be moved to be a 'set' below
			if (prop === 'syncState') {
				return async() => {
					if (target instanceof Classes.InternalAcState) {
						try {
							easyDebugInfo(`${device.name} - syncState - syncing`)

							await platform.sensiboApi.syncDeviceOnState(device.id, !target.active)
							target.active = !target.active
							device.updateHomeKit()
						} catch (err) {
							log.error(`${device.name} - syncState - ERROR Syncing!`)
							easyDebugInfo(`${device.name} - Error: ${err}`)
						}
					} else {
						log.error(`${device.name} - syncState -  ${device.name} is not an instance of AirConditioner or AirPurifier!`)
					}
				}
			}

			// NOTE: we use Reflect.get instead of setting state[prop] directly in order to bypass state's ProxyHandler, otherwise this would result in an infinite loop.
			return Reflect.get(target, prop, ...args)
		},

		// As StateHandler is invoked as a Proxy the below overwrites/intercepts the default set() commands [traps]
		// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy
		// TODO: update state variable below to target?
		/**
		 *
		 * @param {Classes.InternalAcState|Classes.InternalOccupancyState|Classes.InternalSensorState|Classes.InternalAirQualitySensorState|Classes.InternalAirPurifierState} state
		 * @param {any} value
		 * @param {string} prop
		 * @param {any[]} args
		 */
		set: (state, prop, value, ...args) => {
			easyDebugInfo(`StateHandler SET Property: ${prop}, New Value:`)
			easyDebugInfo(JSON.stringify(value, null, 4))

			if (prop != '_') {
				if (!platform.allowRepeatedCommands && prop in state && state[prop] === value) {
					easyDebugInfo(`${device.name} - ${prop} already equal to target value, returning without updating.`)

					return false
				}

				// NOTE: we use Reflect.set instead of setting state[prop] directly in order to bypass state's ProxyHandler, otherwise this would result in an infinite loop.
				Reflect.set(state, prop, value, ...args)

				// Send Reset Filter command
				if (prop === 'filterChange') {
					try {
						easyDebugInfo(`${device.name} - filterChange - Resetting filter indicator`)

						platform.sensiboApi.resetFilterIndicator(device.id)
					} catch(err) {
						log.error(`${device.name} - filterChange - Error occurred! -> Could not reset filter indicator`)
						easyDebugInfo(`${device.name} - Error: ${err}`)
					}

					return true
				}

				if (prop === 'filterLifeLevel') {
					return true
				}

				// Send Climate React state command and refresh state
				if (prop === 'smartMode') {
					(async () => {
						if (device instanceof AirConditioner && state instanceof Classes.InternalAcState) {
							try {
								const sensiboNewClimateReactState = sensiboFormattedClimateReactState(device, state)

								easyDebugInfo(`${device.name} - smartMode - new Climate React state:\n${JSON.stringify(sensiboNewClimateReactState, null, 4)}`)

								await platform.sensiboApi.setDeviceClimateReactState(device.id, sensiboNewClimateReactState)
							} catch(err) {
								easyDebugError(`${device.name} - smartMode - Error occurred! -> Climate React state did not change:\n${JSON.stringify(err, null, 4)}`)
							}

							if (!platform.setProcessing) {
								platform.refreshState()
							} else {
								easyDebugInfo(`${device.name} - setProcessing is true, skipping refreshState() after Climate React SET`)
							}
						} else {
							log.error(`${device.name} - smartMode -  ${device.name} is not an instance of AirConditioner! `)
						}
					})()

					// TODO: should we "catch" if the API calls fail, prevent it from updating state and return false instead?
					return true
				}

				// Send Pure Boost state command and refresh state
				if (prop === 'pureBoost') {
					try {
						easyDebugInfo(`${device.name} - pureBoost - Setting Pure Boost state to ${value}`)
						platform.sensiboApi.enableDisablePureBoost(device.id, value)
					} catch(err) {
						log.error(`${device.name} - pureBoost - Error occurred! -> Pure Boost state did not change`)
						easyDebugInfo(`${device.name} - Error: ${err}`)
					}

					if (!platform.setProcessing) {
						platform.refreshState()
					} else {
						easyDebugInfo(`${device.name} - setProcessing is true, skipping refreshState() after Pure Boost SET`)
					}

					return true
				}

				easyDebugInfo(`${device.name} - updating setProcessing to true, Prop: ${prop}`)
				platform.setProcessing = true

				// Make sure device is not turning off when setting fanSpeed to 0 (AUTO)
				// FIXME: check on issue / race condition that prevents AC turning off if the previous command was to set fan to 0% (auto)

				if (prop === 'fanSpeed' && value === 0) {
					if ((device instanceof AirConditioner || device instanceof AirPurifier) && (state instanceof Classes.InternalAcState)) {
						if (device.capabilities[state.mode].autoFanSpeed) {
							preventTurningOff = true
						}
					} else {
						log.info(`${device.name} - fanSpeed -  ${device.name} is not an instance of AirConditioner or AirPurifier! `)
					}
				}
			} else {
				// TODO: completely overwrite all properties of state with all properties of value (which is of the same type),
				//       this replacing it completely and then proceeding to call platform.sensiboApi.setDeviceACState(device.id, sensiboNewACState)
				//     	 which will make the AC switch to the target state.

				Object.entries(value).forEach(([propertyName, propertyValue]) => {
					// NOTE: we use Reflect.set instead of setting state[prop] directly in order to bypass state's ProxyHandler, otherwise this would result in an infinite loop.
					Reflect.set(state, propertyName, propertyValue)
				})
			}

			clearTimeout(setTimer)
			setTimer = setTimeout(async function() {
				if (device instanceof AirConditioner && state instanceof Classes.InternalAcState) {
					// Make sure device is not turning off when setting fanSpeed to 0 (AUTO)
					if (preventTurningOff && state.active === false) {
						easyDebugInfo(`${device.name} - Auto fan speed, don't turn off when fanSpeed is set to 0%. Prop: ${prop}, Value: ${value}`)
						state.active = true
						preventTurningOff = false
					}

					const sensiboNewACState = sensiboFormattedACState(device, state)

					easyDebugInfo(`${device.name} - before calling API to set new state:\n${JSON.stringify(sensiboNewACState, null, 4)}`)

					try {
						// send state command to Sensibo
						await platform.sensiboApi.setDeviceACState(device.id, sensiboNewACState)
					} catch(err) {
						log.error(`${device.name} - ERROR setting ${prop} to ${value}:\n${JSON.stringify(err, null, 4)}`)
						easyDebugInfo(`${device.name} - ERROR setting ${prop} to ${value}:\n${JSON.stringify(err, null, 4)}`)

						setTimeout(() => {
							platform.setProcessing = false
							platform.refreshState()
						}, setTimeoutDelay)

						return
					}
				} else {
					log.error(`${device.name} - setDeviceACState -  ${device.name} is not an instance of AirConditioner!`)
				}

				setTimeout(() => {
					platform.setProcessing = false
					device.updateHomeKit()
				}, (setTimeoutDelay / 2))
			}, setTimeoutDelay)

			return true
		}
	}
}