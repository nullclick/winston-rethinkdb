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
 * @param {Object} options
 * @param {string=rethinkdb} options.name Transport instance identifier.
 */
var RethinkDB = exports.RethinkDB = function (options) {

    var self  = this
      , r     = null
      , db    = null
      , table = null

    winston.Transport.call(this, options)
    options = (options || {})

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


    function dbaseCreate(callback) {
        r.dbCreate(db).run()
            .then(function (results) {
                callback(null)
            })
            .catch(r.Error.ReqlRuntimeError, function (error) {
                // @todo figure out best way of checking that this is the error we expect
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
                // @todo figure out best way of checking that this is the error we expect
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
                // @todo figure out best way of checking that this is the error we expect
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



RethinkDB.prototype.query = function (options, callback) {
    var q_opts = null

    if (!this.ready) {
        this._queue.push({ method: 'query', args: arguments })
        return null
    }

    if ('function' === typeof options) {
        callback = options
        options  = {}
    }

    q_opts = this.normalizeQuery(options)

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
            if (callback) {
                callback(null, results)
            }
        })
        .error(function (error) {
            self.emit('error', error)
            if (callback) {
                callback(error, null)
            }
        })
}


RethinkDB.prototype.stream = function (options) {
    var self    = this
      , stream

    options = options || {}

    if (!this.ready) {
        options.stream = new Stream
        this._queue.push({ method: 'stream', args: arguments })
        return stream
    }

    stream = options.stream || new Stream

    stream.destroy = function () {
        if (this.destroyed) {
            return null
        }

        this.destroyed = true
        stream.end()
        self._changes.close()
        self._changes = null
    }

    if (!self._changes) {
        self._changes = this.r.db(this.db).table(this.table)
            .changes()
            .filter(this.r.row('old_val').eq(null))
            .toStream()
    }

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
