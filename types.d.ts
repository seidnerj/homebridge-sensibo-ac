export declare type DeviceInfo = {
    id: string,
    productModel: string,
    serial: string,
    manufacturer: string,
    appId: string,
    room: Room,
    temperatureUnit: string,
    filterService: boolean
}

export declare type LocationInfo = {
    id: string,
    name: string,
    serial: string
}

export declare type SensorInfo = {
    id: string,
    productModel: string,
    serial: string
}

export declare type Sensor = {
    id: string,
    productModel: string,
    serial: string,
    measurements?: SensorMeasurements
}

export declare type SensorMeasurements = {
    motion: boolean,
    temperature: number,
    humidity: number,
    batteryVoltage: number
}

export declare type SwingState = {
    horizontalSwing: null|string,
    verticalSwing: null|string
}

export declare type FilterState = {
    filterChange: null|string, 
    filterLifeLevel: null|number
}

export declare type Device = {
    id: string,
    temperatureUnit: string,
    room: Room,
    acState: AcState,
    location: Location,
    productModel: string,
    serial: string
    motionSensors: any[],
    filtersCleaning: FiltersCleaning,
    pureBoostConfig: null|PureBoostConfig,
    homekitSupported: boolean,
    remoteCapabilities: RemoteCapabilities,
    smartMode: SmartMode,
    measurements: Measurements
}

export declare type SmartMode = {
    enabled: boolean,
    type: string,
    deviceUid: string,
    highTemperatureState: SmartModeTempratureState,
    highTemperatureThreshold: number,
    highTemperatureWebhook: null|object,
    lowTemperatureState: SmartModeTempratureState,
    lowTemperatureThreshold: number,
    lowTemperatureWebhook: null|object,
    sync_with_ac_power: boolean
}

export declare type InternalSmartMode = {
    enabled: boolean,
    type?: string,
    highTemperatureState?: InternalSmartModeTempratureState,
    highTemperatureThreshold?: number,
    highTemperatureWebhook?: null|object,
    lowTemperatureState?: InternalSmartModeTempratureState,
    lowTemperatureThreshold?: number,
    lowTemperatureWebhook?: null|object
}

export declare type RemoteCapabilities = {
    modes: {
        cool?: RemoteMode,
        heat?: RemoteMode,
        fan?: RemoteMode,
        dry?: RemoteMode,
        auto?: RemoteMode
    }
}

export declare type RemoteMode = {
    temperatures?: RemoteTemperature,
    fanLevels: string[],
    swing: string[],
    horizontalSwing: string[],
    light: string[]
}

export declare type Capabilities = {
    COOL?: Mode,
    HEAT?: Mode,
    FAN?: Mode,
    DRY?: Mode,
    AUTO?: Mode
}

export declare type Mode = {
    homeKitSupported?: boolean,
    temperatures?: Temperature,
    fanSpeeds?: string[],
    autoFanSpeed?: boolean,
    verticalSwing?: boolean,
    horizontalSwing?: boolean,
    threeDimensionalSwing?: boolean,
    light?: boolean
}

export declare type TemperatureDetails = {
    min: number,
    max: number
}

export declare type Temperature = {
    F?: TemperatureDetails,
    C?: TemperatureDetails
}


export declare type RemoteTemperatureDetails = {
    isNative: boolean,
    values: number[]
}

export declare type RemoteTemperature = {
    F: RemoteTemperatureDetails,
    C: RemoteTemperatureDetails
}

export declare type Room = {
    uid: string,
    name: string,
    icon: string,
    pureBoostConfig: null|PureBoostConfig
}

export declare type FiltersCleaning = {
    acOnSecondsSinceLastFiltersClean: number,
    filtersCleanSecondsThreshold: number,
    lastFiltersCleanTime: Timestamp,
    shouldCleanFilters: boolean
}

export declare type PureBoostConfig = {
    enabled: boolean
}

export declare type Location = {
    occupancy: string,
    name: string,
    id: string

}

export declare type TokenObject = {
    username: string,
    key: string,
    expirationDate: number
}

export declare type SwingModes = {
    swing: string,
    horizontalSwing: string
}

export declare type SmartModeTempratureState = {
    on: boolean,
    light: string,
    temperatureUnit: string,
    fanLevel: string,
    mode: string,
    targetTemperature: number,
    swing: string,
    horizontalSwing: string
}

export declare type InternalSmartModeTempratureState = {
    on: boolean,
    light: string,
    temperatureUnit: string,
    fanSpeed: number,
    mode: string,
    targetTemperature: number,
    swing: string,
    horizontalSwing: string
}

export declare type TemperatureState = {
    on: boolean,
    light: string,
    temperatureUnit: string,
    fanLevel: string,
    mode: string,
    targetTemperature: number
}

export declare type ClimateReactState = {
    enabled: boolean,
    type: string,
    highTemperatureState: TemperatureState,
    highTemperatureThreshold: number,
    highTemperatureWebhook: null|object,
    lowTemperatureState: TemperatureState
    lowTemperatureThreshold: number,
    lowTemperatureWebhook: null|object
}

export declare type UserDetails = {
    email: string,
    firstName: string,
    lastName: string
}

export declare type FullUserDetails = {
    username: string,
    email: string,
    firstName: string,
    lastName: string,
    temperatureUnit: string,
    appRegistrationSource: string,
    organization: null|string,
    availableOrganizations: string[]
}    

export declare type AcState = {
    on: boolean,
    targetTemperature: number,
    temperatureUnit: string,
    mode: string,
    fanLevel?: string,
    swing?: string,
    horizontalSwing?: string,
    light?: string
    swingModes?: SwingModes,
    timestamp?: Timestamp
}

export declare type Timestamp = {
    time: string,
    secondsAgo: number
}

export declare type Event = {
    objectId: string,
    objectKind: string,
    timestamp: string,
    eventKind: number,
    details: EventDetails
}

export declare type EventDetails = {
        user: UserDetails,
        acState: AcState,
        resultingAcState: AcState,
        causedByUser: FullUserDetails,
        reason: string,
        changedProperties: string[],
        status: string,
        thirdPartyReason: null|object,
        measurements: EventMeasurements,
        weather: null|object
}

export declare type EventMeasurements = {
    temperature: number,
    humidity: number,
    roomIsOccupied: null|boolean,
    name: string    
}    

export declare type Measurements = {
    timestamp: Timestamp
    temperature: number,
    humidity: number,
    feelsLike?: number
    rssi?: number,
    motion: boolean,
    roomIsOccupied?: null|boolean,
    name?: string
    co2?: number,
    pm25?: number,
    tvoc?: number  
}