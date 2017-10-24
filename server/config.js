const config = {
    server: {
        maxParallelUpdates: 6,
        geofabrikMetaDir: "./geofabrikbounds/",
        // seconds
        geofabrikMetaUpdateInterval: 60*60*24,
        workerUpdateInterval: 5
    },
    api: {
        dataDirectory: "./data/",
        port: 1234,
        accesslog: "access.log",
        taskdb: "tasks.db"
    }
};

module.exports = config;
