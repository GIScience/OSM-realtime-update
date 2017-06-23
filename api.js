// jshint esversion: 6, node: true
"use strict";

const express = require('express');
const bodyParser = require('body-parser');
const app = express();
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

var api = {};
api.dataDirectory = "./data/";
module.exports = api;

// enable body parsing
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }));
// parse application/json
app.use(bodyParser.json());

// Configure logging
var accessLogStream = fs.createWriteStream('access.log', {flags: 'a'});

// new token to log POST body
morgan.token('body', function (req) {return "body: " + JSON.stringify(req.body);});
app.use(morgan(':remote-addr - :remote-user [:date[clf]] ":method ' +
    ':url :body HTTP/:http-version" :status :res[content-length] :response-time ms ' +
    '":referrer" ":user-agent" ', {stream: accessLogStream}));

// configure listening port
app.listen(1234, function () {
    logToConsole('Real-time OSM API server running.');
});

// initialise data storage
const dbname = "tasks.db";
api.db = new sqlite3.Database(dbname);
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

//// API Implementation
//
//

app.get('/api/tasks', function (req, res) {
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
    var SQLselect = api.db.prepare("SELECT * FROM tasks;");
    logToConsole("GET tasks; SQL statement to be run:", SQLselect);
    SQLselect.all(function (err, tasks) {
        if(err) res.status(500).send("Error retrieving tasks from the database.");
        res.json(tasks);
    });
});

app.get(['/api/tasks/name=:name'], function (req, res) {
    // responds with the task whose name matches the one given
    logToConsole("/tasks/name=:name, params:", req.params);
    var SQLselect = api.db.prepare("SELECT * FROM tasks WHERE name == ?", req.params.name);
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

app.get(['/api/tasks/id=:id', '/tasks/:id'], function (req, res) {
    // responds with the task whose id matches the one given
    logToConsole("/tasks/id=:id, params:", req.params);
    var SQLselect = api.db.prepare("SELECT * FROM tasks WHERE id == ?", req.params.id);
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

app.delete('/api/tasks', function (req, res) {
    var SQLdelete = api.db.prepare("DELETE FROM tasks WHERE id == ?", req.body.id);
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

app.post('/api/tasks', function (req, res) {
    // tries to add a task to the database, validates input
    
    // validation
    var errorlist = [];
    var name = req.body.name;
    var coverage = req.body.coverage;
    var expirationDate = req.body.expirationDate;
    var updateInterval = req.body.updateInveral || 600;
    logToConsole("req.body", req.body);
    if (!name || name.match(/^[a-zA-Z0-9]+$/) === null) 
        errorlist.push("name [a-zA-Z]");
    if (typeof(req.body.coverage) != "object") {
        try {
            coverage = WKT.parse(coverage);
            if(coverage.coordinates.reduce((result, subpoly) => 
                                            subpoly.length + result, 0) > 10000) {
                throw new Error("Polygon has more that 10000 nodes.");
            }
        } catch (e) {
            logToConsole("Error parsing WKT coverage while adding task. Coverage:\n", 
                coverage, "\n", e);
            errorlist.push("coverage [WKT string / GeoJSON]");
        }
    }

    var hint = geojsonhint.hint(coverage);
    if (hint.length > 0) {
        if(hint[0].message.match("right-hand rule")) {
            coverage = geojsonrewind(coverage);
            hint = geojsonhint.hint(coverage);
        }
        if (hint.length > 0) {
            errorlist.push("coverage: invalid polygon", 
                           JSON.stringify(geojsonhint.hint(coverage)));
        }
    }

    if (expirationDate && isNaN(Date.parse(expirationDate)))
        errorlist.push("expirationDate in ISO 8601, hours optional" +
                        "[YYYY-MM-DD(THH:MM:SS+HH:MM)]");

    if(errorlist.length > 0) {
        res.status(400).send("Error adding task. Invalid parameters: " + 
            errorlist.join(", "));
        return;
    }
    else {
        // insert new task into database, sorry for callback hell,
        // can't think of another way to serialize. db.serialize did not work.
        var SQLinsert = api.db.prepare(
            `INSERT INTO tasks (name, coverage, expirationDate, addedDate, updateInterval) 
            VALUES (?, ?, ?, ?, ?);`, 
            name, JSON.stringify(coverage), expirationDate, Date(), updateInterval);
        logToConsole("POST task; SQL for insertion:", SQLinsert,
            "\nParameters:", name, coverage, expirationDate, Date(), updateInterval);
        SQLinsert.run(function getID(err) {
            if(err) {
                logToConsole("SQL error:", err);
                res.status(500).send("POST task; Error inserting task:" + err);
                return;
            }
            logToConsole("Getting id...");
            // get id
            var id;
            var SQLselect = api.db.prepare("SELECT * FROM tasks WHERE name == ? AND " +
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
                var url = api.dataDirectory + id + "_" + name + ".osm.pbf";
                var SQLupdate = api.db.prepare("UPDATE tasks SET URL = ? WHERE id = ?", 
                    url, id);
                logToConsole("POST task; SQL for updating URL:", SQLupdate,
                    "\nParameters:", url);
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

app.get('/api/taskstats', function (req, res) {
    // responds with an array of all task statistics
    logToConsole("GET /taskstats");
    var SQLselect = api.db.prepare("SELECT * FROM taskstats;");
    logToConsole("GET taskstats; SQL statement to be run:", SQLselect);
    SQLselect.all(function (err, taskstats) {
        if(err) res.status(500).send("Error retrieving tasks from the database.");
        res.json(taskstats);
    });
});

