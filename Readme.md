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

    return child_process.execSync("env TZ='" + tzName + "' date +%Z");

    // #include <time.h>
    // tzset();
    // return tzname[0], tzname[1] ([0] is EST, [1] is EDT; `daylight` is set if toggles dst)

### offset( tzName ), getTimezoneOffset

return the offset as minutes west of GMT of the named timezone

    var tzOffset = parseInt(child_process.exec("env TZ='" + tzName + "' date +%z"));
    if (tzOffset < 0) return ( 60 * Math.floor(-tzOffset / 100) - -tzOffset % 100 );
    else return -( 60 * Math.floor(tzOffset / 100) + tzOffset % 100 );

### convert( timestamp, tzFromName, tzToName )

return a modified timestamp that when formatted as GMT will display the
time correctly formatted for the timezone.  The timezone name must be
handled separately.


Related
-------

- ctime(3)
- tzname(3)
- strftime(3)

- [`phpdate-js`] - fast datetime formatting

- `/bin/date +%Z @0`
- `/etc/timezone`
- `/usr/share/zoneinfo`
- `tzselect(1)`
