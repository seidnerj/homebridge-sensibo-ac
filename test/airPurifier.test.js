const {
	afterEach, beforeEach, mock, test
} = require('node:test')
const assert = require('node:assert/strict')
const hap = require('hap-nodejs')
const {
	callsTo, fakePlatform, flushCommands, homeKitSet
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

test('HomeKit filter characteristics are never pushed for a purifier', async () => {
	const { purifier } = makePurifier({})

	await homeKitSet(purifier, 'ResetFilterIndication', 1)
	purifier.updateHomeKit()

	// BUG: AirPurifier.updateHomeKit returns early unless state is an InternalAcState, which a purifier's never is
	assert.equal(purifier.AirPurifierService.getCharacteristic(FilterChangeIndication).value, FilterChangeIndication.FILTER_OK)
	assert.equal(purifier.AirPurifierService.getCharacteristic(hap.Characteristic.Active).value, 0)
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

test('PureRotationSpeed 0 switches the purifier off', async () => {
	const { purifier } = makePurifier({})

	await homeKitSet(purifier, 'PureRotationSpeed', 0)

	assert.equal(purifier.state.active, false)
})

test('purifier state changes are not sent to Sensibo', async () => {
	const {
		purifier, platform, calls
	} = makePurifier({})
	const errors = []

	platform.log.error = message => {
		errors.push(message)
	}

	await homeKitSet(purifier, 'PureRotationSpeed', 100)
	await flushCommands(mock.timers)

	// BUG: StateHandler only sends AC state for AirConditioner instances; the purifier's change is dropped with an error
	assert.equal(callsTo(calls, 'setDeviceACState').length, 0)
	assert.match(errors[0], /is not an instance of AirConditioner/)
})

test('PureActive getter and setter never answer HomeKit', () => {
	const { purifier } = makePurifier({})
	let answered = false

	purifier.StateManager.get.PureActive(() => {
		answered = true
	})
	purifier.StateManager.set.PureActive(1, () => {
		answered = true
	})

	// BUG: both check for InternalAcState, so HomeKit's request for a purifier is left hanging
	assert.equal(answered, false)
})
