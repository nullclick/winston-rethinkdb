# winston-rethinkdb

A RethinkDB transport for [winston][0].

Uses [rethinkdbdash][1] for it's client driver, and supports querying and streaming.


## Usage
``` js
  var winston = require('winston')

  // Requiring 'winston-rethinkdb' will expose `winston.transports.RethinkDB`
  require('winston-rethinkdb').RethinkDB

  winston.add(winston.transports.RethinkDB, options)
```

The RethinkDB transport takes the following options:

* __name:__ Transport instance identifier when creating multiple RethinkDB transports.  Optional, defaults to 'rethinkdb'.
* __level:__ Level of messages that should be recorded. Optional, defaults to 'info'.
* __label:__ Label to add to log records. Optional.
* __silent:__ Set to true to suppress recording of log messages.
* __storeHost:__ Set to true to add os.hostname() to log records.
* __db:__ Name of database to use for saving logs. Optional, defaults to 'test'.
* __table:__ Name of table to use for saving logs. Optional, defaults to 'log'.
* __options:__  [rethinkdbdash][1] options or function that returns pre-configured reql.


### Connecting 

If options.options is an object, it is passed directly to [rethinkdbdash][1] or nothing is passed (connecting to `localhost`:28015) if options.options is undefined.

A function can be passed instead of an object, it will be called and expects a ReQL term object to be returned.

``` js
  options.options = {
    servers: [
        {host: '192.168.0.100', port: 28015},
        {host: '192.168.0.101', port: 28015},
        {host: '192.168.0.102', port: 28015},
    ],
    buffer: 300,
    max: 3000
  }

  winston.add(winston.transports.RethinkDB, options)
```

Could also be written as follows, if you intend to use `r` for other modules (ie. [session-rethinkdb][2]) or just elsewhere in your application to avoid multiple connection pool configurations.

``` js
  var r = require('rethinkdb')({
    servers: [
        {host: '192.168.0.100', port: 28015},
        {host: '192.168.0.101', port: 28015},
        {host: '192.168.0.102', port: 28015},
    ],
    buffer: 300,
    max: 3000
  })

  options.options = function () { return r }

  winston.add(winston.transports.RethinkDB, options)
```

## unit test plan

I have not had a chance to write automated tests, but have identified the following test cases that I intend to get tests written for soon.

* constructor options
* initialization when db and table exist
* initialization when db exists, table does not
* initialization when neither db nor table exist
* queue log attempts until transport is ready
* circular references in meta data when logging
* too deeply nested meta data
* connection pool connectivity issues
* query loggly options
* query attempts before transport is ready
* stream attempts before transport is ready
* stream options
* stream disconnection
* attempting log, query or stream after closed


[0]: https://github.com/flatiron/winston
[1]: https://github.com/neumino/rethinkdbdash
[2]: https://github.com/llambda/session-rethinkdb
