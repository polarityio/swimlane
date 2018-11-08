const crypto = require('crypto');
const _ = require('lodash');
const htmlEscape = require('./html-escape');

const FIELD_VALUE_TRUNCATION_LENGTH = 2000; // number of characters to truncate to for the field value

class Swimlane {
  constructor(request, logger) {
    this.accessTokenCache = new Map();

    // appCache is a map of maps.  There is a map per application keyed on the appId.  Each app then has a map keyed
    // on field ids with the value being a field object.  The field object contains the field name and the layout name.
    // In addition, the app will be keyed on the fieldName (in lowercase) with the object containing the fieldId
    this.appCache = new Map();
    this.appIdToName = new Map();
    this.appNameToId = new Map();
    this.swimlaneInstanceId = null;
    this.isCaching = true;
    this.cachingAppFailed = false;
    this.log = logger;
    this.request = request;
    this.detailFields = '';
    this.detailFieldsIdList = [];
  }

  cacheApps(options, cb) {
    let self = this;

    if (this._doReload(options)) {
      this.log.info('Caching Swimlane Applications');
      this._resetCaches();
      this._cacheApps(options, (err) => {
        if (!err) {
          this.log.info(
            { cachedApps: Array.from(this.appNameToId.keys()) },
            'Successfully Cached Apps'
          );
        }
        self._setDetailFields(options);
        self.cachingAppFailed = err ? true : false;
        self.isCaching = false;
        return cb(err);
      });
    } else {
      self._setDetailFields(options);
      cb(null);
    }
  }

  _setDetailFields(options) {
    const self = this;
    if (options.detailFields !== this.detailFields) {
      this.detailFields = options.detailFields;
      this.detailFieldsIdList = this.detailFields.split(',').reduce((accum, fieldName) => {
        fieldName = fieldName.trim().toLowerCase();
        self.appCache.forEach(function(appMap, appId) {
          self.log.info({ appId: appId, fieldName: fieldName }, 'setDetailFields');

          if (appMap.byFieldName.has(fieldName)) {
            self.log.info(
              { fieldName: fieldName, fieldId: appMap.byFieldName.get(fieldName) },
              'Field Id'
            );
            accum.push(appMap.byFieldName.get(fieldName).fieldId);
          }
        });
        return accum;
      }, []);
    }
  }

  search(entityValue, options, cb) {
    const self = this;
    const appIds = [];
    const results = [];

    // The app cache did not build correctly we return an error
    if (this.cachingAppFailed) {
      return cb({
        detail: 'Cannot run searches due to a failure to load the Swimlane application'
      });
    }

    // The caching operation can take a couple seconds which means search requests can come in before
    // the app is fully cached.  As a result, we simply return empty results until the app is fully
    // cached.
    if (this.isCaching) {
      this.log.debug(`Cache is still building, skipping search on [${entityValue}]`);
      return cb(null, []);
    }

    let appNames = options.applications.split(',');

    for (let i = 0; i < appNames.length; i++) {
      let appId = this._getAppId(appNames[i].trim());
      if (appId) {
        appIds.push(appId);
      } else {
        // the appName could not be mapped to an app ID
        return cb({
          detail: 'The Application [' + appNames[i].trim() + '] could not be found',
          availableApps: Array.from(this.appNameToId.keys()),
          note:
            'The app names are case insensitive so you do not need to match the casing provided in `availableApps`'
        });
      }
    }

    if (appIds.length === 0) {
      return cb('You must specify a valid application name');
    }

    const requestOptions = {
      url: options.url + '/api/search',
      json: true,
      method: 'POST',
      body: {
        applicationIds: appIds,
        columns: this.detailFieldsIdList,
        filters: [{ fieldId: options.filterFieldId, filterType: 'contains', value: entityValue }],
        pageSize: 5
      }
    };

    this.log.debug({ requestOptions: requestOptions }, 'HTTP Request Options');

    this._executeRequest(
      options,
      requestOptions,
      self._handleRequestError('Searching SwimLane', cb, (response, body) => {
        const resultsCount = body.count;

        appIds.forEach((appId) => {
          if (Array.isArray(body.results[appId])) {
            body.results[appId].forEach((record) => {
              let keys = Object.keys(record.values);
              const parsedDetailFields = [];
              const app = self._getApp(appId);

              keys.forEach((fieldId) => {
                // the values object always contains a $type property which we want to ignore
                if (fieldId === '$type') {
                  return;
                }

                const fieldValue = record.values[fieldId];
                const fieldName = self._getFieldName(appId, fieldId);

                if (!app) {
                  // the appId could not be found so we log it
                  this.log.debug(
                    {
                      appId: appId,
                      fieldId: fieldId,
                      entityValue: entityValue
                    },
                    `Could not find the app ${appId}`
                  );
                  return;
                }

                if (!fieldName) {
                  // the field could not be found so we log it.  This can happen when a field in the app
                  // is deleted but records legacy records still exist which contain the field
                  this.log.debug(
                    {
                      appId: appId,
                      fieldId: fieldId,
                      entityValue: entityValue
                    },
                    `Could not find field id ${fieldId} in app ${appId}`
                  );
                  return;
                }

                parsedDetailFields.push({
                  name: fieldName,
                  value: fieldValue,
                  id: fieldId
                });
              });

              results.push({
                appName: app.name,
                appAcronym: app.acronym,
                appId: appId,
                detailFields: parsedDetailFields,
                recordTrackingId: record.trackingId,
                recordCreatedDate: record.createdDate,
                recordModifiedDate: record.modifiedDate,
                recordTotalTimeSpent: record.totalTimeSpent,
                recordId: record.id,
                recordUrl: self._createRecordUrl(options.url, appId, record.id)
              });
            });
          }
        });

        cb(null, results, resultsCount);
      })
    );
  }

