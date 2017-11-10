// Test routines for OSM realtime server and API
//
// Stefan Eberlein - stefan.eberlein@fastmail.com
//

// Functional API tests

const child = require('child_process');
const assert = require('assert');

let testtasks = [
    // missing tasks: Duplicate names
    {
        name: 'HeidelbergTest',
        comment: 'Task with only geometry as coverage',
        coverage:
        { type: 'Polygon',
            coordinates:
            [ [ [ 8.65283437203444, 49.43935216405316 ],
                [ 8.653521017542252, 49.370096908518946 ],
                [ 8.714632467737564, 49.3662962141664 ],
                [ 8.71600575875319, 49.4402451419453 ],
                [ 8.65283437203444, 49.43935216405316 ] ] ],
        },
        expirationDate: '',
        updateInterval: 10,
    },
    {
        name: 'ManchesterTest',
        comment: 'Task with missing CRS in coverage GeoJSON.',
        coverage:
        { type: 'Feature',
            geometry:
            { type: 'Polygon',
                coordinates:
                [ [ [ -2.376034289983983, 53.52931602350563 ],
                    [ -2.3883939091246074, 53.326389469199256 ],
                    [ -2.027218372015233, 53.36738006370996 ],
                    [ -2.076656848577733, 53.584788043663735 ],
                    [ -2.376034289983983, 53.52931602350563 ] ] ],
            },
            properties: null },
        expirationDate: '',
        updateInterval: 10,
    },
    { name: 'TsuruokaTest',
        comment: 'Optimal task',
        coverage:
        { type: 'Feature',
            geometry:
            { type: 'Polygon',
                coordinates:
                [ [ [ 138.75734504235209, 37.469586218663395 ],
                    [ 138.7697046614927, 37.37633753865222 ],
                    [ 138.93655951989115, 37.41506892489841 ],
                    [ 138.87682136071146, 37.51752857214788 ],
                    [ 138.75734504235209, 37.469586218663395 ] ] ],
                crs: { type: 'name', properties: { name: 'EPSG:4326' } } },
            properties: null },
        expirationDate: '',
        updateInterval: 10,
    },
    {
        name: 'LeipzigTest',
        comment: 'Task with expiration date',
        coverage:
        { type: 'Feature',
            geometry:
            { type: 'Polygon',
                coordinates:
                [ [ [ 12.306189537048354, 51.39269229939205 ],
                    [ 12.302069664001477, 51.304775193168496 ],
                    [ 12.442145347595229, 51.28931867687132 ],
                    [ 12.442145347595229, 51.39054998642462 ],
                    [ 12.306189537048354, 51.39269229939205 ] ] ],
                crs: { type: 'name', properties: { name: 'EPSG:4326' } } },
            properties: null },
        // expirationDate: now + 1 min
        expirationDate: (new Date(new Date().getTime() + 1*60000)).toISOString(),
        updateInterval: 10,
    }
];

function makeTaskComparable(task){
    // deletes data from task JSON that is
    // hard to compare and thus hard to test
    delete task.URL;
    delete task.averageRuntime;
    delete task.addedDate;
    delete task.lastUpdated;
    delete task.coverage;
    delete task.comment;
    // round expiration date to minute
    if (task.expirationDate !== "") {
        task.expirationDate = task.expirationDate.substring(0, 16);
    }
    return task;
}

