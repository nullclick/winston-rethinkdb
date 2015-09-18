/**
 * @module  winston-rethinkdb
 * @license MIT
 * @author  andyb@formulatoast.com (Andy Brown)
 * 
 * @description Winston transport for logging to a RethinkDB database
 */

var os     = require('os')
  , util   = require('util')
  , Stream = require('stream').Stream

var async   = require('async')
  , cycle   = require('cycle')
  , winston = require('winston')


/**
 * Constructor for the RethinkDB transport object
 *
 * @constructor
 * @param {Object}           options
 * @param {string=rethinkdb} options.name       Transport instance identifier
 * @param {string=info}      options.level      level of messages that should be recorded
 * @param {string}           options.label      optional label to add to log records
 * @param {boolean=false}    options.silent     Suppress actual saving of records
 * @param {boolean=false}    options.storeHost  add hostname to log records
 * @param {string=test}      options.db name    of database to save records to
 * @param {string=log}       options.table      name of table to save records to
 * @param {object|function}  options.options 
 *      if an object, it is passed to rethinkdbdash for connection
 *      if a function, it is called and the expected return is a rethindbdash instance
 */
var RethinkDB = exports.RethinkDB = function (options) {

    var self  = this
      , r     = null
      , db    = null
      , table = null

    winston.Transport.call(this, options)
    options = options || {}

    // winston transport logger options
    this.name      = options.name  || 'rethinkdb'
    this.level     = options.level || 'info'
    this.label     = options.label
    this.silent    = options.silent
    this.storeHost = options.storeHost
    this.hostname  = os.hostname()

    // Save locals of these for quick access
    db    = this.db    = options.db    || 'test'
    table = this.table = options.table || 'log'

    this.ready    = false
    this._queue   = []
    this._changes = null

    function drainQueue() {
        function applyMethod(item, callback) {
            self[item.method].apply(self, item.args)
            callback(null)
        }

        function removeQueue(error) {
            if (error) { throw error }
            delete self._queue
            self.emit('ready')
        }

        async.eachSeries(self._queue, applyMethod, removeQueue)
    }


    // @todo figure out how to handle errors connecting here
    function openConnection(callback) {
        if (!options.options) {
            r = self.r = require('rethinkdbdash')()
        } else if ('function' === typeof options.options) {
            r = self.r = options.options()
        } else if ('object' === typeof options.options) {
            r = self.r = require('rethinkdbdash')(options.options)
        } else {
            throw new Error("Invalid options")
        }
        callback(null)
    }


    // @todo check for invalid database name and throw
    function dbaseCreate(callback) {
        r.dbCreate(db).run()
            .then(function (results) {
                callback(null)
            })
            .catch(r.Error.ReqlRuntimeError, function (error) {
                // @todo figure out best way of checking that this 
                //       is the error we expect when db exists
                callback(null)
            })
            .error(callback)
    }


    function tableCreate(callback) {
        r.db(db).tableCreate(table).run()
            .then(function (results) {
                callback(null)
            })
            .catch(r.Error.ReqlRuntimeError, function (error) {
                // @todo figure out best way of checking that this 
                //       is the error we expect when table exists
                callback(null)
            })
            .error(callback)
    }


    function indexTimestamp(callback) {
        r.db(db).table(table).indexCreate('timestamp').run()
            .then(function (results) {
                r.db(db).table(table).indexWait().run()
                    .then(function (results) {
                        callback(null)
                    })
                    .error(callback)
            })
            .catch(r.Error.ReqlRuntimeError, function (error) {
                // @todo figure out best way of checking that this 
                //       is the error we expect when the index exists
                //       particularly since this could fail in other ways
                callback(null)
            })
            .error(callback)

    }


    // initialize database for logging use
    async.series([
        openConnection,
        dbaseCreate,
        tableCreate,
        indexTimestamp
    ], function (error) {
        if (error) { throw error }
        self.ready = true
        drainQueue()
    })
}


// Inherit from winston.Transport
util.inherits(RethinkDB, winston.Transport)

// Define getter for backwards compatibility
// @todo verify that this is indeed required or suggested
winston.transports.RethinkDB = RethinkDB



/**
 * Core logging method exposed to winston.  cycle.decycle is used on
 * the meta data object to ensure that circular references are removed
 *
 * @see npm info cycle
 * 
 * @param  {string}     level       level to log the message as
 * @param  {string}     msg         message to log
 * @param  {object={}}  meta        optional metadata object
 * @param  {Function}   callback    optional (error, success) -> 
 * @return {null}
 */
