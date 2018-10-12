/* A server that provides real-time OSM data for specific regions in .pbf file format.
 * Regions are organised in tasks. An API handles task queries and modifications.
 * The server manages a flock of workers, one for each task, that keeps the
 * OSM data up-to-date.
 *
 * Stefan Eberlein, stefan.eberlein@fastmail.com
 *
 * */

"use strict";

const assert = require("assert");
const fs = require("fs"); // file system access
// handle command line arguments to allow different config files (eg. for test environment)
const args = require('minimist')(process.argv.slice(2));
const path = require("path");
const winston = require('winston'); // logging
const { spawnSync, execFile } = require('child_process'); // spawning processes
const togeojson = require('@mapbox/togeojson');        // convert kml to geojson
const DOMParser = require('xmldom').DOMParser; // for togeojson
const turfFlatten = require('@turf/flatten'); // handle geojsons
const turfArea = require('@turf/area');
const turfBooleanWithin = require('@turf/boolean-within');
const url = require("url");

// read config from config.js ('.js' allows comments)
const config = require(args.c || "./config.js");

// config sanity checks
assert(typeof config.server.maxParallelUpdates == "number",
    "Configuration error: maxParallelUpdates must be a number.");
assert(typeof config.server.geofabrikMetaDir == 'string',
    "Configuration error: geofabrikMetaDir must be a number.");
assert(typeof config.server.geofabrikMetaUpdateInterval == 'number',
    "Configuration error: geofabrikMetaUpdateInterval must be a string");
assert(typeof config.server.workerUpdateInterval == 'number' &&
    config.server.workerUpdateInterval > 0,
    "Configuration error: workerUpdateInterval must be a positive number");
assert(typeof config.server.dataAgeThreshold == 'number' &&
    config.server.dataAgeThreshold > 0,
    "Configuration error: dataAgeThreshold must be a positive number");
assert((typeof config.loglevel == "number" &&
    config.loglevel >= 0 && config.loglevel < 8) ||
    typeof config.loglevel == "string" &&
    ["emerg", "alert", "crit", "error",
        "warning", "notice", "info", "debug"].includes(config.loglevel),
    "Configuration error: loglevel must be either number (0-7) or " +
    "a syslog level string");

// start api
const api = require('./api.js')(config);

// configure logging
const log = new (winston.Logger)({
    level: config.loglevel,
    transports: [
        new winston.transports.Console({
            stderrLevels: ['error'],
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
    this.planetfile = config.server.planetfile;
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
        log.error(`Error extracting Geofabrik metadata. This likely means the archive is corrupted. tar stderr:\n ${tar.stderr}`);
        this.geofabrikMetadata = null;
        return;
    }

    function walkSync(dir) {
        // recursively lists all files within a directory and subdirectories
        return fs.statSync(dir).isDirectory() ? Array.prototype.concat(
            ...fs.readdirSync(dir).map(f => walkSync(path.join(dir, f))))
            : dir;
    }

    // convert all boundary kml files to geojson
    let boundaryFileList = walkSync(this.geofabrikMetaDir);
    boundaryFileList.splice(boundaryFileList.findIndex(arr => arr.match("allkmlfiles")), 1);
    let geojsonBoundaries = [];
    for(let i in boundaryFileList) {
        let file = boundaryFileList[i];
        let kml = new DOMParser().parseFromString(fs.readFileSync(file, 'utf8'));
        let geojsons = turfFlatten(togeojson.kml(kml));
        geojsons.features.map(feature => {
            let region = path.relative(this.geofabrikMetaDir, file).slice(0, -4);
            feature.properties.geofabrikRegion = region;
            feature.properties.area = turfArea(feature.geometry);
        });
        geojsonBoundaries = geojsonBoundaries.concat(geojsons.features);
    }

    this.geofabrikMetadata = {
        "type": "FeatureCollection",
        "features": geojsonBoundaries
    };
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
                    log.info(`Task ${worker.task.id}:${worker.task.name} expired. Deleting task from db.`);
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
                tasks[i].coverage = JSON.parse(tasks[i].coverage);
                this.workers.push(new Worker(this, tasks[i]));
            }
        }
        let newWorkerIDs = this.workers.map(worker => worker.task.id);
        if(oldWorkerIDs.join("") != newWorkerIDs.join("")) {
            log.notice("Updated worker list. Current tasks handled:", newWorkerIDs);
        }
    }.bind(this));
};

