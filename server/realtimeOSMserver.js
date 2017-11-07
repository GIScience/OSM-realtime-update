"use strict";

/* Server that provides real-time OSM data for specific regions in .pbf file format.
 * Regions are organised in tasks. An API handles task queries and modifications.
 * The server manages a flock of workers, one for each task, that keeps the 
 * OSM data up-to-date. */

const assert = require('assert');
const fs = require("fs"); // file system access
const path = require("path");
const winston = require('winston'); // logging
const { spawnSync, execFile } = require('child_process');
const togeojson = require('togeojson');
const DOMParser = require('xmldom').DOMParser; // for togeojson
const geojsonFlatten = require('geojson-flatten'); // handle geojsons
const geojsonArea = require('geojson-area');
const geojsonMerge = require('geojson-merge');
const turfErase = require('turf-erase');
const turfInside = require('turf-inside');
const turfPoint = require('turf-point');
const api = require('./api.js');

// read config from config.js ('.js' allows comments)
const config = require("./config.js");
// config sanity checks
assert(typeof config.server.maxParallelUpdates == "number",
    "Configuration error: maxParallelUpdates must be a number.");
assert(typeof config.server.geofabrikMetaDir == 'string',
    "Configuration error: geofabrikMetaDir must be a number.");
assert(typeof config.server.geofabrikMetaUpdateInterval == 'number',
    "Configuration error: geofabrikMetaUpdateInterval must be a string");
assert(typeof config.server.workerUpdateInterval == 'number' &
    config.server.workerUpdateInterval > 0,
    "Configuration error: workerUpdateInterval must be a positive number");
assert(typeof config.server.dataAgeThreshold == 'number' &
    config.server.dataAgeThreshold > 0,
    "Configuration error: dataAgeThreshold must be a positive number");
assert((typeof config.loglevel == "number" &
    config.loglevel >= 0 & config.loglevel < 8) |
    typeof config.loglevel == "string" &
    ["emerg", "alert", "crit", "error",
        "warning", "notice", "info", "debug"].includes(config.loglevel),
    "Configuration error: loglevel must be either number (0-7) or " +
    "a syslog level string");
// configure logging
const log = new (winston.Logger)({
    level: config.loglevel,
    transports: [
        new winston.transports.Console({
            prettyPrint: (object) => JSON.stringify(object),
            colorize: true,
            timestamp: () => (new Date()).toISOString()
        })
    ]
});
log.setLevels(winston.config.syslog.levels);

function Controller() {
    // base config
    this.maxParallelUpdates = config.server.maxParallelUpdates;
    this.geofabrikMetaDir = config.server.geofabrikMetaDir;
    this.geofabrikMetadata = undefined;
    this.api = api;
    this.workers = [];
    // update geofabrik metadata
    this.updateGeofabrikMetadata();
    setInterval(this.updateGeofabrikMetadata.bind(this),
        config.server.geofabrikMetaUpdateInterval * 1000);
    // update list of workers
    this.updateWorkers();
    setInterval(this.updateWorkers.bind(this),
        config.server.workerUpdateInterval * 1000);
    log.notice("Real-time OSM server running.");
}

Controller.prototype.updateGeofabrikMetadata = function() {
    /* update geofabrik metadata and get extract bounds 
     * Includes code by Martin Raifer: 
     * https://github.com/BikeCitizens/geofabrik-extracts */

    log.info('Updating Geofabrik Metadata...');

    // get boundary files from geofabrik
    const mkdir = spawnSync('mkdir', ['-p', this.geofabrikMetaDir]);
    if(mkdir.stderr.toString() !== '') {
        log.error(`[updateGeofabrikMetadata] mkdir stderr:\n ${mkdir.stderr}`);
    }

    const wget = spawnSync('wget', ['--progress=dot:giga',
        '-N', 'http://download.geofabrik.de/allkmlfiles.tgz'],
        {cwd: `./${this.geofabrikMetaDir}/`, maxBuffer: 1024 * 500});
    let notModified = wget.stderr.toString().match("304 Not Modified");
    if(notModified) {
        log.debug("[updateGeofabrikMetadata] Metadata not modified.");
        if(this.geofabrikMetadata) return;
    } else if(wget.stderr.toString().match("saved") === null &&
              notModified === null) {
        log.error("[updateGeofabrikMetadata] Error downloading metadata.",
            "wget output:", wget.stderr.toString());
        return;
    }

    const tar = spawnSync('tar', ['xzf', 'allkmlfiles.tgz'],
                          {cwd: `./${this.geofabrikMetaDir}/`});
    if(tar.stderr.toString() !== "") {
        log.error(`[updateGeofabrikMetadata] tar stderr:\n ${tar.stderr}`);
    }

    function walkSync(dir) {
        // recursively lists all files within a directory and subdirectories
        return fs.statSync(dir).isDirectory() ? Array.prototype.concat(
            ...fs.readdirSync(dir).map(f => walkSync(path.join(dir, f))))
            : dir;
    }

    // convert all boundary kml files to geojson
    let boundaryFileList = walkSync(path.join(__dirname, this.geofabrikMetaDir));
    boundaryFileList.splice(boundaryFileList.findIndex(arr => arr.match("allkmlfiles")), 1);
    let geojsonBoundaries = [];
    for(let i in boundaryFileList) {
        let file = boundaryFileList[i];
        let kml = new DOMParser().parseFromString(fs.readFileSync(file, 'utf8'));
        let gj = geojsonFlatten(togeojson.kml(kml));
        gj.features.map(feature => {
            feature.properties.geofabrikName = file.substr(0, file.length - 4).substr(5);
            feature.properties.area = geojsonArea.geometry(feature.geometry);
        });
        geojsonBoundaries.push(gj);
    }

    this.geofabrikMetadata = geojsonMerge(geojsonBoundaries);
    log.notice("Successfully updated metadata.");
};