RethinkDB.prototype.log = function (level, msg, meta, callback) {
    var self   = this
      , record = null

    if (!this.ready) {
        this._queue.push({ method: 'log', args: arguments })
        return null
    }

    if (this.silent) {
        if (callback) {
            callback(null, true)
        }
        return null
    }
 
    record           = {}
    record.level     = level
    record.message   = msg
    record.meta      = cycle.decycle(meta)
    record.timestamp = this.r.now()

    if (this.storeHost) {
        record.hostname = this.hostname
    }

    if (this.label) {
        record.label = this.label
    }

   
    this.r.db(this.db).table(this.table).insert(record).run()
        .then(function (results) {
            self.emit('logged')
            if (callback) {
                callback(null, true)
            }
        })
        .error(function (error) {
            self.emit('error', error)
            if (callback) {
                callback(error, null)
            }
        })
}



/**
 * Query method for searching through log records in database
 * 
 * @param  {object={}}  options     query options in the typical winston loggly format
 * @param  {Function}   callback    (error, results) ->
 * @return {null}
 */
RethinkDB.prototype.query = function (options, callback) {
    var q_opts = null

    if (!this.ready) {
        this._queue.push({ method: 'query', args: arguments })
        return null
    }

    // options object is entirely optional, shift callback over
    if ('function' === typeof options) {
        callback = options
        options  = {}
    }

    q_opts = this.normalizeQuery(options)

    // @todo this could be done by simply not chaining .pluck() unless we need it
    if (!q_opts.fields) {
        q_opts.fields = ['id', 'level', 'message', 'meta', 'timestamp', 'hostname', 'label']
    }

    this.r.db(this.db).table(this.table)
        .orderBy({ index: (q_opts.order === 'desc' ? this.r.desc('timestamp') : 'timestamp')})
        .filter(this.r.row('timestamp').during(q_opts.from, q_opts.until))
        .skip(q_opts.start)
        .limit(q_opts.rows)
        .pluck(q_opts.fields)
        .run()
        .then(function (results) {
            callback(null, results)
        })
        .error(function (error) {
            self.emit('error', error)
            callback(error, null)
        })
}



/**
 * Returns an EventEmitter log stream for this transport
 *
 * @todo  why use Stream instead of EventEmitter directly?
 * 
 * @param  {object={}}  options  
 * @param  {Stream}     options.stream  optional pre-existing stream to use   
 * @return {Stream}
 */
RethinkDB.prototype.stream = function (options) {
    var self    = this
      , stream

    options = options || {}
    stream  = options.stream || new Stream

    // if we are not ready to stream records, save the stream to
    // hook-up when the queue is processed so we can return it now
    if (!this.ready) {
        options.stream = stream
        this._queue.push({ method: 'stream', args: arguments })
        return stream
    }

    // provided for winston (or outside) to close the stream cleanly
    stream.destroy = function () {
        if (this.destroyed) {
            return null
        }

        this.destroyed = true
        stream.end()
        self._changes.close()
        self._changes = null
    }

    // don't create another cursor changefeed if more streams are opened
    if (!self._changes) {
        self._changes = this.r.db(this.db).table(this.table)
            .changes()
            .filter(this.r.row('old_val').eq(null))
            .toStream()
    }

    // connect changefeed events to emit on the stream
    self._changes.on('data', function (data) {
        stream.emit('log', data.new_val)
    })
    
    self._changes.on('error', function (error) {
        stream.emit('error', error)
    })

    self._changes.on('end', function () {
        stream.emit('end')
    })

    self._changes.on('close', function () {
        stream.emit('close')
    })

    return stream
}



/**
 * Close method for winston to shutdown transport cleanly.
 * 
 * @return {null}
 */
RethinkDB.prototype.close = function () {
    var self = this

    this.ready = false

    if (this._changes) {
        this._changes._cursor.close()
            .then(function (result) {
                self.r.getPoolMaster().drain()
            })

            // https://github.com/rethinkdb/rethinkdb/issues/4819
            // @todo fix this when parent issue has been resolved
            .catch(r.Error.ReqlRuntimeError, function (error) {
                self.r.getPoolMaster().drain()
            })

            .error(function (error) {
                self.r.getPoolMaster().drain()
            })

    } else {
        this.r.getPoolMaster().drain()
    }
}
