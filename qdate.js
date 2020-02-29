/**
 * simple timezone and datetime adjustment functions
 *
 * Copyright (C) 2016-2020 Andras Radics
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

// alias linux-only eg US/Eastern to their canonical timezone names
// Entries that are locally recognized are deleted from this map and are used as-is.
var tzCanonicalMap = {
    'Canada/Newfoundland': 'America/St_Johns',
    'Canada/Atlantic': 'America/Halifax',
    'Canada/Eastern': 'America/Toronto',
    'Canada/Central': 'America/Winnipeg',
    'Canada/Mountain': 'America/Edmonton',
    'Canada/Pacific': 'America/Vancouver',

    'US/Eastern': 'America/New_York',
    'US/Central': 'America/Chicago',
    'US/Mountain': 'America/Boise',
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
    if (state.tzAbbrevCache[tzName] !== undefined) return state.tzAbbrevCache[tzName];
    try {
        var stats = this._getZoneinfo(tzName, new Date());
        return state.tzAbbrevCache[tzName] = stats.abbrev;
    }
    catch (err) {
        return state.tzAbbrevCache[tzName] = null;
        // TODO: if cannot locate, use eg GMT+0100, GMT-0400
    }
}

/*
 * get the tzinfo struct for the specified time
 */
QDate.prototype._getZoneinfo = function _getZoneinfo( tzName, when ) {
    try {
        var zoneinfo = state.tzInfoCache[tzName] || (state.tzInfoCache[tzName] = tzinfo.parseZoneinfo(tzinfo.readZoneinfoFileSync(tzName)));
        return tzinfo.findTzinfo(zoneinfo, when, true);
    }
    catch (e) {
        throw new Error(sprintf("qdate: %s: no tzinfo found: %s", tzName, e.message));
    }
}

/*
 * return the minutes west of GMT of tzName, either now or at the time `when`
 * Note that JavaScript uses positive values for offsets west of 0 longitude,
 * while in most other contexts positives are east of 0 longitude.
 */
QDate.prototype.offset = function offset( tzName, when ) {
    if (tzName === 'GMT' || tzName === 'UTC') return 0;

    tzName = this.lookupTzName(tzName);
    if (when === undefined && state.tzOffsetCache[tzName] !== undefined) return state.tzOffsetCache[tzName];

    // to look up the offset at a specific time, need to use tzinfo
    // to look up the offset of a specific timezone, better to use tzinfo
    var stats = this._getZoneinfo(tzName, when || new Date());

    // convert seconds to minutes and positive direction from east-of-GMT to west-of-GMT
    var minutesToGMT =  -(stats.tt_gmtoff / 60);
    var rounded = false;

    // CAUTION: newer Linux systems return LMT with fractional timezone offsets
    // for dates before date/time regularization.  Disbelieve anything that's not a
    // multiple of 15 minutes, and round it to the nearest 15 min.
    if (minutesToGMT % 15 !== 0) {
        rounded = true;
        // subtracting signed remainder truncates toward zero
        minutesToGMT += minutesToGMT < 0 ? -15/2 : 15/2;
        minutesToGMT -= (minutesToGMT % 15);
    }

    if (when === undefined && !rounded) state.tzOffsetCache[tzName] = minutesToGMT;
    return minutesToGMT;
}

/*
 * timezone convert the datetime string `timestamp` per the phpdate format `format`
 * The default format is an SQL ISO-9075 datetime string without fractional seconds.
 */
QDate.prototype.convert = function convert( timestamp, tzFromName, tzToName, format ) {
    var dt = this.parseDate(timestamp, tzFromName);
    format = format || 'Y-m-d H:i:s';
    return this.format(dt, format, tzToName);
}

/*
 * return a list of all known timezones.
 * The master list is retrieved just once on program start.
 */
QDate.prototype.list = function list( ) {
    var dirname = tzinfo.getZoneinfoDirectory();
    var files = new Array();
    for (var i=0; i<cachedZonefilesList.length; i++) {
        files.push(cachedZonefilesList[i].slice(dirname.length + 1));
    }
    return files;
}

/*
 * adjust the date represented by timestamp up or down by `+delta` or `-delta` units.
 * Units can be eg `hours`, `days`, `minutes` etc.  If timestamp is a string, it will
 * be parsed as if being from timezone `tzName`.  Adjustment is done to be correct for
 * tzName (else localtime), which affects how months are clamped.
 * Returns a Date object corresponding to the adjusted date.
 *
 * Adjusting the months is special: if the resulting day is past the end of the month,
 * clamp the day to the last day of the month.  Ie, 12/30 +2 months returns 2/28 or 2/29
 * (depending on whether it's a leap year), not 3/2 or 3/1.  This also means that
 * repeatedly adjusting the month can clamp the day multiple times, from 31 to 30 to 28.
 */