  _getAppId(appName) {
    return this.appNameToId.get(appName.toLowerCase());
  }

  _getApp(appId) {
    return this.appIdToName.get(appId);
  }

  _doReload(options) {
    if (this.swimlaneInstanceId === null || this.swimlaneInstanceId !== options.url) {
      this.swimlaneInstanceId = options.url;
      return true;
    }

    return false;
  }

  _cacheApps(options, cb) {
    let self = this;

    this._executeRequest(
      options,
      {
        url: options.url + '/api/app',
        json: true
      },
      self._handleRequestError('Retrieving Apps', cb, (response, body) => {
        body.forEach((app) => {
          self.appIdToName.set(app.id, {
            name: app.name,
            acronym: app.acronym
          });
          self.appNameToId.set(app.name.toLowerCase(), app.id);
          app.fields.forEach((field) => {
            self._setFieldName(app.id, field.id, field.name);
          });

          self._buildLayoutPath(app.id, app.layout);
        });

        cb(null);
      })
    );
  }
  _buildLayoutPath(appId, layout) {
    layout.forEach((item) => {
      this._parseLayoutItem(appId, item, []);
    });
  }
  _parseLayoutItem(appId, item, path) {
    if (item['$type'] === 'Core.Models.Layouts.SectionLayout, Core') {
      this._parseSectionLayout(appId, item, path);
    } else if (item['$type'] === 'Core.Models.Layouts.FieldLayout, Core') {
      this._parseFieldsLayout(appId, item, path);
    } else if (item['$type'] === 'Core.Models.Layouts.TabLayout, Core') {
      this._parseTabLayout(appId, item, path);
    } else if (item['$type'] === 'Core.Models.Layouts.Tabs, Core') {
      this._parseTab(appId, item, path);
    }
  }
  _parseFieldsLayout(appId, field, path) {
    if (field.fieldId) {
      path.push({
        id: field.fieldId,
        name: this._getFieldName(appId, field.fieldId),
        layoutType: field.layoutType
      });

      this._setLayoutPath(appId, field.fieldId, path);
    }
  }
  _parseSectionLayout(appId, section, path) {
    if (Array.isArray(section.children)) {
      path.push({
        id: section.id,
        name: section.name,
        layoutType: section.layoutType
      });

      section.children.forEach((item) => {
        const clonedPath = path.slice(0);
        this._parseLayoutItem(appId, item, clonedPath);
      });
    }
  }
  _parseTabLayout(appId, tabLayout, path) {
    if (Array.isArray(tabLayout.tabs)) {
      tabLayout.tabs.forEach((item) => {
        const clonedPath = path.slice(0);
        this._parseLayoutItem(appId, item, clonedPath);
      });
    }
  }
  _parseTab(appId, tab, path) {
    if (Array.isArray(tab.children)) {
      path.push({
        id: tab.id,
        name: tab.name,
        layoutType: tab.layoutType
      });

      tab.children.forEach((item) => {
        const clonedPath = path.slice(0);
        this._parseLayoutItem(appId, item, clonedPath);
      });
    }
  }

  /**
   * Returns the field for the provided fieldId within the given appId
   * @param appId {String} The application id you want to lookup the field in
   * @param fieldId {String} The id of the field you want to return
   * @returns {*}
   * @private
   */
  _getField(appId, fieldId) {
    let app = this.appCache.get(appId);
    if (app && app.byFieldId.has(fieldId)) {
      return app.byFieldId.get(fieldId);
    } else {
      return null;
    }
  }

