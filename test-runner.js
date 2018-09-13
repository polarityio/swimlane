'use strict';

const Swimlane = require('./swimlane');
const request = require('request');
const bunyan = require('bunyan');
const requestWithDefaults = request.defaults({
  rejectUnauthorized: false
});

// Fill in the options
let options = {
  url: '',
  username: '',
  password: '',
  applications: '',
  numTags: 5
};

const logger = bunyan.createLogger({ name: 'Mocha Test', level: bunyan.TRACE });
const swimlane = new Swimlane(requestWithDefaults, logger);
if(process.argv.length === 2){
    logger.error('Please pass in an IP address to search for');
    return;
}
const ipToSearch = process.argv[2];

swimlane.cacheApps(options, (err) => {
  if (err) {
    logger.error({err:err}, 'Error Caching Apps');
  } else {
    logger.info('Caching Apps Successful!');
    swimlane.search(ipToSearch, options, (err, results) => {
      if (err) {
        logger.error({err:err}, 'Error Running swimlane.search()');
      } else {
        logger.info({results:results}, 'Search Results');
      }
    });
  }
});
