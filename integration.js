const request = require('request');
const async = require('async');
const config = require('./config/config');
const Swimlane = require('./swimlane');
const fs = require('fs');
const _ = require('lodash');

const MAX_ENTITIES_PER_LOOKUP = 10;
const MAX_PARALLEL_LOOKUPS = 5;

let swimlane;
let Logger;
let requestWithDefaults;
let currentDetailFields = '';
/**
 * Array of fieldNames to be displayed in the details block.  This array is computed dynamically anytime the
 * `detailFields` option is modified.
 */
let detailFieldNames;

function doLookup(entities, options, cb) {
  let self = this;
  let lookupResults = [];
  const filteredEntities = [];
  const lookupTasks = [];

  if (options.detailFields !== currentDetailFields) {
    detailFieldNames = options.detailFields.split(',').map((field) => {
      return field.trim();
    });
  }

  swimlane.cacheApps(options, (err) => {
    if (err) {
      return cb(err);
    }

    entities.forEach((entityObj) => {
      if (entityObj.isIP) {
        if (!entityObj.isPrivateIP) {
          filteredEntities.push(entityObj);
        }
      } else {
        filteredEntities.push(entityObj);
      }
    });

    if (filteredEntities.length === 0) {
      return cb(null, []);
    }

    const summaryFields = []; //options.summaryFields.split(',');
    Logger.trace({ options }, 'options');
    const entityGroups = _.chunk(filteredEntities, MAX_ENTITIES_PER_LOOKUP);
    entityGroups.forEach((entityGroup) => {
      lookupTasks.push(_lookupEntityGroup.bind(self, entityGroup, summaryFields, options));
    });

    async.parallelLimit(lookupTasks, MAX_PARALLEL_LOOKUPS, (err, results) => {
      if (err) {
        Logger.error(err, 'Error running lookup');
        return cb(err);
      }

      results.forEach((result) => {
        lookupResults = lookupResults.concat(result);
      });

      cb(null, lookupResults);
    });
  });
}

/**
 * Returns an elasticsearch query that uses the multi-search format:
 *
 * https://www.elastic.co/guide/en/elasticsearch/reference/current/search-multi-search.html
 *
 * @param entities
 * @param options
 * @returns {Object}
 * @private
 */
function _buildDoLookupQuery(entities, options) {
  let multiSearchString = '';
  const multiSearchQueries = [];

  entities.forEach((entityObj) => {
    const query = `{"query": { "simple_query_string": { "query": "\\"${
      entityObj.value
    }\\"" } }, "from": 0, "size": 10, "sort": [ {"CreatedDate": "desc" } ] } }`;
    multiSearchString += `{}\n${query}\n`;
    multiSearchQueries.push(query);
  });
  return { multiSearchString, multiSearchQueries };
}

/**
 * Body is not parsed into JSON for us because the request we make is not JSON.  As a result,
 * we have to parse body ourselves.
 * @private
 */
function _parseBody(body) {
  if (body) {
    try {
      return JSON.parse(body);
    } catch (e) {
      Logger.error({ body: body }, 'Invalid JSON: Unable to parse ES return body into object');
      return null;
    }
  }
  return null;
}

function _isMiss(responseObject) {
  if (
    responseObject &&
    responseObject.hits &&
    Array.isArray(responseObject.hits.hits) &&
    responseObject.hits.hits.length > 0
  ) {
    return false;
  }
  return true;
}

function _lookupEntityGroup(entityGroup, summaryFields, options, cb) {
  const queryObject = _buildDoLookupQuery(entityGroup, options);
  const requestOptions = {
    uri: `${options.esUrl}/${options.index}/_msearch`,
    method: 'GET',
    headers: {
      'Content-Type': 'application/x-ndjson'
    },
    body: queryObject.multiSearchString
  };

  if (options.username && options.password) {
    requestOptions.auth = {
      user: options.esUsername,
      pass: options.esPassword
    };
  }

  Logger.debug({ requestOptions: requestOptions }, 'lookupEntityGroup Request Payload');

  requestWithDefaults(requestOptions, function(httpErr, response, body) {
    if (httpErr) {
      return cb({
        err: httpErr,
        detail: 'Error making HTTP request'
      });
    }

    const jsonBody = _parseBody(body);
    if (jsonBody === null) {
      return cb(
        _createJsonErrorPayload(
          'JSON Parse Error of HTTP Response',
          null,
          '404',
          '1',
          'JSON Parse Error',
          {
            body: body
          }
        )
      );
    }

    const restError = _handleRestErrors(response, jsonBody);
    if (restError) {
      return cb(restError);
    }

    const entityGroupResults = [];

    Logger.trace({ jsonBody }, 'ES Raw Search Result');

    jsonBody.responses.forEach((searchItemResult, index) => {
      if (_isMiss(searchItemResult)) {
        entityGroupResults.push({
          entity: entityGroup[index],
          data: null
        });
      } else {
        const totalResults = searchItemResult.hits.total;
        // wrap the hit in another object so that the font-end integration component can inject properties to track
        // various states without mutating the raw hit result returned from ES.  The raw hit result is stored in `hit`
        const hits = searchItemResult.hits.hits.map((hit) => {
          hit._source.ValuesDocument = swimlane.toHumanReadable(
            hit._source.ApplicationId,
            hit._source.ValuesDocument
          );
          return {
            hit: hit
          };
        });

        entityGroupResults.push({
          entity: entityGroup[index],
          data: {
            summary: _getSummaryTags(searchItemResult, summaryFields),
            details: {
              totalResults: totalResults,
              detailFieldNames: detailFieldNames,
              results: hits,
              queries: queryObject.multiSearchQueries
            }
          }
        });
      }
    });

    cb(null, entityGroupResults);
  });
}

