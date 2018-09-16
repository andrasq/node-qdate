/**
 * simple timezone and datetime adjustment functions
 *
 * Copyright (C) 2016-2018 Andras Radics
 * Licensed under the Apache License, Version 2.0
 *
 * 2016-10-11 - Started.
 */

'use strict';

var child_process = require('child_process');
var phpdate = require('phpdate-js');
var qprintf = require('qprintf');
var sprintf = qprintf.sprintf;
var sprintf = require('util').format
var tzinfo = require('tzinfo');


// initialized during loading
var cachedZonefilesList = tzinfo.listZoneinfoFiles(tzinfo.getZoneinfoDirectory());
var localtimeTimezone;

// export a date adjusting singleton
module.exports = new QDate();

var tzResetInterval = 600000;           // reset cache every 10 min to track daylight savings
var state = {
    tzOffsetCache: null,                // cache of timezones minutes west of gmt
    tzInfoCache: null,                  // cache of tzinfo from `tzinfo`
    tzAbbrevCache: null,                // cache of current tz abbrev
    tzTimer: null,
    resetTzCache: resetTzCache,
    // units used to adjust date offset mapping
    // each unit is defined as [name, offset_in_array, numeric_count]
    // (note that each unit is 1 of iteself, except a week is defined as 7 days)
    unitsInfo: {
        year: ['year', 0, 1],       years: -1, yr: -1, yrs: -1, y: -1, Y: -1,
        month: ['month', 1, 1],     months: -1, mo: -1, mos: -1, mon: -1, mons: -1, M: -1,
        week: ['week', 2, 7],       weeks: -1, wk: -1, wks: -1, w: -1, W: -1,
        day: ['day', 2, 1],         days: -1, dy: -1, d: -1, D: -1,
        hour: ['hour', 3, 1],       hours: -1, hr: -1, hrs: -1, h: -1,
        minute: ['minute', 4, 1],   minutes: -1, min: -1, mins: -1, mi: -1, m: -1,
        second: ['second', 5, 1],   seconds: -1, sec: -1, secs: -1, s: -1,
        millisecond: ['millisecond', 6, 1],         milliseconds: -1, millisec: -1, millisecs: -1, ms: -1, msec: -1, msecs: -1,
    },
    monthDays: [ 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 ],

    getUnitsInfo: function getUnitsInfo( units ) {
        if (!this.unitsInfo[units]) throw new Error(units + ": unrecognized unit");
        return state.unitsInfo[units];
    },

};
function populateAliases( object ) {
    var lastSet;
    for (var key in object) {
        (object[key] === -1) ? object[key] = lastSet : lastSet = object[key];
    }
}
populateAliases(state.unitsInfo);

// expose internals to testing
module.exports._test = state;

