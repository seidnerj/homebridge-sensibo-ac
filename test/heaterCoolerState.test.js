const {
	afterEach, beforeEach, mock, test
} = require('node:test')
const assert = require('node:assert/strict')
const hap = require('hap-nodejs')
const {
	acDevice, flushCommands, makeAirConditioner, pressMode, settle
} = require('./helpers')
const {
	Active, CurrentHeaterCoolerState, TargetHeaterCoolerState
} = hap.Characteristic

beforeEach(() => {
	mock.timers.enable({ apis: ['setTimeout'] })
})

afterEach(() => {
	mock.timers.reset()
})

test('IDLE (and HeaterCooler still on) while Climate React as auto holds the AC off', async () => {
	const { ac } = makeAirConditioner({ climateReactAsAuto: true }, {})

	await pressMode(ac, TargetHeaterCoolerState.AUTO)
	await settle()
	await flushCommands(mock.timers)

	assert.equal(ac.state.active, false)
	assert.equal(ac.currentHeaterCoolerState(), CurrentHeaterCoolerState.IDLE)
	assert.equal(ac.HeaterCoolerService.getCharacteristic(Active).value, 1)
	assert.equal(ac.HeaterCoolerService.getCharacteristic(CurrentHeaterCoolerState).value, CurrentHeaterCoolerState.IDLE)
})

test('INACTIVE when the AC is off', () => {
	const { ac } = makeAirConditioner({}, { on: false })

	assert.equal(ac.currentHeaterCoolerState(), CurrentHeaterCoolerState.INACTIVE)
})

test('INACTIVE in FAN and DRY', () => {
	for (const mode of ['fan', 'dry']) {
		const { ac } = makeAirConditioner({}, { mode })

		assert.equal(ac.currentHeaterCoolerState(), CurrentHeaterCoolerState.INACTIVE)
	}
})

test('COOL and HEAT report COOLING and HEATING', () => {
	assert.equal(makeAirConditioner({}, { mode: 'cool' }).ac.currentHeaterCoolerState(), CurrentHeaterCoolerState.COOLING)
	assert.equal(makeAirConditioner({}, { mode: 'heat' }).ac.currentHeaterCoolerState(), CurrentHeaterCoolerState.HEATING)
})

test('AC auto mode: COOLING above target, HEATING below, IDLE at target', () => {
	const at = temperature => {
		return makeAirConditioner({}, { mode: 'auto' }, {
			measurements: {
				temperature,
				humidity: 50
			}
		}).ac.currentHeaterCoolerState()
	}

	assert.equal(at(26), CurrentHeaterCoolerState.COOLING)
	assert.equal(at(20), CurrentHeaterCoolerState.HEATING)
	assert.equal(at(24), CurrentHeaterCoolerState.IDLE)
})

test('a cooling-only unit in auto below target is IDLE, never HEATING', () => {
	const modes = { ...acDevice({}).remoteCapabilities.modes }

	delete modes.heat

	const { ac } = makeAirConditioner({}, { mode: 'auto' }, {
		measurements: {
			temperature: 20,
			humidity: 50
		},
		remoteCapabilities: { modes }
	})

	assert.equal(ac.currentHeaterCoolerState(), CurrentHeaterCoolerState.IDLE)
})
