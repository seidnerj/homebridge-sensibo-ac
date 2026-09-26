const {
	afterEach, beforeEach, mock, test
} = require('node:test')
const assert = require('node:assert/strict')
const {
	acDevice, callsTo, makeAirConditioner, refreshOnce, settle
} = require('./helpers')
const NOW = Date.parse('2026-09-01T12:00:00Z')
const SECOND = 1000

beforeEach(() => {
	mock.timers.enable({
		apis: ['setTimeout', 'Date'],
		now: NOW
	})
})

afterEach(() => {
	mock.timers.reset()
})

/**
 * An AC state change event as Sensibo's events API returns it
 * @param {number} time
 * @param {string} reason 'Trigger' (Climate React) or 'UserAPI'
 * @param {Object} resultingAcState
 */
function acEvent(time, reason, resultingAcState) {
	return {
		eventKind: 1000000,
		timestamp: new Date(time).toISOString(),
		details: {
			reason,
			resultingAcState
		}
	}
}

const climateReactResult = {
	on: true,
	mode: 'cool',
	targetTemperature: 20,
	temperatureUnit: 'C',
	fanLevel: 'high',
	swing: 'stopped',
	horizontalSwing: 'stopped',
	light: 'on'
}

/** A device refresh with Climate React enabled (or not) */
function refreshedDevice(climateReactEnabled) {
	const device = acDevice({})

	device.smartMode.enabled = climateReactEnabled

	return device
}

/**
 * Two refreshes 90s apart; `events(firstRefreshAt)` is what Sensibo reports on the second one
 * @returns {Promise<{ac: Object, calls: Array}>}
 */
async function refreshTwice(config, events, climateReactEnabled) {
	const {
		ac, platform, calls
	} = makeAirConditioner({
		enableRepeatClimateReactAction: true,
		...config
	}, {})

	await refreshOnce(platform, [refreshedDevice(climateReactEnabled)], mock.timers)

	const firstRefreshAt = ac.lastStateRefresh.getTime()

	platform.sensiboApi.responses.getDeviceEvents = events(firstRefreshAt)
	mock.timers.tick(85 * SECOND)
	await refreshOnce(platform, [refreshedDevice(climateReactEnabled)], mock.timers)

	return {
		ac,
		calls
	}
}

/** Run the repeat timers and StateHandler's debounce for `seconds` */
async function runFor(seconds) {
	for (let i = 0; i < seconds * 10; i++) {
		mock.timers.tick(100)
		await settle()
	}
}

test('the first refresh only records the time, it does not look at events', async () => {
	const {
		ac, platform, calls
	} = makeAirConditioner({ enableRepeatClimateReactAction: true }, {})

	await refreshOnce(platform, [refreshedDevice(true)], mock.timers)

	assert.equal(callsTo(calls, 'getDeviceEvents').length, 0)
	assert.equal(ac.lastStateRefresh.getTime(), NOW + 5 * SECOND)
})

test('re-sends the last Climate React result once by default', async () => {
	const {
		ac, calls
	} = await refreshTwice({}, since => {
		return [acEvent(since + 10 * SECOND, 'Trigger', climateReactResult)]
	}, true)

	await runFor(3)

	const sent = callsTo(calls, 'setDeviceACState')

	assert.equal(sent.length, 1)
	assert.equal(sent[0][1].targetTemperature, 20)
	assert.equal(sent[0][1].fanLevel, 'high')
	assert.equal(ac.state.targetTemperature, 20)
})

test('re-sends commandRepeatCount times, commandRepeatDelaySeconds apart', async () => {
	const { calls } = await refreshTwice({
		commandRepeatCount: 3,
		commandRepeatDelayMilliseconds: 5 * SECOND
	}, since => {
		return [acEvent(since + 10 * SECOND, 'Trigger', climateReactResult)]
	}, true)

	await runFor(4)
	assert.equal(callsTo(calls, 'setDeviceACState').length, 1)
	await runFor(5)
	assert.equal(callsTo(calls, 'setDeviceACState').length, 2)
	await runFor(5)
	assert.equal(callsTo(calls, 'setDeviceACState').length, 3)
})

test('with a 1s repeat delay the repeats collapse into StateHandler\'s 1s debounce', async () => {
	const { calls } = await refreshTwice({
		commandRepeatCount: 3,
		commandRepeatDelayMilliseconds: SECOND
	}, since => {
		return [acEvent(since + 10 * SECOND, 'Trigger', climateReactResult)]
	}, true)

	await runFor(5)

	// SUSPICIOUS: 3 repeats configured, but each one resets the 1s debounce before it fires, so only one command is sent
	assert.equal(callsTo(calls, 'setDeviceACState').length, 1)
})

test('skips when a newer non-Climate React change exists', async () => {
	const { calls } = await refreshTwice({}, since => {
		return [
			acEvent(since + 10 * SECOND, 'Trigger', climateReactResult),
			acEvent(since + 20 * SECOND, 'UserAPI', {
				...climateReactResult,
				on: false
			})
		]
	}, true)

	await runFor(3)

	assert.equal(callsTo(calls, 'setDeviceACState').length, 0)
})

test('skips a Climate React change younger than 45s, and looks at it again next time', async () => {
	const {
		ac, calls
	} = await refreshTwice({}, since => {
		return [acEvent(since + 60 * SECOND, 'Trigger', climateReactResult)]
	}, true)

	await runFor(3)

	assert.equal(callsTo(calls, 'setDeviceACState').length, 0)
	assert.equal(ac.lastStateRefresh.getTime(), NOW + 5 * SECOND + 60 * SECOND)
})

test('skips when Climate React is disabled', async () => {
	const { calls } = await refreshTwice({}, since => {
		return [acEvent(since + 10 * SECOND, 'Trigger', climateReactResult)]
	}, false)

	await runFor(3)

	assert.equal(callsTo(calls, 'getDeviceEvents').length, 0)
	assert.equal(callsTo(calls, 'setDeviceACState').length, 0)
})

test('skips Climate React changes from before the previous refresh', async () => {
	const { calls } = await refreshTwice({}, since => {
		return [acEvent(since - 10 * SECOND, 'Trigger', climateReactResult)]
	}, true)

	await runFor(3)

	assert.equal(callsTo(calls, 'setDeviceACState').length, 0)
})

test('does nothing without enableRepeatClimateReactAction', async () => {
	const { calls } = await refreshTwice({ enableRepeatClimateReactAction: false }, since => {
		return [acEvent(since + 10 * SECOND, 'Trigger', climateReactResult)]
	}, true)

	await runFor(3)

	assert.equal(callsTo(calls, 'getDeviceEvents').length, 0)
	assert.equal(callsTo(calls, 'setDeviceACState').length, 0)
})
