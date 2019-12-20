const NodeCache = require('node-cache');
const StoreInterface = require('./istore');

class StoreClass extends StoreInterface {
	#mCache = [];
	#mProxy;
	
	constructor( pProxy, pSettings ) {
		super();
		var settings = pSettings || {};
		this.#mProxy = pProxy;
		this.#mCache = new NodeCache({ 
			stdTTL: settings.ttlSeconds || 300, 
			checkperiod: (settings.ttlSeconds || 300) * 0.2, 
			useClones: false });
	}
	
	findByClient( pClientId ) {
		const v = this.#mCache.get( pClientId );
	    if (v) {
	      return Promise.resolve( v );
	    }
	    var that = this;
		return this.#mProxy.findByClient( pClientId ).then( function( result ) {
			that.#mCache.set( pClientId, result);
			return result;
		})
	}
	
	save( pElement ) {
		this.#mCache.set( pElement.clientId, pElement );
		return this.#mProxy.save( pElement );
	}
}

exports = module.exports = StoreClass;