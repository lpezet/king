const express = require('express');
const OktaJwtVerifier = require('@okta/jwt-verifier');
const redis = require("redis");
//const util = require('util');
//const SimpleLogger = require('./logger');
//const logger = new SimpleLogger({ level: 'info' });
const bodyParser = require('body-parser');
const AWS = require('aws-sdk');

const { port, oktaClientId, oktaDomain, awsProfile, awsRegion } = require('./config');

console.log('## AWS profile = [' + awsProfile + ']')
var AWSCredentials = new AWS.SharedIniFileCredentials({profile: awsProfile});
AWS.config.credentials = AWSCredentials;
//Set the region 
AWS.config.update({region: awsRegion});
//console.log('#### AWS Region = [' + awsRegion + ']');
//Create the DynamoDB service object
var awsDynamoDB = new AWS.DynamoDB({apiVersion: '2012-08-10'});

//const StoreClass = require('./store');
//const store = new StoreClass();
const StoreClass = require('./dynamodbstore');
const CacheProxyStoreClass = require('./cacheproxystore');
const store = new CacheProxyStoreClass( new StoreClass( awsDynamoDB ) );

const AppClass = require('./app');

// ==========================================
// Express
// ==========================================
const app = express();
app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies

function getToken(req, res, next) {
  const bearerHeader = req.headers['authorization'];

  if (bearerHeader) {
    const bearer = bearerHeader.split(' ');
    const bearerToken = bearer[1];
    req.token = bearerToken;
    next();
  } else {
    // Forbidden
    res.sendStatus(403);
  }
}
app.use( getToken );

// ==========================================
// OAuth2 (Okta)
// ==========================================
const oktaJwtVerifier = new OktaJwtVerifier({
  issuer: `${oktaDomain}/oauth2/default`,
  clientId: oktaClientId
});


// ==========================================
// Redis Client
// ==========================================
const redisClient = redis.createClient({
	enable_offline_queue: false,
    retry_strategy: function (options) {
    	console.log('Lost connection to Redis Server...');
    	/*
        if (options.error && options.error.code === 'ECONNREFUSED') {
            // End reconnecting on a specific error and flush all commands with
            // a individual error
            console.log('...ECONNREFUSED');
            return new Error('The server refused the connection');
        }
        
        if (options.total_retry_time > 1000 * 60 * 60) {
            // End reconnecting after a specific timeout and flush all commands
            // with a individual error
            console.log('...total_retry_time');
            return new Error('Retry time exhausted');
        }
        if (options.attempt > 100) {
            // End reconnecting with built in error
            console.log('Maximum reconnection attempts reached. Giving up.');
            return undefined;
        }
        */
        // reconnect after
        //var time = Math.min(options.attempt * 100, 3000);
        
        var time = 0;
        if (options.attempt > 60) {
        	time = _5_MINUTES_IN_MS;
        } else {
        	time = Math.pow(options.attempt, 2) * 100;
        }
        console.log('...will retry in ' + time + 'ms');
        return time;
    }
});
redisClient.on('connect',function() {
	console.log('Connected to server.');
});


// ==========================================
// App
// ==========================================
new AppClass( app, store, redisClient, oktaJwtVerifier );

app.listen(port, () => console.log(`My App listening on port ${port}!`));
