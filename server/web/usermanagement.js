/* globals */
var apikey;
var table;

function init() { // eslint-disable-line no-unused-vars
    // fill api key input and change user management link if API key supplied
    var url = new URL(window.location.href);
    var URLapikey = url.searchParams.get("apikey");
    var apikeyInput = document.getElementById('inputAPIkey');
    if(URLapikey) {
        apikey = URLapikey;
        apikeyInput.value = apikey;
        document.getElementById('dashboardlink').href = "./dashboard.html?apikey=" + apikey;
        document.getElementById('getuserslink').href = "./api/users/?apikey=" + apikey;
    } else {
        // tell user to enter API key
        document.getElementById("errorinfo").value = "Please enter API key.";
    }

    // listen to changes in the API key input and change parameters accordingly
    apikeyInput.oninput = function() {
        var oldvalue = apikeyInput.value;
        // add delay to response to avoid too many requests
        setTimeout(function () {
            if(oldvalue != apikeyInput.value) return;
            var url = new URL(window.location.href);
            var params = new URLSearchParams(url.search);
            if(apikeyInput.value) {
                apikey = apikeyInput.value;
                // change user management link
                document.getElementById('dashboardlink').href = "./dashboard.html?apikey=" + apikeyInput.value;
                document.getElementById('getuserslink').href = "./api/users/?apikey=" + apikey;
                // change url
                params.set('apikey', apikeyInput.value);
                url.search = params.toString();
                window.history.pushState(undefined, "", url.toString());
                getUsers(apikeyInput.value, handleUserupdate);
            } else {
                // change user management link
                document.getElementById('dashboardlink').href = "./dashboard.html";
                document.getElementById('getuserslink').href = "./api/users/";
                // change url
                params.delete('apikey');
                url.search = params.toString();
                window.history.pushState(undefined, "", url.toString());
            }
        }, 1000);
    };

    if(apikey) {
        // get users
        getUsers(apikey, initTable);
    }

    // handle delete button
    var deleteBtn = document.getElementById('deleteButton');
    deleteBtn.addEventListener('click', handleDeleteButtonClick);

    // handle approve button
    var approveBtn = document.getElementById('approveButton');
    approveBtn.addEventListener('click', handleApproveButtonClick);

    // handle add user form
    var addUserForm = document.getElementById('addUserForm');
    addUserForm.addEventListener('submit', handleAddButtonClick);
}

function handleAddButtonClick(e) {
    // submits new user to API 
    // prevent default action -> redirecting
    e.preventDefault();
    var name = document.getElementById('inputName').value;
    var email = document.getElementById('inputEmail').value;
    var role = document.getElementById('inputRole').value;
    var errorinfo = document.getElementById("errorinfo");

    var xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/users");
    xhr.setRequestHeader("Content-type", "application/JSON");
    xhr.onload = function(){
        if(xhr.status != 200) {
            // inform user about error
            errorinfo.innerHTML = xhr.responseText;
        } else {
            getUsers(apikey, handleUserupdate);
        }
    };
    // send POST request
    xhr.send(JSON.stringify({name, email, role, apikey}));
}

function handleApproveButtonClick() {
    var approveBtn = document.getElementById('approveButton');
    var username = table.rows( { selected: true } ).data()[0].name;
    // approve xhr request to api
    var xhr = new XMLHttpRequest();
    xhr.open("GET", "/api/users/approve/?name=" + username + "&apikey=" + apikey);
    xhr.onload = function(){
        if(xhr.status != 200) {
            // inform user about error
            alert('Error deleting user: '+ xhr.responseText);
        } else {
            getUsers(apikey, handleUserupdate);
            approveBtn.setAttribute("disabled", "disabled");
        }
    };
    xhr.send();
}

function getUsers(apikey, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", "/api/users?apikey="+apikey);
    xhr.setRequestHeader("Content-type", "application/JSON");
    xhr.onload = function(){
        if(xhr.status != 200) {
            // inform user about error
            document.getElementById("errorinfo").innerHTML = xhr.responseText;
            // hide table
            document.getElementById("tablediv").style.display = "none";
            return undefined;
        } else {
            // delete error box content
            document.getElementById("errorinfo").innerHTML = "";
            // trigger callback
            var users = JSON.parse(xhr.response);
            if(callback) callback(users);
            return(users);
        }
    };
    xhr.send();
}

function handleUserupdate(users) {
    if(users) {
        if(!table) {
            initTable(users);
        } else {
            updateTable(users);
            // show table
            document.getElementById("tablediv").style.display = "block";
            // readjust table columns
            table.columns.adjust().draw();
        }
    }
}

function initTable(users) {
    // create table
    table = $('#table').DataTable({
        data: users,
        responsive: true,
        scrollY: false,
        select: {style: 'single', info: false},
        lengthChange: false,
        // custom column definitions
        columns:
            [{ title: "Name", name: "name", data: user => user.name},
             { title: "E-Mail", name: "email", className: "dt-left", data: user => user.email},
             { title: "Role", name: "role", className: "dt-left", data: user => user.role},
             { title: "Signup date", name: "signupDate", className: "dt-left", data: user => user.signupDate},
             { title: "Approved", name: "approved", className: "dt-left", data: user => user.approved},
             { title: "API key", name: "apikey", className: "dt-left", data: user => user.apikey}
        ]
    } );

    // keep table updated
    setInterval(function() {
        if(apikey) {
            getUsers(apikey, handleUserupdate);
        }
    }, 10000);

    // listen to table select event
    table.on('select', (e, dt, type, indexes) => {
        var user = dt.rows( indexes ).data()[0];
        // enable approve button if applicable
        if(!user.approved) {
            document.getElementById('approveButton').removeAttribute("disabled");
        }
        // enable delete button if applicable
        var nAdmins = dt.column('role:name').data().filter(role => role == "admin").length;
        if(nAdmins > 1 || user.role == "user") {
            // can't delete last admin
            document.getElementById('deleteButton').removeAttribute("disabled");
        }
    });

    // listen to table deselect event
    table.on('deselect', () => {
        // disable buttons
        document.getElementById('deleteButton').setAttribute("disabled", "disabled");
        document.getElementById('approveButton').setAttribute("disabled", "disabled");
    });

    // show table
    document.getElementById("tablediv").style.display = "block";
    // readjust table columns
    table.columns.adjust().draw();
}

function updateTable(users) {
    // update table with tasks
    table.clear();
    if(users.length > 0) {
        table.rows.add(users);
    }
    table.draw();
    table.columns.adjust();
}

function handleDeleteButtonClick() {
    var deleteBtn = document.getElementById('deleteButton');
    // delete xhr request to api
    var xhr = new XMLHttpRequest();
    xhr.open("DELETE", "/api/users");
    xhr.setRequestHeader("Content-type", "application/JSON");
    xhr.onload = function(){
        if(xhr.status != 200) {
            // inform user about error
            alert('Error deleting user: '+ xhr.responseText);
        } else {
            getUsers(apikey, updateTable);
            deleteBtn.setAttribute("disabled", "disabled");
        }
    };
    var username = table.rows( { selected: true } ).data()[0].name;
    xhr.send(JSON.stringify({name: username, apikey: apikey}));
}

