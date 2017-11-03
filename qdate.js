/**
 * simple timezone and datetime adjustment functions
 *
 * Copyright (C) 2016-2017 Andras Radics
 * Licensed under the Apache License, Version 2.0
 *
 * 2016-10-11 - Started.
 */

'use strict';

var child_process = require('child_process');
var phpdate = require('phpdate-js');
var qprintf = require('qprintf');
var sprintf = qprintf.sprintf;


var useCanonicalNames = false;


// export a date adjusting singleton
module.exports = new QDate();

var tzResetInterval = 600000;           // reset cache every 10 min to track daylight savings
var state = {
    tzOffsetCache: null,                // cache of timezones minutes west of gmt
    tzTimer: null,
    resetTzCache: resetTzCache,
};

// expose internals to testing
module.exports._test = state;

function resetTzCache( ) {
    state.tzOffsetCache = { localtime: new Date().getTimezoneOffset() };

    // uset a timeout not interval to better control drift
    if (state.tzTimer) clearTimeout(state.tzTimer);
    state.tzTimer = setTimeout(resetTzCache, nextResetMs(tzResetInterval)).unref();
}
resetTzCache();

// number of ms until the next even 10 minutes
function nextResetMs( interval ) {
    var now = Date.now();
    var next = interval - now % interval;
    return next;
}

// recognize the common North American timezone abbreviations
var tzAliasMap = {
    NST: 'Canada/Newfoundland', NDT: 'Canada/Newfoundland',     // 330
    AST: 'Canada/Atlantic', ADT: 'Canada/Atlantic',             // 400
    EST: 'US/Eastern', EDT: 'US/Eastern',                       // 500
    CST: 'US/Central', CDT: 'US/Central',                       // 600
    MST: 'US/Mountain', MDT: 'US/Mountain',                     // 700
    PST: 'US/Pacific', PDT: 'US/Pacific',                       // 800
    AKST: 'US/Alaska', AKDT: 'US/Alaska',                       // 900
    HST: 'US/Hawaii', HDT: 'US/Hawaii',                         // 1000, no daylight savings
    HAST: 'US/Aleutian', HADT: 'US/Aleutian',                   // 1000
};

// map linux-only eg US/Eastern to canonical timezone names
var tzCanonicalMap = {
    'US/Eastern': 'America/New_York',
    'US/Central': 'America/Chicago',
    'US/Moutain': 'America/Boise',
    'US/Pacific': 'America/Los_Angeles',
    'US/Alaska': 'America/Juneau',
    'US/Hawaii': 'Pacific/Honolulu',
    'US/Aleutian': 'Pacific/Honolulu',  // TODO: find a better city for daylight savings HAST time
};

// unit to split date offset mapping
var unitsMap = {
    year: 0,        years: 0,        yr: 0,  yrs: 0,
    month: 1,       months: 1,       mo: 1,  mos: 1,
    day: 2,         days: 2,         dy: 2,
    hour: 3,        hours: 3,        hr: 3,  hrs: 3,
    minute: 4,      minutes: 4,      min: 4, mins: 4,
    second: 5,      seconds: 5,      sec: 5, secs: 5,
    millisecond: 6, milliseconds: 6, ms: 6,

    // weeks are mapped to ['week', days_offset, days_count]
    week: ['week', 2, 7], weeks: ['week', 2, 7], wk: ['week', 2, 7], w: ['week', 2, 7], W: ['week', 2, 7],
};


function QDate( ) {
    this.envCommand = "env";            // /usr/bin/env
    this.tzAbbrevCommand = "date +%Z";
    this.tzOffsetCommand = "date +%z";
    this.strtotimeCommand = 'date --date="%s"';
}

QDate.prototype.maybeTzEnv = function maybeTzEnv( tzName ) {
    if (!tzName) return '';
    return this.envCommand + ' TZ="' + this._escapeString(tzName) + '" ';
}

QDate.prototype.lookupTzName = function lookupTzName( tzName ) {
    if (tzAliasMap[tzName]) tzName = tzAliasMap[tzName];
    if (useCanonicalNames && tzCanonicalMap[tzName]) tzName = tzCanonicalMap[tzName];
    return tzName;
}

QDate.prototype.abbrev = function abbrev( tzName ) {
    tzName = this.lookupTzName(tzName);
    var cmdline = this.maybeTzEnv(tzName) + this.tzAbbrevCommand;
    return child_process.execSync(cmdline).toString().trim();
}

QDate.prototype.offset = function offset( tzName ) {
    tzName = this.lookupTzName(tzName);
    if (state.tzOffsetCache[tzName] !== undefined) return state.tzOffsetCache[tzName];

    var cmdline = this.maybeTzEnv(tzName) + this.tzOffsetCommand;
    var tzOffset = parseInt(child_process.execSync(cmdline));
    if (tzOffset < 0) {
        // javascript timezone offsets increase toward west of gmt, make positive
         return state.tzOffsetCache[tzName] = ( 60 * Math.floor(-tzOffset / 100) - -tzOffset % 100 );
    } else {
        return state.tzOffsetCache[tzName] = -( 60 * Math.floor(tzOffset / 100) + tzOffset % 100 );
    }
},