function onDetails(lookupObject, options, cb) {
  if (options.highlightEnabled === false) {
    return cb(null, lookupObject.data);
  }

  // Maps the Swimlane Record ID (which is also the ES Doc ID) to the Swimlane App ID
  const docIdToAppId = {};
  const documentIds = lookupObject.data.details.results.map((item) => {
    docIdToAppId[item.hit._id] = item.hit._source.ApplicationId;
    return item.hit._id;
  });

  const requestOptions = {
    uri: `${options.esUrl}/${options.index}/_search`,
    method: 'GET',
    body: _buildOnDetailsQuery(lookupObject.entity, documentIds, options),
    json: true
  };

  if (
    typeof options.esUsername === 'string' &&
    options.esUsername.length > 0 &&
    typeof options.esPassword === 'string' &&
    options.esPassword.length > 0
  ) {
    requestOptions.auth = {
      user: options.esUsername,
      pass: options.esPassword
    };
  }

  Logger.debug({ onDetailsQuery: requestOptions }, 'onDetails Request Payload');
  lookupObject.data.details.highlights = {};
  requestWithDefaults(requestOptions, function(httpErr, response, body) {
    if (httpErr) {
      Logger.error(httpErr);
      return cb(httpErr);
    }

    // let restError = _handleRestErrors(response, body);
    // if (restError !== null) {
    //   Logger.error(restError);
    //   return cb(restError);
    // }

    Logger.trace({ body: body }, 'ES Raw Highlight Query Result');
    body.hits.hits.forEach((hit) => {
      const resultHighlights = [];
      for (const [fieldName, fieldValues] of Object.entries(hit.highlight)) {
        if (!fieldName.endsWith('.keyword')) {
          // fieldName will look like "ValuesDocument.<fieldId>" so we want to
          // grab just the ID value
          let fieldId = fieldName.split('.')[1];
          let field = swimlane._getField(docIdToAppId[hit._id], fieldId);
          resultHighlights.push({
            field,
            fieldName,
            fieldValues
          });
        }
      }
      lookupObject.data.details.highlights[hit._id] = resultHighlights;
    });

    Logger.debug({ onDetails: lookupObject.data }, 'onDetails data result');
    cb(null, lookupObject.data);
  });
}

function _buildOnDetailsQuery(entityObj, documentIds, options) {
  return {
    _source: false,
    query: {
      ids: {
        type: '_doc',
        values: documentIds
      }
    },
    highlight: {
      fields: {
        '*': {}
      },
      highlight_query: {
        simple_query_string: {
          query: `"${entityObj.value}"`
        }
      },
      pre_tags: ['<span class="highlight">'],
      post_tags: ['</span>'],
      encoder: 'html',
      fragment_size: 200
    },
    from: 0,
    size: 10
  };
}

/**
 * HTTP Error Codes taken from:
 * https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/errors.html
 * @param response
 * @param body
 * @returns {*}
 * @private
 */
function _handleRestErrors(response, body) {
  switch (response.statusCode) {
    case 403:
      return _createJsonErrorPayload(
        'Access to the resource is forbidden',
        null,
        '404',
        '1',
        'Forbidden',
        {
          body: body
        }
      );
      break;
    case 404:
      return _createJsonErrorPayload('Not Found', null, '404', '1', 'Not Found', {
        body: body
      });
      break;
    case 400:
      return _createJsonErrorPayload(
        'Invalid Search, please check search parameters',
        null,
        '400',
        '2',
        'Bad Request',
        {
          body: body
        }
      );
      break;
    case 409:
      return _createJsonErrorPayload(
        'There was a conflict with your search',
        null,
        '409',
        '3',
        'Conflict',
        {
          body: body
        }
      );
      break;
    case 503:
      return _createJsonErrorPayload(
        'Service is currently unavailable for search results',
        null,
        '503',
        '4',
        'Service Unavailable',
        {
          body: body
        }
      );
    case 500:
      return _createJsonErrorPayload(
        'Internal Server error, please check your instance',
        null,
        '500',
        '5',
        'Internal Server Error',
        {
          body: body
        }
      );
      break;
    case 200:
      if (!Array.isArray(body.responses)) {
        return _createJsonErrorPayload(
          'Unexpected Response Payload Format.  "body.responses" should be an array',
          null,
          response.statusCode,
          '6',
          'Unexpected HTTP Error',
          {
            body: body
          }
        );
      } else {
        return null;
      }
      break;
  }

  return _createJsonErrorPayload(
    'Unexpected HTTP Response Status Code',
    null,
    response.statusCode,
    '7',
    'Unexpected HTTP Error',
    {
      body: body
    }
  );
}

// function that takes the ErrorObject and passes the error message to the notification window
function _createJsonErrorPayload(msg, pointer, httpCode, code, title, meta) {
  return {
    errors: [_createJsonErrorObject(msg, pointer, httpCode, code, title, meta)]
  };
}

// function that creates the Json object to be passed to the payload
function _createJsonErrorObject(msg, pointer, httpCode, code, title, meta) {
  let error = {
    detail: msg,
    status: httpCode.toString(),
    title: title,
    code: 'ES_' + code.toString()
  };

  if (pointer) {
    error.source = {
      pointer: pointer
    };
  }

  if (meta) {
    error.meta = meta;
  }

  return error;
}

function _getSummaryTags(searchItemResult) {
  let tags = new Set();

  searchItemResult.hits.hits.forEach((hit) => {
    tags.add(hit._source.TrackingFull);
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

  requestWithDefaults = request.defaults(requestOptions);

  swimlane = new Swimlane(requestWithDefaults, logger);
}

module.exports = {
  doLookup: doLookup,
  startup: startup,
  onDetails: onDetails
};
