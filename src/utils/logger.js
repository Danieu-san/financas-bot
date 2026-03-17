const { createLogger, format, transports } = require('winston');
const path = require('path');

const logger = createLogger({
    format: format.combine(
        format.timestamp({ format: 'DD/MM/YYYY HH:mm:ss' }),
        format.printf(({ timestamp, level, message }) => `[${timestamp}] ${level.toUpperCase()}: ${message}`)
    ),
    transports: [
        new transports.Console(),
        new transports.File({
            filename: path.resolve(process.cwd(), 'logs/error.log'),
            level: 'error'
        }),
        new transports.File({
            filename: path.resolve(process.cwd(), 'logs/combined.log')
        })
    ]
});

module.exports = logger;
