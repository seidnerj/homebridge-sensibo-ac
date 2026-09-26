const {
	afterEach, beforeEach, mock, test
} = require('node:test')
const assert = require('node:assert/strict')
const {
	callsTo, homeKitSet, makeAirConditioner, pressMode
} = require('./helpers')
const HEAT = 1

beforeEach(() => {
	mock.timers.enable({ apis: ['setTimeout'] })
})

afterEach(() => {
	mock.timers.reset()
})

test('COOL: AC turns on above target + 1 and off below target - 1', async () => {
	const { ac } = makeAirConditioner({ enableClimateReactAutoSetup: true }, {})

	await homeKitSet(ac, 'CoolingThresholdTemperature', 22)

	const smartMode = ac.state.smartMode

	assert.equal(smartMode.type, 'temperature')
	assert.equal(smartMode.highTemperatureThreshold, 23)
	assert.equal(smartMode.lowTemperatureThreshold, 21)
	assert.equal(smartMode.highTemperatureState.on, true)
	assert.equal(smartMode.lowTemperatureState.on, false)
	assert.equal(smartMode.highTemperatureState.mode, 'COOL')
	assert.equal(smartMode.highTemperatureState.targetTemperature, 22)
})

test('HEAT: AC turns off above target + 1 and on below target - 1', async () => {
	const { ac } = makeAirConditioner({ enableClimateReactAutoSetup: true }, {})

	await pressMode(ac, HEAT)
	await homeKitSet(ac, 'HeatingThresholdTemperature', 20)

	const smartMode = ac.state.smartMode

	assert.equal(smartMode.highTemperatureThreshold, 21)
	assert.equal(smartMode.lowTemperatureThreshold, 19)
	assert.equal(smartMode.highTemperatureState.on, false)
	assert.equal(smartMode.lowTemperatureState.on, true)
	assert.equal(smartMode.lowTemperatureState.mode, 'HEAT')
})

test('offset shifts both thresholds and the multipliers widen each side independently', async () => {
	const { ac } = makeAirConditioner({
		enableClimateReactAutoSetup: true,
		climateReactAutoSetupOffset: 0.5,
		positiveClimateReactAutoSetupMultiplier: 2,
		negativeClimateReactAutoSetupMultiplier: 3
	}, {})

	await homeKitSet(ac, 'CoolingThresholdTemperature', 22)

	assert.equal(ac.state.smartMode.highTemperatureThreshold, 24.5)
	assert.equal(ac.state.smartMode.lowTemperatureThreshold, 19.5)
})

test('Fahrenheit units scale each multiplier step by 1.8', async () => {
	const { ac } = makeAirConditioner({ enableClimateReactAutoSetup: true }, {
		temperatureUnit: 'F',
		targetTemperature: 75
	}, { temperatureUnit: 'F' })

	await homeKitSet(ac, 'CoolingThresholdTemperature', 22)

	const smartMode = ac.state.smartMode

	assert.ok(Math.abs(smartMode.highTemperatureThreshold - 23.8) < 1e-9)
	assert.ok(Math.abs(smartMode.lowTemperatureThreshold - 20.2) < 1e-9)
	assert.equal(smartMode.highTemperatureState.temperatureUnit, 'F')
	assert.equal(smartMode.highTemperatureState.targetTemperature, 72)
	assert.equal(smartMode.lowTemperatureState.targetTemperature, 72)
})

test('the existing enabled flag is kept', async () => {
	const { ac } = makeAirConditioner({ enableClimateReactAutoSetup: true }, {})

	await homeKitSet(ac, 'CoolingThresholdTemperature', 22)

	assert.equal(ac.state.smartMode.enabled, false)
})

test('Climate React is not touched when enableClimateReactAutoSetup is off', async () => {
	const { ac } = makeAirConditioner({}, {})

	await homeKitSet(ac, 'CoolingThresholdTemperature', 22)

	assert.equal(ac.state.smartMode.highTemperatureThreshold, 25)
	assert.equal(ac.state.smartMode.lowTemperatureThreshold, 23)
})

test('the new Climate React state is sent to Sensibo with or without allowRepeatedCommands', async () => {
	for (const allowRepeatedCommands of [false, true]) {
		const {
			ac, calls
		} = makeAirConditioner({
			enableClimateReactAutoSetup: true,
			allowRepeatedCommands
		}, {})

		await homeKitSet(ac, 'CoolingThresholdTemperature', 22)
		await Promise.resolve()

		const sent = callsTo(calls, 'setDeviceClimateReactState')

		assert.equal(sent.length, 1, `allowRepeatedCommands: ${allowRepeatedCommands}`)
		assert.equal(sent[0][1].highTemperatureThreshold, 23)
		assert.equal(sent[0][1].highTemperatureState.mode, 'cool')
		assert.equal(sent[0][1].highTemperatureState.fanLevel, 'medium')
	}
})

test('the Climate React switch sends the new enabled flag without allowRepeatedCommands', async () => {
	const {
		ac, calls
	} = makeAirConditioner({ allowRepeatedCommands: false }, {})

	await homeKitSet(ac, 'ClimateReactSwitch', true)
	await Promise.resolve()

	const sent = callsTo(calls, 'setDeviceClimateReactState')

	assert.equal(sent.length, 1)
	assert.equal(sent[0][1].enabled, true)
})

test('Fahrenheit with brokenThermostat puts the forced temperature in F in the Climate React states', async () => {
	const { ac } = makeAirConditioner({
		enableClimateReactAutoSetup: true,
		brokenThermostat: true
	}, {
		temperatureUnit: 'F',
		targetTemperature: 75
	}, { temperatureUnit: 'F' })

	await homeKitSet(ac, 'CoolingThresholdTemperature', 22)

	assert.equal(ac.state.smartMode.highTemperatureState.targetTemperature, 61)
	assert.equal(ac.state.smartMode.lowTemperatureState.targetTemperature, 61)
})