QDate.prototype.adjust = function adjust( timestamp, delta, units, tzName ) {
    var uinfo = state.getUnitsInfo(units);
    tzName = tzName || 'localtime';

    var dt = timestamp instanceof Date ? new Date(timestamp) : this.parseDate(timestamp, tzName);

    // adjust all but months quickly, directly on the Date object
    // months are special, and are handled below
    switch (uinfo[0]) {
        // month, year handled below
        case 'week':        dt.setUTCDate(dt.getUTCDate() + 7 * delta);             return dt;
        case 'day':         dt.setUTCDate(dt.getUTCDate() + delta);                 return dt;
        case 'hour':        dt.setUTCHours(dt.getUTCHours() + delta);               return dt;
        case 'minute':      dt.setUTCMinutes(dt.getUTCMinutes() + delta);           return dt;
        case 'second':      dt.setUTCSeconds(dt.getUTCSeconds() + delta);           return dt;
        case 'millisecond': dt.setUTCMilliseconds(dt.getUTCMilliseconds() + delta); return dt;
    }

    // to clamp months when adjusting months/years, split the timestamp into hms fields
    var hms = this._splitDate(dt, tzName);

    // adjust the hms by the specified delta
    var field = uinfo[1];
    hms[field] += delta * uinfo[2];     // [name, field, multiplier] tuple eg ['week', 2(=day), 7]

    // adjusting by months is different from all the others,
    // because months are different sizes.  Ie, 1/5 -> 2/5 -> 3/5 -> 4/5, but
    // 1/30 -> 2/28 -> 3/30 -> 4/30, and 1/31 -> 2/28 -> 3/31 -> 4/30.
    // If adjusted months, clamp the current day at the last valid day of the new month
    // but not if adjusted hours or days, which need to wrap correctly
    // Adjusting years same thing, eg 2020-02-29 --> 2021-02-28
    if ((field === 0 || field === 1) && hms[2] > state.monthDays[hms[1]] - 1) {
        // peg at last day of month, except February needs a leap year test
        hms[2] = state.monthDays[hms[1]] - 1;
        if (hms[1] === 1) {
            var yr = hms[0], isLeap = (yr % 4) === 0 && ((yr % 100) !== 0 || (yr % 400) === 0);
            // in leap years February has 29 days, clamp to 29.
            // Note that if the adjusted date lands on 28, no clamping is done.
            if (isLeap) hms[2] += 1;
        }
    }

    // combine the adjusted and clamped/normalized hms fields back into a Date
    var dt = this._buildDate(hms, tzName);
    return dt;
}

/*
 * return the start of the next time unit, eg next month, next day, etc.
 * Timestamp can be a datetime string of Date object.
 * The start is calculated in tzName (or localtime), so the day following
 * 1/1 1:00am GMT in would be 1/1 Eastern time, but 1/2 in Paris.
 */
QDate.prototype.following = function following( timestamp, unit, tzName ) {
    return this.startOf(this.adjust(timestamp, +1, unit), unit, tzName || 'localtime');
}

/*
 * return the start of the previous time unit, eg last month, last day, etc
 * Timestamp can be a datetime string of Date object.
 * The start is calculated in tzName (or localtime), so the day preceding
 * 1/2 1:00am GMT in would be 12/31 Eastern time, but 1/1 in Paris.
 */
QDate.prototype.previous = function previous( timestamp, unit, tzName ) {
    return this.startOf(this.adjust(timestamp, -1, unit), unit, tzName || 'localtime');
}

/*
 * return a Date correesponding to the start of the named time unit.
 * Timestamp can be a datetime string of Date object.
 * The start is calculated in tzName (or localtime), so the start of the day
 * 1/1 1:00am GMT would be 12/31 Eastern time but 1/1 in Paris.
 */
QDate.prototype.startOf = function startOf( timestamp, units, tzName ) {
    tzName = tzName || 'localtime';
    var uinfo = state.getUnitsInfo(units);
    var dt = this.parseDate(timestamp, tzName);
    var hms = this._splitDate(dt, tzName);

    var field = uinfo[1];

    // for weeks, move the day back to the start of this week
// TODO: TZDate() object, extend with getTZDay(), getTZMinute() etc methods
// extend date?  or annotate each date object with its timezone?
// FIXME: day of week depends on timezone!  eg 10pm EST -> 2am GMT next day
    if (uinfo[0] === 'week') hms[2] -= dt.getDay();

    // zero out all smaller units
    for (var i=field+1; i<hms.length; i++) hms[i] = 0;

    var dt = this._buildDate(hms, tzName);
    return dt;
}

/*
 * convert the timespec string to a Date with gnu date: date --date="%s"
 */
QDate.prototype.strtotime = function strtotime( timespec, tzName ) {
    tzName = this.lookupTzName(tzName);
    if (typeof timespec !== 'string') throw new Error("timespec must be a string not " + (typeof timespec));
    var cmdline = this.maybeTzEnv(tzName) + sprintf(this.strtotimeCommand, this._escapeString(timespec));
    var timestamp = child_process.execSync(cmdline).toString();
    return new Date(timestamp);
}

/*
 * format the date represented by timestamp with phpdate
 * Timestamp can be a string in tzName (or localtime) or a Date object.
 * TODO: handles only localtime, does not handle arbitrary timezones yet.
 */
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


// shell-escape the string to make it safe for use in a shell command line
// Presumes that quoted strings are double-quoted
QDate.prototype._escapeString = function _escapeString( str ) {
    return str.replace(/([\"\\`$])/g, '\\$1');
}

/*
 * convert the timestamp from the named timezone to Date
 * `timestamp` should be a datetime string without timezone info
 * The timestamp is interprted as being in tzName.
 * Returns a Date object.
 */
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

    // ? strip out any appended timezone, rely exclusively on tzName
    // timestamp = timestamp.replace(/[A-Z/a-z]+$/, ' ') + ' Z';
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
 * Note that all split fields are 0..N-1 (unlike Date.setDate(), which is 1..N)
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
 * Note that all split fields are 0..N-1 (unlike Date.setDate(), which is 1..N)
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
    // TODO: potentially 28% faster, but this version produces wrong results:
    //   var totalMs = ((((hms[2] * 24) + hms[3] * 60) + hms[4]) * 60 + hms[5]) * 1000 + hms[6];
    //   dt.setUTCMilliseconds(totalMs);

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
    try { new QDate()._getZoneinfo(k) && delete tzCanonicalMap[k] } catch (e) {}
}

// look up the default timezone name, if available
try { localtimeTimezone = fs.readFileSync('/etc/timezone').toString() }
catch (e) { localtimeTimezone = tzAliasMap[module.exports.abbrev()] }
