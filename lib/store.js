var mStore = [];

StoreClass = function( pSettings ) {	
}

StoreClass.prototype.findByClient = function( pClientId ) {
	return mStore.filter( e => e.clientId == pClientId );
};

StoreClass.prototype.save = function( pStore ) {
	mStore.push( pStore );
};

exports = module.exports = StoreClass;