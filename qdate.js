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
    tzTimer: null,
    resetTzCache: resetTzCache,
    // units used to adjust date offset mapping
    // each unit is defined as [name, offset_in_array, numeric_count]
    // (note that each unit is 1 of iteself, except a week is defined as 7 days)
    unitsInfo: {
        year: ['year', 0, 1],       years: -1, yr: -1, yrs: -1, y: -1, Y: -1,
        month: ['month', 1, 1],     months: -1, mo: -1, mos: -1, M: -1,
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
    state.tzOffsetCache = { 'localtime': new Date().getTimezoneOffset() };
    state.tzInfoCache = {};

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
// TODO: use tzinfo
    var cmdline = this.maybeTzEnv(tzName) + this.tzAbbrevCommand;
    return child_process.execSync(cmdline).toString().trim();
}

QDate.prototype._findZoneinfo = function _findZoneinfo( tzName ) {
    try {
        return tzinfo.parseZoneinfo(tzinfo.readZoneinfoFileSync(tzName));
    } catch (e) {
        throw new Error(sprintf("qdate: %s: no tzinfo found", tzName));
    }
}

QDate.prototype.offset = function offset( tzName, when ) {
    if (tzName === 'GMT' || tzName === 'UTC') return 0;

    tzName = this.lookupTzName(tzName);
    if (when === undefined && state.tzOffsetCache[tzName] !== undefined) return state.tzOffsetCache[tzName];

    // to look up the offset at a specific time, need to use tzinfo
    // to look up the offset of a specific timezone, better to use tzinfo
    var info = state.tzInfoCache[tzName] || (state.tzInfoCache[tzName] = this._findZoneinfo(tzName));
    var stats = tzinfo.findTzinfo(info, when || new Date(), true);

    // convert seconds to minutes and positive direction from east-of-GMT to west-of-GMT
    var offset =  -(stats.tt_gmtoff / 60);

    if (when === undefined) state.tzOffsetCache[tzName] = offset;
    return offset;
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

QDate.prototype.adjust = function adjust( timestamp, delta, units ) {
    var uinfo = state.getUnitsInfo(units);
    var dt = timestamp instanceof Date ? timestamp : new Date(timestamp);
    var hms = this._splitDate(dt);
    // nb: splitDate converts to local timezone
    // nb: adjusting can land on an invalid date eg 2/31 which Date() handles its own way
    // TODO: make splitDate split into UTC fields

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

// FIXME: can only build the correct date if have the current timezone name! 'localtime' not enough
// FIXME: make split and build always use GMT to avoid the issue
    var dt = this._buildDate(hms);
    return dt;
}

QDate.prototype.following = function following( timestamp, unit ) {
    return this.startOf(this.adjust(timestamp, +1, unit), unit);
}

QDate.prototype.previous = function previous( timestamp, unit ) {
    return this.startOf(this.adjust(timestamp, -1, unit), unit);
}

// extend date?  or annotate each date object with its timezone?
QDate.prototype.startOf = function startOf( timestamp, units, tzName ) {
    var uinfo = state.getUnitsInfo(units);
    var dt = timestamp instanceof Date ? timestamp : new Date(timestamp);
    var hms = this._splitDate(dt, tzName);

    var field = uinfo[1];

    // for weeks, move the day back to the start of this week
// TODO: TZDate() object, extend with getTZDay(), getTZMinute() etc methods
// FIXME: day of week depends on timezone!  eg 10pm EST -> 2am GMT next day
    if (uinfo[0] === 'week') hms[2] -= dt.getDay();

    // zero out all smaller units
    for (var i=field+1; i<hms.length; i++) hms[i] = 0;

    return this._buildDate(hms, tzName);
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

    // javascript creates Date objects in localtime
    // note: Date parses by syntax, not actual timezone offset,
    //   so "2001-01-01 EDT" => "2001-01-01T04:00:00Z", but "2001-01-01 EST" => "2001-01-01T05:00:00Z"
    // TODO: strip out EDT, EST etc abbreviations, replace with -04:00, -05:00 etc.
    // javascript Date constructor interprets timestamp strings as being in localtime unless embeds tz info

    // ? strip out the tz name/abbrev, rely exclusively on tzName (but would break "Wed Jan 23" type dates)
    // timestamp = timestamp.replace(/[A-Za-z]/, ' ') + ' Z';
    timestamp += ' Z';
    var dt = new Date(timestamp);

    // parse as localtime if no timezone specified
    if (!tzName) tzName = 'localtime';
    tzName = this.lookupTzName(tzName);

    // adjust dt so formatted for localtime it will read correct for tzName
    // note that javascript timezone offsets increase westward and decrease eastward, ie Paris is negative
    // TODO: should adjust for GMT, since localtime always changes

    // adjust dt for the timestamp being from a non-UTC timezone
    var offset = this.offset(tzName, dt);
    dt.setMinutes(dt.getMinutes() + offset);

    return dt;
}

/*
 * Split the Date object into YMDhms localtime mktime paramters.
 */
QDate.prototype._splitDate = function _splitDate( dt, tzName ) {
    dt = this.parseDate(dt, tzName);
// TODO: split into GMT parts
    return [ dt.getFullYear(), dt.getMonth(), dt.getDate() - 1, dt.getHours(), dt.getMinutes(), dt.getSeconds(), dt.getMilliseconds() ];
    // getMonth returns 0..11, getDate 1..31
}

/*
 * construct a Date object from the mktime YMDhms parameters.
 * If tzName is provided, the parameters are interpreted as being in that timezone.
 */
QDate.prototype._buildDate = function _buildDate( hms, tzName ) {
    // days are 1-based, months, hours, minutes, etc all 0-based
// TODO: assemble from GMT parts, into localtime by offsetting with dt.getTimezoneOffset()
    var dt = new Date(hms[0], hms[1], hms[2] + 1, hms[3], hms[4], hms[5], hms[6]);
    var offset = this.offset(tzName || 'localtime');
    if (tzName) {
        dt.setMinutes(dt.getMinutes() - this.offset(tzName));
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

QDate.prototype = QDate.prototype;


// do not convert known timezones eg US/Eastern to America/New_York
for (var k in tzCanonicalMap) {
    new QDate().abbrev(k) && delete tzCanonicalMap[k];
}

// look up the default timezone name, if available
try { localtimeTimezone = fs.readFileSync('/etc/timezone').toString() }
catch (e) { localtimeTimezone = tzAliasMap[module.exports.abbrev()] }
