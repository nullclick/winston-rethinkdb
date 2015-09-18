# winston-rethinkdb
A RethinkDB Transport for Winston

Basically copying winston-mongodb but uses a RethinkDB database (via rethinkdbdash)
for the output.

@todo finish out documentation
@see-also winston-mongodb
@see-also session-rethinkdb


unit test cases
==================

constructor options
	all the string options
	options.options
		undefined
		function
		object

initialization
	db and table exist
	db exists, table does not
	neither db nor table exist

queue log attempts until transport is ready
circular references in meta data when logging
too deeply nested meta data
connection pool connectivity issues
query loggly options
query attempts before transport is ready
stream attempts before transport is ready
stream options
stream disconnection
attempting log, query or stream after closed
