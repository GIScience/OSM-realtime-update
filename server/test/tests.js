// Test routines for OSM realtime server and API
//
// Stefan Eberlein - stefan.eberlein@fastmail.com
//

// Functional API tests

const child = require('child_process');
const assert = require('assert');

let testtasks = [
    // missing tasks: task with bad content -> error parsing
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
        name: 'TogoTest',
        comment: 'Task with geofabrikRegion string',
        coverage: 'togo',
        expirationDate: '',
        updateInterval: 15,
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

let testusers = [
    {
        name: "admin",
        email:"",
        role:"admin"
    },
    {
        name: "AverageJoe",
        comment: "Complete user",
        role: "user",
        email: "average@joe.com"
    },
    {
        name: "GrandpaRick",
        comment: "User has no mail",
        role: "user",
        email: ""
    },
    {
        name: "AverageAdmin",
        comment: "Admin user",
        role: "admin",
        email: "average@admin.com"
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
    if (task.expirationDate) {
        task.expirationDate = task.expirationDate.substring(0, 16);
    }
    return task;
}

function makeUserComparable(user){
    // deletes data from task JSON that is
    // hard to compare and thus hard to test
    delete user.apikey;
    delete user.signupDate;
    delete user.approved;
    delete user.comment;
    return user;
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
                    "\n\nResponse: " + curl.toString() + "\n");
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
                JSON.stringify(task, null, 4) + "\nResponse: " +
                JSON.stringify(response, null, 4));
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
                JSON.stringify(task, null, 4) + "\nResponse: " +
                JSON.stringify(response, null, 4));
            console.log("GETtaskByName test successfull!\n");
            return response;
        }
    },
    userspecific: {
        POSTuser: function POSTuser(testuser) {
            // Action: POST:x-www-form-unencoded a task using curl
            // Expected result: JSON response with the task information

            // deep clone test task since we will modify it to make it
            // comparable
            let user = JSON.parse(JSON.stringify(testuser));
            let commandstring = `curl --data 'name=${user.name}&` +
                `email=${user.email}&` +
                `apikey=masterpassword&` +
                `role=${user.role}' ` +
                `http://localhost:1234/api/users`;
            const curl = child.execSync(commandstring, {stdio: "pipe"});
            let response;
            try{
                response = JSON.parse(curl.toString());
            } catch (err) {
                throw Error("Parsing API response:\n\n" + err +
                    "\n\nResponse: " + curl.toString() + "\n");
            }
            // delete all unpredictable data
            response = makeUserComparable(response);
            user = makeUserComparable(user);
            // compare response task with posted task
            assert.deepEqual(response, user,
                "API response does not equal user JSON.\nTask: " +
                JSON.stringify(user, null, 4) + "\nResponse: " +
                JSON.stringify(response, null, 4));
            console.log("POSTuser test successfull!\n");
            return 0;
        },
        // getUserByName
        GETuserByName: function GETuserByName(testuser) {
            // deep clone
            let user = JSON.parse(JSON.stringify(testuser));
            user = makeUserComparable(user);
            let commandstring = `curl 'http://localhost:1234/api/users/name=${user.name}?apikey=masterpassword'`;
            const curl = child.execSync(commandstring, {stdio: "pipe"});
            let response;
            try{
                response = JSON.parse(curl.toString());
                assert(response.length === 1, "Response contains more than one user.");
                response = makeUserComparable(response[0]);
            } catch (err) {
                throw Error("Parsing API response:\n\n" + err +
                    "\n\nResponse: " + curl.toString());
            }
            assert.deepEqual(response, user,
                "API response does not equal users array.\nUsers: " +
                JSON.stringify(user, null, 4) + "\nResponse: " +
                JSON.stringify(response, null, 4));
            console.log("GETuserByName test successfull!\n");
            return response;
        }
    },
    onetime: {
        // get all users
        GETusers: function GETusers() {
            // deep clone
            let users = JSON.parse(JSON.stringify(testusers));
            users = users.map(user => makeUserComparable(user));
            let commandstring = `curl http://localhost:1234/api/users?apikey=masterpassword`;
            const curl = child.execSync(commandstring, {stdio: "pipe"});
            let response;
            try{
                response = JSON.parse(curl.toString());
                response = response.map(user => makeUserComparable(user));
            } catch (err) {
                throw Error("Parsing API response:\n\n" + err +
                    "\n\nResponse: " + curl.toString());
            }
            assert.deepEqual(response, users,
                "API response does not equal users array.\nUsers: " +
                JSON.stringify(users, null, 4) + "\nResponse: " +
                JSON.stringify(response, null, 4));
            console.log("GETusers test successfull!\n");
            return response;
        },
        // approve user
        APPROVEuser: function APPROVEuser() {
            // add user without admin key, then approve with admin key
            let user = {
                name: "Odysseus",
                role: "user",
                email: "disapproved@odysseus.com"
            };
            let curlstring = `curl --data 'name=${user.name}&` +
                `email=${user.email}&` +
                `role=${user.role}' ` +
                `http://localhost:1234/api/users`;
            const postcurl = child.execSync(curlstring, {stdio: "pipe"});
            let response = postcurl.toString();
            // approve user
            curlstring = `curl http://localhost:1234/api/users/approve/name=${user.name}?apikey=masterpassword`;
            const approvecurl = child.execSync(curlstring, {stdio: "pipe"});
            response = approvecurl.toString();
            assert(response === "Successfully approved user with name=" + user.name,
                   `APPROVE not successfull, response: ${response}`);
            // test if APPROVE really was successfull
            curlstring = `curl http://localhost:1234/api/users/` +
                         `name=${user.name}?apikey=masterpassword`;
            const namecurl = child.execSync(curlstring, {stdio: "pipe"});
            try{
                response = JSON.parse(namecurl.toString())[0];
            } catch (err) {
                throw Error("Parsing API response:\n\n" + err +
                    "\n\nResponse: " + namecurl.toString());
            }
            assert(response.approved === true, "APPROVEuser failed. User was not approved.");
            console.log("APPROVEuser successfull!\n");
        },
        // delete user
        DELETEuser: function DELETEuser() {
            // deep clone
            let users = JSON.parse(JSON.stringify(testusers));
            let usersForRemoval = ["AverageJoe", "GrandpaRick"];
            users = users.filter(user => usersForRemoval.includes(user.name));
            users.forEach(user => {
                let curlstring = `curl --data "name=${user.name}" -X DELETE ` +
                                 `http://localhost:1234/api/users?apikey=masterpassword`;
                const deletecurl = child.execSync(curlstring, {stdio: "pipe"});
                let response = deletecurl.toString();
                assert(response === "Successfully deleted user with name=" + user.name,
                       `DELETE not successfull, response: ${response}`);
                // test if DELETE really was successfull
                curlstring = `curl http://localhost:1234/api/users/` +
                             `name=${user.name}?apikey=masterpassword`;
                const namecurl = child.execSync(curlstring, {stdio: "pipe"});
                try{
                    response = JSON.parse(namecurl.toString());
                } catch (err) {
                    throw Error("Parsing API response:\n\n" + err +
                        "\n\nResponse: " + namecurl.toString());
                }
                assert(response.length === 0, "Response is not empty.");
            });
            console.log("DELETEusers successfull!\n");
        },
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
                JSON.stringify(tasks, null, 4) + "\nResponse: " +
                JSON.stringify(response, null, 4));
            console.log("GETtasks test successfull!\n");
            return response;
        },
        DELETEtask: function DELETEtasks() {
            // deep clone
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
            console.log("DELETEtasks successfull!\n");

        },
        testTaskExpiration: function testTaskExpiration() {
            // deep clone
            let tasks = JSON.parse(JSON.stringify(testtasks));
            tasks = tasks.filter(task => task.expirationDate !== "");
            tasks.forEach(task => {
                let expires = new Date(task.expirationDate);
                let countdown = (expires.getTime() - (new Date()).getTime()) + 10 * 1000;
                console.log(`Test: TaskExpiration for task ${task.name}.`,
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
                    console.log(`\nTest: TaskExpiration for task ${task.name}`,
                                `successfull.\n`);
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

// wait a bit for startup, then start testing
setTimeout(function() {
    try {
        // start testing
        for (let user of testusers) {
            // jump over default role
            if(user.name === "admin") continue;

            for (let fun in testfun.userspecific) {
                fun = testfun.userspecific[fun];
                console.log("Running test:", fun.name,
                            "for task", user.name, ":", user.comment);
                fun(user);
            }
        }
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
        console.log("All tests ran, keep server running for 10 minutes " +
                    "and redirecting output to console.\n");
        setTimeout(function() {
           server.stdout.on('data', (data) => console.log(data.toString().trim()));
           server.stderr.on('data', (data) => console.log(data.toString().trim()));
        }, 1000);
        setTimeout(() => server.kill(), 60000 * 10);
    } catch (err) {
        console.log("Error occurred. Server log:\n", serverlog);
        server.kill();
        throw Error(err);
    }
}, 3000);