Controller.prototype.exit = function(signal) {
    log.notice(`Received ${signal}. Shutting down...`);
    // remove temporary files (poly-files and osmupdate folder)
    var polyfiles = fs.readdirSync(".").filter(filename => filename.match("poly"));
    if(polyfiles.length > 0) {
        const rmPoly = spawnSync('rm', [...polyfiles]);
        if(rmPoly.stderr.toString() !== '') {
            log.warning(`[exit] Error removing polydata`,
                         `rm stderr:\n ${rmPoly.stderr}`);
        }
    }
    if(fs.existsSync("osmupdate_temp/")) {
        const rmOsmupdate = spawnSync('rm', ["-r", "osmupdate_temp/"]);
        if(rmOsmupdate.stderr.toString() !== '') {
            log.warning(`[exit] Error removing osmupdate_temp/`,
                         `rm stderr:\n ${rmOsmupdate.stderr}`);
        }
    }
    // exit
    process.exit();
};

function Worker(controller, task) {
    /* keeps the OSM data for a task up to date */
    this.controller = controller;
    this.task = task;
    if (task.URL == null || task.URL == "") {
        log.error(`URL of task ${this.task.id} must not be empty, terminating worker.`,
                  `Please remove task from database.`);
        this.terminate();
        return;
    }

    this.updateIntervalID = setInterval(this.updateTask.bind(this),
                                        this.task.updateInterval * 1000);
    this.updateTask();
}

Worker.prototype.findExtract = function(givenPoly, extractsGeoJSON) {
    /* find smallest area extract that fully includes the given polygon
     * or matches a given region name */
    let matches = extractsGeoJSON.features.filter(function(extract) {
        // does not find extract if coverage boundaries match extract boundaries
        // -> solve by addig extra difference === null check if necessary
        if (givenPoly.hasOwnProperty('geofabrikRegion')) {
            let regex = RegExp("\\/"+givenPoly.geofabrikRegion+"$|^"+givenPoly.geofabrikRegion+"$");
            return extract.properties.geofabrikRegion.match(regex) ?
                true : false;
        } else if (turfBooleanWithin(givenPoly, extract)) {
            return true;
        } else return false;
    });
    if (matches.length === 0) {
        return undefined;
    }
    let result = matches.reduce(function(prev, current) {
        return current.properties.area < prev.properties.area ? current : prev;
    });
    return result;
};

Worker.prototype.createPolyFile = function(task) {
    // Generate poly string
    // check if task.coverage.properties exists
    let header = task.coverage.properties != null ?
        task.coverage.properties.name || "undefined" : "undefined";
    let polygons = [];
    for(let i = 0; i < task.coverage.geometry.coordinates.length; i++) {
        let idx = i + 1;
        idx = (idx == 1 ? idx : -idx);
        let coords = task.coverage.geometry.coordinates[i].map(pair =>
                                                                    pair.join("\t"));
        coords = coords.join("\n\t");
        polygons[i] = `${idx}\n\t${coords}\nEND`;
    }
    let poly = [header, polygons.join("\n"), "END"].join("\n");

    // save poly-string to file
    const polypath = "task" + task.id + ".poly";
    fs.writeFileSync(polypath, poly);
    return polypath;
};

Worker.prototype.clipExtract = function(task, callback) {
    /* clips task data file at task.URL to task.coverage
     * using osmconvert */

    // convert coverage GeoJSON to Polygon Filter File Format:
    // https://wiki.openstreetmap.org/wiki/Osmosis/Polygon_Filter_File_Format

    log.debug("Clipping data to coverage for task", this.task.id);

    let polypath = this.createPolyFile(this.task);
    // clip extract
    const clippedpath = path.join(path.dirname(this.task.URL),
                          "clipped_" + path.basename(this.task.URL));
    this.clipProcess = execFile('osmconvert', [this.task.URL, "-B=" + polypath,
        "-o=" + clippedpath], {maxBuffer: 1024 * 500}, function (error, stdout, stderr) {
        if (error) {
            if(error.killed === true) {
                log.warning(`clipping process for task ${this.task.id} killed`);
                return;
            }
            log.error(
                "Error clipping data to coverage for task",
                this.task.id, "error:", error, "stderr:", stderr, "stdout:", stdout
            );
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
            `Successfully clipped extract for task ${this.task.id}: ${this.task.name}`
        );
        delete this.clipProcess;
        if(callback) callback();
    }.bind(this));
};

