/* jshint esversion: 6 */
function init() {
    // add map
	map = new ol.Map({
		target : 'map',
        pixelRatio: 1, // supposedly avoids blurry map on resize
		view   : new ol.View({
			projection : 'EPSG:3857',
			center     : ol.proj.transform([0, 0], 'EPSG:4326', 'EPSG:3857'),
			zoom       : 2
			}),
		layers : [ 
			new ol.layer.Tile({
                source : new ol.source.Stamen({layer: "terrain"}),
			}),
            new ol.layer.Vector({
                title: 'tasks',
                source : new ol.source.Vector({
                    format: new ol.format.GeoJSON(),
                    loader : function() {
                        var xhr = new XMLHttpRequest();
                        xhr.open("GET", "/api/tasks");
                        xhr.setRequestHeader("Content-type", "application/JSON");
                        xhr.onload = function(){
                            if(xhr.status != 200) {
                                // inform user about error
                                return "Error loading tasks as GeoJSON.";
                            } else {
                                var reader = new ol.format.GeoJSON(
                                    {featureProjection: "EPSG:3857"});
                                var responseJSON = JSON.parse(xhr.response);
                                var features = responseJSON.map(task => {
                                    var f = reader.readFeature(task.coverage);
                                    f.setProperties(task);
                                    f.setId(task.id);
                                    return(f);
                                });
                                this.addFeatures(features);
                            }
                        }.bind(this);
                        xhr.send();
                    }
                }),
                // improve polygon visibility
                style: new ol.style.Style({
                    stroke: new ol.style.Stroke({
                        color: 'rebeccapurple',
                        width: 1.5
                    }),
                    fill: new ol.style.Fill({
                        color: 'rgba(200,200,200, 0.8)'
                    })
                })
			}),
			new ol.layer.Vector({
                title: 'tasks_tmp',
				source: new ol.source.Vector({
                    features: new ol.Collection(),
                    projection: "EPSG:4326"
				})
			}),
		]
		});

    // get references to local VectorLayer
    tasksLayer = map.getLayers().item(1);
    tasksTmpLayer = map.getLayers().item(2);

    // add select interaction
    selectInteraction = new ol.interaction.Select({
                                condition: ol.events.condition.singleclick});
    selectInteraction.on('select', handleMapSelect);
    tasksLayer.selectedFeature = null;
    map.addInteraction(selectInteraction);

    // add draw interaction
    drawInteraction = new ol.interaction.Draw({
        source: tasksTmpLayer.getSource(),
        type: "Polygon"
    });
    drawInteraction.on('drawend', handleDrawEnd);
    var drawBtn = document.getElementById('addButton');
    var deleteBtn = document.getElementById('deleteButton');
    drawBtn.addEventListener('click', function handleDrawButtonClick() {
        // change draw button text to "cancel"
        if(drawBtn.innerHTML == "Add Task") {
            map.removeInteraction(selectInteraction);
            map.addInteraction(drawInteraction);
            deselectFeature(tasksLayer.selectedFeature);
            deleteBtn.setAttribute("disabled", "disabled");
            drawBtn.innerHTML = "Cancel drawing";
        } else if (drawBtn.innerHTML == "Cancel drawing") {
            map.removeInteraction(drawInteraction);
            map.addInteraction(selectInteraction);
            tasksTmpLayer.getSource().clear();
            deleteBtn.removeAttribute("disabled");
            drawBtn.innerHTML = "Add Task";
        }
    });

    // handle delete button 
    deleteBtn.addEventListener('click', handleDeleteButtonClick);

    // create table
    var tasks = tasksLayer.getSource().getFeatures();
    var table = $('#table').DataTable( {
        data: tasks,
        rowId: "getId()",
        select: {style: 'single', info: false},
        scrollX: true,
        scrollY: false,
        // custom column definitions
        columns: [{ data: "getId()", title: "ID"},
          { data: "getProperties().name", title: "Name", className: "dt-left"},
          { data: "getProperties().URL", title: "URL", className: "dt-left"},
          { data: "getProperties().expirationDate", title: "expires", className: "dt-left",
              render: data => {return data !== null ? data.substring(0, 19) : '';}},
          { data: "getProperties().addedDate", title: "added", className: "dt-left",
              render: data => {return data !== null ? data.substring(0, 16) : '';}},
          { data: "getProperties().updateInterval", title: "update interval [s]", 
              className: "dt-left"},
          { data: "getProperties().lastUpdated", title: "updated", className: "dt-left",
              render: data => {return data !== null ? data.substring(0, 19) : '';}},
          { data: "getProperties().averageRuntime", title: "mean runtime [s]", 
              className: "dt-left", render: data => Math.trunc((data/100))/10},
        ]
    } );

    // keep table updated
    tasksLayer.getSource().on('change', updateTable);
    // keep map size updated with context
    window.onresize = setTimeout(map.updateSize.bind(map), 200);

    // listen to table select event
    table.on('select', handleTableSelect);
    // listen to table deselect event
    table.on('deselect', (e, dt, type, indexes) => {
        // remove popup
		popupOverlay.setPosition(undefined);
		popupCloser.blur();
        // deselect feature
        var feature = dt.rows( indexes ).data()[0];
        deselectFeature(feature);
    });

	// integrate pop-up - http://openlayers.org/en/latest/examples/popup.html
    // Create an overlay to anchor the popup to the map.
	var popupOverlay = new ol.Overlay(/** @type {olx.OverlayOptions} */ ({
		element: document.getElementById('popup'),
        autoPan: true,
        autoPanAnimation: {
            duration: 250
        }
	}));
    map.addOverlay(popupOverlay);

	// Add a click handler to hide the popup.
	var popupCloser = document.getElementById('popup-closer');
	popupCloser.onclick = function() {
        // remove popup
		popupOverlay.setPosition(undefined);
		popupCloser.blur();
        // remove feature from map
        tasksTmpLayer.getSource().clear();
        deselectFeature(tasksLayer.selectedFeature);
		return false;
	};
}

