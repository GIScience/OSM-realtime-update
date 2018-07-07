"use strict";

const assert = require('assert'); // assertions for testing
const express = require('express');
const serveIndex = require('serve-index');
const bodyParser = require('body-parser');
const winston = require('winston'); // logging
const morgan = require('morgan');   // logging express access
const sqlite3 = require('sqlite3').verbose(); // database access
const WKT = require('wellknown'); // WKT parsing
const geojsonhint = require('@mapbox/geojsonhint'); // validate GeoJSONs
const geojsonrewind = require('geojson-rewind'); // fix right-hand rule for GeoJSONs

const geofabrikRegions = ["africa", "antarctica", "asia", "australia-oceania",
    "central-america", "europe", "north-america", "russia", "south-america",
    "algeria", "angola", "benin", "botswana", "burkina-faso", "burundi",
    "cameroon", "canary-islands", "cape-verde", "central-african-republic", "chad",
    "comores", "congo-brazzaville", "congo-democratic-republic", "djibouti",
    "egypt", "equatorial-guinea", "eritrea", "ethiopia", "gabon", "ghana",
    "guinea-bissau", "guinea", "ivory-coast", "kenya", "lesotho", "liberia",
    "libya", "madagascar", "malawi", "mali", "mauritania", "mauritius", "morocco",
    "mozambique", "namibia", "nigeria", "niger", "rwanda",
    "saint-helena-ascension-and-tristan-da-cunha", "sao-tome-and-principe",
    "senegal-and-gambia", "seychelles", "sierra-leone", "somalia",
    "south-africa-and-lesotho", "south-africa", "south-sudan", "sudan",
    "swaziland", "tanzania", "togo", "tunisia", "uganda", "zambia", "zimbabwe",
    "afghanistan", "azerbaijan", "bangladesh", "bhutan", "cambodia", "china",
    "gcc-states", "india", "indonesia", "iran", "iraq", "israel-and-palestine",
    "japan", "jordan", "kazakhstan", "kyrgyzstan", "lebanon",
    "malaysia-singapore-brunei", "maldives", "mongolia", "myanmar", "nepal",
    "north-korea", "pakistan", "philippines", "russia-asian-part", "south-korea",
    "sri-lanka", "syria", "taiwan", "tajikistan", "thailand", "turkmenistan",
    "uzbekistan", "vietnam", "yemen", "chubu", "chugoku", "hokkaido", "kansai",
    "kanto", "kyushu", "shikoku", "tohoku", "australia", "fiji", "new-caledonia",
    "new-zealand", "papua-new-guinea", "belize", "cuba", "guatemala",
    "haiti-and-domrep", "nicaragua", "albania", "alps", "andorra", "austria",
    "azores", "belarus", "belgium", "bosnia-herzegovina", "british-isles",
    "bulgaria", "croatia", "cyprus", "czech-republic", "dach", "denmark",
    "estonia", "faroe-islands", "finland", "france", "georgia", "germany",
    "great-britain", "greece", "hungary", "iceland",
    "ireland-and-northern-ireland", "isle-of-man", "italy", "kosovo", "latvia",
    "liechtenstein", "lithuania", "luxembourg", "macedonia", "malta", "moldova",
    "monaco", "montenegro", "netherlands", "norway", "poland", "portugal",
    "romania", "russia-european-part", "serbia", "slovakia", "slovenia", "spain",
    "sweden", "switzerland", "turkey", "ukraine", "alsace", "aquitaine",
    "auvergne", "basse-normandie", "bourgogne", "bretagne", "centre",
    "champagne-ardenne", "corse", "franche-comte", "guadeloupe", "guyane",
    "haute-normandie", "ile-de-france", "languedoc-roussillon", "limousin",
    "lorraine", "martinique", "mayotte", "midi-pyrenees", "nord-pas-de-calais",
    "pays-de-la-loire", "picardie", "poitou-charentes",
    "provence-alpes-cote-d-azur", "reunion", "rhone-alpes", "baden-wuerttemberg",
    "bayern", "berlin", "brandenburg", "bremen", "hamburg", "hessen",
    "mecklenburg-vorpommern", "niedersachsen", "nordrhein-westfalen",
    "rheinland-pfalz", "saarland", "sachsen-anhalt", "sachsen",
    "schleswig-holstein", "thueringen", "freiburg-regbez", "karlsruhe-regbez",
    "stuttgart-regbez", "tuebingen-regbez", "mittelfranken", "niederbayern",
    "oberbayern", "oberfranken", "oberpfalz", "schwaben", "unterfranken",
    "arnsberg-regbez", "detmold-regbez", "duesseldorf-regbez", "koeln-regbez",
    "muenster-regbez", "england", "scotland", "wales", "berkshire",
    "buckinghamshire", "cambridgeshire", "cheshire", "cornwall", "cumbria",
    "derbyshire", "devon", "dorset", "east-sussex", "east-yorkshire-with-hull",
    "essex", "gloucestershire", "greater-london", "greater-manchester",
    "hampshire", "herefordshire", "hertfordshire", "isle-of-wight", "kent",
    "lancashire", "leicestershire", "norfolk", "northumberland", "north-yorkshire",
    "nottinghamshire", "oxfordshire", "shropshire", "somerset", "south-yorkshire",
    "staffordshire", "suffolk", "surrey", "west-midlands", "west-sussex",
    "west-yorkshire", "wiltshire", "worcestershire", "enfield", "centro", "isole",
    "nord-est", "nord-ovest", "sud", "dolnoslaskie", "kujawsko-pomorskie",
    "lodzkie", "lubelskie", "lubuskie", "malopolskie", "mazowieckie", "opolskie",
    "podkarpackie", "podlaskie", "pomorskie", "slaskie", "swietokrzyskie",
    "warminsko-mazurskie", "wielkopolskie", "zachodniopomorskie", "canada",
    "greenland", "mexico", "us-midwest", "us-northeast", "us-pacific", "us-south",
    "us-west", "alberta", "british-columbia", "manitoba", "new-brunswick",
    "newfoundland-and-labrador", "northwest-territories", "nova-scotia", "nunavut",
    "ontario", "prince-edward-island", "quebec", "saskatchewan", "yukon",
    "alabama", "alaska", "arizona", "arkansas", "california", "colorado",
    "connecticut", "delaware", "district-of-columbia", "florida", "georgia",
    "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky",
    "louisiana", "maine", "maryland", "massachusetts", "michigan", "minnesota",
    "mississippi", "missouri", "montana", "nebraska", "nevada", "new-hampshire",
    "new-jersey", "new-mexico", "new-york", "north-carolina", "north-dakota",
    "ohio", "oklahoma", "oregon", "pennsylvania", "puerto-rico", "rhode-island",
    "south-carolina", "south-dakota", "tennessee", "texas", "utah", "vermont",
    "virginia", "washington", "west-virginia", "wisconsin", "wyoming",
    "central-fed-district", "crimean-fed-district", "far-eastern-fed-district",
    "kaliningrad", "north-caucasus-fed-district", "northwestern-fed-district",
    "siberian-fed-district", "south-fed-district", "ural-fed-district",
    "volga-fed-district", "argentina", "bolivia", "brazil", "chile", "colombia",
    "ecuador", "paraguay", "peru", "suriname", "uruguay"];

