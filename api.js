// jshint esversion: 6, node: true
"use strict";

const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const morgan = require('morgan');   // library for logging
const fs = require("fs");           // file system access for logging
const sqlite3 = require('sqlite3').verbose(); // database access
const WKT = require('terraformer-wkt-parser'); // WKT parsing


// enable body parsing
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }));
// parse application/json
app.use(bodyParser.json());

// Configure logging
var accessLogStream = fs.createWriteStream('access.log', {flags: 'a'});

// new token to log POST body
morgan.token('body', function (req, res) {return "body: " + JSON.stringify(req.body);});
app.use(morgan(':remote-addr - :remote-user [:date[clf]] ":method ' +
    ':url :body HTTP/:http-version" :status :res[content-length] :response-time ms ' +
    '":referrer" ":user-agent" ', {stream: accessLogStream}));

// configure listening port
app.listen(1234, function () {
    console.log('Realtime OSM API server running.');
});

// initialise data storage
const dbname = "tasks.db";
var db = new sqlite3.Database(dbname);
db.run("CREATE TABLE if not exists tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, " +
                                         "name TEXT NOT NULL, " +
                                         "coverage BLOB NOT NULL, " +
                                         "URL TEXT, " +
                                         "expirationDate TEXT, " +
                                         "lastUpdated TEXT, " +
                                         "addedDate TEXT, " +
                                         "averageRuntime TEXT, " +
                                         "unique(coverage));");
db.run("CREATE TABLE if not exists taskstats (timestamp TEXT PRIMARY KEY, " +
                                             "taskID INTEGER, timing INTEGER);");

//// API Implementation
//
//

app.get('/tasks', function (req, res) {
    // responds with an array of all tasks
    if(req.query.name) {
        res.redirect('/tasks/name='+req.query.name);
        return;
    }
    if(req.query.id) {
        res.redirect('/tasks/'+req.query.id);
        return;
    }
    console.log("GET /tasks");
    var SQLselect = db.prepare("SELECT * FROM tasks;");
    console.log("GET tasks; SQL statement to be run:", SQLselect);
    SQLselect.all(function (err, tasks) {
        if(err) res.status(500).send("Error retrieving tasks from the database.");
        res.json(tasks);
    });
});

app.get(['/tasks/name=:name'], function (req, res) {
    // responds with the task whose name matches the one given
    console.log("/tasks/name=:name, params:", req.params);
    var SQLselect = db.prepare("SELECT * FROM tasks WHERE name == ?", req.params.name);
    console.log("GET tasks; SQL statement to be run:", SQLselect,
        "\nParameter:", req.params.name);
    SQLselect.all(function (err, rows) {
        if(err) {
            console.log("SQL error:", err);
            res.status(500).send("Error retrieving tasks from the database.");
        }
            res.json(rows);
    });
});

app.get(['/tasks/id=:id', '/tasks/:id'], function (req, res) {
    // responds with the task whose id matches the one given
    console.log("/tasks/id=:id, params:", req.params);
    var SQLselect = db.prepare("SELECT * FROM tasks WHERE id == ?", req.params.id);
    console.log("GET tasks; SQL statement to be run:", SQLselect, 
        "\nParameter:", req.params.id);
    SQLselect.all(function (err, rows) {
        if(err) {
            console.log("SQL error:", err);
            res.status(500).send("Error retrieving tasks from the database.");
        }
        res.json(rows);
    });
});

app.delete('/tasks', function (req, res) {
    var SQLdelete = db.prepare("DELETE FROM tasks WHERE id == ?", req.body.id);
    console.log("DELETE tasks; SQL statement to be run:", SQLdelete, 
        "\nParameter:", req.body.id);
    SQLdelete.run(function (err) {
        if(err) {
            console.log("SQL error:", err);
            res.status(500).send("Error retrieving tasks from the database.");
        }
        res.status(200).send("Succesfully deleted task with ID=" + req.body.id);
    });
});

app.post('/tasks', function (req, res) {
    // tries to add a task to the database, validates input
    
    // validation
    var errorlist = [];
    var name = req.body.name;
    var coverage = req.body.coverage;
    var expirationDate = req.body.expirationDate;
    console.log("req.body", req.body);
    if (!name || name.match(/^[a-zA-Z0-9]+$/) === null) 
        errorlist.push("name [a-zA-Z]");
    try {
        WKT.parse(coverage);
    } catch (e) {
        console.log("Error parsing WKT coverage while adding task. Coverage:\n", 
            coverage, "\n", e);
        errorlist.push("coverage [WKT string]");
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
        var SQLinsert = db.prepare("INSERT INTO tasks (name, coverage, expirationDate, addedDate) " +
               "VALUES (?, ?, ?, ?);", name, coverage, expirationDate, Date());
        console.log("POST task; SQL for insertion:", SQLinsert,
            "\nParameters:", name, coverage, expirationDate, Date());
        SQLinsert.run(function getID(err) {
            if(err) {
                console.log("SQL error:", err);
                res.status(500).send("POST task; Error inserting task:" + err);
                return;
            }
            console.log("Getting id...");
            // get id
            var id;
            var SQLselect = db.prepare("SELECT * FROM tasks WHERE name == ? AND " +
                "coverage == ?", name, coverage);
            console.log("POST task; SQL for id select;", SQLselect,
                "\nParameters:", name, coverage);
            SQLselect.all(function updateURL(err, rows) {
                if(err) {
                    console.log("SQL error:", err);
                    res.status(500).send("POST task; Error retrieving id " +
                    "from database after insertion. Can't generate URL.");
                    return;
                } 
                console.log("GET id for generating url. Result:", rows);
                if(rows) id = rows[0].id;
                else {
                    res.status(500).send("POST task; Error retrieving id " +
                    "from database after insertion. Can't generate URL.");
                    return;
                }
                // generate and update URL
                var url = "data/" + id + "_" + name + ".pbf";
                var SQLupdate = db.prepare("UPDATE tasks SET URL = ? WHERE id = ?", 
                    url, id);
                console.log("POST task; SQL for updating URL:", SQLupdate,
                    "\nParameters:", url);
                SQLupdate.run(function(err) {
                    if(err) {
                        console.log("SQL error:", err);
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

app.get('/taskstats', function (req, res) {
    // responds with an array of all task statistics
    console.log("GET /taskstats");
    var SQLselect = db.prepare("SELECT * FROM taskstats;");
    console.log("GET taskstats; SQL statement to be run:", SQLselect);
    SQLselect.all(function (err, taskstats) {
        if(err) res.status(500).send("Error retrieving tasks from the database.");
        res.json(taskstats);
    });
});

