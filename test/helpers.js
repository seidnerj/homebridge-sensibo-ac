const hap = require('hap-nodejs')
const { PlatformAccessory } = require('homebridge/lib/platformAccessory')
const AirConditioner = require('../homekit/AirConditioner')

/**
 * A Sensibo API double that records every call instead of sending it
 * @param   {Object}  responses  canned results for the read calls (getDeviceEvents, getDeviceHistoricalMeasurements, getAllDevices)
 * @returns {Object}             the fake API, with a `calls` array of [method, ...args]
 */
function fakeSensiboApi(responses) {
	const calls = []
	const record = method => {
		return async (...args) => {
			calls.push([method, ...args])
		}
	}
	const respond = method => {
		return async (...args) => {
			calls.push([method, ...args])
			const response = responses[method]

			if (response instanceof Error) {
				throw response
			}

			return typeof response === 'function' ? response(...args) : response
		}
	}

	return {
		calls,
		responses,
		setDeviceACState: record('setDeviceACState'),
		setDeviceClimateReactState: record('setDeviceClimateReactState'),
		syncDeviceOnState: record('syncDeviceOnState'),
		enableDisableClimateReact: record('enableDisableClimateReact'),
		enableDisablePureBoost: record('enableDisablePureBoost'),
		resetFilterIndicator: record('resetFilterIndicator'),
		getDeviceEvents: respond('getDeviceEvents'),
		getDeviceHistoricalMeasurements: respond('getDeviceHistoricalMeasurements'),
		getAllDevices: respond('getAllDevices')
	}
}

/**
 * A platform with the fields the accessories read (same defaults as SensiboACPlatform), and no Homebridge server behind it
 * @param   {Object}  config  platform settings to override
 * @returns {Object}          the fake platform
 */
function fakePlatform(config) {
	const noop = () => {}
	const log = noop.bind(null)

	log.info = log.warn = log.error = log.success = log.debug = log.log = noop

	const platform = {
		api: {
			hap,
			platformAccessory: PlatformAccessory,
			registerPlatformAccessories: noop,
			unregisterPlatformAccessories: noop
		},
		log,
		easyDebug: noop,
		easyDebugInfo: noop,
		easyDebugError: noop,
		easyDebugWarning: noop,
		storage: {
			setItem: async () => {},
			getItem: async () => {}
		},
		cachedAccessories: [],
		activeAccessories: [],
		devices: [],
		cachedState: {
			devices: {},
			sensors: {},
			occupancy: {}
		},
		sensiboApi: fakeSensiboApi({
			getDeviceEvents: [],
			getDeviceHistoricalMeasurements: { temperature: [] },
			getAllDevices: []
		}),
		refreshState: noop,
		syncHomeKitCache: noop,
		processingState: false,
		setProcessing: false,
		pollingInterval: 0,
		pollingTimeout: null,
		refreshDelay: 5 * 1000,
		repeatClimateReactActionMinGapMilliseconds: 45 * 1000,
		persistPath: '/nonexistent',
		pluginName: 'homebridge-sensibo-ac',
		platformName: 'SensiboAC',
		CELSIUS_UNIT: 'C',
		FAHRENHEIT_UNIT: 'F',
		VOCDENSITY_MAX: 10000,
		carbonDioxideAlertThreshold: 1500,
		allowRepeatedCommands: false,
		brokenThermostat: false,
		climateReactAsAuto: false,
		climateReactAutoSetupOffset: 0,
		climateReactSwitchInAccessory: false,
		commandRepeatCount: 1,
		commandRepeatDelayMilliseconds: 1000,
		disableAirConditioner: false,
		disableDry: false,
		disableFan: false,
		disableHorizontalSwing: false,
		disableHumidity: false,
		disableLightSwitch: false,
		disableVerticalSwing: false,
		enableClimateReactAutoSetup: false,
		enableClimateReactSwitch: false,
		enableHistoryStorage: false,
		enableRepeatClimateReactAction: false,
		modesToExclude: [],
		negativeClimateReactAutoSetupMultiplier: 1,
		positiveClimateReactAutoSetupMultiplier: 1,
		syncButtonInAccessory: false,
		...config
	}

	// mirrors SensiboACPlatform: Climate React as auto owns Climate React
	if (platform.climateReactAsAuto) {
		platform.enableClimateReactAutoSetup = true
		platform.enableClimateReactSwitch = false
		platform.climateReactSwitchInAccessory = false
	}

	return platform
}

const celsius = {
	isNative: true,
	values: [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30]
}
const fahrenheit = {
	isNative: true,
	values: [61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86]
}

/**
 * A Climate React state as the API returns it
 * @param   {string}  mode
 * @param   {boolean} on
 * @returns {Object}
 */
function climateReactTemperatureState(mode, on) {
	return {
		on,
		light: 'on',
		temperatureUnit: 'C',
		fanLevel: 'medium',
		mode,
		targetTemperature: 24,
		swing: 'stopped',
		horizontalSwing: 'stopped'
	}
}

/**
 * A Sensibo AC device as the API returns it, cooling to 24°C at 26.5°C
 * @param   {Object}  acState    acState fields to override
 * @param   {Object}  overrides  device fields to override (e.g. remoteCapabilities, temperatureUnit, measurements)
 * @returns {Object}             the device
 */
