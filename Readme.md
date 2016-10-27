qdate
=====

Quick, small and light date conversion functions.

Unlike other timezone packages that drag along their own timezone
database, `qdate` leverages the host system's native timezone support.
This makes it much smaller and pretty fast.

This is a work in progress.


Summary
-------

    var qdate = require('qdate')
    qdate.adjust(new Date(), -30, 'minute');


Api
---

### abbrev( tzName ), getTimezoneAbbrev

return the three-character timezone abbreviation of the named timezone

### offset( tzName ), getTimezoneOffset

return the offset as minutes west of GMT of the named timezone.  This is what
`new Date().getTimezoneOffset()` does for the default timezone.

### list( ), getTimezoneList

return the list of known timezone names as an array of strings

### adjust( timestamp, delta, units )

return the Date corresponding to the timestamp adjusted by +/- delta units.  Units
may be one of 'year', 'month', 'week', 'day', 'hour', 'minute' or 'second' or
'millisecond'.

### strtotime( timespec [,tzName] )

convert the time specification to a Date.  The time spec can be anything `date
--date` can parse, like "+2 hours" or "3 weeks ago" or "9pm last Friday".

##### convert( timestamp, tzFromName, tzToName, [format] ) ?

convert the timestamp between timezones, and return a reformatted timestamp.
Formatting (tbd) by `phpdate`

##### startOf( timestamp, unit ) ?

return the Date corresponding to the timestamp at the start of the named unit.
Unit can be any time division listed under `adjust()` above, eg 'month', 'week',
'hour'.


Todo
----

- way to fetch the default timezone abbreviation (to use in formatting) `date +%Z`


Change Log
----------

- 0.0.2 - rename to `qdate`, test (tbd) with qnit
- 0.0.1 - adjust(), strtotime(), tz abbrev, tz offset, list all known tz names

Related
-------

- `ctime(3)`
- `tzname(3)`
- `strftime(3)`
- [`phpdate-js`](https://github.com/andrasq/phpdate-js) - fast datetime formatting
- `/bin/date +%Z @0`
- `/etc/timezone`
- `/usr/share/zoneinfo`
- `tzselect(1)`