Controller.prototype.updateWorkers = function() {
    /* loops through list of tasks in db and 
     * starts/terminates workers accordingly */

    let oldWorkerIDs = this.workers.map(worker => worker.task.id);
    // get tasks and sync with worker list
    let SQLselect = this.api.db.prepare("SELECT * FROM tasks;");
    SQLselect.all(function (err, tasks) {
        if(err) log.error("Can't get list of tasks from database", err);
        // list of task ids handled by workers
        let taskIDs = tasks.map(task => task.id);
        // delete workers that work on tasks no longer in database
        this.workers.forEach(function(worker, idx) {
            if(worker.task.expirationDate) {
                let expires = new Date(worker.task.expirationDate);
                if(expires < Date.now()) {
                    log.info(`Task ${worker.task.id} expired. Deleting task and worker.`);
                    // delete from database
                    let SQLdelete = this.api.db.prepare("DELETE FROM tasks WHERE id = ?;",
                        worker.task.id);
                    SQLdelete.all(function (err) {
                        if(err) log.error("Error deleting task", worker.task.id,
                            "from database", err);
                    });
                    // remove task from taskIDs in order to trigger worker removal
                    let taskIdx = taskIDs.indexOf(worker.task.id);
                    taskIDs.splice(taskIdx, 1);
                    tasks.splice(taskIdx, 1);
                }
            }
            if(taskIDs.indexOf(worker.task.id) == -1) {
                log.info("Deleting worker for task", worker.task.id);
                this.workers[idx].terminate();
                this.workers.splice(idx, 1);
            }
        }.bind(this));
        // add new workers for unhandled tasks
        let workerTaskIDs = this.workers.map(worker => worker.task.id);
        for(let i in tasks) {
            if(workerTaskIDs.indexOf(tasks[i].id) == -1) {
                log.info("Adding worker for task", tasks[i].id);
                this.workers.push(new Worker(this, tasks[i]));
            }
        }
        let newWorkerIDs = this.workers.map(worker => worker.task.id);
        if(oldWorkerIDs.join("") != newWorkerIDs.join("")) {
            log.notice("Updated worker list. Current tasks handled:", newWorkerIDs);
        }
    }.bind(this));
};

function Worker(controller, task) {
    /* keeps the OSM data for a task up to date */
    this.controller = controller;
    this.task = task;
    this.task.coverage = JSON.parse(this.task.coverage);

    this.updateTask();
    this.updateIntervalID = setInterval(this.updateTask.bind(this),
                                        this.task.updateInterval * 1000);
}

Worker.prototype.findExtract = function(given, extractsGeoJSON) {
    /* find smallest area extract that fully includes the given polygon */
    let matches = extractsGeoJSON.features.filter(function(extract) {
        if (!turfInside(turfPoint(given.geometry.coordinates[0][0]), extract))
            return false;
        // deep-clone `given` object, see: https://github.com/Turfjs/turf-erase/issues/5
        let erased = turfErase(JSON.parse(JSON.stringify(given)), extract);
        if (erased === undefined)
            return true;
        return false;
    });
    if (matches.length === 0) {
        return undefined;
    }
    let result = matches.reduce(function(prev, current) {
        return current.properties.area < prev.properties.area ? current : prev;
    });
    return result.properties.geofabrikName;
};