function handleDeleteButtonClick() {
    var deleteBtn = document.getElementById('deleteButton');
    // delete xhr request to api
    var xhr = new XMLHttpRequest();
    xhr.open("DELETE", "/api/tasks");
    xhr.setRequestHeader("Content-type", "application/JSON");
    xhr.onload = function(){
        if(xhr.status != 200) {
            // inform user about error
            alert('Error deleting task: '+ xhr.responseText);
            // enable button to allow resend
        }
    };
    xhr.send(JSON.stringify({id: tasksLayer.selectedFeature.getId()}));
    // remove popup
    var popupOverlay = map.getOverlays().item(0);
    var popupCloser = document.getElementById('popup-closer');
    popupOverlay.setPosition(undefined);
    popupCloser.blur();
    // remove feature from map
    tasksTmpLayer.getSource().clear();
    deselectFeature(tasksLayer.selectedFeature);
    // refresh data source and disable delete button, 
    // assuming no task is selected after refresh.
    tasksLayer.getSource().clear();
    //deselectFeature(tasksLayer.selectedFeature);
    deleteBtn.setAttribute("disabled", "disabled");
}

function handleTableSelect( e, dt, type, indexes) {
    // abort if item has already been selected in map
    if(selectInteraction.getFeatures().getLength() > 0) return;
    // otherwise add item to map
    var feature = dt.rows( indexes ).data()[0];
    var coordinates = feature.getGeometry().getInteriorPoint().getCoordinates();
    tasksLayer.selectedFeature = feature;
    selectInteraction.getFeatures().push(feature);
    document.getElementById('deleteButton').removeAttribute("disabled");
    createPopup(coordinates, featureToPopupContent(feature));
}

function handleDrawEnd(e) {
    // clear existing temporary point
    tasksTmpLayer.getSource().clear();
    // populate popup
    var popupContent = `
        <h3 class=popupTitel>New task</h3>
        <form onsubmit="return handleTaskSubmit()">
            <label for=titel class=inputLabel>Name:</label>
            <input type=text id=inputName class=inputText name=name required>
            <label for="expirationDate" class=inputLabel>Expires:</label>
            <input type=text id=inputExpires class=inputDate name=expirationDate>
            <label for=updateInterval class=inputLabel>updateInterval in seconds:</label>
            <input type=number id=inputUpdateInterval class=inputNumber 
                   name=updateInterval value=600>
            <button type="submit" id=submitButton class=popupSubmit>Save task</button>
        </form>
        <p id="responseText" class="responseText"></p>`;
    var coordinates = e.feature.getGeometry().getInteriorPoint().getCoordinates();
    createPopup(coordinates, popupContent);
    // trigger map update
    map.render();
    // enable date picker
    $("#inputExpires").datepicker({dateFormat: "yy-mm-dd"});
}

