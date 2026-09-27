// Shapes of the Sensibo API responses and of the plugin's own state, for JSDoc type checking (see tsconfig.json).
// Nothing here exists at runtime.

// ~~~~~~~~~~~~~~~~~~~~~ Sensibo API ~~~~~~~~~~~~~~~~~~~~~ //

export declare type Timestamp = {
	time: string,
	secondsAgo: number
}

export declare type Room = {
	uid?: string,
	name: string,
	icon?: string
}

export declare type Location = {
	id: string,
	name: string,
	occupancy?: string
}

export declare type FiltersCleaning = {
	acOnSecondsSinceLastFiltersClean: number,
	filtersCleanSecondsThreshold: number,
	lastFiltersCleanTime?: Timestamp,
	shouldCleanFilters: boolean
}

export declare type PureBoostConfig = {
	enabled: boolean
}

export declare type AcState = {
	on: boolean,
	mode: string,
	targetTemperature?: number,
	temperatureUnit?: string,
	fanLevel?: string,
	swing?: string,
	horizontalSwing?: string,
	light?: string,
	timestamp?: Timestamp
}

export declare type Measurements = {
	time?: Timestamp,
	temperature?: number,
	humidity?: number,
	feelsLike?: number,
	rssi?: number,
	motion?: boolean,
	roomIsOccupied?: null|boolean,
	co2?: number,
	pm25?: number,
	tvoc?: number,
	iaq?: number,
	etoh?: number
}

export declare type SensorMeasurements = {
	motion: boolean,
	temperature: number,
	humidity: number,
	batteryVoltage?: number
}

export declare type MotionSensor = {
	id: string,
	productModel: string,
	serial: string,
	measurements?: SensorMeasurements
}

/** One Climate React side (above the high threshold or below the low one), in the device's temperature unit */
export declare type ClimateReactTemperatureState = {
	on: boolean,
	mode: string,
	targetTemperature?: number,
	temperatureUnit?: string,
	fanLevel?: string,
	swing?: string,
	horizontalSwing?: string,
	light?: string
}

/** Climate React ("smart mode") as Sensibo returns and accepts it; getAllDevices fills in { enabled: false } when missing */
export declare type ClimateReactState = {
	enabled: boolean,
	type?: string,
	highTemperatureState?: ClimateReactTemperatureState,
	highTemperatureThreshold?: number,
	highTemperatureWebhook?: null|string,
	lowTemperatureState?: ClimateReactTemperatureState,
	lowTemperatureThreshold?: number,
	lowTemperatureWebhook?: null|string
}

export declare type RemoteTemperatureValues = {
	isNative: boolean,
	values: number[]
}

export declare type RemoteMode = {
	temperatures?: {
		C?: RemoteTemperatureValues,
		F?: RemoteTemperatureValues
	},
	fanLevels?: string[],
	swing?: string[],
	horizontalSwing?: string[],
	light?: string[]
}

export declare type RemoteCapabilities = {
	modes: { [mode: string]: RemoteMode }
}

/** A device (pod) as getAllDevices returns it */
export declare type Device = {
	id: string,
	productModel: string,
	serial: string,
	temperatureUnit?: string,
	room: Room,
	location: Location,
	acState: AcState,
	measurements: Measurements,
	smartMode: ClimateReactState,
	motionSensors?: MotionSensor[],
	filtersCleaning?: FiltersCleaning,
	pureBoostConfig?: null|PureBoostConfig,
	homekitSupported?: boolean,
	remoteCapabilities?: RemoteCapabilities
}

/** An entry of getDeviceEvents; timestamp is UTC, e.g. "2024-05-26T22:41:28Z" */
export declare type Event = {
	eventKind: number,
	timestamp: string,
	details?: {
		reason?: string,
		acState?: AcState,
		resultingAcState?: AcState,
		changedProperties?: string[]
	}
}

export declare type HistoricalMeasurements = {
	temperature: { time: string, value: number }[],
	humidity: { time: string, value: number }[]
}

export declare type Token = {
	username: string,
	key: string,
	expirationDate: number
}

// ~~~~~~~~~~~~~~~~~~~~~ Plugin state ~~~~~~~~~~~~~~~~~~~~~ //

export declare type TemperatureRange = {
	min: number,
	max: number
}

/** What a mode supports, see Utils.airConditionerCapabilities */
export declare type ModeCapabilities = {
	homeKitSupported?: boolean,
	temperatures?: {
		C?: TemperatureRange,
		F?: TemperatureRange
	},
	fanSpeeds?: string[],
	autoFanSpeed?: boolean,
	verticalSwing?: boolean,
	horizontalSwing?: boolean,
	threeDimensionalSwing?: boolean,
	light?: boolean
}

/** Keyed by upper-case mode: COOL, HEAT, AUTO, FAN, DRY */
export declare type Capabilities = { [mode: string]: ModeCapabilities }

/**
 * AC or Pure state, see Utils.airConditionerStateFromDevice and airPurifierStateFromDevice. Temperatures are in C.
 * A Pure has no temperatures, humidity or Climate React. Wrapped in the StateHandler Proxy on the accessory.
 */
export declare type AcStateInternal = {
	active: boolean,
	mode: string,
	targetTemperature?: null|number,
	currentTemperature?: number,
	relativeHumidity?: number,
	smartMode?: ClimateReactState,
	pureBoost?: boolean,
	light?: boolean,
	filterChange?: 'CHANGE_FILTER'|'FILTER_OK',
	filterLifeLevel?: number,
	horizontalSwing: 'SWING_ENABLED'|'SWING_DISABLED',
	verticalSwing: 'SWING_ENABLED'|'SWING_DISABLED',
	fanSpeed?: number
}

/** See Utils.airQualityStateFromDeviceMeasurements; empty without measurements */
export declare type AirQualityStateInternal = {
	airQuality?: number,
	VOCDensity?: number,
	carbonDioxideDetected?: number,
	carbonDioxideLevel?: number,
	PM2_5Density?: number,
	currentTemperature?: number
}

/** See Utils.sensorStateFromSensorMeasurements */
export declare type SensorStateInternal = {
	motionDetected: boolean,
	currentTemperature: number,
	relativeHumidity: number,
	lowBattery: 'BATTERY_LEVEL_LOW'|'BATTERY_LEVEL_NORMAL'
}

/** See Utils.occupancyStateFromDeviceLocation */
export declare type OccupancyStateInternal = {
	occupancy: 'OCCUPANCY_DETECTED'|'OCCUPANCY_NOT_DETECTED'
}

/** Climate React as auto, per AC; persisted with the rest of the cached state */
export declare type AutoClimateReactState = {
	/** HeaterCooler switched on in COOL/HEAT/AUTO (the AC itself may be off while Climate React holds it) */
	active: boolean,
	auto: boolean,
	/** 'COOL', 'HEAT', or null while still observing the room's drift */
	direction: null|string,
	coolTo: number,
	heatTo: number
}

/** What the platform keeps in node-persist under 'state' */
export declare type PlatformState = {
	devices: { [id: string]: AcStateInternal },
	airQuality: { [id: string]: AirQualityStateInternal },
	sensors: { [id: string]: SensorStateInternal },
	occupancy: { [id: string]: OccupancyStateInternal },
	autoClimateReact?: { [id: string]: AutoClimateReactState }
}

declare module 'axios' {
	interface InternalAxiosRequestConfig {
		/** Number of automatic retries already performed for this request (see sensibo/SensiboAPI.js) */
		retryCount?: number
	}
}
