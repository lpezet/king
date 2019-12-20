// config.js
const dotenv = require('dotenv');
dotenv.config();

module.exports = {
  oktaClientId: process.env.OKTA_CLIENT_ID,
  oktaDomain: process.env.OKTA_DOMAIN,
  port: process.env.PORT,
  awsProfile: process.env.AWS_PROF,
  awsRegion: process.env.AWS_REG
};