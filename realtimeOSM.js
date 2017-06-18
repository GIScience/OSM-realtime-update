// jshint esversion: 6, node: true
"use strict";

const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const morgan = require('morgan');   // library for logging
const fs = require("fs");           // file system access for logging
const sqlite3 = require('sqlite3').verbose(); // database access
const WKT = require('terraformer-wkt-parser'); // WKT parsing

require('./api.js');