function acDevice(acState, overrides) {
	const temperatures = {
		C: celsius,
		F: fahrenheit
	}

	return {
		id: 'pod1',
		productModel: 'skyv2',
		serial: '1234',
		temperatureUnit: 'C',
		room: { name: 'Study' },
		location: { id: 'loc1' },
		acState: {
			on: true,
			mode: 'cool',
			targetTemperature: 24,
			temperatureUnit: 'C',
			fanLevel: 'medium',
			swing: 'stopped',
			horizontalSwing: 'stopped',
			light: 'on',
			...acState
		},
		measurements: {
			temperature: 26.5,
			humidity: 50
		},
		smartMode: {
			enabled: false,
			type: 'temperature',
			highTemperatureThreshold: 25,
			highTemperatureState: climateReactTemperatureState('cool', true),
			lowTemperatureThreshold: 23,
			lowTemperatureState: climateReactTemperatureState('cool', false)
		},
		remoteCapabilities: {
			modes: {
				cool: {
					temperatures,
					fanLevels: ['low', 'medium', 'high', 'auto'],
					swing: ['stopped', 'rangeFull'],
					horizontalSwing: ['stopped', 'rangeFull'],
					light: ['on', 'off']
				},
				heat: {
					temperatures,
					fanLevels: ['low', 'medium', 'high', 'auto'],
					swing: ['stopped', 'rangeFull'],
					horizontalSwing: ['stopped', 'rangeFull'],
					light: ['on', 'off']
				},
				auto: {
					temperatures,
					fanLevels: ['low', 'medium', 'high', 'auto'],
					swing: ['stopped', 'rangeFull']
				},
				fan: {
					temperatures: {},
					fanLevels: ['low', 'medium', 'high'],
					swing: ['stopped', 'rangeFull']
				},
				dry: {
					temperatures,
					swing: ['stopped', 'rangeFull']
				}
			}
		},
		...overrides
	}
}

/**
 * An AirConditioner accessory built from a device, with the Sensibo API recorded
 * @param   {Object}  platformConfig  platform settings to override
 * @param   {Object}  acState         acState fields to override
 * @param   {Object}  [deviceOverrides]  device fields to override
 * @returns {{ac: AirConditioner, platform: Object, device: Object, calls: Array}}
 */
function makeAirConditioner(platformConfig, acState, deviceOverrides) {
	const platform = fakePlatform(platformConfig)
	const device = acDevice(acState, deviceOverrides)
	const ac = new AirConditioner(device, platform)

	platform.activeAccessories.push(ac)
	// Homebridge pushes the state to HomeKit right after creating the accessory (syncHomeKitCache); setters read it back
	ac.updateHomeKit()

	return {
		ac,
		platform,
		device,
		calls: platform.sensiboApi.calls
	}
}

/**
 * Invoke a StateManager setter the way HomeKit does
 * @param   {Object}  accessory
 * @param   {string}  characteristic  StateManager.set key
 * @param   {*}       value
 * @returns {Promise<void>}
 */
function homeKitSet(accessory, characteristic, value) {
	return new Promise(resolve => {
		accessory.StateManager.set[characteristic](value, resolve)
	})
}

/**
 * Invoke a StateManager getter the way HomeKit does
 * @param   {Object}  accessory
 * @param   {string}  characteristic  StateManager.get key
 * @returns {Promise<*>}
 */
function homeKitGet(accessory, characteristic) {
	return new Promise(resolve => {
		accessory.StateManager.get[characteristic]((_error, value) => {
			resolve(value)
		})
	})
}

/**
 * The calls of one API method, as argument lists
 * @param   {Array}   calls
 * @param   {string}  method
 * @returns {Array}
 */
function callsTo(calls, method) {
	return calls.filter(call => {
		return call[0] === method
	}).map(call => {
		return call.slice(1)
	})
}

/**
 * Let pending promise chains run (setImmediate is left unmocked by the tests)
 * @returns {Promise<void>}
 */
async function settle() {
	for (let i = 0; i < 20; i++) {
		await new Promise(resolve => {
			setImmediate(resolve)
		})
	}
}

/**
 * Press a HeaterCooler mode the way HAP does: the characteristic value changes along with the setter call
 * @param   {Object}  ac
 * @param   {number}  value  TargetHeaterCoolerState value
 * @returns {Promise<void>}
 */
function pressMode(ac, value) {
	ac.HeaterCoolerService.getCharacteristic(hap.Characteristic.TargetHeaterCoolerState).updateValue(value)

	return homeKitSet(ac, 'TargetHeaterCoolerState', value)
}

/**
 * Run one polling refresh (sensibo/refreshState.js) against the given devices
 * @param   {Object}  platform
 * @param   {Array}   devices  what getAllDevices returns
 * @param   {Object}  timers   node:test mock.timers, with setTimeout mocked
 * @returns {Promise<void>}
 */
async function refreshOnce(platform, devices, timers) {
	platform.sensiboApi.responses.getAllDevices = devices
	require('../sensibo/refreshState')(platform)()
	timers.tick(platform.refreshDelay)
	await settle()
	// refreshState keeps new refreshes blocked for another refreshDelay; release it without firing other timers
	platform.processingState = false
}

/**
 * Let StateHandler's 1s debounce send the command, then its follow-up 0.5s timer release setProcessing and update HomeKit
 * @param   {Object}  timers  node:test mock.timers, with setTimeout mocked
 * @returns {Promise<void>}
 */
async function flushCommands(timers) {
	timers.tick(1000)
	await settle()
	timers.tick(500)
	await settle()
}

module.exports = {
	acDevice,
	flushCommands,
	refreshOnce,
	callsTo,
	pressMode,
	settle,
	fakePlatform,
	fakeSensiboApi,
	homeKitGet,
	homeKitSet,
	makeAirConditioner
}
