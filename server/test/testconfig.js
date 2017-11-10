const config = {
    /* supported loglevels (syslog)
        0 emerg: system is unusable
        1 alert: action must be taken immediately
        2 crit: the system is in critical condition
        3 error: error condition
        4 warning: warning condition
        5 notice: a normal but significant condition
        6 info: a purely informational message
        7 debug: messages to debug an application */
    loglevel: 'debug',
    server: {
        maxParallelUpdates: 10,
        geofabrikMetaDir: "./test/testgeofabrikbounds/",
        // seconds
        geofabrikMetaUpdateInterval: 60*60*24,
        workerUpdateInterval: 1,
        // time threshold after which data is redownloaded
        // instead of updated (days)
        dataAgeThreshold: 1,
    },
    api: {
        port: 1234,
        accesslog: "./test/testaccess.log",
        taskdb: "./test/test.db",
        // directory where osm data is stored and served
        dataDirectory: "./test/testdata/",
    }
};

module.exports = config;