function api(customconfig) {
    const api = express();

    // load configuration
    const config = customconfig || require("./config.js");

    // config sanity checks
    assert(typeof config.api.dataDirectory == "string",
        "Configuration error: dataDirectory must be a string.");
    assert(typeof config.api.port == 'number',
        "Configuration error: port must be a number.");
    assert(typeof config.api.accesslog == 'string',
        "Configuration error: accesslog must be a string");
    assert(typeof config.api.taskdb == 'string',
        "Configuration error: taskdb must be a string");
    assert((typeof config.loglevel == "number" &&
        config.loglevel >= 0 && config.loglevel < 8) ||
        typeof config.loglevel == "string" &&
        ["emerg", "alert", "crit", "error", "warning",
            "notice", "info", "debug"].includes(config.loglevel),
        "Configuration error: loglevel must be either number (0-7) or " +
        "a syslog level string");

    // configure logging
    const log = new (winston.Logger)({
        level: config.loglevel,
        transports: [
            new winston.transports.Console({
                stderrLevels: ['error'],
                prettyPrint: true,
                depth: 10,
                colorize: true,
                timestamp: true
            })
        ]
    });
    log.setLevels(winston.config.syslog.levels);
    const accesslogger = new (winston.Logger)({
        level: 'info',
        transports: [
            new (winston.transports.File)({
                timestamp: true,
                prettyPrint: (object) => JSON.stringify(object),
                filename: config.api.accesslog
            })
        ]
    });
    accesslogger.setLevels(winston.config.syslog.levels);
    accesslogger.stream = {
        write: message => accesslogger.info("[API access]", message)
    };

    // set data directory for serving data
    api.dataDirectory = config.api.dataDirectory;

    // enable body parsing
    // parse application/x-www-form-urlencoded
    api.use(bodyParser.urlencoded({ extended: false }));
    // parse application/json
    api.use(bodyParser.json());

    // new token to log POST body
    morgan.token('body', function (req) {return "body: " + JSON.stringify(req.body);});
    api.use(morgan(':remote-addr - :remote-user [:date[clf]] ":method ' +
        ':url :body HTTP/:http-version" :status :res[content-length] :response-time ms ' +
        '":referrer" ":user-agent" ', {stream: accesslogger.stream}));

    // configure listening port
    api.listen(config.api.port, function () {
        log.notice(`Real-time OSM API server running on port ${config.api.port}.`);
    });

    // initialise data storage
    const dbname = config.api.taskdb;
    api.db = new sqlite3.Database(dbname);
    api.db.serialize(function() {
        api.db.run("CREATE TABLE if not exists tasks (" +
            "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
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
    api.use(express.static('./web/'));
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
        log.info("GET /tasks");
        let SQLselect = api.db.prepare("SELECT * FROM tasks;");
        log.debug("GET tasks; SQL statement to be run:", SQLselect);
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
        log.info("/tasks/name=:name, params:", req.params);
        let SQLselect = api.db.prepare("SELECT * FROM tasks WHERE name == ?", req.params.name);
        log.debug("GET tasks; SQL statement to be run:", SQLselect,
            "\nParameter:", req.params.name);
        SQLselect.all(function (err, tasks) {
            if(err) res.status(500).send("Error retrieving tasks from the database.");
            tasks.map(obj => {
                obj.coverage = JSON.parse(obj.coverage);
                return obj;
            });
            res.json(tasks);
        });
    });

    api.get(['/api/tasks/id=:id', '/tasks/:id'], function (req, res) {
        // responds with the task whose id matches the one given
        log.info("/tasks/id=:id, params:", req.params);
        let SQLselect = api.db.prepare("SELECT * FROM tasks WHERE id == ?", req.params.id);
        log.debug("GET tasks; SQL statement to be run:", SQLselect,
            "\nParameter:", req.params.id);
        SQLselect.all(function (err, tasks) {
            if(err) res.status(500).send("Error retrieving task from the database." +
                                         err);
            tasks.map(obj => {
                obj.coverage = JSON.parse(obj.coverage);
                return obj;
            });
            res.json(tasks);
        });
    });

    api.delete('/api/tasks', function (req, res) {
        let SQLdelete = api.db.prepare("DELETE FROM tasks WHERE id == ?", req.body.id);
        log.info("DELETE tasks; SQL statement to be run:", SQLdelete,
            "\nParameter:", req.body.id);
        SQLdelete.run(function (err) {
            if(err) {
                log.error("SQL error:", err);
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
        log.debug("req.body", req.body);
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
            // check if coverage is Geofabrik region string
            if (geofabrikRegions.includes(coverage)) {
                coverage = {"geofabrikRegion": coverage};
            } else {
                // parse wkt string
                try {
                    let wktcoverage = WKT.parse(coverage);
                    if (wktcoverage === null) {
                        throw new Error("Can't parse coverage string as WKT or " +
                                        "Geofabrik region code.");
                    } else if(wktcoverage.coordinates.reduce((result, subpoly) =>
                        subpoly.length + result, 0) > 10000) {
                        throw new Error("Polygon has more that 10000 nodes.");
                    } else {
                        coverage = wktcoverage;
                    }
                } catch (e) {
                    log.error("Error parsing string while adding task. Coverage:\n",
                        req.body.coverage, "\n", e);
                    errorlist.push("coverage [GeoJSON / WKT string / Geofabrik regioncode]:" +
                                   e);
                }
            }
        } else {
            // treat as GeoJSON
            //
            // dismiss GeoJSON 'properties' in order to be able to compare GeoJSON
            // coverages with WKT coverages in database and check for 'unique' constraint
            coverage.properties = null;
        }
        if(errorlist.length === 0) {
            // check if geojson was correctly parsed
            if (!coverage.hasOwnProperty("geofabrikRegion")) {
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
            }
            if (expirationDate) {
                if (isNaN(Date.parse(expirationDate))) {
                    errorlist.push("expirationDate in ISO 8601, hours optional" +
                        "[YYYY-MM-DD(THH:MM:SS+HH:MM)]");
                } else {
                    // generate ISO Date String
                    expirationDate = new Date(expirationDate).toISOString();
                }
            }
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
                "INSERT INTO tasks (name, coverage, expirationDate, addedDate," +
                "updateInterval) VALUES (?, ?, ?, ?, ?);",
                name, JSON.stringify(coverage), expirationDate,
                new Date().toISOString(), updateInterval);
            log.info("POST task; SQL for insertion:", SQLinsert,
                "\nParameters:", {name: name, coverage: coverage,
                    expirationdate: expirationDate, creationdate: new Date().toISOString(),
                    updateInterval: updateInterval});
            SQLinsert.run(function getID(err) {
                if(err) {
                    log.error("SQL error:", err);
                    res.status(500).send("POST task; Error inserting task:" + err);
                    return;
                }
                // get id
                let id;
                let SQLselect = api.db.prepare("SELECT * FROM tasks WHERE name == ? AND " +
                    "coverage == ?", name, JSON.stringify(coverage));
                SQLselect.all(function updateURL(err, rows) {
                    if(err) {
                        log.error("SQL error:", err);
                        res.status(500).send("POST task; Error retrieving id " +
                            "from database after insertion. Can't generate URL.");
                        return;
                    }
                    log.debug("GET id for generating url. Result:", rows);
                    if(rows && rows.length === 1) {
                        id = rows[0].id;
                    } else {
                        res.status(500).send("POST task; Error retrieving id " +
                            "from database after insertion. Can't generate URL.");
                        return;
                    }
                    // generate and update URL
                    let url = api.dataDirectory + id + "_" + name + ".osm.pbf";
                    let SQLupdate = api.db.prepare("UPDATE tasks SET URL = ? WHERE id = ?",
                        url, id);
                    log.debug("POST task; SQL for updating URL:", SQLupdate,
                        "\nParameters:", url, id);
                    SQLupdate.run(function(err) {
                        if(err) {
                            log.error("SQL error:", err);
                            res.status(500).send("POST task; Error updating task url:" + err);
                            return;
                        }
                        // update URL in local variable
                        rows[0].URL = url;
                        rows[0].coverage = JSON.parse(rows[0].coverage);
                        res.json(rows[0]);
                    });
                });
            });
        }
    });

    api.get('/api/taskstats', function (req, res) {
        // responds with an array of all task statistics
        log.info("GET /taskstats");
        let SQLselect = api.db.prepare("SELECT * FROM taskstats;");
        log.debug("GET taskstats; SQL statement to be run:", SQLselect);
        SQLselect.all(function (err, taskstats) {
            if(err) res.status(500).send("Error retrieving tasks from the database.");
            res.json(taskstats);
        });
    });

    return api;
}

module.exports = function(customconfig) {
    return new api(customconfig);
};

// init api if run standalone
if (require.main === module) new api();
