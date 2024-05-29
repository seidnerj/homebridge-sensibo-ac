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

	if ('threeDimensionalSwing' in mode) {
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
		if ('verticalSwing' in mode) {
			swingModes.swing = state.verticalSwing === 'SWING_ENABLED' ? 'rangeFull' : 'stopped'
		}

		if ('horizontalSwing' in mode) {
			swingModes.horizontalSwing = state.horizontalSwing === 'SWING_ENABLED' ? 'rangeFull' : 'stopped'
		}
	}

	return swingModes
}

/**
* @param {AirConditioner} device
* @param {Classes.InternalAcState} state
* @return {import('../types').AcState}
*/
function sensiboFormattedACState(device, state) {
	device.easyDebug(`${device.name} -> sensiboFormattedACState start`)
	// device.easyDebug(`${device.name} -> sensiboFormattedACState acState: ${JSON.stringify(acState, null, 4)}`)

	const acState = {
		on: state.active,
		mode: state.mode.toLowerCase(),
		temperatureUnit: device.temperatureUnit,
		targetTemperature: device.usesFahrenheit ? toFahrenheit(state.targetTemperature) : state.targetTemperature
	}
	/** @type {import('../types').Mode} */
	const mode = device.capabilities[state.mode]
	const swingModes = swingMode(mode, state)

	Object.assign(acState, swingModes)

	if ('fanSpeeds' in device.capabilities[state.mode]) {
		acState.fanLevel = HKToFanLevel(state.fanSpeed, device.capabilities[state.mode].fanSpeeds)
	}

	if ('light' in device.capabilities[state.mode]) {
		acState.light = state.light ? 'on' : 'off'
	}

	// device.easyDebug(`${device.name} -> sensiboFormattedACState acState: ${JSON.stringify(acState, null, 4)}`)

	return acState
}

