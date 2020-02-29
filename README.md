qdate
=====
[![Build Status](https://api.travis-ci.org/andrasq/node-qdate.svg?branch=master)](https://travis-ci.org/andrasq/node-qdate?branch=master)
[![Coverage Status](https://coveralls.io/repos/github/andrasq/node-qdate/badge.svg?branch=master)](https://coveralls.io/github/andrasq/node-qdate?branch=master)


Small, light and quick handy date conversion functions.

Unlike timezone packages that drag along their own timezone database, `qdate`
leverages the host system's native timezone support, making it much smaller.

This is a work in progress.


Summary
-------

    var qdate = require('qdate')
    qdate.adjust(new Date(), -30, 'minute');


Api
---

### abbrev( tzName ), getTimezoneAbbrev

return the three-character timezone abbreviation of the named timezone, or `null` if not known.
Note that the abbreviation is what is currently in effect, and may change with daylight savings.

### offset( tzName [,when] ), getTimezoneOffset

return the current offset as minutes west of GMT of the named timezone.  This is what
`new Date().getTimezoneOffset()` does for the default timezone.  If `when` is specified,
returns the offset in effect at that time.  Throws an Error if the named timezone is not found.

### list( ), getTimezoneList

return the list of known timezone names as an array of strings

### adjust( timestamp, delta, unit [,tzName] )

return the Date corresponding to the timestamp adjusted by +/- delta units.  Unit
may be one of 'year', 'month', 'week', 'day', 'hour', 'minute', 'second' or
'millisecond'.  Plurals and some common abbreviations are allowed.

### strtotime( timespec [,tzName] )

convert the time specification to a Date.  The time spec can be anything `date
--date` can parse, like "+2 hours" or "3 weeks ago" or "9pm last Friday".

### startOf( timestamp, unit [,tzName] )

return the Date corresponding to the start of the current unit.  Unit may be any
one of the time divisions listed under `adjust()`, eg 'year', 'month', 'week',
etc.

### following( timestamp, unit [,tzName] )

return the Date corresponding to the start of the named unit following the current.
Unit as in `adjust`.

### previous( timestamp, unit [,tzName] ) 

return the Date corresponding to the start of the named unit preceding the current.
Unit as in `adjust`.


Change Log
----------

- 0.2.0 - fix end-of-month clamping for year adjusts, round old date LMT fractional offets to 15 min
- 0.1.1 - tighten up the shell escaping of timespecs, speed up adjust
- 0.1.0 - use tzinfo to obtain timezone offsets
- 0.0.4 - refactor into a singleton, split into an array, startOf, previous, following methods
- 0.0.3 - depend on phpdate-js
- 0.0.2 - rename to `qdate`, test (tbd) with qnit
- 0.0.1 - adjust(), strtotime(), tz abbrev, tz offset, list all known tz names

Related
-------

- `ctime(3)`
- `tzname(3)`
- `strftime(3)`
- [`phpdate-js`](https://npmjs.com/package/phpdate-js) - fast datetime formatting
- `/bin/date +%Z @0`
- `/etc/timezone`
- `/usr/share/zoneinfo`
- `tzselect(1)`
- [`tzinfo`](https://npmjs.com/package/tzinfo) - zoneinfo file parsing
