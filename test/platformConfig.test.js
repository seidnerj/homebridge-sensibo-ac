// Records how SensiboACPlatform resolves its config: explicit falsy values, clamping, the
// climateReactAsAuto overrides, disableAirConditioner, and redaction in the logged config.
const {
	describe, it
} = require('node:test')
const assert = require('node:assert/strict')
const SensiboACPlatform = require('../sensibo/SensiboACPlatform')

function makePlatform(config) {
	const logs = {
		debug: [],
		info: [],
		error: []
	}
	const listeners = []
	const log = {
		debug: line => {
			logs.debug.push(line)
		},
		info: (...args) => {
			logs.info.push(args.join(' '))
		},
		warn: () => {},
		error: (...args) => {
			logs.error.push(args.join(' '))
		},
		log: () => {}
	}
	const api = {
		on: (event, handler) => {
			listeners.push(event)
			assert.equal(typeof handler, 'function')
		},
		user: {
			persistPath: () => {
				return '/tmp/homebridge-test/persist'
			}
		}
	}
	const platform = new SensiboACPlatform(log, {
		platform: 'SensiboAC',
		apiKey: 'secret-key',
		...config
	}, api)

	return {
		platform,
		logs,
		listeners
	}
}

describe('SensiboACPlatform config parsing', () => {
	it('registers didFinishLaunching without running it', () => {
		const { listeners } = makePlatform({})

		assert.deepEqual(listeners, ['didFinishLaunching'])
	})

	it('applies defaults when options are absent', () => {
		const { platform } = makePlatform({})

		assert.equal(platform.climateReactAutoSetupOffset, 0)
		assert.equal(platform.positiveClimateReactAutoSetupMultiplier, 1)
		assert.equal(platform.negativeClimateReactAutoSetupMultiplier, 1)
		assert.equal(platform.carbonDioxideAlertThreshold, 1500)
		assert.equal(platform.commandRepeatCount, 1)
		assert.equal(platform.commandRepeatDelayMilliseconds, 1000)
		assert.equal(platform.climateReactAsAuto, false)
		assert.equal(platform.enableClimateReactAutoSetup, false)
		assert.equal(platform.name, 'SensiboAC')
		assert.equal(platform.disableAirConditioner, false)
		assert.deepEqual(platform.modesToExclude, [])
		assert.equal(platform.persistPath, '/tmp/homebridge-test/sensibo-persist')
	})

	it('keeps explicit 0 / false / empty-string values instead of replacing them with defaults', () => {
		const { platform } = makePlatform({
			climateReactAutoSetupOffset: 0,
			positiveClimateReactAutoSetupMultiplier: 0,
			negativeClimateReactAutoSetupMultiplier: 0,
			carbonDioxideAlertThreshold: 0,
			debug: false,
			name: ''
		})

		assert.equal(platform.climateReactAutoSetupOffset, 0)
		assert.equal(platform.positiveClimateReactAutoSetupMultiplier, 0)
		assert.equal(platform.negativeClimateReactAutoSetupMultiplier, 0)
		assert.equal(platform.carbonDioxideAlertThreshold, 0)
		assert.equal(platform.debug, false)
		assert.equal(platform.name, '')
	})

	it('keeps explicit non-default numeric values', () => {
		const { platform } = makePlatform({
			climateReactAutoSetupOffset: -1.5,
			positiveClimateReactAutoSetupMultiplier: 2,
			negativeClimateReactAutoSetupMultiplier: 0.5
		})

		assert.equal(platform.climateReactAutoSetupOffset, -1.5)
		assert.equal(platform.positiveClimateReactAutoSetupMultiplier, 2)
		assert.equal(platform.negativeClimateReactAutoSetupMultiplier, 0.5)
	})

	for (const [input, expected] of [[0, 1], [-5, 1], [1, 1], [2, 2], [3, 3], [4, 3], [100, 3]]) {
		it(`clamps commandRepeatCount ${input} to ${expected}`, () => {
			assert.equal(makePlatform({ commandRepeatCount: input }).platform.commandRepeatCount, expected)
		})
	}

	for (const [input, expected] of [[0, 1000], [-1, 1000], [1, 1000], [2.5, 2500], [60, 60000], [61, 60000], [3600, 60000]]) {
		it(`clamps commandRepeatDelaySeconds ${input} to ${expected}ms`, () => {
			assert.equal(makePlatform({ commandRepeatDelaySeconds: input }).platform.commandRepeatDelayMilliseconds, expected)
		})
	}

	it('climateReactAsAuto forces auto setup on and the Climate React switches off', () => {
		const { platform } = makePlatform({
			climateReactAsAuto: true,
			enableClimateReactAutoSetup: false,
			enableClimateReactSwitch: true,
			climateReactSwitchInAccessory: true
		})

		assert.equal(platform.climateReactAsAuto, true)
		assert.equal(platform.enableClimateReactAutoSetup, true)
		assert.equal(platform.enableClimateReactSwitch, false)
		assert.equal(platform.climateReactSwitchInAccessory, false)
	})

	it('leaves the Climate React switch options alone without climateReactAsAuto', () => {
		const { platform } = makePlatform({
			enableClimateReactSwitch: true,
			climateReactSwitchInAccessory: true
		})

		assert.equal(platform.enableClimateReactAutoSetup, false)
		assert.equal(platform.enableClimateReactSwitch, true)
		assert.equal(platform.climateReactSwitchInAccessory, true)
	})

	it('uppercases modesToExclude and disables the air conditioner only when AUTO, COOL and HEAT are all excluded', () => {
		let { platform } = makePlatform({ modesToExclude: ['auto', 'Cool', 'HEAT'] })

		assert.deepEqual(platform.modesToExclude, ['AUTO', 'COOL', 'HEAT'])
		assert.equal(platform.disableAirConditioner, true)

		platform = makePlatform({ modesToExclude: ['AUTO', 'COOL', 'DRY', 'FAN'] }).platform
		assert.equal(platform.disableAirConditioner, false)
	})

	it('redacts apiKey and password in both logged configs', () => {
		const { logs } = makePlatform({
			username: 'me@example.com',
			password: 'hunter2'
		})
		const logged = logs.debug.join('\n')

		assert.ok(!logged.includes('secret-key'), logged)
		assert.ok(!logged.includes('hunter2'), logged)
		// once for the raw config, once for the resolved config
		assert.equal(logs.debug.filter(line => {
			return line.includes('"apiKey": "[REDACTED]"')
		}).length, 2)
		assert.equal(logs.debug.filter(line => {
			return line.includes('"password": "[REDACTED]"')
		}).length, 2)
		assert.ok(logged.includes('"username": "me@example.com"'))
	})

	it('does not mutate the caller config when redacting', () => {
		const config = {
			platform: 'SensiboAC',
			apiKey: 'secret-key'
		}

		new SensiboACPlatform({
			debug: () => {},
			info: () => {},
			error: () => {}
		}, config, {
			on: () => {},
			user: {
				persistPath: () => {
					return '/tmp/x'
				}
			}
		})
		assert.equal(config.apiKey, 'secret-key')
	})

	it('stops early, logging an error, without credentials or an API key', () => {
		const logs = []
		const platform = new SensiboACPlatform({
			debug: () => {},
			info: () => {},
			error: line => {
				logs.push(line)
			}
		}, { platform: 'SensiboAC' }, {
			on: () => {
				assert.fail('should not register listeners')
			}
		})

		assert.ok(logs.some(line => {
			return line.includes('without user credentials or an API key')
		}))
		assert.equal(platform.commandRepeatCount, undefined)
	})
})