  /**
   * Maps a field id for a given app to a field name
   * @param appId  {String} The application id you want to lookup the field in
   * @param fieldId {String} The field id you want to return the name for
   * @returns {*}
   * @private
   */
  _getFieldName(appId, fieldId) {
    let app = this.appCache.get(appId);
    // It is possible for a field to be deleted out of an app but to still have records that exist with that
    // data in the backend.  As a result, we need to validate that we have a fieldId in the app cache.  If we don't
    // we can safely ignore this field.
    if (app && app.byFieldId.has(fieldId)) {
      return app.byFieldId.get(fieldId).fieldName;
    } else {
      return null;
    }
  }
  _getFieldId(appId, fieldName) {
    let app = this.appCache.get(appId);
    // It is possible for a field to be deleted out of an app but to still have records that exist with that
    // data in the backend.  As a result, we need to validate that we have a fieldId in the app cache.  If we don't
    // we can safely ignore this field.
    if (app && app.byFieldName.has(fieldName.toLowerCase())) {
      return app.byFieldName.get(fieldName.toLowerCase).fieldId;
    } else {
      return null;
    }
  }
  _getLayoutPath(appId, fieldId) {
    let app = this.appCache.get(appId);
    if (app) {
      return app.byFieldId.get(fieldId).layoutPath;
    } else {
      return null;
    }
  }
  _setFieldName(appId, fieldId, fieldName) {
    if (!this.appCache.has(appId)) {
      this.appCache.set(appId, {
        byFieldId: new Map(),
        byFieldName: new Map()
      });
    }

    let app = this.appCache.get(appId);
    let field = {};
    if (app.byFieldId.has(fieldId)) {
      field = app.byFieldId.get(fieldId);
    }

    app.byFieldId.set(fieldId, _.merge(field, { fieldName: fieldName }));

    // Set an entry in the other direction so the same map has keys that
    // are fieldIds and keys that are fieldNames
    const fieldNameLowerCase = fieldName.toLowerCase();
    if (app.byFieldName.has(fieldNameLowerCase)) {
      field = app.byFieldName.get(fieldNameLowerCase);
    }
    app.byFieldName.set(fieldNameLowerCase, _.merge(field, { fieldId: fieldId }));
  }
  _setLayoutPath(appId, fieldId, layoutPath) {
    if (!this.appCache.has(appId)) {
      this.appCache.set(appId, {
        byFieldId: new Map(),
        byFieldName: new Map()
      });
    }

    let app = this.appCache.get(appId);
    let field = {};

    if (app.byFieldId.has(fieldId)) {
      field = app.byFieldId.get(fieldId);
    }

    app.byFieldId.set(fieldId, _.merge(field, { layoutPath: layoutPath }));
  }
  _createRecordUrl(host, appId, recordId) {
    return host + '/record/' + appId + '/' + recordId;
  }

  _resetCaches() {
    this.appNameToId.clear();
    this.appIdToName.clear();
    this.appCache.clear();
    this.detailFields = '';
    this.detailFieldsIdList = [];
  }

  _executeRequest(options, requestOptions, cb, requestCount) {
    let self = this;

    if (typeof requestCount === 'undefined') {
      requestCount = 0;
    }

    this._getAccessToken(options, (err, accessToken) => {
      if (err) {
        cb(err);
        return;
      }

      requestOptions.headers = {
        Authorization: `Bearer ${accessToken}`
      };

      self.request(requestOptions, (err, response, body) => {
        if (response.statusCode === 401 && requestCount < 2) {
          // accessToken has expired
          self.accessTokenCache.delete(self._getAccessTokenCacheKey(options));

          //repeat this function to get a new access token
          self._executeRequest(options, requestOptions, cb, requestCount ? ++requestCount : 1);
          return;
        }

        cb(err, response, body);
      });
    });
  }

  _handleRequestError(errorMessage, errorCb, cb) {
    let self = this;
    return function(err, response, body) {
      if (err) {
        self.log.error({
          err: err,
          statusCode: response ? response.statusCode : null,
          body: body
        });

        errorCb({
          err: err,
          detail: 'HTTP Error: ' + errorMessage,
          body: body
        });

        return;
      }

      if (response.statusCode !== 200) {
        self.log.error({
          err: err,
          statusCode: response ? response.statusCode : null,
          body: body
        });

        errorCb({
          err: err,
          detail: 'Error: ' + errorMessage,
          body: body
        });

        return;
      }

      cb(response, body);
    };
  }

  _getAccessToken(options, cb) {
    let cacheKey = this._getAccessTokenCacheKey(options);
    if (this.accessTokenCache.has(cacheKey)) {
      cb(null, this.accessTokenCache.get(cacheKey));
    } else {
      // We have to generate the token
      this._generateAccessToken(options, cb);
    }
  }

  _generateAccessToken(options, cb) {
    let self = this;
    let requestOptions = {
      json: true,
      url: options.url + '/api/user/login',
      method: 'POST',
      body: {
        username: options.username,
        password: options.password
      }
    };

    this.request(requestOptions, (err, response, body) => {
      if (err || response.statusCode != 200 || !body || !body.token) {
        cb({
          err: err,
          response: response,
          username: options.username,
          body: body,
          detail: 'Error retrieving Swimlane API token'
        });
        return;
      }

      // Cache the new token
      self.accessTokenCache.set(self._getAccessTokenCacheKey(options), body.token);

      cb(null, body.token);
    });
  }

  _getAccessTokenCacheKey(options) {
    let key = options.url + options.username + options.password;
    return crypto
      .createHash('sha1')
      .update(key)
      .digest('hex');
  }
}

module.exports = Swimlane;
