"use strict";

const express = require('express');
const serveIndex = require('serve-index');
const bodyParser = require('body-parser');
const api = express();
const morgan = require('morgan');   // library for logging
const fs = require("fs");           // file system access for logging
const sqlite3 = require('sqlite3').verbose(); // database access
const WKT = require('wellknown'); // WKT parsing
const geojsonhint = require('geojsonhint'); // validate GeoJSONs
const geojsonrewind = require('geojson-rewind'); // fix right-hand rule for GeoJSONs
const log = true;

function logToConsole() {
    if(log) console.log(new Date().toISOString() + " [API]:", ...arguments);
}

const config = require("./config.js").api;

api.dataDirectory = config.dataDirectory;

module.exports = api;

// enable body parsing
// parse application/x-www-form-urlencoded
api.use(bodyParser.urlencoded({ extended: false }));
// parse application/json
api.use(bodyParser.json());

// Configure logging
let accessLogStream = fs.createWriteStream(config.accesslog, {flags: 'a'});

// new token to log POST body
morgan.token('body', function (req) {return "body: " + JSON.stringify(req.body);});
api.use(morgan(':remote-addr - :remote-user [:date[clf]] ":method ' +
    ':url :body HTTP/:http-version" :status :res[content-length] :response-time ms ' +
    '":referrer" ":user-agent" ', {stream: accessLogStream}));

// configure listening port
api.listen(config.port, function () {
    logToConsole('Real-time OSM API server running.');
});

// initialise data storage
const dbname = config.taskdb;
api.db = new sqlite3.Database(dbname);
api.db.serialize(function() {
    api.db.run("CREATE TABLE if not exists tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, " +
                                         "name TEXT NOT NULL, " +
                                         "coverage BLOB NOT NULL, " +
                                         "URL TEXT, " +
                                         "expirationDate TEXT, " +
                                         "updateInterval INT DEFAULT 600, " +
                                         "lastUpdated TEXT, " +
                                         "addedDate TEXT, " +
                                         "averageRuntime TEXT, " +
                                         "unique(coverage));");
    api.db.run("CREATE TABLE if not exists taskstats (timestamp TEXT PRIMARY KEY, " +
                                             "taskID INTEGER, timing INTEGER);");
});

//
/// serve website
//
api.use(express.static('../web/'));
api.use('/data', serveIndex('./data/', {icons: true, view: "details"}));
api.use('/data', express.static('./data/'));


