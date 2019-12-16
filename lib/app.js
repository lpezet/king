const util = require('util');
const SimpleLogger = require('./logger');
const logger = new SimpleLogger({ level: 'info' });

const _5_MINUTES_IN_MS = 5 * 60 * 1000;

const EXPIRATIONS_IN_SECONDS = {
	second: 1,
	minute: 60,
	hour: 3600,
	day: 86400,
	month: 2592000,
	year: 31536000
};


const LUA_MAX_N_ROLLING_WINDOW_SORTEDSET = `
local limit = tonumber( ARGV[2] )
local period_in_ms = tonumber( ARGV[3] )
local now = tonumber( ARGV[1] )
-- cleanup list
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[1] - period_in_ms)
local count = tonumber(redis.call('ZCARD', KEYS[1]))  
if count >= limit
then
	local tmp = redis.call('ZRANGE', KEYS[1], 0, 0)
	local start_time = tonumber( tmp[1] )
	return {'exceeded limit', limit, 0, period_in_ms - (now - start_time), -1}
else
  	redis.call('ZADD', KEYS[1], ARGV[1], ARGV[1])
  	return {'pass', limit, limit - count - 1, 0, -1}
end`;

const LUA_MAX_N_ROLLING_WINDOW = `
local limit = tonumber(ARGV[2])
local period_in_ms = tonumber( ARGV[3] )
local count = tonumber(redis.call('LLEN', KEYS[1]))
if count < limit 
then
  redis.call('LPUSH', KEYS[1], ARGV[1]) 
  return {'pass',limit,count,-1}
else
  local time = tonumber(redis.call('LINDEX', KEYS[1], -1))
  local ttl = ARGV[1] - time
  if ttl <= period_in_ms
  then 
    return {'exceeded limit',limit,count,ttl/1000,time}
  else 
    redis.call('LPUSH', KEYS[1], ARGV[1])
    redis.call('RPOP', KEYS[1])
    return {'pass',limit,count,ttl/1000,time}
  end	
end`;

// Problem here is we could have a situatiom with 4 (from previous period) + 5 (new period) request within second (say limit is 5 per minute).
const LUA_MAX_N = `
local limit = tonumber(ARGV[1])
local period_in_ms = tonumber( ARGV[3] )
if redis.call('EXISTS', KEYS[1]) == 0 
then 
  redis.call('SETEX', KEYS[1], period_in_ms / 1000, 0) 
end
local new_value = tonumber(redis.call('INCR', KEYS[1]))
local ttl = tonumber(redis.call('TTL', KEYS[1]))
if tonumber(redis.call('GET', KEYS[1])) <= 5
then return {'pass',limit,limit-new_value,ttl}
else return {'exceeded limit',limit,limit-new_value,ttl}
end`;


var AppClass = function( pExpress, pStore, pRedisClient, pOktaVerifier ) {
	this.mExpress = pExpress;
	this.mStore = pStore;
	this.mRedisClient = pRedisClient;
	this.mOktaVerifier = pOktaVerifier;
	this._init( pExpress );
}


AppClass.prototype._create_redis_key = function( pId, pPeriod ) {
	return util.format("ratelimit:%s:%s", pId, pPeriod);
}

AppClass.prototype._check_rate_limit = function( pId, pLimit, pPeriod ) {
	var that = this;
	return new Promise(function(resolve, reject) {
		var key = that._create_redis_key( pId, pPeriod );
		that.mRedisClient.eval(LUA_MAX_N_ROLLING_WINDOW_SORTEDSET, 1, key, Date.now(), pLimit, EXPIRATIONS_IN_SECONDS[ pPeriod ] * 1000, function(err, replies) {
			if (err) {
				reject( { period: pPeriod, error: err } );
			} else {
				resolve( { 
					period: pPeriod, 
					details: { 
						status: replies[0],
						limit: replies[1],
						remaining: replies[2],
						retryAfter: replies[3]
					} 
				} );
			}
		});
	});
};

