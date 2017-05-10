# Real-time OSM [DRAFT]

A service providing live OSM data.

Three components:

1. The API adds, deletes and gets information about tasks that provide region-bound real-time
   OSM data in PBF file format via a permanent URL

2. The backend runs, manages and gathers statistics for tasks

3. The web application serves the osm data produced by the tasks


## API Specification

Endpoints: Add, Delete, Get

Prefer GET-Requests. Minimum length: 2KB (Safari), Maximum length: 8KB (Firefox)

Allow POST-Requests for large WKT-Strings.


### Add task

`/add/?name=&coverage=&bbox=&expirationDate=`

`/add/?name=indonesia&coverage="POLYGON ((30 10, 40 40, 20 40, 10 20, 30 10))"`

`/add/?name=indonesia&bbox=94.972,-11.009,141.012,6.077&expirationDate=2020-01-01T23:59:59+02:00`


#### Parameters

- *name:* character string [a-zA-Z]
- *bounding box* (bbox): WGS84 decimal coordinates [minx, miny, maxx, maxy]
- *coverage:* a polygon in WKT-format
	- maximum nodes: 1000
- *expirationDate:* timestamp in ISO 8601 format [YYYY-MM-DDTHH:MM:SS+HH:MM]

If both bounding box and coverage are supplied, bbox is be preferred.


#### Response

- status code [int]
- status message [string]
- summary of the tasks properties
	- name [string]
	- id [int]
	- coverage [WKT polygon]
	- bounding box [minx,maxx,miny,maxy]
	- expiration date [YYYY-MM-DDTHH:MM:SS+HH:MM]
	- URL to final product [string]

&nbsp;


### Delete task

#### Parameters

- *id* [int]

#### Response

- status code [int]
- status message [string]

&nbsp;


### Get information about tasks

#### Parameters
- *id* [int]
- *name* [string] 
	- multiple matches prints multiple tasks

#### Response

- status code [int]
- status message [string]
- list of tasks found with properties:
	- name [string]
	- id [int]
	- coverage [WKT polygon]
	- bounding box [minx,maxx,miny,maxy]
	- URL to final product [string]
	- runtime statistics [string]


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
	- header: id, name, url, bbox, coverage, lastUpdated, averageRuntime, addedDate, expirationDate

2. taskstats.csv
	- stores all benchmarks
	- header: timestamp, taskID, timing

Format:
- all dates in ISO 8601 format.
- bounding box (bbox): WGS84 coordinates [minx, maxx, miny, maxy]
- coverage: a polygon in WKT-format
- timing: seconds



### Update strategies

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

&nbsp;

# Commands

Generate highly simplified sample polygon file for indonesia:
`
wget http://biogeo.ucdavis.edu/data/gadm2.8/gpkg/IDN_adm_gpkg.zip
unzip IDN_adm_gpkg.zip
python2 ogr2poly.py IDN_adm.gpkg IDN_adm0 -s 1000
rm IDN_adm_gpkg.zip IDN_adm.gpkg license.txt
mv IDN_adm_0.poly indonesia.poly
`

Sample command, extracts up-to-date data for indonesia's bounding box:
`
osmosis --read-apidb-current authFile="authfile" \
							 host="1.2.3.4" \
							 database="osm" \
		--bounding-polygon file="indonesia.poly" \
		--write-pbd file="country.osm.pbf" \
					compress="deflate"
`
&nbsp;

Sample command, extracts up-to-date data for a polygon:
`
osmosis --read-apidb-current authFile="authfile" \
							 host="1.2.3.4" \
							 database="osm" \
		--bounding-polygon file="indonesia.poly" \
		--write-pbd file="country.osm.pbf" \
					compress="deflate"
`
&nbsp;

