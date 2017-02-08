/**
 * simple timezone and datetime adjustment functions
 *
 * Copyright (C) 2016 Andras Radics
 * Licensed under the Apache License, Version 2.0
 *
 * 2016-10-11 - Started.
 */

'use strict';

var child_process = require('child_process');
var phpdate = require('phpdate-js');

var tzResetInterval = 600000;           // reset cache every 10 min to track daylight savings
var tzOffsetCache = null;               // cache of timezones minutes west of gmt
function resetTzCache( ) {
    tzOffsetCache = { localtime: new Date().getTimezoneOffset() };
}
resetTzCache();
setTimeout(function tzTimeout(){ resetTzCache(); setTimeout(tzTimeout, tzResetInterval).unref(); }, Date.now() % tzResetInterval).unref();

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


// export a date adjusting singleton
module.exports = new QDate();


function QDate( ) {
}

QDate.prototype.abbrev = function abbrev( tzName ) {
    if (tzAliasMap[tzName]) tzName = tzAliasMap(tzName);
    var cmdline = (tzName ? "env TZ=\"" + this._escapeString(tzName) + "\" " : "") + "date +%Z";
    return child_process.execSync(cmdline).toString().trim();
}

QDate.prototype.offset = function offset( tzName ) {
    if (tzAliasMap[tzName]) tzName = tzAliasMap(tzName);
    if (tzOffsetCache[tzName] !== undefined) return tzOffsetCache[tzName];

    var cmdline = (tzName ? "env TZ=\"" + this._escapeString(tzName) + "\" " : "") + "date +%z";
    var tzOffset = parseInt(child_process.execSync(cmdline));
    if (tzOffset < 0) {
        // javascript timezone offsets increase toward west of gmt, make positive
        return tzOffsetCache[tzName] = ( 60 * Math.floor(-tzOffset / 100) - -tzOffset % 100 );
    } else {
        return tzOffsetCache[tzName] = -( 60 * Math.floor(tzOffset / 100) + tzOffset % 100 );
    }
},

QDate.prototype.convert = function convert( timestamp, tzFromName, tzToName, format ) {
    if (tzAliasMap[tzFromName]) tzFromName = tzAliasMap(tzFromName);
    if (tzAliasMap[tzToName]) tzToName = tzAliasMap(tzToName);
    if (typeof timestamp !== 'number') timestamp = new Date(timestamp).getTime();
    // FIXME:
    // ??? return timestamp + 60000 * (this.offset(tzToName) - this.offset(tzFromName));
},

QDate.prototype.list = function list( ) {
    // note: this call could be slow, and is blocking, call only during setup
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
    if (field >= 0) hms[field] += delta;            // field
    else hms[field[1]] += delta * field[2];         // [field, multiplier] tuple

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
    for (var i=field+1; i<hms.length; i++) hms[field] = 0;

    return this._buildDate(hms);
},

QDate.prototype.strtotime = function strtotime( timespec, tzName ) {
    if (tzAliasMap[tzName]) tzName = tzAliasMap(tzName);
    if (typeof timespec !== 'string') throw new Error("timespec must be a string not " + (typeof timespec));
    var cmdline = (tzName ? "env TZ=\"" + this._escapeString(tzName) + "\" " : "") + "date --date=\"" + this._escapeString(timespec) + "\"";
    var timestamp = this._runCommand(cmdline);
    return (typeof timestamp === 'string') ? new Date(timestamp) : null;
},

QDate.prototype.format = function format( timestamp, format, tzName ) {
    // TBD - use phpdate-js
    if (tzAliasMap[tzName]) tzName = tzAliasMap(tzName);
},

QDate.prototype._runCommand = function _runCommand( cmdline ) {
    try { return child_process.execSync(cmdline).toString(); }
    catch (err) { return err; }
},

QDate.prototype._escapeString = function _escapeString( str ) {
    return str.replace('"', '\\"');
},

QDate.prototype._splitDate = function _splitDate( dt, tzName ) {
    // the Date is split into components according to the system timezone, not utc
    if (tzName) {
        // FIXME: adjust for specified timezone
    }
    return [ dt.getFullYear(), dt.getMonth(), dt.getDate() - 1, dt.getHours(), dt.getMinutes(), dt.getSeconds(), dt.getMilliseconds() ];
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


///** quicktest:

var timeit = require('qtimeit');
var qdate = module.exports;

//console.log(new Date( qdate.adjust("2016-01-01 00:00:00.001", +1, "weeks") ));
//console.log(new Date( qdate.adjust("2016-10-13 01:23:45.678", +1, "weeks") ));
//console.log(new Date( qdate.adjust(new Date(), +4, "weeks") ));

var x = 0, dt = new Date();

//timeit(100000, function(){ x = qdate.adjust("2016-10-13 01:23:45.678", +1, "weeks") });
// 760k/s v6.2.2, 1.15m/s v5.10.1, v0.10.42
//timeit(100000, function(){ x = qdate.adjust(dt, +1, "weeks") });
// 1.6m/s v6.2.2, 1.8m/s v0.10.42, 1.85m/s v5.10.1
//timeit(100000, function(){ x = new Date() });
// 2.8m/s v6.2.2, 3.3m/s v0.10.42, 3.0m/s v5.10.1
//timeit(100000, function(){ x = qdate.startOf(dt, 'week') });
// 1.35m/s v6.2.2
//timeit(100000, function(){ x = qdate.following(dt, 'week') });
// 855k/s v6.9.1, 580k/s v7.0.0 (?!?)

console.log("AR: got", x, x.toString());
// note: Date stringifies with toString if first arg of console.log, with toJSON if second arg
// actual serialization depends on nodejs version, node before v6 didn't do toJSON

console.log("AR:", qdate.strtotime("+2 hours"));

/**/
