const version = require('./../package.json').version
const pluginName = require('./../package.json').name
// eslint-disable-next-line no-unused-vars
const SensiboACPlatform = require('./SensiboACPlatform')
// TODO: should we revert removing ".default" and all the subsequent changes emanating from this change?
const axios = require('axios')
const integrationName = `${pluginName}@${version}`
const baseURL = 'https://home.sensibo.com/api/v2'

/**
 * @param {SensiboACPlatform} platform
 * @return {Promise<string|object>}
 */
function getToken(platform) {
	// TODO: check on if the below is required
	// eslint-disable-next-line no-async-promise-executor
	return new Promise(async (resolve, reject) => {
		/** @type {import('../types').TokenObject} */
		const token = await platform.storage.getItem('token')

		// TODO: what happens if returned token doesn't work? E.g. password change... should token be "checked" for validity?
		// TODO: Looks like Token expiry might be 15 years?!
		if (token && token.username && token.username === platform.username && new Date().getTime() < token.expirationDate) {
			platform.easyDebug('Found valid token in storage')
			resolve(token.key)

			return
		}

		const tokenURL = 'https://home.sensibo.com/o/token/'
		const data = {
			username: platform.username,
			password: platform.password,
			grant_type: 'password',
			client_id: 'bcrEwCG2mZTvm1vFJOD51DNdJHEaRemMitH1gCWc',
			scope: 'read write'
		}

		axios.post(
			tokenURL,
			data,
			{ headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
			.then(async response => {
				if (response.data.access_token) {
					/** @type {import('../types').TokenObject} */
					const tokenObj = {
						username: platform.username,
						key: response.data.access_token,
						expirationDate: new Date().getTime() + response.data.expires_in*1000
					}

					platform.easyDebug('Token successfully acquired from Sensibo API')
					// platform.easyDebug(tokenObj)
					await platform.storage.setItem('token', tokenObj)
					resolve(tokenObj.key)
				} else {
					const error = `Inner Could NOT complete the the token request -> ERROR: "${response.data}"`

					platform.log.info(error)
					reject(error)
				}
			})
			.catch(err => {
				const errorContent = {}

				errorContent.message = `Could NOT complete the the token request - ERROR: "${err.response.data.error_description || err.response.data.error}"`

				platform.log.info('getToken:', errorContent.message)

				if (err.response) {
					platform.easyDebug('Error response:')
					platform.easyDebug(err.response.data)
					errorContent.response = err.response.data
				}

				// platform.easyDebug(err)
				reject(errorContent)
			})
	})
}

function fixResponse(results) {
	return results.map(result => {
		// remove user's address to prevent it from appearing in logs
		result.location && (result.location = {
			occupancy: result.location.occupancy,
			name: result.location.name,
			id: result.location.id
		})

		// If climate react was never set up, or not valid for the device, result.smartMode will return
		// a 'null' value which will break other code so we fix this here
		if (result.smartMode === null) {
			result.smartMode = { enabled: false }
		}

		return result
	})
}

/**
 * @param {SensiboACPlatform} platform
 * @param {string} method
 * @param {string} url
 * @param {object} data
 */
async function apiRequest(platform, method, url, data) {
	// TODO: Authorization header (login token) expiry isn't checked... could result in API failures
	// Though it does look like Token expiry might be 15 years?!
	// maybe https://www.thedutchlab.com/en/insights/using-axios-interceptors-for-refreshing-your-api-token

	// TODO: could add auto-retry for timeouts etc
	if (!axios.defaults?.params?.apiKey && !axios.defaults?.headers?.common?.Authorization) {
		platform.easyDebug('apiRequest error: No API Token or Authorization Header found')

		try {
			const token = await getToken(platform)

			axios.defaults.headers.common = { Authorization: 'Bearer ' + token }
		} catch(err) {
			platform.log.info('apiRequest token error:', err.message || err)
			throw err
		}
	}

	return new Promise((resolve, reject) => {
		platform.easyDebug(`Creating ${method.toUpperCase()} request to Sensibo API ->`)
		platform.easyDebug(baseURL + url)
		if (data) {
			platform.easyDebug(`data: ${JSON.stringify(data, null, 4)}`)
		}

		axios({
			method,
			url,
			data
		})
			.then(response => {
				const json = response.data
				let results

				if (json.status && json.status == 'success') {
					platform.easyDebug(`Successful ${method.toUpperCase()} response:`)

					// TODO: The below is only relevant for getAllDevices (and should be moved).
					//       This prevents address details being logged through (and adds ClimateReact settings if they are missing),
					//       so the logger would also need to be moved...
					if (json.result && json.result instanceof Array) {
						results = fixResponse(json.result)
					} else {
						results = json
					}

					platform.easyDebug(JSON.stringify(results, null, 4))
					resolve(results)
				} else {
					const error = json

					platform.log.info(`ERROR: ${error.reason} - "${error.message}"`)
					platform.log.info(json)
					reject(error)
				}
			})
			.catch(err => {
				const errorContent = {}

				errorContent.errorURL = baseURL + url
				errorContent.message = err.message
				platform.log.info(`Error URL: ${errorContent.errorURL}`)
				platform.log.info(`Error message: ${errorContent.message}`)

				if (err.response) {
					errorContent.response = err.response.data
					platform.easyDebug(`Error response: ${JSON.stringify(errorContent.response, null, 4)}`)
				}

				reject(errorContent)
			})
	})
}

/**
* @param {SensiboACPlatform} platform
* @returns {Promise<import('../types').Device[]>}
*/
async function getAllDevices(platform) {
	const path = '/users/me/pods'
	const queryString = 'fields=id,acState,measurements,location,occupancy,smartMode,motionSensors,filtersCleaning,serial,pureBoostConfig,homekitSupported,remoteCapabilities,room,temperatureUnit,productModel'
	/** @type {import('../types').Device[]} */
	let allDevices

	try {
		allDevices = await apiRequest(platform, 'get', path + '?' + queryString)
	} catch(err) {
		platform.log.info('getAllDevices ERR:', err.message)
		throw err
	}

	// TODO: the below will return an exception if above "get" fails... null check?
	return allDevices.filter(device => {
		return (platform.locationsToInclude.length === 0
						|| platform.locationsToInclude.includes(device.location.id)
						|| platform.locationsToInclude.includes(device.location.name))
					&& !platform.devicesToExclude.includes(device.id)
					&& !platform.devicesToExclude.includes(device.serial)
					&& !platform.devicesToExclude.includes(device.room.name)
	})
}

/**
* @param {SensiboACPlatform} platform
* @param {string} deviceId
* @return {Promise<import('../types').Event[]>}
*/
async function getDeviceEvents (platform, deviceId) {
	const path = `/pods/${deviceId}/events`
	const queryString = ''

	return await apiRequest(platform, 'get', path + '?' + queryString)

	// TODO: remove
	// function Ar(e, t) {
	// 	if (t.eventKind == Tr.REMOTE.CHANGED) return `Remote changed to ${t.details.flavorName}`;
	// 	if (t.eventKind == Tr.CLIMATE_REACT.THRESHOLD_CROSSED) return "Climate React detected a threshold cross";
	// 	if (t.eventKind == Tr.CLIMATE_REACT.ENABLED_DISABLED_ON_SCHEDULING) return `Scheduler turned Climate React ${t.details.enabled?"on":"off"}`;
	// 	if (t.eventKind == Tr.CLIMATE_REACT.ENABLED_DISABLED_ON_MOTION) return `Motion turned Climate React ${t.details.enabled?"on":"off"}`;
	// 	if (t.eventKind == Tr.MOTION.ENABLED_DISABLED_ON_SCHEDULING) return `Scheduler turned Motion ${t.details.enabled?"on":"off"}`;
	// 	if (t.eventKind == Tr.MOTION.ENTERED) return "Motion detected an entrance";
	// 	if (t.eventKind == Tr.MOTION.LEFT) return "Motion detected an exit";
	// 	const n = t.details.user,
	// 		a = void 0 == n ? "" : n.email == e.email ? "You" : n.firstName;
	// 	return t.eventKind == Tr.AC_STATE.CHANGED ? function(e, t) {
	// 		switch (e.reason) {
	// 			case Lt.USER_REQUEST:
	//				t = "User Reqeust";  // NOTE: this was added by me, also Lt.USER_REQUEST should be set to "UserAPI" and not "UserRequest" (seems like this was updated by Sensibo in the web interface)
	// 				break;
	// 			case Lt.STATE_CORRECTION_BY_USER:
	// 				t = "Sync State";
	// 				break;
	// 			case Lt.REMOTE_CONTROL:
	// 				t = "Remote Control";
	// 				break;
	// 			case Lt.CHANGED_REMOTE:
	// 				t = "Changed Remote";
	// 				break;
	// 			case Lt.TRIGGER:
	// 				t = "Climate React";
	// 				break;
	// 			case Lt.GEOFENCE:
	// 				t = "Geofence";
	// 				break;
	// 			case Lt.IFTTT_REQUEST:
	// 				t = "IFTTT";
	// 				break;
	// 			case Lt.SCHEDULED_COMMAND:
	// 				t = "Scheduler";
	// 				break;
	// 			case Lt.MOTION_REACTION:
	// 				t = "Motion";
	// 				break;
	// 			case Lt.AMAZON_ECHO:
	// 				t = "Amazon Echo";
	// 				break;
	// 			case Lt.GOOGLE_ASSISTANT:
	// 				t = "Google Assistant";
	// 				break;
	// 			default:
	// 				t = "Unknown"
	// 		}
	// 		let n = [];
	// 		for (let t of e.changedProperties) {
	// 			let a;
	// 			if (t == St.ON) a = e.resultingAcState.on ? "AC power to on" : "AC power to off";
	// 			else {
	// 				let n = kt[t]
	// 				void 0 === n && (console.error("No name for property", t), n = t), a = `${n} to ${e.resultingAcState[t]}`
	// 			}
	// 			n.push(a)
	// 		}
	// 		return n.length >= 1 ? e.changedProperties[0] == St.ON ? e.resultingAcState.on ? `${t} turned AC on` : `${t} turned AC off` : e.changedProperties[0] == St.MODE ? `${t} changed mode to ${e.resultingAcState.mode}` : e.changedProperties[0] == St.TARGET_TEMPERATURE ? `${t} changed temperature to ${e.resultingAcState.targetTemperature}` : e.changedProperties[0] == St.FAN_LEVEL ? `${t} changed fan level to ${e.resultingAcState.fanLevel}` : `${t} changed AC state` : `${t} executed`
	// 	}(t.details, a) : t.eventKind == Tr.REMOTE.STARTED_REMOTE_RECOGNITION ? `${a} started a remote recognition session` : t.eventKind == Tr.SCHEDULING.CHANGED ? `${a} changed schedule` : t.eventKind == Tr.SCHEDULING.CREATED ? `${a} created schedule` : t.eventKind == Tr.SCHEDULING.DELETED ? `${a} deleted schedule` : t.eventKind == Tr.CLIMATE_REACT.ENABLED_DISABLED ? `${a} turned Climate React ${t.details.enabled?"on":"off"}` : t.eventKind == Tr.CLIMATE_REACT.ENABLED_DISABLED_ON_GEOFENCE ? `${a} turned Climate React ${t.details.enabled?"on":"off"} by ${t.details.transition} ${t.details.location?t.details.location.name:""}` : t.eventKind == Tr.MOTION.ENABLED_DISABLED_ON_GEOFENCE ? `${a} turned Motion ${t.details.enabled?"on":"off"} by ${t.details.transition} ${t.details.location?t.details.location.name:""}` : t.eventKind == Tr.CLIMATE_REACT.CHANGED ? `${a} changed Climate React` : t.eventKind == Tr.GEOFENCE.EVERYONE_LEFT ? `${a} ${"You"==a?"were":"was"} the last to leave ${t.details.location?t.details.location.name:""}` : t.eventKind == Tr.GEOFENCE.CHANGED ? `${a} changed Geofence behaviour` : t.eventKind == Tr.MOTION.CREATED ? `${a} created Motion configuration` : t.eventKind == Tr.MOTION.CHANGED ? `${a} changed Motion configuration` : t.eventKind == Tr.MOTION.ENABLED_DISABLED ? `${a} turned Motion ${t.details.enabled?"on":"off"}` : t.eventKind == Cr.GEOFENCE.ENTERED || t.eventKind == Cr.GEOFENCE.LEFT ? `You ${t.eventKind==Cr.GEOFENCE.ENTERED?"entered":"left"} ${t.details.location?t.details.location.name:""}` : ""
	// }
}

/**
* @param {SensiboACPlatform} platform
* @param {string} deviceId
* @param {import('../types').AcState} acState
*/
async function setDeviceACState (platform, deviceId, acState) {
	const path = `/pods/${deviceId}/acStates`
	const json = { 'acState': acState }

	return await apiRequest(platform, 'post', path, json)
}

/**
* @param {SensiboACPlatform} platform
* @param {string} deviceId
* @param {boolean} value
*/
async function syncDeviceOnState (platform, deviceId, value) {
	const path = `/pods/${deviceId}/acStates/on`
	const json = {
		'newValue': value,
		'reason': 'StateCorrectionByUser'
	}

	return await apiRequest(platform, 'patch', path, json)
}

/**
* @param {SensiboACPlatform} platform
* @param {string} deviceId
* @param {string} enabled
*/
async function enableDisablePureBoost (platform, deviceId, enabled) {
	const path = `/pods/${deviceId}/pureboost`
	const json = { 'enabled': enabled }

	return await apiRequest(platform, 'put', path, json)
}

/**
* @param {SensiboACPlatform} platform
* @param {string} deviceId
*/
async function resetFilterIndicator (platform, deviceId) {
	const path = `/pods/${deviceId}/cleanFiltersNotification`

	return await apiRequest(platform, 'delete', path)
}

/**
* @param {SensiboACPlatform} platform
* @param {string} deviceId
* @param {import('../types').ClimateReactState} climateReactState
*/
async function setDeviceClimateReactState (platform, deviceId, climateReactState) {
	const path = `/pods/${deviceId}/smartmode`
	const json = climateReactState

	return await apiRequest(platform, 'post', path, json)
}

/**
 * @param {SensiboACPlatform} platform
 */
module.exports = async function (platform) {
	// Pretty sure the below only runs during first load...
	if (platform.apiKey) {
		axios.defaults.params = {
			integration: integrationName,
			apiKey: platform.apiKey
		}
	} else {
		try {
			const token = await getToken(platform)

			axios.defaults.headers.common = { Authorization: 'Bearer ' + token }
			axios.defaults.params = { integration: integrationName }
		} catch (err) {
			platform.log.info('The plugin was NOT able to find a stored token or acquire one from Sensibo\'s API -> it will not be able to set or get the state!!!')
		}
	}
	axios.defaults.baseURL = baseURL

	return {

		/**
		 * @returns {Promise<import('../types').Device[]>}
		 */
		getAllDevices: async function() {
			return await getAllDevices(platform)
		},

		/**
		* @param {string} deviceId
		* @return {Promise<import('../types').Event[]>}
		*/
		getDeviceEvents: async function (deviceId) {
			return await getDeviceEvents(platform, deviceId)
		},

		/**
		* @param {string} deviceId
		* @param {import('../types').AcState} acState
		*/
		setDeviceACState: async function (deviceId, acState) {
			return await setDeviceACState(platform, deviceId, acState)
		},

		/**
		* @param {string} deviceId
		* @param {boolean} value
		*/
		syncDeviceOnState: async function (deviceId, value) {
			return await syncDeviceOnState(platform, deviceId, value)
		},

		/**
		* @param {string} deviceId
		* @param {string} enabled
		*/
		enableDisablePureBoost: async function (deviceId, enabled) {
			return await enableDisablePureBoost(platform, deviceId, enabled)
		},

		/**
		* @param {string} deviceId
		*/
		resetFilterIndicator: async function (deviceId) {
			return await resetFilterIndicator(platform, deviceId)
		},

		/**
		* @param {string} deviceId
		* @param {import('../types').ClimateReactState} climateReactState
		*/
		setDeviceClimateReactState: async function (deviceId, climateReactState) {
			return await setDeviceClimateReactState(platform, deviceId, climateReactState)
		}
	}
}