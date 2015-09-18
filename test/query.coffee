
describe '#query', ->


	describe 'before transport is ready', ->

		it 'should not throw an error'
		it 'should fire the callback when available'


	describe 'options', ->

		it 'should be optional'
		it 'should support start/count row limits'
		it 'should support returning only requested fields'
		it 'should support date ranges'
		it 'should support sorting by date'


	describe 'after transport has closed', ->

		it 'should callback with error'
