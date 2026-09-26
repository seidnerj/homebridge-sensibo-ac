// eslint-disable-next-line no-unused-vars
const SensiboACPlatform = require('../sensibo/SensiboACPlatform')
// eslint-disable-next-line no-unused-vars
const Classes = require('../classes')
const eventKinds = require('../sensibo/eventKinds.json')
// Direction (COOL/HEAT) is decided from how the room drifts while the AC is off, using the pod's readings (~every 90s).
// Readings right after the AC stops are skipped, since the room still coasts on the last cycle.
const SETTLE_MILLISECONDS = 5 * 60 * 1000
// Passive drift needed before its direction is trusted
const WINDOW_MILLISECONDS = 30 * 60 * 1000
// °C per hour; a flatter drift means the room is holding on its own
const MIN_SLOPE_PER_HOUR = 0.4
// Extra room between the heat-to and cool-to bands so neither band's overshoot reaches the other setpoint
const GAP_MARGIN = 0.5

/**
 * Least-squares slope of the samples, in degrees per hour
 * @param {{time: number, value: number}[]} samples time is epoch milliseconds
 * @returns {number}
 */
function slopePerHour(samples) {
	const meanTime = samples.reduce((sum, sample) => {
		return sum + sample.time
	}, 0) / samples.length
	const meanValue = samples.reduce((sum, sample) => {
		return sum + sample.value
	}, 0) / samples.length
	let numerator = 0
	let denominator = 0

	for (const sample of samples) {
		numerator += (sample.time - meanTime) * (sample.value - meanValue)
		denominator += (sample.time - meanTime) ** 2
	}

	return denominator === 0 ? 0 : numerator / denominator * 60 * 60 * 1000
}

/**
 * Passive drift over the trailing window of one continuous AC-off period, or null if the period is too short
 * @param {{time: number, value: number}[]} samples
 * @param {number} offSince when the AC turned off
 * @param {number} until end of the off period
 * @returns {null|number}
 */
function driftSlope(samples, offSince, until) {
	const windowStart = until - WINDOW_MILLISECONDS

	if (windowStart < offSince + SETTLE_MILLISECONDS) {
		return null
	}

	const windowed = samples.filter(sample => {
		return sample.time >= windowStart && sample.time <= until
	})

	if (windowed.length < 3) {
		return null
	}

	return slopePerHour(windowed)
}

/**
 * The direction is sticky: being past the opposite setpoint is not enough, the room must also be drifting further
 * past it with the AC off. With no direction yet, the drift alone decides.
 * @param {null|string} direction 'COOL', 'HEAT' or null
 * @param {number} temperature
 * @param {null|number} slope
 * @param {number} heatTo
 * @param {number} coolTo
 * @returns {null|string}
 */
function nextDirection(direction, temperature, slope, heatTo, coolTo) {
	if (slope === null) {
		return direction
	}

	const rising = slope > MIN_SLOPE_PER_HOUR
	const falling = slope < -MIN_SLOPE_PER_HOUR

	if (direction === null) {
		if (rising) {
			return 'COOL'
		}

		return falling ? 'HEAT' : null
	}

	if (direction === 'COOL' && falling && temperature < heatTo) {
		return 'HEAT'
	}

	if (direction === 'HEAT' && rising && temperature > coolTo) {
		return 'COOL'
	}

	return direction
}

/**
 * Drift of the most recent AC-off period found in Sensibo's history
 * @param {import('../types').Event[]} events
 * @param {{time: string, value: number}[]} measurements
 * @param {number} now
 * @returns {null|number}
 */