Worker.prototype.clipExtract = function(task, callback) {
    /* clips task data file at task.URL to task.coverage 
     * using osmconvert */

    // convert coverage GeoJSON to Polygon Filter File Format:
    // https://wiki.openstreetmap.org/wiki/Osmosis/Polygon_Filter_File_Format

    log.debug("Clipping data to coverage for task", this.task.id);
    // Generate poly string
    // check if task.coverage.properties exists 
    let header = this.task.coverage.properties !== null ?
        this.task.coverage.properties.name || "undefined" : "undefined";
    let polygons = [];
    for(let i = 0; i < this.task.coverage.geometry.coordinates.length; i++) {
        let idx = i + 1;
        idx = (idx == 1 ? idx : -idx);
        let coords = this.task.coverage.geometry.coordinates[i].map(pair =>
                                                                    pair.join("\t"));
        coords = coords.join("\n\t");
        polygons[i] = `${idx}\n\t${coords}\nEND`;
    }
    let poly = [header, polygons.join("\n"), "END"].join("\n");

    // save poly-string to file
    const polypath = "task" + this.task.id + ".poly";
    fs.writeFileSync(polypath, poly);

    // clip extract
    const clippedpath = path.join(path.dirname(this.task.URL),
                          "clipped_" + path.basename(this.task.URL));
    this.clipProcess = execFile('osmconvert', [this.task.URL, "-B=" + polypath,
        "-o=" + clippedpath], {maxBuffer: 1024 * 500}, function (error, stdout, stderr) {
        if (error) {
            log.error(
                "[clipExtract] Error clipping data to coverage for task",
                this.task.id, "error:", error, "stderr:", stderr, "stdout:", stdout
            );
            throw "Error clipping file.";
        }

        // replace original file with clipped file
        const mv = spawnSync('mv', [clippedpath, this.task.URL]);
        if(mv.stderr.toString() !== '') {
            log.error(
                `[clipExtract] Error moving clipped file to original file.`,
                `mv stderr:\n ${mv.stderr}`
            );
            throw "Error moving clipped file.";
        }

        // remove poly-file
        const rm = spawnSync('rm', [polypath]);
        if(rm.stderr.toString() !== '') {
            log.error(
                "[clipExtract] Error removing poly-file for task",
                this.task.id, `rm stderr:\n ${rm.stderr}`
            );
            throw "Error removing poly-file for task.";
        }
        log.info(
            "Successfully clipped extract for task", this.task.id
        );
        delete this.clipProcess;
        if(callback) callback();
    }.bind(this));
};

Worker.prototype.createInitialDatafile = function() {
    /* downloads initial data file in .pbf-format */
    if(!this.controller.geofabrikMetadata) {
        log.warning(
            "Can't create initial data file for task", this.task.id,
            "- no Geofabrik metadata."
        );
        return;
    }
    let geofabrikName = this.findExtract(this.task.coverage,
                                         this.controller.geofabrikMetadata);
    if(geofabrikName === undefined) {
        log.warning(
            "Can't create initial data file for task", this.task.id,
            "- no Geofabrik extract found. Terminating worker."
        );
        this.terminate();
        return;
    }
    const mkdir = spawnSync('mkdir', ['-p', path.dirname(this.task.URL)]);
    if(mkdir.stderr.toString() !== '') {
        log.error(
            `[createInitialDatafile] mkdir stderr:\n ${mkdir.stderr}`
        );
    }
    let geofabrikBase = 'http://download.geofabrik.de/';
    let suffixIdx = geofabrikName.match(this.controller.geofabrikMetaDir).index;
    let suffix = geofabrikName.substr(suffixIdx + this.controller.geofabrikMetaDir.length,
                                      geofabrikName.length) + "-latest.osm.pbf";
    log.info(
        "Downloading", geofabrikBase + suffix,
        "for task", this.task.id
    );
    this.wgetInitialFileProcess = execFile('wget', ['--progress=dot:giga', '-O',
        this.task.URL, geofabrikBase + suffix], {maxBuffer: 1024 * 1024},
        function (error, stdout, stderr) {
            if (error) {
                log.error("Wget error:", error, "Stdout:", stdout,
                    "Stderr:", stderr);
                return;
            }
            if (stderr.match("saved")) {
                log.info(
                    "Successfully downloaded",
                    geofabrikBase + suffix, "for task", this.task.id
                );
            }
            this.clipExtract(this.task);
            delete this.wgetInitialFileProcess;
        }.bind(this));
};

