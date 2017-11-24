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
    unitsInfo: null,
    monthDays: null,
};

// expose internals to testing
module.exports._test = state;

function resetTzCache( ) {
    // always keep the localtime offset on hand
    state.tzOffsetCache = { localtime: new Date().getTimezoneOffset() };

    // uset a timeout not interval to better control drift
    if (state.tzTimer) clearTimeout(state.tzTimer);
    state.tzTimer = setTimeout(resetTzCache, nextResetMs(tzResetInterval)).unref();

    // timezone offset accuracy is ensured by the millisecond precision timeout timer
    // that discards the cached offsets every 10 minutes.  If the event loop is blocked,
    // code that wants to look up offsets will also be delayed.  If the event loop is
    // blocked computing timezone offsets, it will appear as if the entire loop had
    // completed in the second leading up to the zone offset change.
}
resetTzCache();

// number of ms until the next even 10 minutes
function nextResetMs( interval ) {
    var now = Date.now();
    var currentIntervalMs = now % interval;
    var nextIntervalStart = interval - currentIntervalMs;
    return nextIntervalStart;
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

// units used to adjust date offset mapping
// each unit is defined as [name, offset_in_array, numeric_count]
// (note that each unit is 1 of iteself, except a week is defined as 7 days)
state.unitsInfo = {
    year: ['year', 0, 1],       years: -1, yr: -1, yrs: -1,
    month: ['month', 1, 1],     months: -1, mo: -1, mos: -1,
    week: ['week', 2, 7],       weeks: -1, wk: -1, wks: -1, w: -1,
    day: ['day', 2, 1],         days: -1, dy: -1,
    hour: ['hour', 3, 1],       hours: -1, hr: -1, hrs: -1,
    minute: ['minute', 4, 1],   minutes: -1, min: -1, mins: -1,
    second: ['second', 5, 1],   seconds: -1, sec: -1, secs: -1,
    millisecond: ['millisecond', 6, 1],         milliseconds: -1, millisec: -1, millisecs: -1, ms: -1, msec: -1, msecs: -1,
};
state.monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function populateAliases( object, marker ) {
    var lastSet;
    for (var key in object) {
        if (object[key] !== marker) lastSet = object[key];
        else object[key] = lastSet;
    }
}
populateAliases(state.unitsInfo, -1);

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
    if (!(state.unitsInfo[units][1] >= 0)) throw new Error(units + ": unrecognized unit");
    var dt = timestamp instanceof Date ? timestamp : new Date(timestamp);
    var hms = this._splitDate(dt);
    // nb: splitDate converts to local timezone
    // nb: adjusting can land on an invalid date eg 2/31 which Date() handles its own way

    var uinfo = state.unitsInfo[units];
    hms[uinfo[1]] += delta * uinfo[2];  // [name, field, multiplier] tuple eg ['week', 2(=day), 7]

/**
    // fixup: if adjusted months, cap the current day at the last valid day of the new month
    // but not if adjusted hours or days, which need to wrap correctly
    if (field === 1 && hms[2] > state.monthDays[hms[1]] - 1) {
        // unix leap years are precisely known, and no leap seconds
        var yr = hms[0], isLeap = (yr % 4) === 0 && ((yr % 100) !== 0 || (yr % 400) === 0);
        // peg at last day of month, except February needs a lookup
        hms[2] = state.monthDays[hms[1]];
        if (hms[2] === 1 && isLeap) hms[2] += 1;
    }
**/

    var dt = this._buildDate(hms);
    return dt;
},

QDate.prototype.following = function following( timestamp, unit ) {
    return this.startOf(this.adjust(timestamp, +1, unit), unit);
},

QDate.prototype.previous = function previous( timestamp, unit ) {
    return this.startOf(this.adjust(timestamp, -1, unit), unit);
},

QDate.prototype.startOf = function startOf( timestamp, unit ) {
    if (!(state.unitsInfo[units][1] >= 0)) throw new Error(units + ": unrecognized unit");
    var dt = timestamp instanceof Date ? timestamp : new Date(timestamp);
    var hms = this._splitDate(dt);

    var uinfo = state.unitsInfo[unit];
    var field = uinfo[1];

    // for weeks, move the day back to the start of this week
    if (uinfo[0] === 'week') hms[2] -= dt.getDay();

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
    if (tzAliasMap[tzName]) tzName = tzAliasMap[tzName];
},

QDate.prototype.formatUnix = function formatUnix( timestamp, tzName ) {
    var dt = this.parseDate(timestamp, tzName);
    // return dt.getTime() ... FIXME: need UTC timestamp!
//
// TODO: change all internal dates to when formatted to render the time in the tzName timezone.
}



QDate.prototype._escapeString = function _escapeString( str ) {
    return str.replace('\\', '\\\\').replace('"', '\\"');
},

// convert the timestamp from the named timezone to Date
QDate.prototype.parseDate = function parseDate( timestamp, tzName ) {
    tzName = this.lookupTzName(tzName);
    if (timestamp instanceof Date) return timestamp;

    // TODO: detect unix timestamp vs js timestamp vs datetime string

    // javascript creates Date objects in localtime
    // NOTE: Date parses by syntax, not actual timezone offset!
    //   ie "2001-01-01 EDT" => "2001-01-01T04:00:00Z", but "2001-01-01 EST" => "2001-01-01T05:00:00Z"
    var dt = new Date(timestamp);

    if (tzName) {
        // adjust dt so formatted for localtime it will read correct for tzName
        var offs = this.offset('localtime') - this.offset(tzName);
    }

    return dt;
}

QDate.prototype._splitDate = function _splitDate( dt, tzName ) {
    // the Date is split into components according to the system timezone, not utc
    if (tzName) {
        // TODO: adjust for specified timezone
    }
    return [ dt.getFullYear(), dt.getMonth(), dt.getDate() - 1, dt.getHours(), dt.getMinutes(), dt.getSeconds(), dt.getMilliseconds() ];
    // getMmonth returns 0..11, getDate 1..31
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