Worker.prototype.createInitialDatafile = function(usePlanetfile = false) {
    /* creates initial data file in .pbf-format */
    if(usePlanetfile) {
        if(!fs.existsSync(this.controller.planetfile)) {
            log.error("Can't initialise data file for task", this.task.id,
                        "- planet file '", this.controller.planetfile, "' not available. Terminating worker.");
            this.terminate();
            return;
        }
        // extract data from planetfile
        const mkdir = spawnSync('mkdir', ['-p', path.dirname(this.task.URL)]);
        if(mkdir.stderr.toString() !== '') {
            log.error(
                `[createInitialDatafile] mkdir stderr:\n ${mkdir.stderr}`
            );
        }
        log.info("Extracting data for task", this.task.id, "from planet file",
                 this.controller.planetfile);

        // create poly file for clipping
        let polyFile = this.createPolyFile(this.task);

        this.planetfileExtractProcess = execFile('osmconvert',
            ["-v", "--drop-broken-refs", "-B=" + polyFile, "-o=" + this.task.URL,
                this.controller.planetfile], {maxBuffer: 1024 * 500},
            function (error, stdout, stderr) {
                if (error) {
                    if(error.killed === true) {
                        log.warning(`osmconvert process for task ${this.task.id} killed`);
                        // TODO adjust error and success handling
                    } else {
                        log.error("Error extracting data from planet file for task",
                        this.task.id, "Error:", error.message);
                    }
                } else {
                    if (stderr.match("osmconvert: Last processed")) {
                        log.notice("Successfully extracted data from planet file for task",
                            this.task.id);
                    } else log.warning(`Unexpected osmconvert output. stdout: ${stdout}.`,
                        `stderr: ${stderr}`);
                }
                delete this.planetfileExtractProcess;

                // remove poly-file
                const rm = spawnSync('rm', [polyFile]);
                if(rm.stderr.toString() !== '') {
                    log.error(
                        "[createInitialDatafile] Error removing poly-file for task",
                        this.task.id, `rm stderr:\n ${rm.stderr}`
                    );
                    throw "Error removing poly-file for task.";
                }
            }.bind(this));
    } else {
        if(this.controller.geofabrikMetadata == undefined) {
            log.error("Can't initialise data file for task", this.task.id,
                        "- no Geofabrik metadata available. Trying again using planet file.");
            this.createInitialDatafile(true);
            return;
        }
        // find matching geofabrik extract and download data
        let metadataMatch = this.findExtract(this.task.coverage,
                                             this.controller.geofabrikMetadata);
        if(metadataMatch === undefined) {
            log.warning("Can't create initial data file for task", this.task.id,
                        "- no Geofabrik extract found. Trying again using planet file.");
            this.createInitialDatafile(true);
            return;
        }
        // update coverage if geofabrikRegion-string was given
        if (this.task.coverage.hasOwnProperty("geofabrikRegion")) {
            // save metadata coverage
            this.task.coverage = {
                type: "Feature",
                geometry: metadataMatch.geometry,
                properties: {name: this.task.coverage.geofabrikRegion}
            };
            // update coverage in database
            let updateCoverageSQL = this.controller.api.db.prepare(
                `UPDATE tasks
                 SET coverage = ?
                 WHERE id = ?`, JSON.stringify(this.task.coverage), this.task.id);
            updateCoverageSQL.run(function (err) {
                if(err) log.error("[updateCoverage] SQL error:", err);
            });
        }
        // update geofabrikRegion name
        this.task.geofabrikRegion = metadataMatch.properties.geofabrikRegion;
        const mkdir = spawnSync('mkdir', ['-p', path.dirname(this.task.URL)]);
        if(mkdir.stderr.toString() !== '') {
            log.error(
                `[createInitialDatafile] mkdir stderr:\n ${mkdir.stderr}`
            );
        }
        let geofabrikBase = 'http://download.geofabrik.de/';
        let geofabrikURL = url.resolve(geofabrikBase,
                                       this.task.geofabrikRegion + "-latest.osm.pbf");
        log.info("Downloading", geofabrikURL, "for task", this.task.id);
        this.wgetInitialFileProcess = execFile('wget', ['--progress=dot:giga', '-O',
            this.task.URL, geofabrikURL], {maxBuffer: 1024 * 1024},
            function (error, stdout, stderr) {
                if (error) {
                    if(error.killed === true) return;
                    log.error(`wget error: ${error}\nstdout: ${stdout}\n`,
                              `stderr: ${stderr}\n`,
                              `processinfo:`, this.wgetInitialFileProcess);
                    return;
                }
                if (stderr.match("saved")) {
                    log.info(
                        "Successfully downloaded",
                        geofabrikURL, "for task", this.task.id
                    );
                }
                this.clipExtract(this.task);
                delete this.wgetInitialFileProcess;
            }.bind(this));
    }
};

