const request = require('postman-request');
const async = require('async');
const config = require('./config/config');
const Swimlane = require('./swimlane');
const fs = require('fs');

let swimlane;
let Logger;

function doLookup(entities, options, cb) {
  let lookupResults = [];

  swimlane.cacheApps(options, (err) => {
    if (err) {
      return cb(err);
    }

    async.each(
      entities,
      (entity, next) => {
        swimlane.search(entity.value, options, (err, records) => {
          if (err) {
            return next(err);
          }

          if (records.length > 0) {
            lookupResults.push({
              entity: entity,
              data: {
                summary: _getTags(records, options),
                details: {
                  records: records
                }
              }
            });
          } else {
            lookupResults.push({
              entity: entity,
              data: null
            });
          }

          next();
        });
      },
      (err) => {
        Logger.trace({ lookupResults }, 'Final Results');
        cb(err, lookupResults);
      }
    );
  });
}

function _getTags(records, options) {
  let tags = new Set();
  records.forEach((record) => {
    tags.add(record.appAcronym + '-' + record.recordTrackingId);
  });
  const tagsArray = [...tags];
  const slicedTagsArray = tagsArray.slice(0, options.numTags);
  if (slicedTagsArray.length < tagsArray.length) {
    slicedTagsArray.push(`+${tagsArray.length - slicedTagsArray.length} more`);
  }
  return slicedTagsArray;
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

function validateOptions(userOptions, cb) {
  let errors = [];

  if (typeof userOptions.url.value !== 'string' ||
      (typeof userOptions.url.value === 'string' && userOptions.url.value.length === 0)) {
    errors.push({
      key: 'url',
      message: 'You must provide a Swimlane URL'
    })
  }

  if (typeof userOptions.username.value !== 'string' ||
      (typeof userOptions.username.value === 'string' && userOptions.username.value.length === 0)) {
    errors.push({
      key: 'username',
      message: 'You must provide a username'
    })
  }

  if (typeof userOptions.password.value !== 'string' ||
      (typeof userOptions.password.value === 'string' && userOptions.password.value.length === 0)) {
    errors.push({
      key: 'password',
      message: 'You must provide a password'
    })
  }

  if (typeof userOptions.applications.value !== 'string' ||
      (typeof userOptions.applications.value === 'string' && userOptions.applications.value.length === 0)) {
    errors.push({
      key: 'applications',
      message: 'You must provide a comma delimited list of Applications to search'
    })
  }

  cb(null, errors);
}

module.exports = {
  doLookup,
  startup,
  validateOptions
};