function historicalDriftSlope(events, measurements, now) {
	const acStateChanges = events
		.filter(event => {
			return event.eventKind == eventKinds.AC_STATE.CHANGED && event.details?.resultingAcState
		})
		.map(event => {
			return {
				time: Date.parse(event.timestamp),
				on: event.details.resultingAcState.on
			}
		})
		.sort((a, b) => {
			return a.time - b.time
		})
	const offPeriods = []
	let offSince = null

	for (const change of acStateChanges) {
		if (!change.on && offSince === null) {
			offSince = change.time
		} else if (change.on && offSince !== null) {
			offPeriods.push({
				offSince,
				until: change.time
			})
			offSince = null
		}
	}

	if (offSince !== null) {
		offPeriods.push({
			offSince,
			until: now
		})
	}

	const samples = measurements.map(measurement => {
		return {
			time: Date.parse(measurement.time),
			value: measurement.value
		}
	})

	for (const period of offPeriods.reverse()) {
		const slope = driftSlope(samples, period.offSince, period.until)

		if (slope !== null) {
			return slope
		}
	}

	return null
}

/**
 * Climate React as auto: HomeKit AUTO is implemented by the plugin instead of the AC. Climate React cycles the AC
 * around one setpoint, and the plugin picks which one (cool-to or heat-to) from the room's passive drift.
 */
class AutoClimateReact {

	/**
	 * @param {import('./AirConditioner')} device
	 * @param {SensiboACPlatform} platform
	 */
	constructor(device, platform) {
		this.device = device
		this.platform = platform

		const unit = device.usesFahrenheit ? 1.8 : 1 // mirrors the Climate React band formula in StateManager

		/** @type {number} */
		this.minimumGap = Math.max(
			platform.negativeClimateReactAutoSetupMultiplier * unit - platform.climateReactAutoSetupOffset,
			platform.positiveClimateReactAutoSetupMultiplier * unit + platform.climateReactAutoSetupOffset
		) + GAP_MARGIN

		const acState = this.acState
		const targetTemperature = acState.targetTemperature ?? 25

		platform.cachedState.autoClimateReact ??= {}
		/** @type {import('../types').AutoClimateReactState} */
		this.state = platform.cachedState.autoClimateReact[device.id] ??= {
			active: acState.active && (acState.mode === 'COOL' || acState.mode === 'HEAT'),
			auto: false,
			direction: null,
			coolTo: targetTemperature,
			heatTo: targetTemperature - this.minimumGap
		}

		/** @type {null|Promise<null|number>} */
		this.historyLookup = null
		/** @type {null|number} */
		this.offSince = null
		/** @type {{time: number, value: number}[]} */
		this.samples = []
	}

	/** @returns {Classes.InternalAcState} */
	get acState() {
		return /** @type {Classes.InternalAcState} */ (this.device.state)
	}

	save() {
		this.platform.storage.setItem('state', this.platform.cachedState)
	}

	/**
	 * Whether Climate React should be enabled, given the user's selection
	 * @returns {boolean}
	 */
	climateReactEnabled() {
		if (!this.state.active) {
			return false
		}

		if (this.state.auto) {
			return this.state.direction !== null
		}

		return this.acState.mode === 'COOL' || this.acState.mode === 'HEAT'
	}

	/**
	 * @param {boolean} active
	 */
	setActive(active) {
		this.state.active = active
		this.save()
	}

	/**
	 * Manual COOL/HEAT: Climate React with the direction pinned. Also becomes the direction AUTO resumes from.
	 * @param {string} mode 'COOL' or 'HEAT'
	 */
	selectManual(mode) {
		this.state.active = true
		this.state.auto = false
		this.state.direction = mode
		this.save()
	}

	/**
	 * @param {number} coolTo
	 */
	setCoolTo(coolTo) {
		this.state.coolTo = coolTo
		this.state.heatTo = Math.min(this.state.heatTo, coolTo - this.minimumGap)
		this.save()
	}

	/**
	 * @param {number} heatTo
	 */
	setHeatTo(heatTo) {
		this.state.heatTo = heatTo
		this.state.coolTo = Math.max(this.state.coolTo, heatTo + this.minimumGap)
		this.save()
	}

