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
	- *bounding box* (bbox): WGS84 decimal coordinates [minx, miny, maxx, maxy]
	- *coverage:* a polygon in WKT-format
		- maximum nodes: 1000
	- *expirationDate:* timestamp in ISO 8601 format [YYYY-MM-DDTHH:MM:SS+HH:MM]

	If both bounding box and coverage are supplied, an error is returned.

* Response:

	- status code [int]
	- status message [string]
	- summary of the tasks properties
		- name [string]
		- id [int]
		- coverage [WKT polygon]
		- bounding box [minx,maxx,miny,maxy]
		- expiration date [YYYY-MM-DDTHH:MM:SS+HH:MM]
		- URL to final product [string]

* Example:

	**ToDo**

&nbsp;


#### Delete task

* URL: `/tasks`

* Method: DELETE

* Request Parameters:

	- *id* [int]

* Response:

	- status code [int]
	- status message [string]

* Example:

	**ToDo**

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
		- bounding box [minx,maxx,miny,maxy]
		- URL to final product [string]
		- runtime statistics [string]

* Example:

	**ToDo**



### Authentication

Token-based, to be specified


&nbsp;

&nbsp;




## Backend Specification

### Data storage 

File-based. 

The OSM data files are stored in a subfolder that is served by
the web app. File names are generated using name and id.

Two main files keep track of the application state:

1. tasklist.csv
    - stores all information about tasks
	- header: id, name, url, bbox, coverage, lastUpdated, averageRuntime,
	  addedDate, expirationDate

2. taskstats.csv
    - stores all benchmarks
    - header: timestamp, taskID, timing

Format:
- all dates in ISO 8601 format.
- bounding box (bbox): WGS84 coordinates [minx, maxx, miny, maxy]
- coverage: a polygon in WKT-format
- timing: seconds



### Update strategies

**Strategy 4 was chosen based on performance.**

1. 
    - keep an up-to-date copy of the real-time global OSM file from the GIScience intranet
    - for each task, clip data based on tasks polygon, update file that is
      served by the task URL

2. 
    - for each task, directly request the task's data from the GIScience
      intranet OSM database and save data to file that is served by the task URL

3.  
    - for each task, request diffs from the GIScience intranet OSM database and
      apply to the task's data files

4.
	- for each task, initialise by downloading a .pbf from Geofabrik and update it using osmupdate
	- find region by polygon: https://github.com/BikeCitizens/geofabrik-extracts


### Update algorithm for each task

1. Is an update process running for this task?
   a) Yes: Abort
   b) No: go to step 2 and start update

2. Is there an initial .pbf-file?
   a) Yes: Update the file using osmupdate (+timing)
   b) No: Generate initial .pbf-file:
	  - download smallest Geofabrik extract that covers the task [1](https://github.com/BikeCitizens/geofabrik-extracts)
      - clip extract using the task polygon/bbox
      - go to step 2a)

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

