/**
 * Copyright (C) 2016-2017 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

var qdate = require("./");

///** quicktest:

var timeit = require('qtimeit');
var qdate = module.exports;

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

/**/
