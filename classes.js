class InternalAcState {

	/**
     * @param {null|boolean} active
     * @param {null|string} mode
     * @param {null|number} targetTemperature
     * @param {null|number} currentTemperature
     * @param {null|number} relativeHumidity
     * @param {null|import('./types').InternalSmartMode} smartMode
     * @param {null|boolean} light
     * @param {null|boolean} pureBoost
     * @param {null|string} filterChange
     * @param {null|number} filterLifeLevel
     * @param {null|string} horizontalSwing
     * @param {null|string} verticalSwing
     * @param {null|number} fanSpeed
     * @param {null|number} airQuality
     * @param {null|number} VOCDensity
     * @param {null|number} carbonDioxideDetected
     * @param {null|number} carbonDioxideLevel
     */
	constructor(active, mode, targetTemperature, currentTemperature, relativeHumidity, smartMode, light, pureBoost,
		filterChange, filterLifeLevel, horizontalSwing, verticalSwing, fanSpeed, airQuality, VOCDensity,
		carbonDioxideDetected, carbonDioxideLevel) {
		this.active = active
		this.mode = mode
		this.targetTemperature = targetTemperature
		this.currentTemperature = currentTemperature
		this.relativeHumidity = relativeHumidity
		this.smartMode = smartMode
		this.light = light
		this.pureBoost = pureBoost
		this.filterChange = filterChange
		this.filterLifeLevel = filterLifeLevel
		this.horizontalSwing = horizontalSwing
		this.verticalSwing = verticalSwing
		this.fanSpeed = fanSpeed
		this.airQuality = airQuality
		this.VOCDensity = VOCDensity
		this.carbonDioxideDetected = carbonDioxideDetected
		this.carbonDioxideLevel = carbonDioxideLevel
		this.syncState = null // this is overriden by StateHandler which wraps this class' instance
		this.update = null // this is overriden by StateHandler which wraps this class' instance
	}

}

class InternalOccupancyState {

	/**
	 * @param {string} occupancy
	 */
	constructor (occupancy) {
		this.occupancy = occupancy
		this.update = null // this is overriden by StateHandler which wraps this class's instance
	}

}

class InternalSensorState {

	constructor(motionDetected, currentTemperature, relativeHumidity, lowBattery) {
		this.motionDetected = motionDetected
		this.currentTemperature = currentTemperature
		this.relativeHumidity =relativeHumidity
		this.lowBattery = lowBattery
		this.update = null // this is overriden by StateHandler which wraps this class's instance
	}

}

module.exports = {
	InternalAcState,
	InternalOccupancyState,
	InternalSensorState
}