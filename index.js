'use strict'


/**
 * Modules
 * Node
 * @constant
 */
const fs = require('fs-extra')
const os = require('os')
const path = require('path')
const util = require('util')

/**
 * Modules
 * External
 * @constant
 */
const _ = require('lodash')
const Appdirectory = require('appdirectory')
const chalk = require('chalk')
const { GetElectronProcessType } = require('electron-process-type/lib/v3')
const isDebug = require('@bengennaria/is-env')('debug')
const isNolog = require('@bengennaria/is-env')('nolog')
const moment = require('moment')
const present = require('present')
const readPkgUp = require('read-pkg-up')
const rootPath = require('root-path')

/**
 * Base Directory & package.json of this module (@bengennaria/logger)
 * @constant
 */
const thisModuleDirectory = __filename
const thisModulePackageJson = readPkgUp.sync({ cwd: thisModuleDirectory }).packageJson
const thisModulePackageName = thisModulePackageJson.name

/**
 * Base Directory & package.json of top-level module (at root level of filesystem tree)
 * @constant
 */
const toplevelModuleDirectory = rootPath()
const toplevelModulePackageJson = readPkgUp.sync({ cwd: toplevelModuleDirectory }).packageJson
const toplevelModulePackageName = toplevelModulePackageJson.name

/**
 * Logfile location
 * @constant
 */
const logfileLabel = toplevelModulePackageJson.productName || toplevelModulePackageJson.name
const logfilePath = path.join((new Appdirectory(logfileLabel)).userLogs(), `${logfileLabel}.log`)


/**
 * Default Options for Logger Instance
 * @type {LoggerOptions}
 * @default
 */
const defaultLoggerOptions = {
    write: false,
    timestamp: true,
    namespace: '',
    logfile: logfilePath
}

/**
 * @typedef {function} LogMethod
 * @param {...*} Log message
 */

/**
 * @typedef {Object} LoggerInstance
 * @property {LogMethod} warn
 * @property {LogMethod} debug
 * @property {LogMethod} log
 * @property {LogMethod} error
 * @property {LogMethod} info
 * @property {function} getConfiguration
 * @property {function} setConfiguration
 */

/**
 * @typedef {Object} LoggerOptions
 * @property {Boolean} write
 * @property {Boolean} timestamp
 * @property {String} namespace
 * @property {String} logfile
 */


/**
 * Log Context Type
 * @constant
 */
const contextType = GetElectronProcessType()
const isBrowserContext = Boolean(contextType === 'browser')


/**
 * @constant
 * @default
 */
const colorDictionary = {
    debug: 'cyan',
    log: 'cyan',
    info: 'magenta',
    warn: 'yellow',
    error: 'red'
}

/**
 * @constant
 * @default
 */
let loglevelRgbDictionary = {
    debug: [ 100, 100, 100 ],
    log: [ 0, 128, 255 ],
    info: [ 255, 100, 150 ],
    warn: [ 200, 100, 30 ],
    error: [ 230, 70, 50 ]
}

/**
 * @constant
 * @default
 */
const loglevelEmojiDictionary = {
    debug: '🔧',
    log: '📝',
    info: 'ℹ️ ',
    warn: '⚠️ ',
    error: '🚨'
}


/**
 * Get Timestamp for Logfile
 * @returns {String} - Timestamp
 * @private
 */
let getCurrentTimestamp = () => moment().format('YYYY-DD-MM HH:mm:ss')

/**
 * Initial Log Timestamp
 * @returns {String} - Timestamp
 * @private
 */
let initialTimestamp = null

/**
 * Append Message to Logfile
 * @param {String=} message - Log Message
 * @private
 */
let writeMessageToFile = function(message = '') {
    // console.debug('appendMessageToFile', 'message', message)

    // Get this Logger instances' configuration
    const configuration = module.exports.configuration
    const logfile = configuration.logfile

    // Test if should write to file
    if (!configuration.write || isNolog) { return }

    // Ensure Log Directory exists
    fs.mkdirp(path.dirname(logfile), (error) => {
        if (error) {
            console.error('logger', 'appendMessageToFile', 'fs.mkdirp', error)
            return
        }

        // Create Stream
        const stream = fs.createWriteStream(logfile, { flags: 'a' })

        // Split message into lines
        message.split(os.EOL).forEach((line) => {
            // Write to stream
            stream.write(`[${getCurrentTimestamp()}] ${line}${os.EOL}`)
        })

        // Close Stream
        stream.end()
    })
}

/**
 * Append Header to Logfile
 * @private
 */
let writeHeaderToFile = () => {
    writeMessageToFile(`${os.EOL}LOG STARTED (${getCurrentTimestamp()})${os.EOL}${'▔'.repeat(80)}`)
}


/**
 * Create a formatted Log Message
 * @class LoggerMessage
 * @property {String} loglevel - Format Loglevel
 * @property {String} emoji - Format Emoji Format
 * @property {String} rgb - Format Color
 * @property {Chalk} chalkstyle - Format Style
 *
 * @property {String} title - Message Title
 * @property {String} body - Message Body
 *
 * @property {Number} thread - Log Timestamp
 * @property {Number} thread - Log Thread
 * @property {String} namespace - Log Namespace
 */
