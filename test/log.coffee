
describe '#log', ->


	describe 'before transport is ready', ->

		it 'should not throw an error'
		it 'should operate when available'


	describe 'metadata', ->

		it 'should throw if too deeply nested'
		it 'should sanitize circular references'


	describe 'record', ->

		it 'should adhear to the label option'
		it 'should adhear to the storeHost option'
		it 'should have a valid timestamp'
		it 'should emit when successfully written'
