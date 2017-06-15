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

* Method: POST

* Request Parameters:

	- *name:* character string [a-zA-Z]
	- *coverage:* a polygon in WKT-format
		- maximum nodes: 1000
	- *expirationDate:* timestamp in ISO 8601 format [YYYY-MM-DDTHH:MM:SS+HH:MM]

* Response:

	- status code [int]
	- tasks properties
		- name [string]
		- id [int]
		- coverage [WKT polygon]
		- expiration date [YYYY-MM-DDTHH:MM:SS+HH:MM]
		- URL to final product [string]

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


# Commands

Generate highly simplified sample polygon file for Indonesia:
`
wget http://biogeo.ucdavis.edu/data/gadm2.8/gpkg/IDN_adm_gpkg.zip
unzip IDN_adm_gpkg.zip
python2 tools/ogr2poly.py IDN_adm.gpkg IDN_adm0 -s 1000
rm IDN_adm_gpkg.zip IDN_adm.gpkg license.txt
mv IDN_adm_0.poly indonesia.poly
`
&nbsp;

osmosis, extracts up-to-date data for Indonesia's bounding box:
`
osmosis --read-apidb-current authFile="authfile" \
                             host="1.2.3.4" \
                             database="osm" \
        --bounding-polygon file="indonesia.poly" \
        --write-pbd file="indonesia.osm.pbf" \
                    compress="deflate"
`
&nbsp;

osmosis, extracts up-to-date data for a polygon:
`
osmosis --read-apidb-current authFile="authfile" \
                             host="1.2.3.4" \
                             database="osm" \
        --bounding-polygon file="indonesia.poly" \
        --write-pbd file="indonesia.osm.pbf" \
                    compress="deflate"
`
&nbsp;

