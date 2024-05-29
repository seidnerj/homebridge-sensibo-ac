// eslint-disable-next-line no-unused-vars
const SensiboACPlatform = require('../sensibo/SensiboACPlatform')
// eslint-disable-next-line no-unused-vars
const SensiboAccessory = require ('../homekit/SensiboAccessory')

// FIXME: This file should be moved to a different location...
// TODO: move unified.js functions here

/**
 * @param {SensiboAccessory} device
 * @param {SensiboACPlatform} platform
 */
module.exports = (device, platform) => {
	const Characteristic = platform.api.hap.Characteristic
	const easyDebug = platform.easyDebug

	return {

		/**
		 * Convert degrees F to degrees C
		 * @param  {Number} degreesF The degrees in F to convert
		 * @return {Number} The degrees in C
		 */
		toCelsius: (degreesF) => {
			const degreesC = (degreesF - 32) / 1.8

			easyDebug(`${device.name} - Utils toCelsius - degreesF: ${degreesF}, degreesC: ${degreesC}`)

			return degreesC
		},

		/**
		 * Convert degrees C to degrees F
		 * @param  {Number} degreesC The degrees in C to convert
		 * @return {Number} The degrees in F
		 */
		toFahrenheit: (degreesC) => {
			const degreesF = Math.round((degreesC * 1.8) + 32)

			easyDebug(`${device.name} - Utils toFahrenheit - degreesC: ${degreesC}, degreesF: ${degreesF}`)

			return degreesF
		},

		// TODO: if this doesn't update accessory value, do we need to make sure state also doesn't get changed?

		// TODO: round numbers to 0 or 1 decimals?
		// Probably should be done when _calling_ updateValue rather than in it? (So it's not "hidden" functionality)
		// E.g. humidity should be a full percentage, temp seems to support 1 decimal
		// Note: some rounding is occurring below using minStep

		/**
		 * Checks the given Service for the given Characteristic, if found, validates the newValue and updates the Characteristic with it
		 * @param  {String} serviceName        The Service to update
		 * @param  {String} characteristicName The Characteristic to update
		 * @param  {Number|String|Boolean} newValue   The value that the Characteristic should be set to
		 */
		updateValue: (serviceName, characteristicName, newValue) => {
			// easyDebug(`${device.name} - updateValue: ${newValue} for characteristic ${characteristicName} on service ${serviceName}`)
			// Could we use .validateUserInput or .validateClientSuppliedValue from HAP Characteristics definition? Probably not as both are private...

			const characteristic = device[serviceName]?.getCharacteristic(Characteristic[characteristicName])

			if (typeof(characteristic) === 'undefined') {
				easyDebug(`${device.name} - characteristic undefined for serviceName: ${serviceName} and/or characteristicName: ${characteristicName} while trying to set '${newValue}'... skipping update`)

				return
			}

			// FIXME: what does this line actually check for? Does it look for not false and false (not true) at the same time?
			if (newValue !== 0 && newValue !== false && (typeof newValue === 'undefined' || !newValue)) {
				easyDebug(`${device.name} - '${newValue}' bad value for characteristic ${characteristicName} on service ${serviceName}... skipping update`)

				return
			}

			if (newValue === undefined || newValue === null) {
				easyDebug(`${device.name} - '${newValue}' undefined or null for characteristic ${characteristicName} on service ${serviceName}... skipping update`)

				return
			}

			const currentValue = characteristic.value
			const format = characteristic.props.format ?? 'undefined'
			const maxValue = characteristic.props.maxValue
			const minValue = characteristic.props.minValue
			const minStep = characteristic.props.minStep
			const validValues = characteristic.props.validValues

			if (Number.isNaN(newValue)) {
				// non-number is valid for many usecases
				// TODO: could check if props.format is float or int, then compare and fail if needed?
				easyDebug(`${device.name} - '${newValue}' is not a number for characteristic ${characteristicName} (expected format '${format}') on service ${serviceName}... continuing`)
			}

			if (validValues && !validValues.includes(newValue)) {
				easyDebug(`${device.name} - '${newValue}' not in validValues: ${validValues} for characteristic ${characteristicName} on service ${serviceName}... skipping update`)

				return
			}

			// TODO: CurrentTemperature value being returned seems to need rounding?
			// e.g. "22.60000000000001"

			if (minStep) {
				if (typeof(newValue) == 'number') {
					const newValuePlusEpsilon = newValue + Number.EPSILON
					const roundedValue = minStep < 1 ? Math.round((newValuePlusEpsilon) * 10) / 10 : Math.round(newValuePlusEpsilon)

					if (roundedValue !== newValue) {
						easyDebug(`${device.name} - '${newValue}' doesn't meet the rounding requird by minStep: ${minStep} for characteristic ${characteristicName} on service ${serviceName}... rounding to ${roundedValue}`)
						newValue = roundedValue
					}
				} else{
					easyDebug(`${device.name} - '${newValue}' for characteristic ${characteristicName} on service ${serviceName} is not of type 'number'... skipping update`)

					return
				}
			}

			if (minValue && newValue < minValue) {
				easyDebug(`${device.name} - '${newValue}' less than minValue: ${minValue} for characteristic ${characteristicName} on service ${serviceName}... skipping update`)

				return
			} else if (maxValue && newValue > maxValue) {
				easyDebug(`${device.name} - '${newValue}' greater than maxValue: ${maxValue} for characteristic ${characteristicName} on service ${serviceName}... skipping update`)

				return
			}

			if (currentValue === newValue) {
				easyDebug(`${device.name} - '${newValue}' equals '${currentValue}' for characteristic ${characteristicName} on service ${serviceName}... skipping update`)

				return
			}

			easyDebug(`${device.name} - Setting '${newValue}' for characteristic ${characteristicName} on service ${serviceName}, value was '${currentValue}'`)
			characteristic.updateValue(newValue)

			return
		}

	}
}