const chai = require('chai');
const spies = require('chai-spies');
chai.use(spies);
const expect = chai.expect;
const Logger = require('../lib/logger');

describe('logger',function(){
	
	const levels = [ 'debug', 'info', 'warn', 'error' ];
	
	const basic_expectations = [
		{ level: 'info', msg: 'Hello world!', expected: 'INFO : Hello world!'},
		{ level: 'debug', msg: 'Hello world!', expected: 'DEBUG: Hello world!'},
		{ level: 'error', msg: 'Hello world!', expected: 'ERROR: Hello world!'},
		{ level: 'warn', msg: 'Hello world!', expected: 'WARN : Hello world!'}
	];
	
	beforeEach(function() {
		//sinon.spy(console, 'log');
		chai.spy.on(console, 'log');
	});
	
	afterEach(function() {
		//console.log.restore();
		chai.spy.restore(console, 'log')
	});
	
	
	describe('format', function() {
		it('should format', function() {
			var logger = new Logger({ level: 'info' });
			logger.info('Hello %s!', 'world');
			expect(console.log).to.have.been.called.with('INFO : Hello world!');
		});
	});

	describe('log', function() {
		for (var i in basic_expectations) {
			var exp = basic_expectations[i];
			(function( pLevel, pMsg, pExpected) {
				it('should log ' + pLevel, function() {
			    	var logger = new Logger({ level: pLevel });
			    	logger[pLevel](pMsg);
			    	expect(console.log).to.have.been.called.with(pExpected);
			    });
			})( exp.level, exp.msg, exp.expected);
		};
	});
	
	describe('skip log', function() {
		
		for (var i in levels) {
			(function( pLevelIndex, pLevel ) {
				it('with ' + pLevel, function() {
					var logger = new Logger({ level: pLevel });
					if (pLevelIndex === 0) {
						// debug, log all
						for (j=0; j < levels.length; j++) {
							var level2 = levels[j];
							logger[level2]('Test');
							expect(console.log).to.have.been.called;
						}
					} else {
						for (var j = 0; j < pLevelIndex; j++) {
							var lowerLevel = levels[j];
							//console.log('level=' + pLevel + ', lowLevel=' + lowerLevel)
							logger[lowerLevel](lowerLevel);
							expect(console.log).to.have.been.called.exactly(0);
						}
					}
				});
			})(i, levels[i]);
		}
	});
	
});
