let chai = require('chai');
let assert = chai.assert;

const bunyan = require('bunyan');
const config = require('../config/config');
config.request.rejectUnauthorized = false;
const Swimlane = require('../swimlane');
const request = require('request');
// uncomment to debug tests
// integration.startup(bunyan.createLogger({ name: 'Mocha Test'/*, level: bunyan.TRACE*/ }));

const logger = bunyan.createLogger({ name: 'Mocha Test' /*, level: bunyan.TRACE*/ });

describe('Swimlane App Caching', () => {
  let options;
  let swimlane;

  before(() => {
    options = {
      url: 'https://localhost:5555',
      username: 'username',
      password: 'password',
      applications: 'Master'
    };

    swimlane = new Swimlane(request.defaults({ rejectUnauthorized: false }), logger);
  });

  function getEntities(type, value) {
    let isEmail = type === 'email';
    let isIPv4 = type === 'ip';
    let types = type.indexOf('custom') > -1 ? type : undefined;
    return {
      type: type.split('.')[0],
      types: types,
      isEmail: isEmail,
      isIPv4: isIPv4,
      value: value
    };
  }

  describe('email lookups', () => {
    it('should handle request errors', (done) => {
      swimlane.cacheApps(options, (err) => {
        if (err) {
          console.info(JSON.stringify(err, null, 2));
        } else {
          console.info('Cached App');
          console.info(swimlane.appNameToId.keys());
        }

        done();
      });
    });
  });
});