class LoggerMessage {
    /**
     * @param {string} loglevel - Type
     * @param {array} message - Message
     * @constructor
     */
    constructor(loglevel, message) {
        // console.debug('constructor')

        /**
         * Formatting
         */
        this.loglevel = _.toUpper(loglevel)
        this.emoji = loglevelEmojiDictionary[loglevel]
        this.rgb = loglevelRgbDictionary[loglevel].join()
        this.chalkstyle = chalk[colorDictionary[loglevel]]

        /**
         * Message Namespace
         */
        // Get this Logger instances' configuration, namespace
        const configuration = module.exports.configuration
        this.namespace = configuration.namespace

        /**
         * Message Thread
         */
        // Get other Logger instances' configurations, namespaces
        const allConfigurations = Array.from(global[thisModulePackageName].configurations.values())
        const namespacesList = _.map(allConfigurations, 'namespace')

        // Calculate message "threads": Consecutive messages from same namespace.
        // This enables alternating logs after a namespace change.
        const namespaceIndex = namespacesList.indexOf(this.namespace)
        this.thread = namespaceIndex & 1

        const indent = !isBrowserContext ? (`i [${this.namespace}] `).length : (`i  [${this.namespace}]  `).length

        /**
         * Message Title & Message Body
         */
        // Formatting & massage JavaScript entities for log string output
        for (let index in message) {
            if (message.hasOwnProperty(index)) {
                if (_.isObjectLike(message[index])) {
                    if (_.isArray(message[index])) {
                        message[index]
                            = os.EOL + ' '.repeat(indent) + '[' + os.EOL + ' '.repeat(indent + 2) + message[index].join(',' + os.EOL + ' '.repeat(indent + 2)) + os.EOL + ' '.repeat(indent) + ']'
                    } else {
                        message[index] = os.EOL + util.inspect(message[index], {
                            depth: null, showProxy: true, showHidden: true
                        })
                        message[index] = message[index].replace(new RegExp(os.EOL, 'gi'), `${os.EOL}${' '.repeat(indent)}`)
                    }

                    message[index - 1] = `${message[index - 1]}`
                }
            }
        }

        // If there are more than 1 segments to the message, use the first as the message "title"
        if (message.length > 1) {
            this.title = message[0]
            message.shift()
        }

        // Concatenate the rest of the message
        this.body = message.join(' ')

        // if there's no title, remove body
        if (!this.title) { this.title = this.body }

        // consolidate title, body
        if (this.title === this.body) { this.body = '' }

        /**
         * Message Timestamp
         */
        if (configuration.timestamp) {
            if (!initialTimestamp) { initialTimestamp = present() }
            this.timestamp = `${(present() - initialTimestamp).toFixed(4)} ms`
            initialTimestamp = present()
        } else {
            this.timestamp = ''
        }
    }
}

/**
 * Print to Browser Developer Console
 * @param {String} loglevel - Loglevel
 * @param {Array} message - Message
 * @private
 */
let printToBrowserConsole = function(loglevel, message) {
    if (message.length === 0) { return }

    const loggerMessage = new LoggerMessage(loglevel, message)

    console.log(
        `%s %c %s | %c %c%s%c %c%s%c %s`,
        loggerMessage.emoji,
        `background-color: rgba(${loggerMessage.rgb}, 0.2); color: rgba(${loggerMessage.rgb}, 0.8); padding: 0 0px; font-weight: normal`,
        loggerMessage.namespace,
        '',
        `background-color: rgba(${loggerMessage.rgb}, 0.0); color: rgba(${loggerMessage.rgb}, 1.0); padding: 0 0px; font-weight: bold`,
        loggerMessage.title,
        '',
        `background-color: rgba(${loggerMessage.rgb}, 0.1); color: rgba(${loggerMessage.rgb}, 1.0); padding: 0 0px; font-weight: normal`,
        loggerMessage.body,
        `background-color: rgba(${loggerMessage.rgb}, 0.0); color: rgba(${loggerMessage.rgb}, 0.5); padding: 0 0px; font-weight: normal`,
        loggerMessage.timestamp
    )

    writeMessageToFile(util.format(
        '[%s] [%s] [%s] %s %s',
        loggerMessage.loglevel, _.startCase(contextType), loggerMessage.namespace, loggerMessage.title, loggerMessage.body
    ))
}

/**
 * Print to TTY / Terminal
 * @param {String} loglevel - Loglevel
 * @param {Array} message - Message
 * @private
 */