Worker.prototype.updateTask = function() {
    /* updates task's OSM data */
    let timing = Date.now();
    log.info("Starting update for task", this.task.id);
    if(this.updateProcess !== undefined) {
        log.info(
            `Update for task ${this.task.id} already running.`
        );
        return;
    }
    if(this.clipProcess !== undefined) {
        log.info(
            `Abort update, clipping for task ${this.task.id} running.`
        );
        return;
    }
    if(this.wgetInitialFileProcess !== undefined) {
        log.info(
            `Abort update, initial download for task ${this.task.id} running.`
        );
        return;
    }
    let nParallelUpdates = this.controller.workers.filter(worker =>
        worker.updateProcess !== undefined).length;
    if(nParallelUpdates >= this.controller.maxParallelUpdates) {
        log.warning(
            `Abort update for task ${this.task.id}] Number of parallel updates` +
            `exceeds threshold (${this.controller.maxParallelUpdates}),` +
            `trying again in 30s.`
        );
        setTimeout(this.updateTask.bind(this), 30000);
        return;
    }

    if(!fs.existsSync(this.task.URL)) {
        log.notice(`Can't update task ${this.task.id}.` +
                      this.task.URL + " not found. Trying to initialize data file.");
        this.createInitialDatafile();
        return;
    }
    // check if file is older than threshold -> redownload
    let dateThreshold = config.server.dataAgeThreshold;
    if((Date.now() - fs.statSync(this.task.URL).mtime)/1000/60/60/24 > dateThreshold) {
        log.info(
            `${this.task.URL} older than ${dateThreshold} days, recreating.`
        );
        this.createInitialDatafile();
        return;
    }
    let newfile = path.join(path.dirname(this.task.URL),
                  "new_" + path.basename(this.task.URL));

    // helper function that finishes update by inserting timings
    let finishTaskUpdate = function() {
        // insert timing into database
        let insertTimingSQL = this.controller.api.db.prepare(
            `INSERT INTO taskstats (timestamp, taskID, timing)
                VALUES (?, ?, ?);`,
                new Date().toISOString(), this.task.id, Date.now() - timing);
        insertTimingSQL.run(function (err) {
            if(err) log.error("[updateTask] SQL error:", err);
        });
        // update timing statistics
        let updateTimingStatsSQL = this.controller.api.db.prepare(
            `UPDATE tasks
             SET averageRuntime = (SELECT avg(timing) FROM taskstats
                                   WHERE taskID = ?)
             WHERE id = ?`, this.task.id, this.task.id);
        updateTimingStatsSQL.run(function (err) {
            if(err) log.error("[updateTask] SQL error:", err);
        });
        // update lastUpdated
        let updateLastUpdatedSQL = this.controller.api.db.prepare(
            `UPDATE tasks
             SET lastUpdated = ?
             WHERE id = ?`,
             new Date().toISOString(), this.task.id);
        updateLastUpdatedSQL.run(function (err) {
            if(err) log.error("[updateTask] SQL error:", err);
        });
        log.notice("Successfully updated task", this.task.id);
    };
    // start update
    this.updateProcess = execFile('osmupdate',
        ["-v", "--max-merge=2", `-t=osmupdate_temp/Task${this.task.id}`,
        this.task.URL, newfile], {maxBuffer: 1024 * 500},
        function (error, stdout, stderr) {
            if (error) {
                if(error.toString().match("Your OSM file is already up-to-date.")) {
                    log.info(`Task ${this.task.id} already up-to-date.`);
                } else log.error(`Error updating task. error: ${error}`);
            } else {
                if (stderr.match("Completed successfully")) {
                    // replace old file with updated version
                    const mv = spawnSync('mv', [newfile, this.task.URL]);
                    if(mv.stderr.toString() !== '') {
                        log.error(`[updateTask] Error moving new file to old file.`,
                                     `mv stderr:\n ${mv.stderr}`);
                    } else {
                        // clip new file and finish task update (insert timings)
                        try{
                            this.clipExtract(this.task, finishTaskUpdate.bind(this));
                        }
                        catch(err) {
                            log.error(
                                "[updateTask] Error clipping updated file for task",
                                this.task.id
                            );
                            return;
                        }
                    }
                }
            }
            delete this.updateProcess;
        }.bind(this));
};

Worker.prototype.terminate = function() {
    /* terminates running update, clip or download processes,
     * clears interval and removes data */
    clearInterval(this.updateIntervalID);
    if(this.updateProcess) this.updateProcess.kill();
    if(this.clipProcess) this.clipProcess.kill();
    if(this.wgetInitialFileProcess) this.wgetInitialFileProcess.kill();
    const rm = spawnSync('rm', [this.task.URL]);
    if(rm.stderr.toString() !== '') {
        log.error(`[terminateWorker] Error removing data for task ${this.task.id}`,
                     `rm stderr:\n ${rm.stderr}`);
    }
    log.notice("Terminated worker for task", this.task.id);
};

new Controller();
