import SensiboACPlatform from './sensibo/SensiboACPlatform.js'

import pjson from './package.json' with { type: 'json' }

export default api => {
	api.registerPlatform(pjson.config.pluginName, pjson.config.platformName, SensiboACPlatform)
}
