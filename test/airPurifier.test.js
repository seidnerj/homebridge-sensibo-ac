const {
	afterEach, beforeEach, mock, test
} = require('node:test')
const assert = require('node:assert/strict')
const hap = require('hap-nodejs')
const {
	callsTo, fakePlatform, flushCommands, homeKitGet, homeKitSet
} = require('./helpers')
// after helpers: requiring an accessory first hits a circular require
const AirPurifier = require('../homekit/AirPurifier')
const { FilterChangeIndication } = hap.Characteristic

beforeEach(() => {
	mock.timers.enable({ apis: ['setTimeout'] })
})

afterEach(() => {
	mock.timers.reset()
})

/** A Sensibo Pure whose filter is due for a change */
function pureDevice() {
	return {
		id: 'pure1',
		productModel: 'pure',
		serial: 'pure-serial',
		temperatureUnit: 'C',
		room: { name: 'Bedroom' },
		location: { id: 'loc1' },
		acState: {
			on: true,
			mode: 'fan',
			fanLevel: 'low',
			light: 'on'
		},
		measurements: {
			temperature: 22,
			humidity: 40,
			pm25: 1
		},
		pureBoostConfig: { enabled: false },
		filtersCleaning: {
			shouldCleanFilters: true,
			acOnSecondsSinceLastFiltersClean: 2000,
			filtersCleanSecondsThreshold: 1000
		},
		remoteCapabilities: {
			modes: {
				fan: {
					temperatures: {},
					fanLevels: ['low', 'high'],
					light: ['on', 'off']
				}
			}
		}
	}
}

/** @param {Object} config */
function makePurifier(config) {
	const platform = fakePlatform(config)
	const purifier = new AirPurifier(pureDevice(), platform)

	purifier.updateHomeKit()

	return {
		purifier,
		platform,
		calls: platform.sensiboApi.calls
	}
}

test('ResetFilterIndication resets the filter on Sensibo and in the state', async () => {
	const {
		purifier, calls
	} = makePurifier({})

	assert.equal(purifier.state.filterChange, 'CHANGE_FILTER')
	assert.equal(purifier.state.filterLifeLevel, 0)

	await homeKitSet(purifier, 'ResetFilterIndication', 1)

	assert.deepEqual(callsTo(calls, 'resetFilterIndicator'), [['pure1']])
	assert.equal(purifier.state.filterChange, 'FILTER_OK')
	assert.equal(purifier.state.filterLifeLevel, 100)
})

test('updateHomeKit pushes the purifier state to HomeKit', async () => {
	const { purifier } = makePurifier({})
	const service = purifier.AirPurifierService

	assert.equal(service.getCharacteristic(hap.Characteristic.Active).value, 1)
	assert.equal(service.getCharacteristic(hap.Characteristic.CurrentAirPurifierState).value, hap.Characteristic.CurrentAirPurifierState.PURIFYING_AIR)
	assert.equal(service.getCharacteristic(hap.Characteristic.RotationSpeed).value, purifier.state.fanSpeed)
	assert.equal(service.getCharacteristic(FilterChangeIndication).value, FilterChangeIndication.CHANGE_FILTER)

	await homeKitSet(purifier, 'ResetFilterIndication', 1)
	purifier.updateHomeKit()

	assert.equal(service.getCharacteristic(FilterChangeIndication).value, FilterChangeIndication.FILTER_OK)
	assert.equal(service.getCharacteristic(hap.Characteristic.FilterLifeLevel).value, 100)
})

test('PureRotationSpeed does not touch Climate React, even with auto setup on', async () => {
	const {
		purifier, calls
	} = makePurifier({
		enableClimateReactAutoSetup: true,
		allowRepeatedCommands: true
	})

	await homeKitSet(purifier, 'PureRotationSpeed', 100)
	await flushCommands(mock.timers)

	assert.equal(purifier.state.fanSpeed, 100)
	assert.equal(purifier.state.active, true)
	assert.equal(callsTo(calls, 'setDeviceClimateReactState').length, 0)
})

test('Pure getters answer HomeKit', async () => {
	const { purifier } = makePurifier({})

	assert.equal(await homeKitGet(purifier, 'PureRotationSpeed'), purifier.state.fanSpeed)
	assert.equal(await homeKitGet(purifier, 'CurrentAirPurifierState'), hap.Characteristic.CurrentAirPurifierState.PURIFYING_AIR)
	assert.equal(await homeKitGet(purifier, 'TargetAirPurifierState'), 0)
})

test('PureRotationSpeed 0 switches the purifier off', async () => {
	const { purifier } = makePurifier({})

	await homeKitSet(purifier, 'PureRotationSpeed', 0)

	assert.equal(purifier.state.active, false)
})

test('purifier state changes are sent to Sensibo after the debounce', async () => {
	const {
		purifier, platform, calls
	} = makePurifier({})
	const errors = []

	platform.log.error = message => {
		errors.push(message)
	}

	await homeKitSet(purifier, 'PureRotationSpeed', 100)
	await flushCommands(mock.timers)

	assert.deepEqual(callsTo(calls, 'setDeviceACState'), [['pure1', {
		on: true,
		mode: 'fan',
		temperatureUnit: undefined,
		targetTemperature: null,
		swingModes: {},
		fanLevel: 'high',
		light: 'on'
	}]])
	assert.deepEqual(errors, [])
	assert.equal(platform.setProcessing, false)
})

test('PureActive getter and setter answer HomeKit', async () => {
	const { purifier } = makePurifier({})

	assert.equal(await homeKitGet(purifier, 'PureActive'), 1)

	await homeKitSet(purifier, 'PureActive', 0)

	assert.equal(purifier.state.active, false)
	assert.equal(await homeKitGet(purifier, 'PureActive'), 0)
})
