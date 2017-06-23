// jshint esversion: 6, node: true, loopfunc: true
"use strict";

/* Server that provides real-time OSM data for specific regions in .pbf file format. 
 * Regions are organised in tasks. An API handles task queries and modifications.
 * The server manages a flock of workers, one for each task, that keeps the 
 * OSM data up-to-date. */

const fs = require("fs");           // file system access 
const path = require("path");
const {spawnSync, execFile} = require('child_process');
const togeojson = require('togeojson');
const WKT = require('wellknown'); // WKT parsing
const DOMParser = require('xmldom').DOMParser; // for togeojson
const geojsonFlatten = require('geojson-flatten'); // handle geojsons
const geojsonArea = require('geojson-area');
const geojsonMerge = require('geojson-merge');
const turfErase = require('turf-erase');
const turfInside = require('turf-inside');
const turfPoint = require('turf-point');
//const sqlite3 = require('sqlite3').verbose(); // database access
const api = require('./api.js');
const log = true;

function logToConsole() {
    if(log) console.log(new Date().toISOString() + " [Controller]:", ...arguments);
}

function Controller() {
    this.api = api;
    this.workers = [];
    this.geofabrikMetadir = "geofabrikbounds";
    this.geofabrikMetadata = undefined;
    // update geofabrik metadata and update daily
    this.updateGeoFabrikMetadata();
    setInterval(this.updateGeoFabrikMetadata.bind(this), 1000*60*60*24);
    // update list of workers every five seconds
    this.updateWorkers();
    setInterval(this.updateWorkers.bind(this), 1000*5);
    logToConsole("Real-time OSM controller running.");
}

Controller.prototype.updateGeoFabrikMetadata = function() {
    /* update geofabrik metadata and get extract bounds 
     * Includes code by Martin Raifer: 
     * https://github.com/BikeCitizens/geofabrik-extracts */
    
    logToConsole('[updateGeoFabrikMetadata] Updating GeoFabrik Metadata...');

    // get boundary files from geofabrik
    const mkdir = spawnSync('mkdir', ['-p', this.geofabrikMetadir]);
    if(mkdir.stderr.toString() !== '') {
        logToConsole(`[updateGeoFabrikMetadata] mkdir stderr:\n ${mkdir.stderr}`);
    }

    const wget = spawnSync('wget', ['-N', 'http://download.geofabrik.de/allkmlfiles.tgz'],
                            {cwd: `./${this.geofabrikMetadir}/`});
    var notModified = wget.stderr.toString().match("304 Not Modified");
    if(notModified) {
        logToConsole("[updateGeoFabrikMetadata] Metadata not modified.");
        if(this.geofabrikMetadata) return;
    } else if(wget.stderr.toString().match("saved") === null && 
              notModified === null) {
        logToConsole("[updateGeoFabrikMetadata] Error downloading metadata.");
        return;
    }

    const tar = spawnSync('tar', ['xzf', 'allkmlfiles.tgz'], 
                          {cwd: `./${this.geofabrikMetadir}/`});
    if(tar.stderr.toString() !== "") {
        logToConsole(`[updateGeoFabrikMetadata] tar stderr:\n ${tar.stderr}`);
    }

    function walkSync(dir) {
            return fs.statSync(dir).isDirectory() ? Array.prototype.concat(
                ...fs.readdirSync(dir).map(f => walkSync(path.join(dir, f))))
                : dir;
    }

    // convert all kml files to geojson
    var boundaryFileList = walkSync(path.join(__dirname, this.geofabrikMetadir));
    boundaryFileList.splice(boundaryFileList.findIndex(arr => arr.match("allkmlfiles")), 1);
    var geojsonBoundaries = [];
    for(var i in boundaryFileList) {
        var file = boundaryFileList[i];
        var kml = new DOMParser().parseFromString(fs.readFileSync(file, 'utf8'));
        var gj = geojsonFlatten(togeojson.kml(kml));
        gj.features.map(feature => {
            feature.properties.geofabrikName = file.substr(0, file.length-4).substr(5);
            feature.properties.area = geojsonArea.geometry(feature.geometry);
        });
        geojsonBoundaries.push(gj);
    }

    this.geofabrikMetadata = geojsonMerge(geojsonBoundaries);
    
    // remove temporary data
    //const rm = spawnSync('rm', ['-r', this.geofabrikMetadir, 'allkmlfiles.tgz']);
    //if(rm.stderr.toString() !== '') {
    //    logToConsole(`[Controller updateGeoFabrikMetadata] rm stderr:\n ${rm.stderr}`);
    //}
};