function handleTaskSubmit() {
    // submits new report to API
    var name = document.getElementById('inputName').value;
    var expirationDate = document.getElementById('inputExpires').value;
    var updateInterval = document.getElementById('inputUpdateInterval').value;
    // generate geojson from feature
    var feature = tasksTmpLayer.getSource().getFeatures()[0];
    var featureGeoJSON = new ol.format.GeoJSON({featureProjection: "EPSG:3857"})
                            .writeFeatureObject(feature, {rightHanded: true});
    featureGeoJSON.geometry.crs = {"type":"name","properties":{"name":"EPSG:4326"}};
    var coverage = featureGeoJSON;
    var submitBtn = document.getElementById('submitButton');
    // safety check for large areas
    if(feature.getGeometry().getArea()/1000000 > 10000 && 
       submitBtn.innerHTML == "Save task") {
        var responseText = document.getElementById('responseText');
        responseText.innerHTML = "Task area exceeds 10000km²! Really submit?";
        submitBtn.innerHTML = "Really submit!";
    } else submitData();
    return false;

    function submitData() {
        var submitBtn = document.getElementById('submitButton');
        var deleteBtn = document.getElementById('deleteButton');
        var drawBtn = document.getElementById('addButton');
        var xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/tasks");
        xhr.setRequestHeader("Content-type", "application/JSON");
        xhr.onload = function(){
            var responseText = document.getElementById('responseText');
            if(xhr.status != 200) {
                // inform user about error
                responseText.innerHTML = xhr.responseText;
                // enable button to allow resend
                submitBtn.removeAttribute("disabled");
            } else {
                responseText.innerHTML = "Saved task.";
                setTimeout(function() {
                    // remove popup and feature
                    var popupOverlay = map.getOverlays().item(0);
                    var popupCloser = document.getElementById('popup-closer');
                    popupOverlay.setPosition(undefined);
                    popupCloser.blur();
                }, 2000);
                // update task layer
                tasksLayer.getSource().clear();
                // switch to select interaction
                map.removeInteraction(drawInteraction);
                map.addInteraction(selectInteraction);
                tasksTmpLayer.getSource().clear();
                deleteBtn.removeAttribute("disabled");
                drawBtn.innerHTML = "Add Task";
            }
        };
        // send POST request
        xhr.send(JSON.stringify({name, coverage, expirationDate, updateInterval}));
        // disable submit button
        submitBtn.setAttribute("disabled", "disabled");
    }
}

function handleMapSelect(e) {
    e.deselected.forEach(feature => deselectFeature(feature));
    e.selected.forEach(feature => {
        // abort if feature is temporary (= no id)
        if(feature.getId() === undefined) return;
        tasksLayer.selectedFeature = feature;
        var coordinates = feature.getGeometry().getInteriorPoint().getCoordinates();

        // select appropriate table row
        var table = $('table').DataTable();
        table.rows(`#${feature.getId()}`).select();

        createPopup(coordinates, featureToPopupContent(feature));
        document.getElementById('deleteButton').removeAttribute("disabled");
    });
}

function deselectFeature(feature) {
    // deselect from table
    if($('table').DataTable().rows( {selected: true}).data().length > 0)
        $('table').DataTable().rows().deselect();
    // deselect from map
    tasksLayer.selectedFeature = null;
    selectInteraction.getFeatures().clear();
    document.getElementById('deleteButton').setAttribute("disabled", "disabled");
    map.render();
}

function featureToPopupContent(feature) {
    // generate html content for popup from feature
    var popupContent = `
        <h3 class=popupName>${feature.getProperties().name}</h3>
        <p class=popupId>id: ${feature.getId()}</p>
        <p class=popupExpirationDate>Expires: ${feature.getProperties().expirationDate}</p>
        <p class=popupUpdateInterval>Update interval: ${feature.getProperties().updateInterval}</p>
        <p class=popupDate>Last updated: ${feature.getProperties().lastUpdated}</p>
        <p class=popupDate>Added: ${feature.getProperties().addedDate}</p>`;
    return popupContent;
}

function createPopup(coordinates, content) {
    // creates popup using ol.Overlay
	var popupContent = document.getElementById('popup-content');
    var popupOverlay = map.getOverlays().item(0);
    popupContent.innerHTML = content;
    popupOverlay.setPosition(coordinates);
    map.render();
}

function updateTable() {
    // update table with tasks
    var tasks = tasksLayer.getSource().getFeatures();
    var table = $('table').DataTable();
    table.clear().rows.add(tasks).draw();
    // reselect row after update
    if(tasksLayer.selectedFeature)
        table.rows(`#${tasksLayer.selectedFeature.getId()}`).select();
}
