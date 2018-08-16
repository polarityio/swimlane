const request = require('request');
const async = require('async');
const config = require('./config/config');
const Swimlane = require('./swimlane');
const fs = require('fs');

let swimlane;
let Logger;

function doLookup(entities, options, cb) {
  let results = [];

  swimlane.cacheApps(options, (err) => {
    if (err) {
      return cb(err);
    }

    async.each(
      entities,
      (entity, next) => {
        swimlane.search(entity.value, options, (err, records, resultsCount) => {
          if (err) {
            return next(err);
          }

          if (records.length > 0) {
            results.push({
              entity: entity,
              data: {
                summary: _getTags(records),
                details: {
                  records: records,
                  count: resultsCount
                }
              }
            });
          } else {
            results.push({
              entity: entity,
              data: null
            });
          }

          next();
        });
      },
      (err) => {
        Logger.info(results);
        cb(err, results);
      }
    );
  });
}

function _getTags(records) {
  let tags = new Set();
  records.forEach((record) => {
    tags.add(record.appAcronym + '-' + record.recordTrackingId);
  });
  return [...tags];
}

function startup(logger) {
  Logger = logger;
  let requestOptions = {};

  if (typeof config.request.cert === 'string' && config.request.cert.length > 0) {
    requestOptions.cert = fs.readFileSync(config.request.cert);
  }

  if (typeof config.request.key === 'string' && config.request.key.length > 0) {
    requestOptions.key = fs.readFileSync(config.request.key);
  }

  if (typeof config.request.passphrase === 'string' && config.request.passphrase.length > 0) {
    requestOptions.passphrase = config.request.passphrase;
  }

  if (typeof config.request.ca === 'string' && config.request.ca.length > 0) {
    requestOptions.ca = fs.readFileSync(config.request.ca);
  }

  if (typeof config.request.proxy === 'string' && config.request.proxy.length > 0) {
    requestOptions.proxy = config.request.proxy;
  }

  if (typeof config.request.rejectUnauthorized === 'boolean') {
    requestOptions.rejectUnauthorized = config.request.rejectUnauthorized;
  }

  let requestWithDefaults = request.defaults(requestOptions);

  swimlane = new Swimlane(requestWithDefaults, logger);
}

module.exports = {
  doLookup: doLookup,
  startup: startup
};
