const StoreInterface = require('./istore');

class StoreClass extends StoreInterface {
	mStore = [];
	constructor( pSettings ) {
		super();
	}
	
	findByClient( pClientId ) {
		return Promise.resolve( this.mStore.filter( e => e.clientId === pClientId ) );
	}
	
	save( pElement ) {
		return Promise.resolve( this.mStore.push( pElement ) );
	}
}

exports = module.exports = StoreClass;