	async enterAuto() {
		this.state.active = true
		this.state.auto = true
		this.save()
		this.apply()

		if (this.state.direction !== null) {
			return
		}

		// HomeKit sends several characteristics at once (Active, mode, setpoints), so share one history lookup
		this.historyLookup ??= this.historicalSlope().finally(() => {
			this.historyLookup = null
		})

		const slope = await this.historyLookup
		const direction = nextDirection(null, this.acState.currentTemperature, slope, this.state.heatTo, this.state.coolTo)

		if (direction !== null && this.state.active && this.state.auto && this.state.direction === null) {
			this.switchDirection(direction, slope, 'history')
		}
	}

	/**
	 * @returns {Promise<null|number>}
	 */
	async historicalSlope() {
		try {
			const events = await this.platform.sensiboApi.getDeviceEvents(this.device.id)
			const measurements = await this.platform.sensiboApi.getDeviceHistoricalMeasurements(this.device.id, 1)

			return historicalDriftSlope(events, measurements.temperature, Date.now())
		} catch (err) {
			this.platform.log.warn(`${this.device.name} - Auto: could not read Sensibo history, will watch the room instead: ${err?.message ?? JSON.stringify(err)}`)

			return null
		}
	}

	/**
	 * @param {string} direction
	 * @param {number} slope
	 * @param {string} source
	 */
	switchDirection(direction, slope, source) {
		this.platform.log.info(`${this.device.name} - Auto: ${this.state.direction ?? 'undecided'} -> ${direction}`
			+ ` (${source}: room ${this.acState.currentTemperature}°C, drifting ${slope.toFixed(2)}°C/h with the AC off)`)
		this.state.direction = direction
		this.save()
		this.apply()
	}

	/**
	 * Point the AC and Climate React at the current direction's setpoint. With no direction yet, keep the AC off
	 * so the room's passive drift can be observed.
	 */
	apply() {
		const device = this.device

		if (!this.state.active || !this.state.auto) {
			return
		}

		// Reflect.set still goes through StateHandler (which sends the command), but returns false instead of throwing
		// when the value is unchanged
		if (this.state.direction === null) {
			Reflect.set(device.state, 'active', false)
			device.StateManager.updateClimateReact()

			return
		}

		const cooling = this.state.direction === 'COOL'

		Reflect.set(device.state, 'mode', this.state.direction)
		Reflect.set(device.state, 'targetTemperature', cooling ? this.state.coolTo : this.state.heatTo)
		device.StateManager.updateClimateReact()

		// Climate React only reacts to crossing a threshold, so start the AC ourselves if the room is already past it
		const smartMode = this.acState.smartMode
		const temperature = this.acState.currentTemperature
		const run = cooling ? temperature > smartMode.highTemperatureThreshold : temperature < smartMode.lowTemperatureThreshold

		Reflect.set(device.state, 'active', run)
	}

	/**
	 * Called after every state refresh from Sensibo
	 */
	onRefresh() {
		const now = Date.now()
		const acState = this.acState

		if (acState.active) {
			this.offSince = null
			this.samples = []
		} else {
			this.offSince ??= now
			this.samples.push({
				time: now,
				value: acState.currentTemperature
			})
			this.samples = this.samples.filter(sample => {
				return sample.time >= now - WINDOW_MILLISECONDS
			})
		}

		if (!this.state.active || !this.state.auto || this.offSince === null) {
			return
		}

		const slope = driftSlope(this.samples, this.offSince, now)
		const direction = nextDirection(this.state.direction, acState.currentTemperature, slope, this.state.heatTo, this.state.coolTo)

		if (direction !== this.state.direction) {
			this.switchDirection(direction, slope, 'observed')
		}
	}

}

module.exports = AutoClimateReact
module.exports.nextDirection = nextDirection
module.exports.driftSlope = driftSlope
module.exports.historicalDriftSlope = historicalDriftSlope