QDate.prototype.convert = function convert( timestamp, tzFromName, tzToName, format ) {
    tzFromName = this.lookupTzName(tzFromName);
    tzToName = this.lookupTzName(tzToName);
    if (typeof timestamp !== 'number') timestamp = new Date(timestamp).getTime();
    // FIXME:
    // ??? return timestamp + 60000 * (this.offset(tzToName) - this.offset(tzFromName));
},

QDate.prototype.list = function list( ) {
    // note: this call could be slow, and is blocking, call only during setup
    // TODO: make work on platforms, eg /usr/lib/zoneinfo
    var files = child_process.execSync(
        "find /usr/share/zoneinfo/ -type f | xargs file | grep timezone | cut -d: -f1 | cut -b21- | grep '^[A-Z]'");
    files = files.toString().trim().split("\n");
    return files;
},

QDate.prototype.adjust = function adjust( timestamp, delta, units ) {
    if (!unitsMap[units]) throw new Error(units + ": unrecognized unit");
    var dt = timestamp instanceof Date ? timestamp : new Date(timestamp);
    var hms = this._splitDate(dt);

    var field = unitsMap[units];
    if (field >= 0) hms[field] += delta;        // field
    else hms[field[1]] += delta * field[2];     // [field, multiplier] tuple eg ['week', 7, 2]

    return this._buildDate(hms);
},

QDate.prototype.following = function following( timestamp, unit ) {
    return this.startOf(this.adjust(timestamp, +1, unit), unit);
},

QDate.prototype.previous = function previous( timestamp, unit ) {
    return this.startOf(this.adjust(timestamp, -1, unit), unit);
},

QDate.prototype.startOf = function startOf( timestamp, unit ) {
    if (!unitsMap[unit]) throw new Error(unit + ": unrecognized unit");
    var dt = timestamp instanceof Date ? timestamp : new Date(timestamp);
    var hms = this._splitDate(dt);

    var field = unitsMap[unit];
    if (field >= 0) {
        ;
    }
    else if (field[0] === 'week') {
        field = 2;
        hms[field] -= dt.getDay();
    }

    // zero out all smaller units
    for (var i=field+1; i<hms.length; i++) hms[field] = 0;

    return this._buildDate(hms);
},

QDate.prototype.strtotime = function strtotime( timespec, tzName ) {
    tzName = this.lookupTzName(tzName);
    if (typeof timespec !== 'string') throw new Error("timespec must be a string not " + (typeof timespec));
    var cmdline = this.maybeTzEnv(tzName) + sprintf(this.strtotimeCommand, this._escapeString(timespec));
    var timestamp = child_process.execSync(cmdline).toString();
    return new Date(timestamp);
},

QDate.prototype.format = function format( timestamp, format, tzName ) {
    // TBD - use phpdate-js
    if (tzAliasMap[tzName]) tzName = tzAliasMap(tzName);
},

QDate.prototype._tryCommand = function _tryCommand( cmdline ) {
    try { return child_process.execSync(cmdline).toString(); }
    catch (err) { return err; }
},

QDate.prototype._escapeString = function _escapeString( str ) {
    return str.replace('\\', '\\\\').replace('"', '\\"');
},

QDate.prototype._splitDate = function _splitDate( dt, tzName ) {
    // the Date is split into components according to the system timezone, not utc
    if (tzName) {
        // FIXME: adjust for specified timezone
    }
    return [ dt.getFullYear(), dt.getMonth(), dt.getDate() - 1, dt.getHours(), dt.getMinutes(), dt.getSeconds(), dt.getMilliseconds() ];
    // getMmonth returns 0..11, getDay 1..31
},

QDate.prototype._buildDate = function _buildDate( hms ) {
    // days are 1-based, months, hours, minutes, etc all 0-based
    return new Date(hms[0], hms[1], hms[2] + 1, hms[3], hms[4], hms[5], hms[6]);
},

// aliases
QDate.prototype.getTimezoneAbbrev = null;
QDate.prototype.getTimezoneOffset = null;
QDate.prototype.getTimezoneList = null;


// aliases

QDate.prototype.getTimezoneAbbrev = QDate.prototype.abbrev;
QDate.prototype.getTimezoneOffset = QDate.prototype.offset;
QDate.prototype.getTimezoneList = QDate.prototype.list;
QDate.prototype.current = QDate.prototype.startOf;
QDate.prototype.next = QDate.prototype.following;
QDate.prototype.last = QDate.prototype.previous;

QDate.prototype = QDate.prototype;

// if US/Eastern is not a recognized timezone name, canonicalize names
useCanonicalNames = ! new QDate().abbrev('US/Eastern');