Worker.prototype.updateTask = function() {
    /* updates task's OSM data */
    let timing = Date.now();
    log.info(`Starting update for task ${this.task.id}: ${this.task.name}`);
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
    if(this.planetfileExtractProcess !== undefined) {
        log.info("Abort update, initial planet file extraction for task",
                 this.task.id, "running.");
        return;
    }
    if(this.wgetInitialFileProcess !== undefined) {
        log.info(`Abort update, initial download for task ${this.task.id} running.`);
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
    // create poly file for clipping
    let polyFile = this.createPolyFile(this.task);

    // start update
    //
    // idea to reduce traffic and processing time: keep a general temp-directory for
    // osmupdate that gets cleaned daily/weekly...
    //
    this.updateProcess = execFile('osmupdate',
        ["-v", "--max-merge=2", `-t=osmupdate_temp/Task${this.task.id}`,
        "-B=" + polyFile, this.task.URL, newfile], {maxBuffer: 1024 * 500},
        function (error, stdout, stderr) {
            if (error) {
                if(error.killed === true) {
                    log.warning(`osmupdate process for task ${this.task.id} killed`);
                } else if(error.toString().match("Your OSM file is already up-to-date.")) {
                    log.info(`Task ${this.task.id} already up-to-date.`);
                } else log.error(`Error updating task. error: ${error.toString()}`);
            } else {
                if (stderr.match("Completed successfully")) {
                    // replace old file with updated version
                    const mv = spawnSync('mv', [newfile, this.task.URL]);
                    if(mv.stderr.toString() !== '') {
                        log.error(`[updateTask] Error moving new file to old file.`,
                                     `mv stderr:\n ${mv.stderr}`);
                    } else {
                        // finish task update (insert timings)
                        finishTaskUpdate.bind(this)();
                    }
                } else log.warning(`Unexpected osmupdate output. stdout: ${stdout}.`,
                    `stderr: ${stderr}`);
            }
            delete this.updateProcess;

            // remove poly-file
            const rm = spawnSync('rm', [polyFile]);
            if(rm.stderr.toString() !== '') {
                log.error(
                    "[clipExtract] Error removing poly-file for task",
                    this.task.id, `rm stderr:\n ${rm.stderr}`
                );
                throw "Error removing poly-file for task.";
            }
        }.bind(this));
};

Worker.prototype.terminate = function() {
    /* terminates running update, clip or download processes,
     * clears interval and removes data */
    clearInterval(this.updateIntervalID);
    if(this.updateProcess) this.updateProcess.kill();
    if(this.clipProcess) this.clipProcess.kill();
    if(this.wgetInitialFileProcess) this.wgetInitialFileProcess.kill();
    if(fs.existsSync(this.task.URL)) {
        const rmData = spawnSync('rm', [this.task.URL]);
        if(rmData.stderr.toString() !== '') {
            log.error(`[terminateWorker] Error removing data for task ${this.task.id}`,
                         `rm stderr:\n ${rmData.stderr}`);
        }
    }
    log.notice("Terminated worker for task", this.task.id);
};

var realtimeosm = new Controller();

process.on('SIGINT', realtimeosm.exit.bind(realtimeosm));
process.on('SIGTERM', realtimeosm.exit.bind(realtimeosm));
process.on('SIGHUP', realtimeosm.exit.bind(realtimeosm));
