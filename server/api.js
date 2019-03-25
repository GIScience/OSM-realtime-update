"use strict";

const fs = require('fs'); // file system operations
const crypto = require('crypto'); // file system operations
const assert = require('assert'); // assertions for testing
const express = require('express');
const serveIndex = require('serve-index');
const bodyParser = require('body-parser');
const winston = require('winston'); // logging
const morgan = require('morgan');   // logging express access
const sequelize = require('sequelize'); // database access
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
    assert(typeof config.api.database == 'string',
        "Configuration error: database must be a string");
    assert(typeof config.api.adminkey == 'string',
        "Configuration error: adminkey must be a string");
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
    api.db = new sequelize(config.api.database, null, null, {
        dialect: "sqlite",
        storage: config.api.database,
        logging: false,
        operatorsAliases: false
    });

    // define tasks, taskstats and user model and create database if not exists
    api.db.tasks = api.db.define('tasks', {
        id: {type: sequelize.INTEGER, primaryKey: true, autoIncrement: true},
        name: {type: sequelize.TEXT, notNull: true},
        coverage: {type: sequelize.BLOB, notNull: true, unique: true},
        URL: {type: sequelize.TEXT},
        expirationDate: {type: sequelize.TEXT},
        updateInterval: {type: sequelize.INTEGER, defaultValue: 600},
        lastUpdated: {type: sequelize.DATE},
        addedDate: {type: sequelize.DATE, notNull: true},
        averageRuntime: {type: sequelize.TEXT}
    }, {timestamps: false});

    api.db.taskstats = api.db.define('taskstats', {
        timestamp: {type: sequelize.TEXT, primaryKey: true},
        taskID: {type: sequelize.INTEGER, notNull: true},
        timing: {type: sequelize.INTEGER, notNull: true}
    }, {timestamps: false});

    api.db.users = api.db.define('users', {
        name: {type: sequelize.TEXT, primaryKey: true, unique: {msg: "Username already taken."}},
        email: {type: sequelize.TEXT, notNull: true, unique: {msg: 'This email is already taken.'},
				validate: { isEmail: { msg: 'Email address must be valid.' } } },
        role: {type: sequelize.TEXT, notNull: true},
        apikey: {type: sequelize.TEXT, notNull: true},
        approved: {type: sequelize.BOOLEAN, defaultValue: false},
        signupDate: {type: sequelize.DATE, notNull: true}
    }, {timestamps: false});

    api.db.tasks.belongsTo(api.db.users, {as: "author"});

    api.db.sync().then(() => {
        // if no admin present, add one and log credentials
        api.db.users.findAll({
            where: { role: "admin" }
        }).then(role => {
            if (role.length == 0) {
                api.db.users.create({
                    name: "admin",
                    role: "admin",
                    email: "admin@admin.com",
                    apikey: config.api.adminkey,
                    approved: true,
                    signupDate: new Date().toISOString()
                }).then(admin => {
                    log.notice("No admin account found, created one. " +
                        "Please change default admin password!", admin.dataValues);
                }).catch(err => {
                    // error handling
                    log.error("POST user; Cannot create admin role:" + err);
                });
            }
        });
    }).catch(err => log.critical(`Cannot initialize database. Error message: ${err}`));


    //
    /// serve website
    //

    // throttling
    // api.use(function(req, res, next) {
    //     let bps = config.api.maxBandwidth;
    //     if (bps > 0) {
    //         var total = 0;
    //         var resume = req.socket.resume;

    //         // make sure nothing else can resume
    //         req.socket.resume = function() {};

    //         var pulse = setInterval(function() {
    //             total = total - bps / 100;
    //             if (total < bps) {
    //                 resume.call(req.socket);
    //             }
    //         }, 10);

    //         req.on('data', function(chunk) {
    //             log.debug("chunk", chunk.length);
    //             total += chunk.length;
    //             if (total >= bps) {
    //                 req.socket.pause();
    //             }
    //         }).on('end', function() {
    //             clearInterval(pulse);
    //             // restore resume because socket could be reused
    //             req.socket.resume = resume;
    //             // future requests need the socket to be flowing
    //             req.socket.resume();
    //         });
    //     }
    //     next();
    // });
    api.use(express.static('./web/'));
    api.use('/data', serveIndex(api.dataDirectory, {icons: true, view: "details"}));
    api.use('/data', express.static(api.dataDirectory));



    ////
    /// API Implementation
    //
    api.use(function(req, res, next) {
        // enable CORS
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
        next();
    });

    /// task handling
    //
    api.get('/api/tasks', checkUserRole, function (req, res) {
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

        api.db.tasks.findAll().then(tasks => {
            tasks.map(obj => {
                obj.coverage = JSON.parse(obj.coverage);
                // mask author if not admin
                if (req.role != "admin")
                    obj.authorName = "";
                return obj;
            });
            res.json(tasks);
            return;
        }).catch(err => {
            res.status(500).send(`Error retrieving tasks from the database: ${err}`);
            return;
        });
    });

    api.get(['/api/tasks/name=:name'], checkUserRole, function (req, res) {
        // responds with the task whose name matches the one given
        log.info("/tasks/name=:name, params:", req.params);
        api.db.tasks.findAll({
            where: {
                name: req.params.name
            }
        }).then(tasks => {
            tasks.map(obj => {
                obj.coverage = JSON.parse(obj.coverage);
                // mask author if not admin
                if (req.role != "admin")
                    obj.authorName = "";
                return obj;
            });
            res.json(tasks);
            return;
        }).catch(err => {
            log.error(`Error retrieving tasks from the database: ${err}`);
            res.status(500).send(`Error retrieving tasks from the database: ${err}`);
            return;
        });
    });

    api.get(['/api/tasks/id=:id', '/tasks/:id'], function (req, res) {
        // responds with the task whose id matches the one given
        log.info("/tasks/id=:id, params:", req.params);
        api.db.tasks.findAll({
            where: {
                id: req.params.id
            }
        }).then(tasks => {
            tasks.map(obj => {
                obj.coverage = JSON.parse(obj.coverage);
                // mask author if not admin
                if (req.role != "admin")
                    obj.authorName = "";
                return obj;
            });
            res.json(tasks);
            return;
        }).catch(err => {
            log.error(`Error retrieving tasks from the database: ${err}`);
            res.status(500).send(`Error retrieving tasks from the database: ${err}`);
            return;
        });
    });

    api.delete('/api/tasks', checkUserRole, function (req, res) {
        log.info("DELETE tasks; ", req.body.id);
        if (req.role == "user" || req.role == "admin") {
            api.db.tasks.destroy({
                where: {
                    id: req.body.id
                }
            }).then(() => {
                res.status(200).send("Succesfully deleted task with ID=" + req.body.id);
                return;
            }).catch(err => {
                log.error(`Error deleting tasks from the database: ${err}`);
                res.status(500).send(`Error deleting task from the database: ${err}`);
                return;
            });
        } else {
            res.status(403).send('Access forbidden. Check API key validity. Request an API key: info@heigit.org');
            return;
        }
    });

    api.post('/api/tasks', checkUserRole, function (req, res) {
        // tries to add a task to the database, validates input

        // valid api key check
        if (req.role != "admin" && req.role != "user") {
            res.status(403).send('Access forbidden. Check API key validity. Request an API key: info@heigit.org');
            return;
        }

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
            // insert new task into database
            log.info("POST task.",
                "\nParameters:", {name: name, coverage: coverage,
                    expirationdate: expirationDate, addedDate: new Date().toISOString(),
                    updateInterval: updateInterval});
            api.db.tasks.create({
                name: name,
                coverage: JSON.stringify(coverage),
                expirationDate: expirationDate,
                addedDate: new Date().toISOString(),
                updateInterval: updateInterval
            }).then(task => {
                // set author
                task.setAuthor(req.user);
                // update url
                task.update({
                    URL: api.dataDirectory + task.id + "_" + task.name + ".osm.pbf"
                }).then(task => {
                    res.json(task);
                    return;
                });
            }).catch(err => {
                // error handling
                log.error("POST task; Error inserting task:" + err);
                res.status(500).send("POST task; Error inserting task:" + err);
                return;
            });
        }
    });

    api.get('/api/taskstats', function (req, res) {
        // responds with an array of all task statistics
        log.info("GET /taskstats");
        api.db.taskstats.findAll().then(taskstats => {
            res.json(taskstats);
            return;
        }).catch(err => {
            res.status(500).send(`Error retrieving taskstats from the database: ${err}`);
            return;
        });
    });

    /// user handling
    //
    function checkUserRole(req, res, next) {
        // check for API key and matching role
        log.debug("checkUserRole:", "\nreq.route.methods", req.route.methods,
                  "\nreq.route.path", req.route.path, "\nreq.body", req.body,
            "\nreq.params", req.params, "\nreq.query", req.query);
        let key = req.body.apikey || req.params.apikey || req.query.apikey;
        if(key) {
            api.db.users.findAll({
                where: {
                    apikey: key
                }
            }).then(user => {
                if(user.length > 1) {
                    res.status(500).send("Error, multiple API keys match. Contact admin.");
                    return next();
                } else {
                    if (user.length == 1) {
                        if (user[0].approved) {
                            req.role = user[0].role;
                            req.user = user[0];
                            log.debug("req.role:", req.role);
                        } else {
							res.status(403).send("Access forbidden. API key has not been approved yet.");
							return;
						}
                    } else {
                        req.role = undefined;
                    }
                    return next();
                }
            }).catch(err => {
                res.status(500).send(`Error authenticating api key: ${err}`);
                return next();
            });
        } else {
            req.role = undefined;
            return next();
        }
    }

    api.get('/api/users/', checkUserRole, function (req, res) {
        // responds with an array of all users
        if(req.query.name) {
            res.redirect('/users/name='+req.query.name);
            return;
        }
        log.info("GET /users");

        if (req.role == "admin") {
            // fetch users and send results
            api.db.users.findAll().then(users => {
                res.json(users);
                return;
            }).catch(err => {
                res.status(500).send(`Error retrieving users from the database: ${err}`);
                return;
            });
        } else {
            if (req.role == "user") {
                res.status(403).send('Access forbidden. Need admin key. Contact: info@heigit.org');
                return;
            } else {
                res.status(403).send('Access forbidden. Check API key validity. Request an API key: info@heigit.org');
                return;
            }
        }
    });

    api.get(['/api/users/name=:name'], checkUserRole, function (req, res) {
        // responds with the user whose name matches the one given
        log.info("/users/name=:name, params:", req.params);
        if (req.role == "admin") {
            // fetch users and send results
            api.db.users.findAll({
                where: {
                    name: req.params.name
                }
            }).then(users => {
                res.json(users);
                return;
            }).catch(err => {
                res.status(500).send(`Error retrieving users from the database: ${err}`);
                return;
            });
        } else {
            res.status(403).send('Access forbidden. Check API key validity. Request an API key: info@heigit.org');
            return;
        }
    });

    // add a user
    api.post('/api/users', checkUserRole, function (req, res) {
        // tries to add a user to the database
        log.debug("Adding user: req.body", req.body);

        // validation
        let name = req.body.name;
        if (req.body.role === "admin" && req.role !== "admin") {
            res.status(403).send("Access restricted. Provide admin API key to add admin user.");
            return;
        }
        let role;
        if(req.body.role) {
            role = req.body.role;
        }
        else {
            role = "user";
        }
        // no five-lines regex check, trust on sequelize.js to prevent sql injection
        let email = req.body.email;
        let approved;
        // generate 32 bit api key
        let apikey = crypto.randomBytes(32).toString("base64");
        // replace + with = to avoid URL encoding issues
        apikey = apikey.replace("+", "=");
        if (req.role == "admin") {
            approved = true;
        } else {
            approved = false;
        }

        let errorlist = [];
        if (!name || name.match(/^[a-zA-Z0-9_]+$/) === null)
            errorlist.push("name [a-zA-Z0-9_]");

        if (!role || role.match(/(^user$|^admin$)/) === null)
            errorlist.push("role ['user' or 'admin']");

        if(errorlist.length > 0) {
            res.status(400).send("Error adding user. Invalid parameters: " +
                errorlist.join(", "));
            return;
        }
        else {
            // insert new user into database
            log.info("POST user.",
                "\nParameters:", {name: name, role: role, approved: approved,
                    signupDate: new Date().toISOString()});
            api.db.users.create({
                name: name,
                role: role,
                email: email,
                apikey: apikey,
                approved: approved,
                signupDate: new Date().toISOString()
            }).then(user => {
                res.json(user);
                // todo send mail to new user ?
                return;
            }).catch(err => {
                // error handling
                log.warning("POST user; Error inserting user: " + err);
                res.status(500).send("Error adding user: " + err.message);
                return;
            });
        }
    });

    // approve a user
    api.get(['/api/users/approve/'], checkUserRole, function (req, res) {
        // approve a user by name
        log.info("GET /users/approve/, query:", req.query);
        console.log("req.role approve:", req.role);
        if (req.role == "admin") {
            api.db.users.update({approved: true}, {
                where: { name: req.query.name }
            }).then(() => {
                res.status(200).send("Successfully approved user with name=" + req.query.name);
                // todo send mail to approved user ?
                return;
            }).catch(err => {
                log.error(`Error approving user: ${err}`);
                res.status(500).send(`Error approving user: ${err}`);
                return;
            });
        } else {
            res.status(403).send('Access forbidden. Check API key validity. Request an API key: info@heigit.org');
            return;
        }
    });

    // delete a user
    api.delete('/api/users', checkUserRole, function (req, res) {
        log.info("DELETE users; ", req.body.name);
        if (req.role == "admin") {
            api.db.users.destroy({
                where: {
                    name: req.body.name
                }
            }).then(() => {
                res.status(200).send("Successfully deleted user with name=" + req.body.name);
                return;
            }).catch(err => {
                log.error(`Error deleting user from the database: ${err}`);
                res.status(500).send(`Error deleting user from the database: ${err}`);
                return;
            });
        } else {
            res.status(403).send('Access forbidden. Check API key validity. Request an API key: info@heigit.org');
            return;
        }
    });

    // backups
    api.backupSQliteDB = function () {
        // backup database
        let backuppath = "./backups/" + config.api.database + "." + (new Date()).toISOString() + ".bak";
        // check if database exists
        if (fs.existsSync(config.api.database)) {
            if (!fs.existsSync("./backups/")){
                fs.mkdirSync("./backups/");
            }
            fs.copyFile(config.api.database, backuppath, (err) => {
                if(err) {
                    log.error("Could not create backup of database, error:", err);
                } else {
                    log.info("Created new backup at", backuppath);
                }
            });
        } else {
            log.info("Cannot backup database, file not found:", config.api.database);
        }
    };

    // create initial backup
    api.backupSQliteDB();
    // set backup timer
    setInterval(api.backupSQliteDB, config.api.backupInterval * 1000 * 60);

    return api;
}

module.exports = function(customconfig) {
    return new api(customconfig);
};

// init api if run standalone
if (require.main === module) new api();