Controller.prototype.updateWorkers = function() {
    /* loops through list of tasks in db and 
     * starts/terminates workers accordingly */

    var oldWorkerIDs = this.workers.map(worker => worker.task.id);
    // get tasks and sync with worker list
    var SQLselect = this.api.db.prepare("SELECT * FROM tasks;");
    SQLselect.all(function (err, tasks) {
        if(err) logToConsole("Can't get list of tasks from database", err);
        // list of task ids handled by workers
        var taskIDsHandled = this.workers.map(worker => worker.task.id);
        var taskIDs = tasks.map(task => task.id);
        // delete workers that work on tasks no longer in database
        for(let i in taskIDsHandled) {
            if(taskIDs.indexOf(taskIDsHandled[i]) == -1) {
                logToConsole("Deleting worker for task", taskIDsHandled[i]);
                this.workers[i].terminate();
                this.workers.splice(i, 1);
            }
        }
        // add new workers for unhandled tasks
        for(let i in tasks) {
            if(taskIDsHandled.indexOf(tasks[i].id) == -1) {
                logToConsole("Adding worker for task", tasks[i].id);
                this.workers.push(new Worker(this, tasks[i]));
            }
        }
        var newWorkerIDs = this.workers.map(worker => worker.task.id);
        if(oldWorkerIDs.join("") != newWorkerIDs.join("")) {
            logToConsole("Updated workers. Current tasks handled:", newWorkerIDs);
        }
    }.bind(this));
};

function Worker(controller, task) {
    /* keeps the OSM data for a task up to date */
    this.controller = controller;
    this.task = task;
    this.task.coverage = JSON.parse(this.task.coverage);

    // ToDo Check age of data file, recreate initial file if older than threshold
    if(!fs.existsSync(this.task.URL)) this.createInitialDatafile();
    this.updateTask();
    this.updateIntervalID = setInterval(this.updateTask.bind(this), 
                                        this.task.updateInterval*1000);
}

Worker.prototype.clipExtract = function(task) {
    /* clips task data file at task.URL to task.coverage 
     * using osmconvert */
};

Worker.prototype.findExtract = function(given, extractsGeoJSON) {
    /* find smallest area extract that fully includes the given polygon */
    var matches = extractsGeoJSON.features.filter(function(extract) {
        if (!turfInside(turfPoint(given.geometry.coordinates[0][0]), extract))
            return false;
        // deep-clone `given` object, see: https://github.com/Turfjs/turf-erase/issues/5
        var erased = turfErase(JSON.parse(JSON.stringify(given)), extract);
        if (erased === undefined)
            return true;
        return false;
    });
    if (matches.length === 0) {
        return undefined;
    }
    var result = matches.reduce(function(prev, current) {
        return current.properties.area < prev.properties.area ? current : prev;
    });
    return result.properties.geofabrikName;
};
Worker.prototype.createInitialDatafile = function() {
    /* downloads initial data file in .pbf-format */
    var geofabrikName = this.findExtract(this.task.coverage, 
                                         this.controller.geofabrikMetadata);
    if(geofabrikName === undefined) {
        logToConsole("Unable to update task", this.task.id, 
                     "- no Geofabrik extract found.");
        return;
    }
    const mkdir = spawnSync('mkdir', ['-p', 'data']);
    if(mkdir.stderr.toString() !== '') {
        logToConsole(`[createInitialDatafile] mkdir stderr:\n ${mkdir.stderr}`);
    }
    var geofabrikBase = 'http://download.geofabrik.de/';
    var suffixIdx = geofabrikName.match(this.controller.geofabrikMetadir).index;
    var suffix = geofabrikName.substr(suffixIdx + this.controller.geofabrikMetadir.length, 
                                      geofabrikName.length) + "-latest.osm.pbf";
    logToConsole("[createInitialDatafile] Downloading", geofabrikBase + suffix,
                  "for task", this.task.id);
    var clipFile = function () {
        console.log("Clippediclipp.");
    };
    clipFile.bind(this)();
    const wget = execFile('wget', ['-O', this.task.URL, geofabrikBase + suffix],
        function (error, stdout, stderr) {
            if (error) {
                logToConsole(`exec error: ${error}`);
                return;
            }
            if (stderr.match("saved")) {
                logToConsole("[createInitialDatafile] Successfully downloaded",
                    geofabrikBase + suffix, "for task", this.task.id);
            }
            // clip data
            //var poly = 
            //const osmconvert = spawnSync('mv', [newfile, this.task.URL]);
            //if(mv.stderr.toString() !== '') {
            //    logToConsole(`[updateTask] Error moving new file to old file.`,
            //                 `mv stderr:\n ${mv.stderr}`);
            //} else logToConsole("[updateTask] Successfully updated task", this.task.id);
            // update data
            this.updateTask();
        }.bind(this));
    // ToDo clip extract!
    // generate poly file, clip with osmconvert
};