function resetTzCache( ) {
    // always keep the localtime offset on hand
    state.tzOffsetCache = new Object({ 'localtime': new Date().getTimezoneOffset() });
    state.tzAbbrevCache = new Object();
    state.tzInfoCache = new Object();

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

// recognize some common timezone abbreviations
var tzAliasMap = {
    // standard, daylight savings, HHMM west of GMT
    NST: 'Canada/Newfoundland', NDT: 'Canada/Newfoundland',     // 330
    AST: 'Canada/Atlantic', ADT: 'Canada/Atlantic',             // 400
    EST: 'US/Eastern', EDT: 'US/Eastern',                       // 500
    CST: 'US/Central', CDT: 'US/Central',                       // 600
    MST: 'US/Mountain', MDT: 'US/Mountain',                     // 700
    PST: 'US/Pacific', PDT: 'US/Pacific',                       // 800
    AKST: 'US/Alaska', AKDT: 'US/Alaska',                       // 900
    HST: 'US/Hawaii', HDT: 'US/Hawaii',                         // 1000, no daylight savings
    HAST: 'US/Aleutian', HADT: 'US/Aleutian',                   // 1000

    GMT: 'GMT', 'UTC': 'UTC',                                   // -0000
    BST: 'Europe/London', BDST: 'Europe/London',                // -0000
    CET: 'Europe/Central', CEST: 'Europe/Central',              // -0100
    EET: 'Europe/Eastern', EEST: 'Europe/Eastern',              // -0200
    MSK: 'Europe/Moscow', /* MST, MDST, */                      // -0300
};

// map linux-only eg US/Eastern to canonical timezone names
// Entries that are locally recognized are deleted from this map.
var tzCanonicalMap = {
    'Canada/Newfoundland': 'America/St_Johns',
    'Canada/Atlantic': 'America/Halifax',
    'Canada/Eastern': 'America/Toronto',
    'Canada/Central': 'America/Winnipeg',
    'Canada/Mountain': 'America/Edmonton',
    'Canada/Pacific': 'America/Vancouver',

    'US/Eastern': 'America/New_York',
    'US/Central': 'America/Chicago',
    'US/Moutain': 'America/Boise',
    'US/Pacific': 'America/Los_Angeles',
    'US/Alaska': 'America/Juneau',
    'US/Hawaii': 'Pacific/Honolulu',

    'Europe/Central': 'Europe/Paris',
    'Europe/Eastern': 'Europe/Athens',
};


function QDate( ) {
    // gnu date options to retrieve timezone name and abbrev
    this.envCommand = "env";            // /usr/bin/env
    this.tzAbbrevCommand = "date +%Z";
    this.tzOffsetCommand = "date +%z";
    this.strtotimeCommand = 'date --date="%s"';
}

QDate.prototype._state = state;

QDate.prototype.maybeTzEnv = function maybeTzEnv( tzName ) {
    if (!tzName) return '';
    return this.envCommand + ' TZ="' + this._escapeString(tzName) + '" ';
}

QDate.prototype.lookupTzName = function lookupTzName( tzName ) {
    return tzAliasMap[tzName] || tzCanonicalMap[tzName] || tzName;
}

QDate.prototype.abbrev = function abbrev( tzName ) {
    if (state.tzAbbrevCache[tzName]) return state.tzAbbrevCache[tzName];
    var cmdline = this.maybeTzEnv(tzName) + this.tzAbbrevCommand;
    return state.tzAbbrevCache[tzName] = child_process.execSync(cmdline).toString().trim();

/**
    // using tzinfo:
    try {
        var stats = this._getZoneinfo(tzName, new Date());
        return state.tzAbbrevCache[tzName] = stats.abbrev;
    } catch (err) {
        return tzName;
    }
// TODO: if cannot locate, use eg GMT+0100, GMT-0400
**/
}

/*
 * get the info for the named timezone, or the tzinfo struct for the specified time
 */
QDate.prototype._getZoneinfo = function _getZoneinfo( tzName, when ) {
    try {
        tzName = this.lookupTzName(tzName);
        var zoneinfo = state.tzInfoCache[tzName] || (state.tzInfoCache[tzName] = tzinfo.parseZoneinfo(tzinfo.readZoneinfoFileSync(tzName)));
        return tzinfo.findTzinfo(zoneinfo, when, true);
    }
    catch (e) {
        throw new Error(sprintf("qdate: %s: no tzinfo found: %s", tzName, e.message));
    }
}

QDate.prototype.offset = function offset( tzName, when ) {
    if (tzName === 'GMT' || tzName === 'UTC') return 0;

    tzName = this.lookupTzName(tzName);
    if (when === undefined && state.tzOffsetCache[tzName] !== undefined) return state.tzOffsetCache[tzName];

    // to look up the offset at a specific time, need to use tzinfo
    // to look up the offset of a specific timezone, better to use tzinfo
    var stats = this._getZoneinfo(tzName, when || new Date());

    // convert seconds to minutes and positive direction from east-of-GMT to west-of-GMT
    var minutesToGMT =  -(stats.tt_gmtoff / 60);

    if (when === undefined) state.tzOffsetCache[tzName] = minutesToGMT;
    return minutesToGMT;
}

QDate.prototype.convert = function convert( timestamp, tzFromName, tzToName, format ) {
    var dt = this.parseDate(timestamp, tzFromName);
    format = format || 'Y-m-d H:i:s';
    return this.format(dt, format, tzToName);
}

QDate.prototype.list = function list( ) {
    var dirname = tzinfo.getZoneinfoDirectory();
    var files = new Array();
    for (var i=0; i<cachedZonefilesList.length; i++) {
        files.push(cachedZonefilesList[i].slice(dirname.length + 1));
    }
    return files;
}

QDate.prototype.adjust = function adjust( timestamp, delta, units, tzName ) {
    var uinfo = state.getUnitsInfo(units);

    // split the timestamp into localtime hms fields
    var dt = timestamp instanceof Date ? timestamp : this.parseDate(timestamp, tzName || 'localtime');
    var hms = this._splitDate(dt, tzName || 'localtime');

    // adjust the hms by the specified delta
    var field = uinfo[1];
    hms[field] += delta * uinfo[2];     // [name, field, multiplier] tuple eg ['week', 2(=day), 7]

    // adjusting by months is different from all the others,
    // because months are different sizes.  Ie, 1/5 -> 2/5 -> 3/5 -> 4/5, but
    // 1/30 -> 2/28 -> 3/30 -> 4/30, and 1/31 -> 2/28 -> 3/31 -> 4/30.
    // If adjusted months, cap the current day at the last valid day of the new month
    // but not if adjusted hours or days, which need to wrap correctly
    if (field === 1 && hms[2] > state.monthDays[hms[1]] - 1) {
        // peg at last day of month, except February needs a leap year test
        hms[2] = state.monthDays[hms[1]] - 1;
        if (hms[1] === 1) {
            var yr = hms[0], isLeap = (yr % 4) === 0 && ((yr % 100) !== 0 || (yr % 400) === 0);
            if (isLeap) hms[2] += 1;
        }
    }

    // combine the adjusted and clamped/normalized hms fields
    var dt = this._buildDate(hms, tzName || 'localtime');
    return dt;
}

QDate.prototype.following = function following( timestamp, unit, tzName ) {
    return this.startOf(this.adjust(timestamp, +1, unit), unit, tzName || 'localtime');
}

QDate.prototype.previous = function previous( timestamp, unit, tzName ) {
    return this.startOf(this.adjust(timestamp, -1, unit), unit, tzName || 'localtime');
}

// extend date?  or annotate each date object with its timezone?
QDate.prototype.startOf = function startOf( timestamp, units, tzName ) {
    tzName = tzName || 'localtime';
    var uinfo = state.getUnitsInfo(units);
    var dt = this.parseDate(timestamp, tzName);
    var hms = this._splitDate(dt, tzName);

    var field = uinfo[1];

    // for weeks, move the day back to the start of this week
// TODO: TZDate() object, extend with getTZDay(), getTZMinute() etc methods
// FIXME: day of week depends on timezone!  eg 10pm EST -> 2am GMT next day
    if (uinfo[0] === 'week') hms[2] -= dt.getDay();

    // zero out all smaller units
    for (var i=field+1; i<hms.length; i++) hms[i] = 0;

    var dt = this._buildDate(hms, tzName);
    return dt;
}

QDate.prototype.strtotime = function strtotime( timespec, tzName ) {
    tzName = this.lookupTzName(tzName);
    if (typeof timespec !== 'string') throw new Error("timespec must be a string not " + (typeof timespec));
    var cmdline = this.maybeTzEnv(tzName) + sprintf(this.strtotimeCommand, this._escapeString(timespec));
    var timestamp = child_process.execSync(cmdline).toString();
    return new Date(timestamp);
}

QDate.prototype.formatDate = function formatDate( timestamp, format, tzName ) {
    tzName = this.lookupTzName(tzName);
    var dt = this.parseDate(timestamp, tzName);
    if (!tzName) return phpdate(format, timestamp);

    // TODO: look up tzInfo, look up offset for Math.floor(dt.getTime() / 1000),
    // tell php the timezone name, abbrev and offset to use, and format as gmt.
    // phpdate.tzdate(format, dt, { tzName: tzName, tzAbbrev: tzAbbrev, tzOffset: tzOffset });
}

/**
QDate.prototype.formatUnix = function formatUnix( timestamp, tzName ) {
    var dt = this.parseDate(timestamp, tzName);
    // return dt.getTime() ... FIXME: need UTC timestamp!
//
// TODO: change all internal dates to when formatted to render the time in the tzName timezone.
}
**/


QDate.prototype._escapeString = function _escapeString( str ) {
    return str.replace('\\', '\\\\').replace('"', '\\"');
}

// convert the timestamp from the named timezone to Date
// @{timestamp] should be a datetime string without timezone info
QDate.prototype.parseDate = function parseDate( timestamp, tzName ) {
    if (typeof timestamp !== 'string') {
        if (timestamp instanceof Date) return timestamp;
        if (typeof timestamp === 'number') return new Date(timestamp);
        throw new Error(sprintf("cannot parse date from '%s'", timestamp));
    }

    // note: Date parses by syntax, not actual timezone offset,
    //   so "2001-01-01 EDT" => "2001-01-01T04:00:00Z", but "2001-01-01 EST" => "2001-01-01T05:00:00Z"
    // TODO: strip out EDT, EST etc abbreviations, replace with -04:00, -05:00 etc.
    // javascript Date constructor interprets timestamp strings as being in localtime unless embeds tz info

    // ? strip out the tz name/abbrev, rely exclusively on tzName (but would break "Wed Jan 23" type dates)
    // timestamp = timestamp.replace(/[A-Za-z]/, ' ') + ' Z';
    if (! /Z\s*$/.test(timestamp)) timestamp += 'Z';
    var dt = new Date(timestamp);

    // parse as localtime if no timezone specified
    tzName = this.lookupTzName(tzName || 'localtime');

    // adjust dt for the timestamp being from a non-UTC timezone
// FIXME: actually, need the offset not for dt, but for dt + offsetToGMT
    var minutesToGMT = this.offset(tzName, dt);
    dt.setMinutes(dt.getMinutes() + minutesToGMT);

    return dt;
}

/*
 * Split the Date object into YMDhms mktime hms fields.
 * If a timezone is named, split into timezone-specific hms fields.
 */
QDate.prototype._splitDate = function _splitDate( dt, tzName ) {
    if (typeof dt === 'object') {
        var minutesToGMT = this.offset(tzName || 'localtime', dt);
        if (minutesToGMT) {
            // offset the GMT Date to make hms fields read localtime values
            // TODO: check that this works during ST/DT changes
            dt = new Date(dt);
            dt.setMinutes(dt.getMinutes() - minutesToGMT);
        }
    } else {
        // split a datetime string as is, without tz adjust
        dt = this.parseDate(dt, 'GMT');
    }
    var hms = [ dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate() - 1,
                dt.getUTCHours(), dt.getUTCMinutes(), dt.getUTCSeconds(), dt.getUTCMilliseconds() ];
    return hms;
}

/*
 * assemble a Date object from the mktime YMDhms fields.
 * If tzName is provided, the parameters are interpreted as being in that timezone.
 */
QDate.prototype._buildDate = function _buildDate( hms, tzName ) {
    // assemble date as if GMT to avoid localtime
    // days are 1-based, months, hours, minutes, etc all 0-based
    // new Date(1000*(h*3600 + m*60 + s) + ms) builds wrong date if eg hrs == -1
    var dt = new Date(0);
    dt.setUTCFullYear(hms[0]);
    dt.setUTCMonth(hms[1]);
    dt.setUTCDate(hms[2] + 1);
    dt.setUTCHours(hms[3]);
    dt.setUTCMinutes(hms[4]);
    dt.setUTCSeconds(hms[5]);
    dt.setUTCMilliseconds(hms[6]);

    var minutesToGMT = this.offset(tzName || 'localtime', dt);
    if (minutesToGMT) {
        // if hms was not in GMT, adjust the Date by the tz offset
        // TODO: confirm that this works during ST/DT changes
        // FIXME: actually, need the offset not of dt, but the adjusted dt + minutesToGMT
        dt.setMinutes(dt.getMinutes() + minutesToGMT);
    }
    return dt;
}

// aliases
QDate.prototype.getTimezoneAbbrev = QDate.prototype.abbrev;
QDate.prototype.getTimezoneOffset = QDate.prototype.offset;
QDate.prototype.getTimezoneList = QDate.prototype.list;
QDate.prototype.parse = QDate.prototype.parseDate;
QDate.prototype.format = QDate.prototype.formatDate;
QDate.prototype.current = QDate.prototype.startOf;
QDate.prototype.next = QDate.prototype.following;
QDate.prototype.last = QDate.prototype.previous;

QDate.prototype = toStruct(QDate.prototype);
function toStruct( hash ) { return toStruct.prototype = hash }

// do not convert known timezones eg US/Eastern to America/New_York
for (var k in tzCanonicalMap) {
    new QDate().abbrev(k) && delete tzCanonicalMap[k];
}

// look up the default timezone name, if available
try { localtimeTimezone = fs.readFileSync('/etc/timezone').toString() }
catch (e) { localtimeTimezone = tzAliasMap[module.exports.abbrev()] }
