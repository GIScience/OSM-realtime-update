# Real-time OSM

A service providing live OSM data.

Three components:

1. The API adds, deletes and gets information about tasks that provide region-bound real-time
   OSM data in PBF file format via a permanent URL

2. The backend runs, manages and gathers statistics for tasks

3. The web application serves the osm data produced by all tasks


## API Specification

Endpoints:

Add, Delete, Get


### Add task

/add/?name=&coverage=

- name should only allow [a-zA-Z]

- coverage should be a polygon in WKT-format


### Delete task
- by ID

### Get information about tasks
- by ID
- by name (-> multiple matches prints multiple tasks)


### Authentication

Token-based



## Backend Specification

### Data storage 

File-based. 

The OSM data files are stored in a subfolder that is served by
the web app. File names are generated using name and id.

Two main files keep track of the application state:

1. tasklist.csv
	- stores all information about tasks
	- header: id, name, url, coverage, lastupdated, average runtime, valid until

2. taskstats.csv
	- stores all benchmarks
	- header: timestamp, taskID, timing



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

# Osmosis Commands

Sample command, extracts up-to-date data for indonesia's bounding box:

´
osmosis --read-apidb-current authFile="authfile" \
							 host="1.2.3.4" \
							 database="osm" \
		--bounding-polygon file="indonesia.poly" \
		--write-pbd file="country.osm.pbf" \
					compress="deflate"
´



Sample command, extracts up-to-date data for a polygon:

´
osmosis --read-apidb-current authFile="authfile" \
							 host="1.2.3.4" \
							 database="osm" \
		--bounding-polygon file="indonesia.poly" \
		--write-pbd file="country.osm.pbf" \
					compress="deflate"
´


Generate highly simplified sample polygon file for indonesia:
´
wget http://biogeo.ucdavis.edu/data/gadm2.8/gpkg/IDN_adm_gpkg.zip
unzip IDN_adm_gpkg.zip
python2 ogr2poly.py IDN_adm.gpkg IDN_adm0 -s 1000
rm IDN_adm_gpkg.zip IDN_adm.gpkg license.txt
mv IDN_adm_0.poly indonesia.poly
´
