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
var unitNamesMap = {
    year: 'Y', years: 'Y', yr: 'Y', yrs: 'Y', Y: 'Y', y: 'Y',
    week: 'w', weeks: 'w', wk: 'w', wks: 'w',
};
var unitsMap = {
    year: 'yr',         years: 'yr',        Y: 'yr', y: 'yr', yr: 'yr', yrs: 'yr',
    month: 'mo',        months: 'mo',       M: 'mo',          mo: 'mo', mos: 'mo',
    day: 'dt',          days: 'dt',         D: 'dt', d: 'dt', date: 'dt',
    hour: 'h',          hours: 'h',         H: 'hr', h: 'hr', hr: 'h', hrs: 'h',
    minute: 'm',        minutes: 'm',       m: 'm',           min: 'm', mins: 'm',
    second: 's',        seconds: 's',       s: 's',  S: 's',  sec: 's', secs: 's',
    millisecond: 'ms',  milliseconds: 'ms',                   ms: 'ms', millis: 'ms',
    week: ['dt', 7],    weeks: ['dt', 7],   w: ['dt', 7],     wk: ['dt', 7],
};


module.exports = {
    abbrev: function abbrev( tzName ) {
        var cmdline = (tzName ? "env TZ=\"" + this._escapeString(tzName) + "\" " : "") + "date +%Z";
        return child_process.execSync(cmdline).toString().trim();
    },

    offset: function offset( tzName ) {
        if (tzOffsetCache[tzName] !== undefined) return tzOffsetCache[tzName];
        var cmdline = (tzName ? "env TZ=\"" + this._escapeString(tzName) + "\" " : "") + "date +%z";
        var tzOffset = parseInt(child_process.execSync(cmdline));
        if (tzOffset < 0) {
            return tzOffsetCache[tzName] = ( 60 * Math.floor(-tzOffset / 100) - -tzOffset % 100 );
        } else {
            return tzOffsetCache[tzName] = -( 60 * Math.floor(tzOffset / 100) + tzOffset % 100 );
        }
    },

    convert: function convert( timestamp, tzFromName, tzToName, format ) {
        if (typeof timestamp !== 'number') timestamp = new Date(timestamp).getTime();
        // FIXME:
        // ??? return timestamp + 60000 * (this.offset(tzToName) - this.offset(tzFromName));
    },

    list: function list( ) {
        // note: this call could be slow, and is blocking, call only during setup
        var files = child_process.execSync(
            "find /usr/share/zoneinfo/ -type f | xargs file | grep timezone | cut -d: -f1 | cut -b21- | grep '^[A-Z]'");
        files = files.toString().trim().split("\n");
        return files;
    },

    adjust: function adjust( timestamp, delta, units ) {
        if (!unitsMap[units]) throw new Error("unrecognized units: " + units);
        var dt = timestamp instanceof Date ? timestamp : new Date(timestamp);
        var hms = this._splitDate(dt);

        var field = unitsMap[units];
        if (typeof field === 'string') hms[field] += delta;
        else hms[field[0]] += delta * field[1];  // field can be a [name, multipler] tuple

        return new Date(hms.yr, hms.mo, hms.dt, hms.h, hms.m, hms.s, hms.ms);
    },

    startOf: function startOf( timestamp, units ) {
        if (!unitsMap[units]) throw new Error("unrecognized units: " + units);
        var dt = timestamp instanceof Date ? timestamp : new Date(timestamp);
        var hms = this._splitDate(dt);

        // start of week 
        if (unitNamesMap[units] === 'w') {
            var day = dt.getDay();
            hms.dt -= day;
            hms.h = 0;
            hms.m = 0;
            hms.s = 0;
            hms.ms = 0;
        }
        else {
            // zero out the lesser fields.  Months are 0-based, dates 1..
        }
        return new Date(hms.yr, hms.mo, hms.dt, hms.h, hms.m, hms.s, hms.ms);
    },

    strtotime: function strtotime( timespec, tzName ) {
        if (typeof timespec !== 'string') throw new Error("timespec must be a string not " + (typeof timespec));
        var cmdline = (tzName ? "env TZ=\"" + this._escapeString(tzName) + "\" " : "") + "date --date=\"" + this._escapeString(timespec) + "\"";
        var timestamp = this._runCommand(cmdline);
        return (typeof timestamp === 'string') ? new Date(timestamp) : null;
    },

    format: function format( timestamp, format, tzName ) {
        // TBD - use phpdate-js
    },

    _runCommand: function _runCommand( cmdline ) {
        try { return child_process.execSync(cmdline).toString(); }
        catch (err) { return err; }
    },

    _escapeString: function _escapeString( str ) {
        return str.replace('"', '\\"');
    },

    _splitDate: function _splitDate( dt, tzName ) {
        // the Date is split into components according to the system timezone, not utc
        if (tzName) {
            // FIXME: adjust for specified timezone
        }
        return {
            yr: dt.getFullYear(), mo: dt.getMonth(), dt: dt.getDate(), h: dt.getHours(), m: dt.getMinutes(), s: dt.getSeconds(), ms: dt.getMilliseconds()
        };
        return [ dt.getFullYear(), dt.getMonth(), dt.getDate(), dt.getHours(), dt.getMinutes(), dt.getSeconds(), dt.getMilliseconds() ];
    },

    // aliases
    getTimezoneAbbrev: null,
    getTimezoneOffset: null,
    getTimezoneList: null,
}

// aliases
module.exports.getTimezoneAbbrev = module.exports.abbrev;
module.exports.getTimezoneOffset = module.exports.offset;
module.exports.getTimezoneList = module.exports.list;


///** quicktest:

var timeit = require('qtimeit');
var qdate = module.exports;

//console.log(new Date( qdate.adjust("2016-10-13 01:23:45.678", +1, "weeks") ));
//console.log(new Date( qdate.adjust(new Date(), +4, "weeks") ));

var x, dt = new Date();

//timeit(100000, function(){ x = qdate.adjust("2016-10-13 01:23:45.678", +1, "weeks") });
// 760k/s v6.2.2, 1.15m/s v5.10.1, v0.10.42
//timeit(100000, function(){ x = qdate.adjust(dt, +1, "weeks") });
// 1.6m/s v6.2.2, 1.8m/s v0.10.42, 1.85m/s v5.10.1
//timeit(100000, function(){ x = new Date() });
// 2.8m/s v6.2.2, 3.3m/s v0.10.42, 3.0m/s v5.10.1
timeit(100000, function(){ x = qdate.startOf(dt, 'week') });
// 1.35m/s v6.2.2
console.log(x, x.toString());

console.log("AR:", qdate.strtotime("+2 hours"));

/**/
