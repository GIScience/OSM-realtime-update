function init() { // eslint-disable-line no-unused-vars
    // handle signup form
    var addUserForm = document.getElementById('signupForm');
    addUserForm.addEventListener('submit', handleSignupForm);
}

function handleSignupForm(e) {
    // submits new user to API 
    // prevent default action / redirecting
    e.preventDefault();
    var name = document.getElementById('inputName').value;
    var email = document.getElementById('inputEmail').value;
    var errorinfo = document.getElementById("errorinfo");

    var xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/users");
    xhr.setRequestHeader("Content-type", "application/JSON");
    xhr.onload = function(){
        if(xhr.status != 200) {
            // inform user about error
            errorinfo.innerHTML = xhr.responseText;
        } else {
            errorinfo.innerHTML = "Application received. Please wait a few days until approval.";
        }
    };
    // send POST request
    xhr.send(JSON.stringify({name, email}));
}