/**
* @param {AirConditioner} device
* @param {Classes.InternalAcState} state
* @return {import('../types').ClimateReactState}
*/
function sensiboFormattedClimateReactState(device, state) {
	device.easyDebug(`${device.name} -> sensiboFormattedClimateReactState start`)
	// device.easyDebug(`${device.name} -> sensiboFormattedClimateReactState incoming state: ${JSON.stringify(state, null, 4)}`)

	const smartModeState = state.smartMode
	const climateReactState = {
		enabled: smartModeState.enabled,
		type: smartModeState.type,
		highTemperatureState: {
			on: smartModeState.highTemperatureState.on,
			light: smartModeState.highTemperatureState.light ? 'on' : 'off',
			temperatureUnit: device.temperatureUnit,
			fanLevel: HKToFanLevel(state.fanSpeed, device.capabilities[state.mode].fanSpeeds),
			mode: smartModeState.highTemperatureState.mode.toLowerCase(),
			targetTemperature: smartModeState.highTemperatureState.targetTemperature
		},
		highTemperatureThreshold: smartModeState.highTemperatureThreshold,
		highTemperatureWebhook: null,
		lowTemperatureState: {
			on: smartModeState.lowTemperatureState.on,
			light: smartModeState.lowTemperatureState.light ? 'on' : 'off',
			temperatureUnit: device.temperatureUnit,
			fanLevel: HKToFanLevel(state.fanSpeed, device.capabilities[state.mode].fanSpeeds),
			mode: smartModeState.lowTemperatureState.mode.toLowerCase(),
			targetTemperature: smartModeState.lowTemperatureState.targetTemperature
		},
		lowTemperatureThreshold: smartModeState.lowTemperatureThreshold,
		lowTemperatureWebhook: null
	}
	const swingModes = swingMode(device.capabilities[state.mode], state)

	Object.assign(climateReactState.lowTemperatureState, swingModes)
	Object.assign(climateReactState.highTemperatureState, swingModes)

	// device.easyDebug(`${device.name} -> sensiboFormattedClimateReactState climateReactState: ${JSON.stringify(climateReactState, null, 4)}`)

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
	const easyDebug = platform.easyDebug
	const log = platform.log

	return {
		// As StateHandler is invoked as a Proxy the below overwrites/intercepts the default get() commands [traps]
		// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy
		/**
		 * @param {Classes.InternalAcState|Classes.InternalOccupancyState|Classes.InternalSensorState} target
		 * @param {string} prop
		 * @param {any[]} args
		 */
		get: (target, prop, ...args) => {
			// easyDebug(`StateHandler GET Prop: ${prop} for Target: ${JSON.stringify(target, null, 4)}`)
			// easyDebug(`StateHandler GET Args: ${JSON.stringify(...args, null, 4)}`)

			// check for last update and refresh state if needed
			if (!platform.setProcessing) {
				platform.refreshState()
			} else {
				// easyDebug(`setProcessing is true, skipping refreshState() in GET, Prop: ${prop}`)
			}

			// returns an anonymous *function* to update the state (multiple properties)
			if (prop === 'update') {
				// 'state' below is the value passed in when the update() function is called
				// see refreshState.js, e.g. airConditioner.state.update(unified.acState(device))
				/**
				 * @param {Classes.InternalAcState|Classes.InternalOccupancyState|Classes.InternalSensorState} state
				 */
				return (state) => {
					// easyDebug(`StateHandler GET state obj: ${JSON.stringify(state, null, 4)}`)
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

			// return a function to sync ac state
			// TODO: should be moved to be a 'set' below, see also StateManager line 576
			if (prop === 'syncState') {
				return async() => {
					if (target instanceof Classes.InternalAcState) {
						try {
							easyDebug(`${device.name} - syncState - syncing`)

							await platform.sensiboApi.syncDeviceOnState(device.id, !target.active)
							target.active = !target.active
							device.updateHomeKit()
						} catch (err) {
							log.info(`${device.name} - syncState - ERROR Syncing!`)
						}
					} else {
						log.info(`${device.name} - syncState -  ${device.name} is not an instance of AirConditioner or AirPurifier... skipping update`)
					}
				}
			}

			return Reflect.get(target, prop, ...args)
		},

		// As StateHandler is invoked as a Proxy the below overwrites/intercepts the default set() commands [traps]
		// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy
		// TODO: update state variable below to target?
		/**
		 *
		 * @param {Classes.InternalAcState|Classes.InternalOccupancyState|Classes.InternalSensorState} state
		 * @param {any} value
		 * @param {string} prop
		 * @param {any[]} args
		 */
		set: (state, prop, value, ...args) => {
			easyDebug(`StateHandler SET Property: ${prop}`)
			easyDebug(`StateHandler SET New Value: ${JSON.stringify(value, null, 4)}`)
			// easyDebug(`StateHandler SET Current State: ${JSON.stringify(state, null, 4)}`)
			// easyDebug(`StateHandler value args: ${JSON.stringify(...args)}`)

			if (!platform.allowRepeatedCommands && prop in state && state[prop] === value) {
				if (prop === 'smartMode') {
					if (state instanceof Classes.InternalAcState) {
						// NOTE: Without this, smartMode changes are seen as "duplicate". This happens because
						//       the smartMode object child values are being updated _before_ this setter runs
						//       (on smartMode). So when it compares it looks the same
						if (state.smartMode.enabled) {
							easyDebug(`${device.name} - smartMode update already running, returning without updating`)

							return false
						}

						state.smartMode.enabled = true
					} else {
						log.info(`${device.name} - smartMode -  ${device.name} is not an instance of AirConditioner... skipping update`)
					}
				} else {
					easyDebug(`${device.name} - ${prop} already set to ${JSON.stringify(value, null, 4)}, returning without updating`)

					return false
				}
			}

			Reflect.set(state, prop, value, ...args)

			// Send Reset Filter command
			if (prop === 'filterChange') {
				try {
					easyDebug(`${device.name} - filterChange - Resetting filter indicator`)

					platform.sensiboApi.resetFilterIndicator(device.id)
				} catch(err) {
					log.info(`${device.name} - filterChange - Error occurred! -> Could not reset filter indicator`)
					easyDebug(`${device.name} - Error: ${err}`)
				}

				return true
			} else if (prop === 'filterLifeLevel') {
				return true
			}

			// Send Climate React state command and refresh state
			if (prop === 'smartMode') {
				(async () => {
					if (device instanceof AirConditioner && state instanceof Classes.InternalAcState) {
						try {
							const sensiboNewClimateReactState = sensiboFormattedClimateReactState(device, state)

							easyDebug(`${device.name} - smartMode - before calling API to set new Climate React`)
							// easyDebug(JSON.stringify(value, null, 4))

							await platform.sensiboApi.setDeviceClimateReactState(device.id, sensiboNewClimateReactState)
						} catch(err) {
							log.info(`${device.name} - smartMode - Error occurred! -> Climate React state did not change`)
							easyDebug(`${device.name} - Error: ${JSON.stringify(err, null, 4)}`)
						}

						if (!platform.setProcessing) {
							platform.refreshState()
						} else {
							easyDebug(`${device.name} - setProcessing is true, skipping refreshState() after Climate React SET`)
						}

						easyDebug(`${device.name} - setting smartMode.enabled to false`)
						state.smartMode.enabled = false
					} else {
						log.info(`${device.name} - smartMode -  ${device.name} is not an instance of AirConditioner... skipping update `)
					}
				})()

				// TODO: should we "catch" if the API calls fail and prevent it from updating state (e.g. line 200)
				//       and return false instead?
				return true
			}

			// Send Pure Boost state command and refresh state
			if (prop === 'pureBoost') {
				try {
					easyDebug(`${device.name} - pureBoost - Setting Pure Boost state to ${value}`)
					platform.sensiboApi.enableDisablePureBoost(device.id, value)
				} catch(err) {
					log.info(`${device.name} - pureBoost - Error occurred! -> Pure Boost state did not change`)
					easyDebug(`${device.name} - Error: ${err}`)
				}

				if (!platform.setProcessing) {
					platform.refreshState()
				} else {
					easyDebug(`${device.name} - setProcessing is true, skipping refreshState() after Pure Boost SET`)
				}

				return true
			}

			easyDebug(`${device.name} - updating setProcessing to true, Prop: ${prop}`)
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

			clearTimeout(setTimer)
			setTimer = setTimeout(async function() {
				if (device instanceof AirConditioner && state instanceof Classes.InternalAcState) {
					// Make sure device is not turning off when setting fanSpeed to 0 (AUTO)
					if (preventTurningOff && state.active === false) {
						easyDebug(`${device.name} - Auto fan speed, don't turn off when fanSpeed set to 0%. Prop: ${prop}, Value: ${value}`)
						state.active = true
						preventTurningOff = false
					}

					const sensiboNewACState = sensiboFormattedACState(device, state)

					easyDebug(`${device.name} - before calling API to set new state`)
					// easyDebug(JSON.stringify(sensiboNewACState, null, 4))

					try {
						// send state command to Sensibo
						await platform.sensiboApi.setDeviceACState(device.id, sensiboNewACState)
					} catch(err) {
						log.info(`${device.name} - ERROR setting ${prop} to ${value}`)
						easyDebug(`${device.name} - Error: ${JSON.stringify(err, null, 4)}`)

						setTimeout(() => {
							platform.setProcessing = false
							platform.refreshState()
						}, setTimeoutDelay)

						return
					}
				} else {
					log.info(`${device.name} - setDeviceACState -  ${device.name} is not an instance of AirConditioner... skipping update `)
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