let printToTty = function(loglevel, message) {
    if (message.length === 0) { return }

    const loggerMessage = new LoggerMessage(loglevel, message)

    console.log(util.format(
        `%s %s | %s %s %s`,
        loggerMessage.emoji,
        loggerMessage.thread ? loggerMessage.chalkstyle(loggerMessage.namespace) : loggerMessage.chalkstyle.underline(loggerMessage.namespace),
        loggerMessage.chalkstyle.bold(loggerMessage.title),
        loggerMessage.chalkstyle(loggerMessage.body),
        loggerMessage.timestamp
    ))

    writeMessageToFile(util.format(
        '[%s] [%s] [%s] %s %s',
        loggerMessage.loglevel, _.startCase(contextType), loggerMessage.namespace, loggerMessage.title, loggerMessage.body
    ))
}

/**
 * Unified print interface (context-aware binding of correct method at require-time)
 * @private
 */
let printToAny = contextType === 'browser' ? printToBrowserConsole.bind(console) : printToTty


/**
 * Get logger instance configuration
 * @returns {String} - Timestamp
 * @private
 */
let getConfiguration = () => module.exports.configuration

/**
 * Set logger instance configuration
 * @param {LoggerOptions=} options - Logger Options
 * @returns {*} - Timestamp
 * @private
 */
let setConfiguration = options => module.exports.configuration = _.defaultsDeep(options, module.exports.configuration)


/**
 * Exported Logger Instance
 * @type {LoggerInstance}
 */
let loggerInstance = {
    debug: function() { if (isDebug) { printToAny('debug', Array.from(arguments)) } },
    log: function() { printToAny('log', Array.from(arguments)) },
    info: function() { printToAny('info', Array.from(arguments)) },
    warn: function() { printToAny('warn', Array.from(arguments)) },
    error: function() { printToAny('error', Array.from(arguments)) },
    getConfiguration: getConfiguration,
    setConfiguration: setConfiguration
}


/**
 * @module Logger
 * @param {LoggerOptions} options - Options
 * @returns {LoggerInstance}
 */
module.exports = (options = {}) => {
    // Merge in default options
    const configuration = _.defaultsDeep(options, defaultLoggerOptions)

    /**
     * Get root (origin) module data
     */
    //const rootModuleBasePath = toplevelModuleDirectory
    // const rootModuleName = toplevelModulePackageName

    /**
     * Get requiring modules' name
     */
    const requiringModuleFilePath = module.parent && module.parent.filename ? module.parent.filename : module.filename
    const requiringModuleFileName = path.basename(requiringModuleFilePath)
    const requiringModuleDirectory = path.dirname(readPkgUp.sync({ cwd: requiringModuleFilePath }).path)
    const requiringModuleName = readPkgUp.sync({ cwd: requiringModuleFilePath }).packageJson.name

    /**
     * Decision algorithm for the type of the requiring module – the 2 types are (either, or):
     * LOCAL Module: within the top-level module path, required via filename, e.g. require('src/app.js')
     * THIRD-PARTY Module: external, required via module name, e.g. require('lodash')
     */

    // Assume LOCAL MODULE as the default
    let isLocalModule = true

    // Compare root directories of top-level module and requiring module:
    // If the requiring modules' base directory is NOT identical to root
    // modules' base directory, the requiring module is a THIRD-PARTY Module.
    if (requiringModuleDirectory !== toplevelModuleDirectory) {
        isLocalModule = false
    }

    /**
     * Setup namespace for this configuration, depending on the requiring module type
     * @example LOCAL Module:           "my-app|…/scripts/main.js"
     * @example THIRD-PARTY Module:     "my-app|lodash"
     */

    // Format LOCAL Module Namespace (default)
    configuration.namespace = `${toplevelModulePackageName}|…/${requiringModuleFileName}`

    // Format THIRD-PARTY Module Namespace
    if (!isLocalModule) {
        configuration.namespace = `${toplevelModulePackageName}|${requiringModuleName}`
    }

    // Attach configuration as property 'configuration' to module.exports
    // This lets each required instance access its configuration directly
    module.exports.configuration = configuration

    // Check if 'global[@bengennaria/logger]' exists
    if (!global[thisModulePackageName]) {
        // Create object at key 'global[@bengennaria/logger]'
        global[thisModulePackageName] = {}
        // Create HashMap at key 'global[@bengennaria/logger].configurations'
        global[thisModulePackageName].configurations = new Map()
    }

    // First required Logger instance: Add new header to Logfile
    if (global[thisModulePackageName].configurations.size === 1) {
        writeHeaderToFile()
    }

    // Add configuration with filename as key to global[packageName].configurations
    global[thisModulePackageName].configurations.set(requiringModuleFilePath, module.exports.configuration)

    // This prevents '@bengennaria/logger' from being added to the 'require.cache' object after having been required.
    // This enables automatic log message prefixes, depending from where a logging method was called.
    delete require.cache[__filename]

    // DEBUG
    // console.debug('module.exports', '-------')
    // console.debug('module.exports', 'toplevelModulePackageName', toplevelModulePackageName)
    // console.debug('module.exports', 'requiringModuleName', requiringModuleName)
    // console.debug('module.exports', 'requiringModuleFileName', requiringModuleFileName)
    // console.debug('module.exports', 'configuration.namespace', configuration.namespace)
    // console.debug('module.exports', 'isLocalModule', isLocalModule)


    // Return
    return loggerInstance
}
