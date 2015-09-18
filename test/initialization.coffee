###
@module test/initialization

Simple unit test to ensure that the transport creates the needed database
elements without removing existing ones.  This test can take some time so
the timeout for it has been raised since creating databases and indexes is
currently super slow in RethinkDB.

@todo clean up the before hooks, they read really poorly
###

should = require 'should'

transport = require __dirname + '/../'

describe 'database initialization', ->
	@timeout 20000

	r = null

	clear_database = (done) ->
		# drop the 'test' database, eat any errors
		# (in the event that the database does not exist)
		r.dbDrop('test').run().then(-> done()).error(-> done())


	before 'create connection pool', () ->
		# @todo this should really be in a config item somewhere, not right here
		r = require('rethinkdbdash') { servers: [ { host: '192.168.1.14', port: 28015 } ] }



	describe 'when db does not exist', ->
		tport = null

		before 'initialize transport', (done) ->
			clear_database ->
				tport = new transport.RethinkDB { options: () -> r }
				tport.on 'ready', -> done()


		it 'should create db', (done) ->
			r.dbList().run()
				.then (results) ->
					results.should.containEql 'test'
					done()
				.error done


		it 'should create table', (done) ->
			r.db('test').tableList().run()
				.then (results) ->
					results.should.containEql 'log'
					done()
				.error done


		it 'should create index', (done) ->
			r.db('test').table('log').indexList().run()
				.then (results) ->
					results.should.containEql 'timestamp'
					done()
				.error done



	describe 'when db exists but table does not exist', ->
		tport = null

		before 'initialize transport', (done) ->
			clear_database ->
				r.dbCreate('test').run()
					.then -> 
						r.db('test').tableCreate('existing').run()
							.then ->
								tport = new transport.RethinkDB { options: () -> r }
								tport.on 'ready', -> done()
							.error done
					.error done


		it 'db should not be dropped', (done) ->
			r.db('test').tableList().run()
				.then (results) ->
					results.should.containEql 'existing'
					done()
				.error done


		it 'should create table', (done) ->
			r.db('test').tableList().run()
				.then (results) ->
					results.should.containEql 'log'
					done()
				.error done


		it 'should create index', (done) ->
			r.db('test').table('log').indexList().run()
				.then (results) ->
					results.should.containEql 'timestamp'
					done()
				.error done



	describe 'when db and table exist but index does not exist', ->
		tport = null

		before 'initialize transport', (done) ->
			clear_database ->
				r.dbCreate('test').run()
					.then -> 
						r.db('test').tableCreate('log').run()
							.then ->
								r.db('test').table('log').indexCreate('existing').run()
									.then ->
										tport = new transport.RethinkDB { options: () -> r }
										tport.on 'ready', -> done()
									.error done
							.error done
					.error done


		it 'db should not be dropped', (done) ->
			r.db('test').tableList().run()
				.then (results) ->
					results.should.containEql 'log'
					done()
				.error done


		it 'table should not be dropped', (done) ->
			r.db('test').table('log').indexList().run()
				.then (results) ->
					results.should.containEql 'existing'
					done()
				.error done


		it 'should create index', (done) ->
			r.db('test').table('log').indexList().run()
				.then (results) ->
					results.should.containEql 'timestamp'
					done()
				.error done



	describe 'when db, table, and index exist', ->

		tport = null

		before 'initialize transport', (done) ->
			clear_database ->
				r.dbCreate('test').run()
					.then -> 
						r.db('test').tableCreate('log').run()
							.then ->
								r.db('test').table('log').indexCreate('timestamp').run()
									.then ->
										tport = new transport.RethinkDB { options: () -> r }
										tport.on 'ready', -> done()
									.error done
							.error done
					.error done


		it 'db should not be dropped', (done) ->
			r.db('test').tableList().run()
				.then (results) ->
					results.should.containEql 'log'
					done()
				.error done


		it 'table should not be dropped', (done) ->
			r.db('test').table('log').indexList().run()
				.then (results) ->
					results.should.containEql 'timestamp'
					done()
				.error done


		it 'index should still exist', (done) ->
			r.db('test').table('log').indexList().run()
				.then (results) ->
					results.should.containEql 'timestamp'
					done()
				.error done