AppClass.prototype._handle_rate_limit_check_replies = function( pChecks, pResponse, pError ) {
	if ( pError ) {
		pResponse.status(500).send( { error : pError } );
		return;
	}
	
	var rateLimited = false;
	var maxRetryAfter = -1;
	for ( var i in pChecks ) {
		var oCheck = pChecks[i];
		var oPeriod = oCheck['period'];
		var oDetails = oCheck['details'];
		var oError = oCheck['error'];
		if ( oError ) {
			//TODO: based on config, we could either ignore it or force rate-limiting (set oLimited to true)
			pResponse
				.header('X-RateLimit-Limit-' + i + '-Error', true);
		} else {
			var limit = oDetails['limit'];
			var remaining = oDetails['remaining'];
			var retryAfter = oDetails['retryAfter'];
			if ( oDetails['status'] === 'pass' ) {
				pResponse
				.header('X-RateLimit-Limit-' + oPeriod, limit)
				.header('X-RateLimit-Remaining-' + oPeriod, remaining);
			} else {
				rateLimited = true;
				maxRetryAfter = Math.max( maxRetryAfter, retryAfter );
				pResponse
				.header('X-RateLimit-Limit-' + oPeriod, limit)
				.header('X-RateLimit-Remaining-' + oPeriod, remaining)
				.header('X-RateLimit-Remaining-' + oPeriod + '-Reset', retryAfter);
			}
		}
		
	}
	pResponse.status( rateLimited ? 429 : 200 ).send( { periods: pChecks, retryAfter: maxRetryAfter } );
	
};

AppClass.prototype._authorize = function( req, res, authorizations, jwt ) {
	var authzed = true;
	var clientId = jwt['claims']['cid'];
	if ( authorizations.scopes && authorizations.scopes.length > 0 ) {
		var requiredScopes = authorizations.scopes;
		var jwtScopes = jwt['claims']['scp'] || [];
		var missingScopes = requiredScopes.filter( e => !jwtScopes.includes( e ) );
		authzed = missingScopes.length == 0;
		if ( ! authzed ) {
			logger.error('Client %s missing scopes: %j', clientId, missingScopes);
		}
	}
	if ( authzed && authorizations.clientId ) {
		authzed = authorizations.clientId === clientId;
		if ( ! authzed ) {
			logger.error('Client %s trying to access resource owned by %s.', clientId, authorizations.clientId);
		}
	}
	return authzed;
}

AppClass.prototype._auth = function( req, res, authorizations ) {
	var that = this;
	return new Promise( function( resolve, reject ) {
		that.mOktaVerifier.verifyAccessToken(req.token, authorizations.audiences).then(jwt => {
			if ( ! that._authorize( req, res, authorizations, jwt ) ) {
				res.sendStatus(403);
		    	reject( 'Forbidden' );
			} else {
				resolve( jwt );
			}
	    })
	    .catch(err => {
	    	if ( typeof(err) === 'JwtParseError' && err.message === 'Jwt is expired' ) {
	    		res.sendStatus(401); // Unauthorized
	    	} else {
	    		res.sendStatus(403); // Forbidden
	    	}
	    	reject(err);
	    });
	});
};

AppClass.prototype._init = function(app) {
	var that = this;
	app.post('/clients', (req, res) => {
		that._auth( req, res, { audiences: ['api://default'], scopes: [] } ).then(function( jwt ) {
			var clientId = jwt['claims']['cid'];
			var configs = [];
			[ 'config.minute', 'config.hour', 'config.day'].forEach( function( k ) {
				var v = req.body[ k ];
				if ( v ) {
					var config = { clientId: clientId, period: k.replace('config.', ''), value: v };
					logger.info('Configuring %s with: %j', clientId, config);
					that.mStore.save( config );
					configs.push( config );
				}
			});
			res.send(configs);
		}, function( error ) {
			logger.error(error);
		});
	});
	
	app.get('/clients/:clientId', (req, res) => {
		that._auth( req, res, { audiences: ['api://default'], scopes: [], clientId: req.params.clientId } ).then(function( jwt ) {
			var clientId = jwt['claims']['cid'];
			var configs = that.mStore.findByClient( clientId );
			res.send(configs);
		});
	});
	
	app.get('/clients/:clientId/resources/:key', (req, res) => {
		that._auth( req, res, { audiences: ['api://default'], scopes: [], clientId: req.params.clientId } ).then(function( jwt ) {
			var key = req.params.key;
			var clientId = req.params.clientId;
			
			var configs = that.mStore.findByClient( clientId );
			logger.debug('Found configs for client %s: %j', clientId, configs);
			
			var oRLs = [];
			configs.forEach( function(c) {
				logger.debug('Running check: key=%s, period=%s, value=%s', key, c.period, c.value);
				var oCheck = that._check_rate_limit( key, c.value, c.period );
				oRLs.push( oCheck );
			});
			
			Promise.all( oRLs ).then( function(values) {
		  		//console.log(values);
		  		that._handle_rate_limit_check_replies( values, res );
			}, function(error) {
				logger.error('Rejection occured: %s', error);
				that._handle_rate_limit_check_replies( null, res, 'Storage error.' );
			}).catch( function( error ) {
				logger.error('Unexpected error: %s', error);
				that._handle_rate_limit_check_replies( null, res, 'Unexpected error.' );
			});
			
		});
	});
}


exports = module.exports = AppClass;