const crypto = require('crypto');
const _ = require('lodash');
const htmlEscape = require('./html-escape');

class Swimlane {
  constructor(request, logger) {
    this.accessTokenCache = new Map();

    // appCache is a map of maps.  There is a map per application keyed on the appId.  Each app then has a map keyed
    // on field ids with the value being a field object.  The field object contains the field name and the layout name.
    this.appCache = new Map();
    this.appIdToName = new Map();
    this.appNameToId = new Map();
    this.swimlaneInstanceId = null;
    this.log = logger;
    this.request = request;
  }

  init(options) {
    this.getApps();
  }

  cacheApps(options, cb) {
    if (this._doReload(options)) {
      this.log.info('Caching Swimlane Applications');
      this._resetCaches();
      this._cacheApps(options, (err) => {
        return cb(err);
      });
    } else {
      cb(null);
    }
  }

  search(entityValue, options, cb) {
    const self = this;
    const appIds = [];
    const results = [];

    let appNames = options.applications.split(',');

    for (let i = 0; i < appNames.length; i++) {
      let appId = this._getAppId(appNames[i].trim());
      if (appId) {
        appIds.push(appId);
      } else {
        // the appName could not be mapped to an app ID
        return cb('The Application [' + appNames[i].trim() + '] could not be found');
      }
    }

    if (appIds.length === 0) {
      return cb('You must specify a valid application name');
    }

    this._executeRequest(
      options,
      {
        url: options.url + '/api/search',
        json: true,
        method: 'POST',
        body: {
          applicationIds: appIds,
          keywords: entityValue,
          pageSize: 10
        }
      },
      self._handleRequestError('Searching SwimLane', cb, (response, body) => {
        const entityRegEx = new RegExp(entityValue, 'gi');
        const resultsCount = body.count;

        appIds.forEach((appId) => {
          if (Array.isArray(body.results[appId])) {
            body.results[appId].forEach((record) => {
              let keys = Object.keys(record.values);
              keys.forEach((key) => {
                let value = record.values[key];
                if (
                  typeof value === 'string' &&
                  value.toLowerCase().includes(entityValue.toLowerCase())
                ) {
                  let fieldValue = htmlEscape(value);
                  fieldValue = fieldValue.replace(entityRegEx, '<span class="match">$&</span>');
                  results.push({
                    appName: self._getAppName(appId),
                    appAcronym: self._getApp(appId).acronym,
                    appId: appId,
                    fieldId: key,
                    fieldName: self._getFieldName(appId, key),
                    layoutPath: self._getLayoutPath(appId, key),
                    fieldValue: fieldValue,
                    recordTrackingId: record.trackingId,
                    recordCreatedDate: record.createdDate,
                    recordModifiedDate: record.modifiedDate,
                    recordTotalTimeSpent: record.totalTimeSpent,
                    recordId: record.id,
                    recordUrl: self._createRecordUrl(options.url, appId, record.id)
                  });
                }
              });
            });
          }
        });

        cb(null, results, resultsCount);
      })
    );
  }

  _getAppName(appId) {
    return this.appIdToName.get(appId).name;
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
  _getField(appId, fieldId) {
    let app = this.appCache.get(appId);
    if (app) {
      return app.get(fieldId);
    } else {
      return null;
    }
  }
  _getFieldName(appId, fieldId) {
    let app = this.appCache.get(appId);
    if (app) {
      return app.get(fieldId).fieldName;
    } else {
      return null;
    }
  }
  _getLayoutPath(appId, fieldId) {
    let app = this.appCache.get(appId);
    if (app) {
      return app.get(fieldId).layoutPath;
    } else {
      return null;
    }
  }
  _setFieldName(appId, fieldId, fieldName) {
    if (!this.appCache.has(appId)) {
      this.appCache.set(appId, new Map());
    }

    let app = this.appCache.get(appId);
    let field = {};
    if (app.has(fieldId)) {
      field = app.get(fieldId);
    }

    app.set(fieldId, _.merge(field, { fieldName: fieldName }));
  }
  _setLayoutPath(appId, fieldId, layoutPath) {
    if (!this.appCache.has(appId)) {
      this.appCache.set(appId, new Map());
    }

    let app = this.appCache.get(appId);
    let field = {};

    if (app.has(fieldId)) {
      field = app.get(fieldId);
    }

    app.set(fieldId, _.merge(field, { layoutPath: layoutPath }));
  }
  _createRecordUrl(host, appId, recordId) {
    return host + '/record/' + appId + '/' + recordId;
  }

  _resetCaches() {
    this.appNameToId.clear();
    this.appIdToName.clear();
    this.appCache.clear();
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

      self.log.info(requestOptions);

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
      if (err || response.statusCode != 200) {
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
