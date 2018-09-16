/**
 * Copyright (C) 2016-2017 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

var qdate = require("./");
var timeit = require('qtimeit');

var x = 0, dt = new Date();

//timeit(100000, function(){ x = qdate.adjust("2016-10-13 01:23:45.678", +1, "weeks") });
// 760k/s v6.2.2, 1.15m/s v5.10.1, v0.10.42
//timeit(100000, function(){ x = qdate.adjust(dt, +1, "weeks") });
// 1.6m/s v6.2.2, 1.8m/s v0.10.42, 1.85m/s v5.10.1
// 1.47m/s Skylake, 1.93m/s v5.10.1
//timeit(100000, function(){ x = new Date() });
// 2.8m/s v6.2.2, 3.3m/s v0.10.42, 3.0m/s v5.10.1
// 4.85m/s v6.7.0 Skylake, 3.85m/s v0.10.42
//timeit(100000, function(){ x = qdate.startOf(dt, 'week') });
// 1.35m/s v6.2.2
//timeit(100000, function(){ x = qdate.following(dt, 'week') });
// 855k/s v6.9.1, 580k/s v7.0.0 (?!?)
// 685k/s v6.7.0 Skylake
//timeit(100000, function(){ x = qdate.previous(dt, 'week') });
// 685k/s v6.7.0 Skylake
//timeit(100000, function(){ x = new Date(1, 2, 3, 4, 5, 6, 7) })
// 4m/s v6.7.0 Skylake, 3.62m/s v7.5.0

console.log("AR: got", x, x.toString());
// note: Date stringifies with toString if first arg of console.log, with toJSON if second arg
// actual serialization depends on nodejs version, node before v6 didn't do toJSON

console.log("AR: +2 hrs", qdate.strtotime("+2 hours"));


module.exports = {
    'abbrev': {
        'should alias as getTimezoneAbbrev': function(t) {
            t.equal(qdate.abbrev, qdate.getTimezoneAbbrev);
            t.done();
        },

        'should look up timezone abbreviation': function(t) {
            var tz = qdate.abbrev('America/Los_Angeles');
            t.ok(tz == 'PDT' || tz == 'PST');
            t.done();
        },

        'should cache abbrev': function(t) {
            qdate._test.resetTzCache();
            var tz = qdate.abbrev('America/Los_Angeles');
            t.ok(qdate._test.tzAbbrevCache['America/Los_Angeles']);
            t.equal(qdate.abbrev('America/Los_Angeles'), tz);
            t.done();
        },
    },

    'offset': {
        'should alias as getTimezoneOffset': function(t) {
            t.equal(qdate.offset, qdate.getTimezoneOffset);
            t.done();
        },

        'should return timezone offset': function(t) {
            var tz = qdate.abbrev('Europe/Bucharest');
            var offs = qdate.offset('Europe/Bucharest');
            t.equal(offs, tz == 'EEST' ? -180 : -120);          // summer time == daylight savings, +1 ahead
            t.done();
        },

        'should cache offset': function(t) {
            qdate.offset('America/Chicago');
            t.ok(qdate._test.tzOffsetCache['America/Chicago']);
            t.done();
        },

        'should look up tz aliases': function(t) {
            var offs = qdate.offset('CDT');
            t.ok(offs == 300 || offs == 360);
            t.done();
        },

        'should reuse cached offset': function(t) {
            qdate._test.tzOffsetCache['nonesuch'] = 'testing only';
            var offs = qdate.offset('nonesuch');
            t.equal(offs, 'testing only');
            t.done();
        },

        'reset should clear the cache': function(t) {
            qdate._test.resetTzCache();
            var cache1 = qdate._test.tzOffsetCache;
            qdate._test.resetTzCache();
            var cache2 = qdate._test.tzOffsetCache;
            t.ok(cache1 != cache2);
            t.done();
        },

        'reset should clear the timer': function(t) {
            var spy = t.spy(global, 'clearTimeout');
            qdate._test.tzTimer = {};
            var timer = qdate._test.tzTimer;
            qdate._test.resetTzCache();
            spy.restore();
            t.equal(spy.callCount, 1);
            t.notEqual(qdate._test.tzTimer, timer);
            t.deepEqual(spy.args[0], [timer]);
            t.done();
        },

        'should expire tzOffsetCache in 10 minutes': function(t) {
            var clock = t.mockTimers();
            qdate._test.resetTzCache();
            qdate.offset('America/Chicago');
            t.ok(qdate._test.tzOffsetCache['America/Chicago']);
            clock.tick(600001);
            t.unmockTimers();
            t.ok(!qdate._test.tzOffsetCache['America/Chicago']);
            t.done();
        },
    },

    'list': {
        'should alias as getTimezoneList': function(t) {
            t.equal(qdate.list, qdate.getTimezoneList);
            t.done();
        },

        'should list known timezones names': function(t) {
            var list = qdate.list();
            t.ok(Array.isArray(list));
            t.ok(list.length > 100);
            t.contains(list, "America/Jamaica");
            t.contains(list, "Pacific/Guam");
            t.done();
        },
    },

    'adjust': {
        'should reject unrecognized units': function(t) {
            t.throws(function(){ qdate.adjust(new Date(), 2, "eons") });
            t.done();
        },

        'should move date forward by units': function(t) {
            t.equal(qdate.adjust("2001-01-01T00:00:00.000Z", 2, 'ms').toISOString(), "2001-01-01T00:00:00.002Z");
            t.equal(qdate.adjust("2001-01-01T00:00:00.000Z", 2, 'sec').toISOString(), "2001-01-01T00:00:02.000Z");
            t.equal(qdate.adjust("2001-01-01T00:00:00.000Z", 2, 'min').toISOString(), "2001-01-01T00:02:00.000Z");
            t.equal(qdate.adjust("2001-01-01T00:00:00.000Z", 2, 'hr').toISOString(), "2001-01-01T02:00:00.000Z");
            t.equal(qdate.adjust("2001-01-01T00:00:00.000Z", 2, 'day').toISOString(), "2001-01-03T00:00:00.000Z");
            t.equal(qdate.adjust("2001-01-01T00:00:00.000Z", 2, 'week').toISOString(), "2001-01-15T00:00:00.000Z");
            t.equal(qdate.adjust("2001-01-01T00:00:00.000Z", 1, 'month').toISOString(), "2001-02-01T00:00:00.000Z");
            t.equal(qdate.adjust("2001-02-01T00:00:00.000Z", 1, 'month').toISOString(), "2001-03-01T00:00:00.000Z");
            t.equal(qdate.adjust("2001-02-28T00:00:00.000Z", 1, 'month').toISOString(), "2001-03-28T00:00:00.000Z");
            t.equal(qdate.adjust("2001-02-29T00:00:00.000Z", 1, 'month').toISOString(), "2001-04-01T00:00:00.000Z");    // 2001-02-29 is an invalid date
            t.equal(qdate.adjust("2016-01-30 12:00:00.000", 1, 'month').toISOString(), "2016-02-29T12:00:00.000Z");     // leap
            t.equal(qdate.adjust("2015-01-30 12:00:00.000", 1, 'month').toISOString(), "2015-02-28T12:00:00.000Z");     // non-leap
            t.equal(qdate.adjust("2000-01-30 12:00:00.000", 1, 'month').toISOString(), "2000-02-29T12:00:00.000Z");     // y2k was leap
            t.equal(qdate.adjust("2015-01-31 12:00:00.000", 2, 'month').toISOString(), "2015-03-31T12:00:00.000Z");
            t.equal(qdate.adjust("2015-01-31 12:00:00.000", 3, 'month').toISOString(), "2015-04-30T12:00:00.000Z");
            t.equal(qdate.adjust("2001-01-30T19:00:00.000Z", 1, 'month').toISOString(), "2001-02-28T19:00:00.000Z");
            t.equal(qdate.adjust("2001-01-01T00:00:00.000Z", 2, 'year').toISOString(), "2003-01-01T00:00:00.000Z");
            t.done();
        },

        'adjust should adjust +1': function(t) {
            t.done();
        },

        'previous should adjust -1': function(t) {
            t.done();
        },

        'startOf should clear less significant units': function(t) {
            t.done();
        },
    },

    'startOf': {
        'should call state.getUnitsInfo': function(t) {
            var spy = t.spyOnce(qdate._state, 'getUnitsInfo');
            qdate.startOf(new Date(), 'day');
            t.equal(spy.callCount, 1);
            t.equal(spy.args[0][0], 'day');
            t.done();
        },

        'should return start of current local timezone time period': function(t) {
            var dt = new Date('2017-02-03 12:34:56.789Z');
            t.equal(qdate.startOf(dt, 'year', 'EST').toISOString(), '2017-01-01T05:00:00.000Z');
            t.equal(qdate.startOf(dt, 'month', 'EST').toISOString(), '2017-02-01T05:00:00.000Z');
            t.equal(qdate.startOf(dt, 'week', 'EST').toISOString(), '2017-01-29T05:00:00.000Z');
            t.equal(qdate.startOf("2016-02-03 12:34:56.789", 'week', 'EST').toISOString(), '2016-01-31T05:00:00.000Z');
            t.equal(qdate.startOf(dt, 'day', 'EST').toISOString(), '2017-02-03T05:00:00.000Z');
            t.equal(qdate.startOf(dt, 'day', 'GMT').toISOString(), '2017-02-03T00:00:00.000Z');
            t.equal(qdate.startOf(dt, 'hour', 'EST').toISOString(), '2017-02-03T12:00:00.000Z');
            t.equal(qdate.startOf(dt, 'minute', 'EST').toISOString(), '2017-02-03T12:34:00.000Z');
            t.equal(qdate.startOf(dt, 'second', 'EST').toISOString(), '2017-02-03T12:34:56.000Z');
            t.equal(qdate.startOf(dt, 'millisecond', 'EST').toISOString(), '2017-02-03T12:34:56.789Z');

            t.equal(qdate.startOf('2017-02-03 12:34:56.789', 'hour', 'EST').toISOString(), '2017-02-03T17:00:00.000Z');
            t.equal(qdate.startOf('2017-02-03 12:34:56.789', 'hour', 'PST').toISOString(), '2017-02-03T20:00:00.000Z');
            t.equal(qdate.startOf('2017-02-03 12:34:56.789', 'minute', 'PST').toISOString(), '2017-02-03T20:34:00.000Z');

            t.done();
        },

        'previous should call startOf': function(t) {
            var spy = t.spyOnce(qdate, 'startOf');
            var now = new Date();
            qdate.previous(now, 'hour');
            t.equal(spy.callCount, 1);
            t.equal(+spy.args[0][0], +now - 1*3600*1000);
            t.equal(spy.args[0][1], 'hour');
            t.done();
        },

        'following should call startOf': function(t) {
            var spy = t.spyOnce(qdate, 'startOf');
            var now = new Date();
            qdate.following(now, 'day');
            t.equal(spy.callCount, 1);
            t.equal(+spy.args[0][0], +now + 24*3600*1000);
            t.done();
        },
    },

    'strtotime': {
        'should convert English offset to date': function(t) {
            var dt = qdate.strtotime("now +2 weeks").getTime();
            var now = Date.now();
            t.ok(now - dt - (2 * 7 * 24 * 3600 * 1000) < 5);
            t.done();
        },

        'should reject non-string timespec': function(t) {
            t.throws(function(){ qdate.strtotime(2) });
            t.throws(function(){ qdate.strtotime(new Date()) });
            t.done();
        },
    },

    'parseDate': {
        'should parse in the specified timezone': function(t) {
            var dt = '2016-08-27 12:34:56.789';
            t.equal(qdate.parse(dt).getTime(), new Date(dt).getTime());
            t.equal(qdate.parse(dt, 'US/Eastern').toISOString(), '2016-08-27T16:34:56.789Z');
            t.equal(qdate.parse(dt, 'GMT').toISOString(), '2016-08-27T12:34:56.789Z');
            t.equal(qdate.parse(dt, 'Europe/Paris').toISOString(), '2016-08-27T10:34:56.789Z');
            t.equal(qdate.parse(dt, 'US/Pacific').toISOString(), '2016-08-27T19:34:56.789Z');

            var dt = '2016-12-31 23:45:00';
            t.equal(qdate.parse(dt, 'GMT').toISOString(), '2016-12-31T23:45:00.000Z');
            t.equal(qdate.parse(dt, 'US/Eastern').toISOString(), '2017-01-01T04:45:00.000Z');
            t.equal(qdate.parse(dt, 'Europe/Paris').toISOString(), '2016-12-31T22:45:00.000Z');
            t.equal(qdate.parse(dt, 'US/Pacific').toISOString(), '2017-01-01T07:45:00.000Z');

            t.equal(qdate.parse('2037-01-01 12:34:56', 'US/Eastern').toISOString(), '2037-01-01T17:34:56.000Z');        // future ST
            t.equal(qdate.parse('2037-08-01 12:34:56', 'US/Eastern').toISOString(), '2037-08-01T16:34:56.000Z');        // future DT
            t.equal(qdate.parse('2999-01-01 12:34:56', 'US/Eastern').toISOString(), '2999-01-01T17:34:56.000Z');        // too far in the future, assume ST
            t.equal(qdate.parse('1812-01-01 12:34:56', 'US/Eastern').toISOString(), '1812-01-01T17:34:56.000Z');        // no DT yet
            t.equal(qdate.parse('1812-08-01 12:34:56', 'US/Eastern').toISOString(), '1812-08-01T17:34:56.000Z');        // no DT yet

            t.equal(qdate.parse(1535328000000, 'US/Eastern').toISOString(), '2018-08-27T00:00:00.000Z');

            t.throws(function(){ qdate.parse('2018-08-27', 'None/Such') }, /qdate: None\/Such: no tzinfo found/);
            t.throws(function(){ qdate.parse({}, 'US/Eastern') }, /cannot parse/);

            t.done();
        },
    },

    'formatDate': {
        'should format in default timezone': function(t) {
            var dt = new Date("2016-02-29 12:34:56.789");
            t.equal(qdate.format(dt, 'Y-m-d H:i:s.u'), "2016-02-29 12:34:56.789000");
            t.done();
        },
    },

    'convert': {
        'should call this.format to format with default format': function(t) {
            var spy = t.spyOnce(qdate, 'format');
            qdate.convert("2016-02-29 12:34:56", 'US/Eastern', 'GMT');
            t.equal(spy.callCount, 1);
            t.equal(spy.args[0][1], 'Y-m-d H:i:s');     // default format
            t.equal(spy.args[0][2], 'GMT');             // tzToName
            t.done();
        },

        'should call this.format with explicit format': function(t) {
            var spy = t.spyOnce(qdate, 'format');
            qdate.convert("2016-02-29 12:34:56", 'US/Eastern', 'GMT', 'T e');
            t.equal(spy.callCount, 1);
            t.equal(spy.args[0][1], 'T e');
            t.equal(spy.args[0][2], 'GMT');
            t.done();
        },
    },

    'helpers': {
        '_splitDate': {
            'should split datetime strings': function(t) {
                var dt = new Date('2018-09-15T12:34:56.789Z');
                var dataset = [
                    [ '2018-09-15T12:34:56.789', 'GMT',            [2018, 08, 14, 12, 34, 56, 789] ],   // gmt string split in gmt
                    [ new Date('2018-09-15T12:34:56.789Z'), 'GMT', [2018, 08, 14, 12, 34, 56, 789] ],   // gmt dt split in gmt
                    [ '2018-09-15T12:34:56.789', 'EDT',            [2018, 08, 14, 12, 34, 56, 789] ],   // tz string split as-is
                    [ new Date('2018-09-15T16:34:56.789Z'), 'EDT', [2018, 08, 14, 12, 34, 56, 789] ],   // tz dt split in tz
                    [ new Date('2018-09-15T19:34:56.789Z'), 'PDT', [2018, 08, 14, 12, 34, 56, 789] ],   // tz dt split in tz
                    [ dt, null, qdate._splitDate(dt, 'localtime') ],                                    // default splits in localtime
                ];

                for (var i=0; i<dataset.length; i++) {
                    t.deepEqual(qdate._splitDate(dataset[i][0], dataset[i][1]), dataset[i][2], "data item " + i);
                }

                t.done();
            },
        },

        '_buildDate': {
            'should build dates': function(t) {
                var dt = new Date('2018-09-15T12:34:56.789Z');
                var offs = dt.getTimezoneOffset();
                var dataset = [
                    [ [2018, 08, 14, 12, 34, 56, 789], 'GMT', dt ],                                     // builds from gmt parts
                    [ [2018, 08, 14,  8, 34, 56, 789], 'EDT', dt ],                                     // builds from tz parts
                    [ [2018, 08, 14,  5, 34, 56, 789], 'PDT', dt ],                                     // builds from tz parts
                    [ [2018, 08, 14, 12, 34, 56, 789], null, new Date(+dt + offs * 60000) ],            // defaults builds from localtime
                ];

                for (var i=0; i<dataset.length; i++) {
                    t.deepEqual(qdate._buildDate(dataset[i][0], dataset[i][1]), dataset[i][2], "data item " + i);
                }

                t.done();
            },
        },
    },
}
