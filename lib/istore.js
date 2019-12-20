StoreInterface = function() {
	if(!this.findByClient) throw new Error("Must implement findByClient()");
	if(!this.save) throw new Error("Must implement save()");	
}

StoreInterface.prototype.findByClient = function( pClientId ) {};

StoreInterface.prototype.save = function( pStore ) {};

exports = module.exports = StoreInterface;