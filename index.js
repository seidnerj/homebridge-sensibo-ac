// eslint-disable-next-line no-unused-vars
const homebridge = require('homebridge')
const SensiboACPlatform = require('./sensibo/SensiboACPlatform')
const pluginName = require('./package.json').name
const platformName = require('./package.json').platformName

/**
 * @param {homebridge.API} api
 */
module.exports = (api) => {
	api.registerPlatform(pluginName, platformName, SensiboACPlatform)
}
