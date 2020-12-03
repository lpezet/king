const StoreInterface = require('./istore');

class StoreClass extends StoreInterface {
	#mClient = null;
	constructor( pDynamoDBClient ) {
		super();
		this.#mClient = pDynamoDBClient;
	}
	
	findByClient( pClientId ) {
		var that = this;
		var params = {
				TableName: 'RL_CONFIGS',
				Key: {
					'CLIENT_ID': {S: pClientId }
				}
		};
		// Call DynamoDB to read the item from the table
		return new Promise( function(resolve, reject) {
			that.#mClient.getItem(params, function(err, data) {
				if (err) {
					reject( err );
				  } else {
				    var result = {};
				    for(var k in data.Item) {
				    	var el = data.Item[k];
				    	var v = el['N'] ? parseInt( el['N'] ) : el['S'];
				    	result[k.toLowerCase()] = v;
				    }
				    resolve( [ result ] );
				  }
			});
		});
		
	}
	
	save( pElement ) {
		var that = this;
		var params = {
		  TableName: 'RL_CONFIGS',
		  Item: {
		    'CLIENT_ID' : {S: pElement.clientId }
		  }
		};
		[ 'config.second', 'config.minute', 'config.hour', 'config.day'].forEach(function(k) {
			if (pElement[k]) params.Item[k.toUpperCase()] = {N: '' + pElement[k]};
		});
		return new Promise( function(resolve, reject) {
			that.#mClient.putItem(params, function(err, data) {
				if (err) {
					console.log("Error", err);
					reject( err );
				} else {
					console.log("Success", data);
					resolve( data );
				}
			});
		});
	}
}

exports = module.exports = StoreClass;
