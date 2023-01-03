# homebridge-sensibo-ac

<img src="branding/sensibo_homebridge.png" width="500px">

[![Downloads](https://img.shields.io/npm/dt/homebridge-sensibo-ac.svg?color=critical)](https://www.npmjs.com/package/homebridge-sensibo-ac) [![Version](https://img.shields.io/npm/v/homebridge-sensibo-ac)](https://www.npmjs.com/package/homebridge-sensibo-ac)

[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins) [![Homebridge Discord](https://img.shields.io/discord/432663330281226270?color=728ED5&logo=discord&label=discord)](https://discord.gg/yguuVAX)

[![certified-hoobs-plugin](https://badgen.net/badge/HOOBS/Certified/yellow)](https://plugins.hoobs.org?ref=10876) [![hoobs-support](https://badgen.net/badge/HOOBS/Support/yellow)](https://support.hoobs.org?ref=10876)

[Homebridge](https://github.com/homebridge/homebridge) plugin for Sensibo - Smart AC Controller and Air Purifier

<img src="branding/products.jpg" width="500px">

## Requirements

![Version](https://img.shields.io/badge/node-%3E%3D10.17-brightgreen)
![Version](https://img.shields.io/badge/homebridge-%3E%3D0.4.4-brightgreen)
![Version](https://img.shields.io/badge/iOS-%3E%3D11.0.0-brightgreen)

Check with: `node -v` & `homebridge -V` and update if needed

## Plugin Unique Features

- Login with **username & password** or **API-key**
- **Sensibo Sky Support**
- **Sensibo Air Support** including the attached **Room Sensors**
- **Sensibo Air Plus Support** including air quality and CO2
- **Pure Support (Air Purifier)** control, including fan speed and boost control, via a separate accessory
- **Auto Detect Configurations** - Automatically detect all your devices and their capabilities and opens up only the options available in Sensibo app to be controlled in HomeKit. More details below
- Accessory type **HeaterCooler** - allowing adjusting fan speed (Rotation Speed) & swing (Oscillate) from within the accessory in "Home" App
- **Fan Mode** control, including fan speed and swing control, via a separate accessory
- **Dry Mode** control, including fan speed and swing control, via a separate accessory
- **Horizontal Swing** - allows you to enable/disable horizontal swing of your AC
- **Vertical Swing** - allows you to enable/disable vertical swing of your AC
- **AC Sync Button** - easily toggle the state of the AC between ON/OFF in case your AC is out of sync with HomeKit (does not send commands to the AC)
- **Occupancy Sensor** - get the Home/Away status from Sensibo API to HomeKit via Occupancy sensor
- **Enable/Disable Climate React** - enable/disable Climate React. Note it is currently not possible to change settings, on/off only
- **Filter Cleaning Indication** - if available in your Sensibo account (via Plus etc), a HomeKit representation of the Filter status will appear in Home app accessories
- **History Storage** - toggle on storing of temperature and humidity measurements and will present them in Eve app as a graph

## Installation

This plugin is Homebridge verified and HOOBS certified and can be easily installed and configured through their UI.

If you don't use Homebridge UI or HOOBS, or if you want to know more about the plugin features and options, keep reading...

1. Install homebridge using: `sudo npm install -g homebridge --unsafe-perm`
2. Install this plugin using: `sudo npm install -g homebridge-sensibo-ac`
3. Update your configuration file. See `config-sample.json` in this repository for a sample.

\* install from git: `sudo npm install -g git+https://github.com/nitaybz/homebridge-sensibo-ac.git`

### Config file

#### Easy config (required)

```json
"platforms": [
    {
        "platform": "SensiboAC",
        "username": "******@*******.***",
        "password": "*******"
    }
]
```

#### Advanced config (optional)

```json
"platforms": [
    {
        "platform": "SensiboAC",
        "apiKey": "***************",
        "allowRepeatedCommands": false,
        "disableAirQuality": false,
        "disableCarbonDioxide": false,
        "disableDry": false,
        "disableFan": false,
        "disableHumidity": false,
        "disableHorizontalSwing": false,
        "disableVerticalSwing": false,
        "disableLightSwitch": false,
        "enableClimateReactSwitch": true,
        "enableHistoryStorage": true,
        "enableOccupancySensor": true,
        "enableSyncButton": true,
        "syncButtonInAccessory": false,
        "externalHumiditySensor": false,
        "devicesToExclude": [],
        "ignoreHomeKitDevices": false,
        "locationsToInclude": [],
        "debug": false
    }
]
```

### Configurations Table

*advanced details below

|          Parameter         |                       Description                                | Required |  Default |   type   |
| -------------------------- | ---------------------------------------------------------------- |:--------:|:--------:|:--------:|
| `platform`                 |  always "SensiboAC"                                              |     ✓    |     -    |  String  |
| `username`                 |  Your Sensibo account username/email                             |     ✓    |     -    |  String  |
| `password`                 |  Your Sensibo account password                                   |     ✓    |     -    |  String  |
| `apiKey`                   |  Your Sensibo account API key (can be used instead of username/password)    |          |     -    |  String  |
| `allowRepeatedCommands`    |  Allow the plugin to send the same state command again           |          |  `false` |  Boolean |
| `disableAirQuality`        |  When set to `true`, will remove Air Quality readings            |          |  `false` |  Boolean |
| `disableCarbonDioxide`     |  When set to `true`, will remove Carbon Dioxide readings and warnings       |          |  `false` |  Boolean |
| `disableDry`               |  When set to `true`, it will disable the DRY accessory           |          |  `false` |  Boolean |
| `disableFan`               |  When set to `true`, it will disable the FAN accessory           |          |  `false` |  Boolean |
| `disableHumidity`          |  When set to `true`, will remove Humidity readings               |          |  `false` |  Boolean |
| `disableLightSwitch`       |  Disable the Light service to control the AC Light (via extra light bulb)   |          |  `false` |  Boolean |
| `disableHorizontalSwing`   |  Disable horizontal swing control (via extra switch)             |          |  `false` |  Boolean |
| `disableVerticalSwing`     |  Disable Vertical swing control (removes option from accessory)  |          |  `false` |  Boolean |
| `enableClimateReactSwitch` |  Adding a switch to quickly enable/disable climate react.        |          |  `false` |  Boolean |
| `enableHistoryStorage`     |  When set to `true`, all measurements (temperature & humidity) will be saved and viewable from the Eve app  |         |  `false` |   Boolean |
| `enableOccupancySensor`    |  Adds an occupancy sensor to represent the state of someone at home         |          |  `false` |  Boolean  |
| `enableSyncButton`         |  Adding a switch to quickly toggle the state of the AC without sending commands to the AC.   |          |  `false` |  Boolean  |
| `syncButtonInAccessory`    |  When set to `true`, it will remove the extra AC Sync switch if it exists and will show \"AC Sync Button\" attached as a service to the Same AC Accessory (works only when `enableSyncButton` is set to true)   |          |  `false` |  Boolean  |
| `externalHumiditySensor`   |  Creates an additional Humidity sensor accessory                 |          |  `false` |  Boolean |
| `devicesToExclude`         |  Add devices identifier (room name, ID from logs or serial from Home app) to exclude from homebridge        |          |  - |  String[]  |
| `ignoreHomeKitDevices`     |  Automatically ignore, skip or remove HomeKit supported devices  |          |  `false` |  Boolean |
| `locationsToInclude`       |  Device location IDs or names to include when discovering Sensibo devices (leave empty for all locations)        |          |  - |  String[]  |
| `debug`                    |  When set to `true`, the plugin will produce extra logs for debugging purposes         |          |  `false` |  Boolean  |

## Advanced Control

### Auto Detect Configurations

The plugin will scan for all your devices and retrieve each device capabilities separately. Therefore in HomeKit you will see only the things that the Sensibo app allows you to control, based on your AC units remote capabilities.

In practice:

- Minimum and Maximum temperatures are taken from Sensibo API
- Temperature unit (Celsius/Fahrenheit) is taken from Sensibo API
- "AUTO" mode is available in the AC states in HomeKit only if it is available in Sensibo app
- Modes "FAN" and "DRY" (dehumidifier) will create their own accessories only if you have this ability inside Sensibo app
- Fan Speed ("Rotation Speed" in Home app) and Vertical Swing ("Oscillate" in Home app) will show in the accessory settings, but only if you have this capability in Sensibo app
- Horizontal Swing capability in Sensibo app will show up as a normal switch in HomeKit (because there is no other way to control horizontal swing at the moment)
- **NEW!** use `"ignoreHomeKitDevices": true` to automatically ignore, skip or remove HomeKit supported devices like Sensibo Air and Sensibo Pure.

### State Polling

The accessory state will be updated in the background every 90 seconds, this is hard coded and requested specifically by Sensibo company.
The state will also refresh every time you open the "Home" app or any related HomeKit app.

### Fan Mode

If your Sensibo app can control your AC **FAN** mode, this plugin will create extra fan accessory in HomeKit to control the FAN mode of your device. It will also include all the fan speeds and swing possibilities you have for FAN mode.

To disable the extra fan accessory, add `"disableFan": true` to your config.

### Dry Mode

If your Sensibo app can control your AC **DRY** mode, the plugin will create extra dehumidifier accessory in HomeKit to control the DRY mode of your device. It will also include all the fan speeds and swing possibilities you have for DRY mode.

To disable the extra dehumidifier accessory, add `"disableDry": true` to your config.

### Horizontal Swing

If your Sensibo app has **Horizontal Swing** control, the plugin will create an extra switch accessory in HomeKit to control it.

To disable the extra horizontal swing switch accessory, add `"disableHorizontalSwing": true` to your config.

### Vertical Swing

If your Sensibo app has **Vertical Swing** control, the plugin will add a switch to the existing AC accessory in HomeKit to control it.

To disable the extra vertical swing (oscillate) switch, add `"disableVerticalSwing": true` to your config.

### AC Sync Button

- Does Sensibo shows your AC is ON while it's actually OFF?
- Does your sensibo state get out of sync with your AC?
- Do you find yourself changing commands from the original remote just for the AC and Sensibo to be in sync?

If you have ever found yourself struggling with the above, this feature is exactly for you!

It allows you to quickly toggle the state in Sensibo and Home app without changing the real state of your device, this will help you to quickly sync between them.

When enabled, this feature creates a new switch accessory in HomeKit. The new switch is stateless, which means that when clicked, it turns back OFF after 1 second. behind the scenes, the plugin changes the state of the device from ON to OFF or the other way around, depends on the current state of the device. all of that, without sending actual commands to the AC! so you can relax while you test this button :)

\* *This can be required if your AC has the same command for ON and OFF because it can go out of sync easily.*

To enable the extra **AC Sync** switch, add `"enableSyncButton": true` to your config.

To attach the **AC Sync** switch as a service within the AC accessory, instead of a separate switch, add `"syncButtonInAccessory": true` to your config.

### Occupancy Sensor

Enabling this feature will add **Occupancy Sensor** to HomeKit, representing the Home/Away state of the geofence feature in Sensibo app.

\* Geofencing must be enabled in Sensibo app for it to work

To enable the extra **Occupancy Sensor**, add `"enableOccupancySensor": true` to your config.

### Climate React

When enabled, this feature creates a new switch accessory in HomeKit. The new switch can quickly enable or disable the state of the "Climate React" you've set in Sensibo app.

Use this feature in conjunction with the occupancy sensor and you'll be able to get the "Sensibo Plus" feature that allows turning it on/off according to your geolocation.

\* This feature does not allow changing the actual logic of the "Climate React", only enable or disable it. Therefore, it will not work if the "Climate React" was not set up in Sensibo app first.

To enable the extra **Climate React** switch, add `"enableClimateReactSwitch": true` to your config.

### Filter Cleaning Indication

If you have the Filter Cleaning notifications feature in Sensibo (from Sensibo "Plus" subscription or via old account) it will appear in the AC settings in HomeKit in this form:

1. **Filer Life Level** - Relative (0-100%) representation of the filter life level. calculated from the last time it was cleaned until the next time it should be clean
2. **Filter Change Indication** - Boolean state represent whether the filter should be cleaned or not (based on usage time).
3. **Reset Filter Indication** - Stateless button appears only in Eve app that resets the counter of the filter life. normally you would click this button right after you cleaned the filters.

### History Storage

Enabling this feature will keep all measurements of temperature and humidity and will store them. Then, all the historic data will be viewable in Eve app under the accessory in a nice graph.

To enable the **history storage** feature, add `"enableHistoryStorage": true` to your config.

### Fan speeds & "AUTO" speed

Fan speed steps are determined by the steps you have available in the Sensibo app. Since HomeKit control over fan speed is with a slider between 0-100, the plugin converts the steps you have in the Sensibo app to values between 1 to 100, when 100 is highest and 1 is lowest. if "AUTO" speed is available in your setup, setting the fan speed to 0, should actually set it to "AUTO" speed.

### Issues & Debug

If you experience any issues with the plugins please refer to the [Issues](https://github.com/nitaybz/homebridge-sensibo-ac/issues) tab or [Sensibo-AC Discord channel](https://discord.gg/yguuVAX) and check if your issue is already described there, if it doesn't, please create a new issue with as much detailed information as you can give (logs are crucial).

If you want to even speed up the process, you can add `"debug": true` to your config, which will give me more details on the logs and speed up fixing the issue.

## Special Thanks

Great thanks to Sensibo company and especially Omer Enbar, their CEO & CO-Founder, which helped me tremendously understanding their best practice, limitation, needs and extra *undocumented* features.

## Support homebridge-sensibo-ac

**homebridge-sensibo-ac** is a free plugin under the GNU license. it was developed as a contribution to the homebridge/hoobs community with lots of love and thoughts.

Creating and maintaining Homebridge plugins consume a lot of time and effort and if you would like to share your appreciation, feel free to "Star" or donate.

[![Downloads](https://img.shields.io/npm/dt/homebridge-sensibo-ac.svg?color=critical)](https://www.npmjs.com/package/homebridge-sensibo-ac)

[![Downloads](https://img.shields.io/badge/PayPal-Donate-blue.svg?logo=paypal)](https://www.paypal.me/nitaybz) [![Downloads](https://img.shields.io/badge/PATREON-Become%20a%20patron-red.svg?logo=patreon)](https://www.patreon.com/nitaybz) [![Downloads](https://img.shields.io/badge/Ko--Fi-Buy%20me%20a%20coffee-29abe0.svg?logo=ko-fi)](https://ko-fi.com/nitaybz)
