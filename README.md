# TODO

- Swaggerhub Dokumentation erstellen
- parameterize important settings (-> config file?)
- allow parameter for verbosity, only log errors?
- allow adding tasks by uploading geojson


# Real-time OSM [DRAFT]

A service providing real-time OSM data.

Three components:

1. The API adds, deletes and requests information about tasks that provide region-bound real-time
   OSM data in PBF file format via a permanent URL

2. The backend runs, manages and gathers statistics for tasks

3. The web application serves the OSM data produced by the tasks


## API Specification

Main collection: `/tasks`

Individual resource: `/tasks/:id`


#### Add task

* URL: `/tasks`

* Method: POST: x-www-form-unencoded or raw/JSON

* Request Parameters:

	- *name:* character string [a-zA-Z]
	- *coverage:* a polygon in WKT-format or JSON
		- maximum nodes: 10000
	- *expirationDate (optional):* timestamp in ISO 8601 format [YYYY-MM-DDTHH:MM:SS+HH:MM]
    - *updateInterval (optional):* time in seconds

* Response:

	- status code [int]
	- tasks properties
		- id [int]
		- name [string]
		- coverage [WKT polygon]
		- URL to final product [string]
		- expiration date [YYYY-MM-DDTHH:MM:SS+HH:MM]
        - updateInterval [int]
        - lastUpdated [YYYY-MM-DDTHH:MM:SS+HH:MM]
        - creationDate [YYYY-MM-DDTHH:MM:SS+HH:MM]
        - averageRuntime [int]

* Example:

	`curl --data "name=test&coverage=POLYGON((10 20), (20 30), (30 30), (10 10))&expirationDate=2020-05-01" http://127.0.0.1:1234/tasks`

&nbsp;


#### Delete task

* URL: `/tasks`

* Method: DELETE

* Request Parameters

	- *id* [int]

* Response:

	- status code [int]
	- status message [string]

* Example:

	curl --data "id=5" -X DELETE http://127.0.0.1:1234/tasks

&nbsp;


#### Get information about tasks

* URL: /tasks

	Individual tasks can be accessed via their resource URL `/tasks/:id`.

* Method: GET

* Filter Parameters in URL:

	- *id* [int]: `/tasks?id=:id`
	- *name* [string]: `/tasks?name=:name`
		- multiple matches prints multiple tasks
	
	If no parameter is given, all tasks are returned.

* Response:

	- status code [int]
	- status message [string]
	- list of tasks found with properties:
		- name [string]
		- id [int]
		- coverage [WKT polygon]
		- URL to final product [string]
		- runtime statistics [string]

* Example:

	* curl http://127.0.0.1:1234/tasks

	* curl http://127.0.0.1:1234/tasks/2

	* curl http://127.0.0.1:1234/tasks/id=2

	* curl http://127.0.0.1:1234/tasks/name=test1


#### Authentication

Optional



&nbsp;




## Backend Specification

#### Data storage 

sqlite3-based. 

The OSM data files are stored in a subfolder that is served by
the web app. File names are generated using name and id.

A main database keeps track of the application state, it 
contains two tables:

1. tasks
    - stores all information about tasks
	- header: id, name, url, coverage, lastUpdated, averageRuntime,
	  addedDate, expirationDate

2. taskstats
    - stores all benchmarks
    - header: timestamp, taskID, timing

Format:
- all dates in ISO 8601 format.
- coverage: a polygon in WKT-format
- timing: milliseconds



#### Update strategy

For each task, initialise by downloading a suitable .pbf from Geofabrik and
update it using osmupdate.

Algorithm:

1. Is an update process running for this task?
   - Yes: Abort
   - No: go to step 2 and start update

2. Is there an initial .pbf-file?
   - Yes: Update the file using osmupdate (+timing)
   - No: Generate initial .pbf-file:
	  - download smallest Geofabrik extract that covers the task 
[(sample code)](https://github.com/BikeCitizens/geofabrik-extracts)
      - clip extract using the task polygon/bbox
      - go to step 2

&nbsp;


#### Task management

Workers care for a specific task including scheduled updates. A master process
manages all workers and checks at an interval whether a) workers became obsolet
because tasks have been removed or b) a new worker should be spawned because a
new task has been added.