Worker.prototype.updateTask = function() {
    /* updates task's OSM data */
    var timing = Date.now();

    logToConsole("[updateTask] Starting update for task", this.task.id);
    if(this.updateProcess !== undefined) {
        logToConsole(`[updateTask] Update for task ${this.task.id} already running.`);
        return;
    }

    if(!fs.existsSync(this.task.URL)) {
        logToConsole(`[updateTask] Can't update task ${this.task.id}.` + 
                      this.task.URL + " not found. Trying to initialize data file.");
        this.createInitialDatafile();
    }
    var newfile = path.join(path.dirname(this.task.URL), 
                  "new_" + path.basename(this.task.URL));
    this.updateProcess = execFile('osmupdate', ["-v", this.task.URL, newfile],
        function (error, stdout, stderr) {
            if (error) {
                if(error.toString().match("Your OSM file is already up-to-date.")) {
                    logToConsole(`[updateTask] Task ${this.task.id} already up-to-date.`);
                } else logToConsole(`[updateTask] Error updating task. error: ${error}`);
            } else {
                if (stderr.match("Completed successfully")) {
                    const mv = spawnSync('mv', [newfile, this.task.URL]);
                    if(mv.stderr.toString() !== '') {
                        logToConsole(`[updateTask] Error moving new file to old file.`,
                                     `mv stderr:\n ${mv.stderr}`);
                    } else logToConsole("[updateTask] Successfully updated task", this.task.id);
                }
                // insert timing into database
                var insertTimingSQL = this.controller.api.db.prepare(
                    `INSERT INTO taskstats (timestamp, taskID, timing) 
                        VALUES (?, ?, ?);`, 
                        new Date().toISOString(), this.task.id, Date.now()-timing);
                insertTimingSQL.run(function (err) {
                    if(err) logToConsole("[updateTask] SQL error:", err);
                });

                // update timing statistics
                var updateTimingStatsSQL = this.controller.api.db.prepare(
                    `UPDATE tasks 
                     SET averageRuntime = (SELECT avg(timing) FROM taskstats
                                           WHERE taskID = ?)
                     WHERE id = ?`, this.task.id, this.task.id);
                updateTimingStatsSQL.run(function (err) {
                    if(err) logToConsole("[updateTask] SQL error:", err);
                });
            }
            delete this.updateProcess;
        }.bind(this));
};

Worker.prototype.terminate = function() {
    /* terminates running update, clears interval and removes data */
    this.updateProcess.kill();
    clearInterval(this.updateIntervalID);
    const rm = spawnSync('rm', [this.task.URL]);
    if(rm.stderr.toString() !== '') {
        logToConsole(`[terminateWorker] Error removing data for task ${this.task.id}`,
                     `rm stderr:\n ${rm.stderr}`);
    } else logToConsole("[terminateWorker] Removed worker for task", this.task.id);
};

new Controller();
