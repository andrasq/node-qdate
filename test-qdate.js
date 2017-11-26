/**
 * Copyright (C) 2016-2017 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

var qdate = require("./");
var timeit = require('qtimeit');

console.log("AR: abbrev", qdate.abbrev("US/Pacific"));
console.log("AR: offset", qdate.offset("US/Pacific"));

//console.log(new Date( qdate.adjust("2016-01-01 00:00:00.001", +1, "weeks") ));
//console.log(new Date( qdate.adjust("2016-10-13 01:23:45.678", +1, "weeks") ));
//console.log(new Date( qdate.adjust(new Date(), +4, "weeks") ));

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
            var tz = qdate.abbrev('America/Los_Angeles');
            var t1 = Date.now();
            var tz = qdate.abbrev('America/Los_Angeles');
            var t2 = Date.now();
            t.ok(t2 - t1 <= 2);
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
            t.equal(qdate.adjust("2001-02-01T00:00:00.000Z", 1, 'month').toISOString(), "2001-03-04T00:00:00.000Z");
            t.equal(qdate.adjust("2001-02-28T00:00:00.000Z", 1, 'month').toISOString(), "2001-03-28T00:00:00.000Z");
            t.equal(qdate.adjust("2001-02-29T00:00:00.000Z", 1, 'month').toISOString(), "2001-03-29T00:00:00.000Z");    // 2001-02-29 is an invalid date
            t.equal(qdate.adjust("2001-01-01T00:00:00.000Z", 2, 'year').toISOString(), "2003-01-01T00:00:00.000Z");
            // TODO: weird things happen if the adjustment asks for an impossibility, eg 1/30 +1 month => 2/30, which is not a thing
            // t.equal(qdate.adjust("2001-01-30T19:00:00.000Z", 1, 'month').toISOString(), "2001-03-02T19:00:00.000Z");
            // TODO: loop through 14 consecutive years, all months, check up/down adjusts by 1, 2, 3 months
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
}