let testfun = {
    taskspecific: {
        POSTtask: function POSTtask(testtask) {
            // Action: POST:x-www-form-unencoded a task using curl
            // Expected result: JSON response with the task information

            // deep clone test task since we will modify it to make it
            // comparable
            let task = JSON.parse(JSON.stringify(testtask));
            let commandstring = `curl --data 'name=${task.name}&` +
                `coverage=${JSON.stringify(task.coverage)}&` +
                `updateInterval=${task.updateInterval}&` +
                `expirationDate=${task.expirationDate}' ` +
                `http://localhost:1234/api/tasks`;
            const curl = child.execSync(commandstring, {stdio: "pipe"});
            let response;
            try{
                response = JSON.parse(curl.toString());
            } catch (err) {
                throw Error("Parsing API response:\n\n" + err +
                    "\n\nResponse: " + curl.toString());
            }
            // save id for future tests
            let i = testtasks.findIndex((item) => item.name === response.name);
            testtasks[i].id = response.id;
            task.id = response.id;
            // delete all unpredictable data
            response = makeTaskComparable(response);
            task = makeTaskComparable(task);
            // compare response task with posted task
            assert.deepEqual(response, task,
                "API response does not equal task JSON.\nTask: " +
                JSON.stringify(task) + "\nResponse: " + JSON.stringify(response));
            console.log("POSTtask test successfull!\n");
            return 0;
        },
        GETtaskByName: function GETtaskByName(testtask) {
            // deep clone
            let task = JSON.parse(JSON.stringify(testtask));
            task = makeTaskComparable(task);
            let commandstring = `curl http://localhost:1234/api/tasks/name=${task.name}`;
            const curl = child.execSync(commandstring, {stdio: "pipe"});
            let response;
            try{
                response = JSON.parse(curl.toString());
                assert(response.length === 1, "Response contains more than one task.");
                response = makeTaskComparable(response[0]);
            } catch (err) {
                throw Error("Parsing API response:\n\n" + err +
                    "\n\nResponse: " + curl.toString());
            }
            assert.deepEqual(response, task,
                "API response does not equal tasks array.\nTasks: " +
                JSON.stringify(task) + "\nResponse: " + JSON.stringify(response));
            console.log("GETtaskByName test successfull!\n");
            return response;
        }
    },
    onetime: {
        GETtasks: function GETtasks() {
            // deep clone
            let tasks = JSON.parse(JSON.stringify(testtasks));
            tasks = tasks.map(task => makeTaskComparable(task));
            let commandstring = `curl http://localhost:1234/api/tasks`;
            const curl = child.execSync(commandstring, {stdio: "pipe"});
            let response;
            try{
                response = JSON.parse(curl.toString());
                response = response.map(task => makeTaskComparable(task));
            } catch (err) {
                throw Error("Parsing API response:\n\n" + err +
                    "\n\nResponse: " + curl.toString());
            }
            assert.deepEqual(response, tasks,
                "API response does not equal tasks array.\nTasks: " +
                JSON.stringify(tasks) + "\nResponse: " + JSON.stringify(response));
            console.log("GETtasks test successfull!\n");
            return response;
        },
        DELETEtask: function DELETEtasks() {
            let tasks = JSON.parse(JSON.stringify(testtasks));
            let tasksForRemoval = ["ManchesterTest", "TsuruokaTest"];
            tasks = tasks.filter(task => tasksForRemoval.includes(task.name));
            tasks.forEach(task => {
                let curlstring = `curl --data "id=${task.id}" -X DELETE ` +
                                 `http://localhost:1234/api/tasks`;
                const deletecurl = child.execSync(curlstring, {stdio: "pipe"});
                let response = deletecurl.toString();
                assert(response === "Succesfully deleted task with ID=" + task.id,
                       `DELETE not successfull, response: ${response}`);
                // test if DELETE really was successfull
                curlstring = `curl http://localhost:1234/api/tasks/` +
                             `name=${task.name}`;
                const namecurl = child.execSync(curlstring, {stdio: "pipe"});
                try{
                    response = JSON.parse(namecurl.toString());
                } catch (err) {
                    throw Error("Parsing API response:\n\n" + err +
                        "\n\nResponse: " + namecurl.toString());
                }
                assert(response.length === 0, "Response is not empty.");
            });
            console.log("DELETEtasks successfull!");

        },
        testTaskExpiration: function testTaskExpiration() {
            // deep clone
            let tasks = JSON.parse(JSON.stringify(testtasks));
            tasks = tasks.filter(task => task.expirationDate !== "");
            tasks.forEach(task => {
                let expires = new Date(task.expirationDate);
                let countdown = (expires.getTime() - (new Date()).getTime()) + 10 * 1000;
                console.log(`testTaskExpiration for task ${task.name}.`,
                    `Countdown: ${countdown/1000}s`);
                setTimeout(function() {
                    let curlstring = `curl http://localhost:1234/api/tasks/` +
                                     `name=${task.name}`;
                    const curl = child.execSync(curlstring, {stdio: "pipe"});
                    let response;
                    try{
                        response = JSON.parse(curl.toString());
                    } catch (err) {
                        throw Error("Parsing API response:\n\n" + err +
                            "\n\nResponse: " + curl.toString());
                    }
                    assert(response.length === 0, "Response is not empty.");
                    console.log(`\ntestTaskExpiration for task ${task.name} successfull.\n`);
                },  countdown);
            });
        }
    }
};

// initialise test server instance and run tests
let serverlog = "";
const server = child.spawn("node", ["./realtimeOSMserver.js",
    "-c", "./test/testconfig.js"], {stdio: 'pipe'});
server.stdout.on('data', (data) => serverlog += data);
server.stderr.on('data', (data) => serverlog += data);

// wait a second for startup, then start testing
setTimeout(function() {
    try {
        // start testing
        for (let task of testtasks) {
            for (let fun in testfun.taskspecific) {
                fun = testfun.taskspecific[fun];
                console.log("Running test:", fun.name,
                            "for task", task.name, ":", task.comment);
                fun(task);
            }
        }
        for (let fun in testfun.onetime) {
            fun = testfun.onetime[fun];
            console.log("Running test:", fun.name);
            fun();
        }

        // finish
        console.log("All tests ran, keep server running for 5 for minutes " +
                    "and redirecting output to console.\n");
        setTimeout(function() {
           server.stdout.on('data', (data) => console.log(data.toString().trim()));
           server.stderr.on('data', (data) => console.log(data.toString().trim()));
        }, 1000);
        setTimeout(() => server.kill(), 60000 * 5);
    } catch (err) {
        console.log("Error occurred. Server log:\n", serverlog);
        server.kill();
        throw Error(err);
    }
}, 2000);