//
/// API Implementation
//
api.use(function(req, res, next) {
    // enable CORS
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", 
               "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

api.get('/api/tasks', function (req, res) {
    // responds with an array of all tasks
    if(req.query.name) {
        res.redirect('/tasks/name='+req.query.name);
        return;
    }
    if(req.query.id) {
        res.redirect('/tasks/'+req.query.id);
        return;
    }
    logToConsole("GET /tasks");
    let SQLselect = api.db.prepare("SELECT * FROM tasks;");
    logToConsole("GET tasks; SQL statement to be run:", SQLselect);
    SQLselect.all(function (err, tasks) {
        if(err) res.status(500).send("Error retrieving tasks from the database.");
        tasks.map(obj => {
            obj.coverage = JSON.parse(obj.coverage);
            return obj;
        });
        res.json(tasks);
    });
});

api.get(['/api/tasks/name=:name'], function (req, res) {
    // responds with the task whose name matches the one given
    logToConsole("/tasks/name=:name, params:", req.params);
    let SQLselect = api.db.prepare("SELECT * FROM tasks WHERE name == ?", req.params.name);
    logToConsole("GET tasks; SQL statement to be run:", SQLselect,
        "\nParameter:", req.params.name);
    SQLselect.all(function (err, rows) {
        if(err) {
            logToConsole("SQL error:", err);
            res.status(500).send("Error retrieving tasks from the database.");
        }
            res.json(rows);
    });
});

api.get(['/api/tasks/id=:id', '/tasks/:id'], function (req, res) {
    // responds with the task whose id matches the one given
    logToConsole("/tasks/id=:id, params:", req.params);
    let SQLselect = api.db.prepare("SELECT * FROM tasks WHERE id == ?", req.params.id);
    logToConsole("GET tasks; SQL statement to be run:", SQLselect, 
        "\nParameter:", req.params.id);
    SQLselect.all(function (err, rows) {
        if(err) {
            logToConsole("SQL error:", err);
            res.status(500).send("Error retrieving tasks from the database.");
        }
        res.json(rows);
    });
});

api.delete('/api/tasks', function (req, res) {
    let SQLdelete = api.db.prepare("DELETE FROM tasks WHERE id == ?", req.body.id);
    logToConsole("DELETE tasks; SQL statement to be run:", SQLdelete, 
        "\nParameter:", req.body.id);
    SQLdelete.run(function (err) {
        if(err) {
            logToConsole("SQL error:", err);
            res.status(500).send("Error retrieving tasks from the database.");
        }
        res.status(200).send("Succesfully deleted task with ID=" + req.body.id);
    });
});

api.post('/api/tasks', function (req, res) {
    // tries to add a task to the database, validates input
    
    // validation
    let errorlist = [];
    let name = req.body.name;
    let coverage = req.body.coverage;
    let expirationDate = req.body.expirationDate;
    let updateInterval = req.body.updateInterval || 600;
    logToConsole("req.body", req.body);
    if (!name || name.match(/^[a-zA-Z0-9_]+$/) === null)
        errorlist.push("name [a-zA-Z0-9_]");

    // try to parse string as JSON
    try {
        coverage = JSON.parse(coverage);
    }
    catch (e) {
        //ignore error if string is not JSON
    }
    if (typeof(coverage) != "object") {
        try {
            coverage = WKT.parse(coverage);
            if(coverage === null) {
                throw new Error("WKT string could not be parsed.");
            }
            if(coverage.coordinates.reduce((result, subpoly) => 
                                            subpoly.length + result, 0) > 10000) {
                throw new Error("Polygon has more that 10000 nodes.");
            }
        } catch (e) {
            logToConsole("Error parsing WKT string while adding task. Coverage:\n", 
                req.body.coverage, "\n", e);
            errorlist.push("coverage [WKT string]");
        }
    }
    if(errorlist.length === 0) {
        let hint = geojsonhint.hint(coverage);
        if(hint.some(element => element.message.match("right-hand rule"))) {
            coverage = geojsonrewind(coverage);
            hint = geojsonhint.hint(coverage);
        }
        hint = hint.filter(element => {
            if(element.message.match('old-style crs member')) {
                return false;
            }
            return true;
        });
        if (hint.length > 0) {
            errorlist.push("coverage: invalid polygon", 
                           JSON.stringify(hint));
        }
        // check whether coverage is geometry
        if(coverage.type == 'Polygon') {
            // generate feature
            coverage = {type: "Feature", geometry: coverage, properties: null};
        }
        if(!coverage.hasOwnProperty("geometry")) {
            errorlist.push("coverage: submitted feature does not have geometry property");
        }
        if (expirationDate && isNaN(Date.parse(expirationDate)))
            errorlist.push("expirationDate in ISO 8601, hours optional" +
                            "[YYYY-MM-DD(THH:MM:SS+HH:MM)]");
    }
    if(errorlist.length > 0) {
        res.status(400).send("Error adding task. Invalid parameters: " + 
            errorlist.join(", "));
        return;
    }
    else {
        // insert new task into database, sorry for callback hell,
        // can't think of another way to serialize. db.serialize did not work.
        let SQLinsert = api.db.prepare(
            `INSERT INTO tasks (name, coverage, expirationDate, addedDate, updateInterval) 
            VALUES (?, ?, ?, ?, ?);`, 
            name, JSON.stringify(coverage), expirationDate, 
            new Date().toISOString(), updateInterval);
        logToConsole("POST task; SQL for insertion:", SQLinsert,
            "\nParameters:", name, coverage, expirationDate, 
            new Date().toISOString(), updateInterval);
        SQLinsert.run(function getID(err) {
            if(err) {
                logToConsole("SQL error:", err);
                res.status(500).send("POST task; Error inserting task:" + err);
                return;
            }
            logToConsole("Getting id...");
            // get id
            let id;
            let SQLselect = api.db.prepare("SELECT * FROM tasks WHERE name == ? AND " +
                "coverage == ?", name, JSON.stringify(coverage));
            logToConsole("POST task; SQL for id select;", SQLselect,
                "\nParameters:", name, coverage);
            SQLselect.all(function updateURL(err, rows) {
                if(err) {
                    logToConsole("SQL error:", err);
                    res.status(500).send("POST task; Error retrieving id " +
                    "from database after insertion. Can't generate URL.");
                    return;
                } 
                logToConsole("GET id for generating url. Result:", rows);
                if(rows) id = rows[0].id;
                else {
                    res.status(500).send("POST task; Error retrieving id " +
                    "from database after insertion. Can't generate URL.");
                    return;
                }
                // generate and update URL
                let url = api.dataDirectory + id + "_" + name + ".osm.pbf";
                let SQLupdate = api.db.prepare("UPDATE tasks SET URL = ? WHERE id = ?", 
                    url, id);
                logToConsole("POST task; SQL for updating URL:", SQLupdate,
                    "\nParameters:", url, id);
                SQLupdate.run(function(err) {
                    if(err) {
                        logToConsole("SQL error:", err);
                        res.status(500).send("POST task; Error updating task url:" + err);
                        return;
                    }
                    // update URL in local variable
                    rows[0].URL = url;
                    res.json(rows[0]);
                });
            });
        });
    }
});

api.get('/api/taskstats', function (req, res) {
    // responds with an array of all task statistics
    logToConsole("GET /taskstats");
    let SQLselect = api.db.prepare("SELECT * FROM taskstats;");
    logToConsole("GET taskstats; SQL statement to be run:", SQLselect);
    SQLselect.all(function (err, taskstats) {
        if(err) res.status(500).send("Error retrieving tasks from the database.");
        res.json(taskstats);
    });
});
