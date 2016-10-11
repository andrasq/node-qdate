qtz
===

Small and light timezone functions

Unlike other timezone packages that drag along their own timezone
database, `qtz` leverages the host system's native timezone support.
This makes it both faster and much smaller

Summary
-------

    var qtz = require('qtz')
    qtz.date('US/Eastern', 'Y-m-d H:i:s', Date.now());


Api
---

### abbrev( tzName ), getTimezoneAbbrev

return the three-character timezone abbreviation of the named timezone

// #include <time.h>
// tzset();
// return tzname[0], tzname[1] ([0] is EST, [1] is EDT; `daylight` is set if toggles dst)

### offset( tzName ), getTimezoneOffset

return the offset in minutes of the named timezone west of GMT

### convert( timestamp, tzFromName, tzToName )

date( tzName, format [,timestamp] )

strftime( tzName, format [,timestamp] )

strtotime( tzName, dateString [,nowTimestamp] )

convert( dateString, tzFromName, tzToName, format )


Related
-------

- ctime(3)
- tzname(3)
- strftime(3)

- [`phpdate-js`] - fast datetime formatting

- `/bin/date +%Z @0`
- `/etc/timzone`
- `/usr/share/zoneinfo`
- `tzselect(1)`
