module.exports = {
  /**
   * Name of the integration which is displayed in the Polarity integrations user interface
   *
   * @type String
   * @required
   */
  name: 'Swimlane',
  /**
   * The acronym that appears in the notification window when information from this integration
   * is displayed.  Note that the acronym is included as part of each "tag" in the summary information
   * for the integration.  As a result, it is best to keep it to 4 or less characters.  The casing used
   * here will be carried forward into the notification window.
   *
   * @type String
   * @required
   */
  acronym: 'SWM',
  /**
   * Description for this integration which is displayed in the Polarity integrations user interface
   *
   * @type String
   * @optional
   */
  description: 'Swimlane is a security automation, orchestration and incident response platform',
  entityTypes: ['ip', 'email', 'hash'],
  /**
   * An array of style files (css or less) that will be included for your integration. Any styles specified in
   * the below files can be used in your custom template.
   *
   * @type Array
   * @optional
   */
  styles: ['./styles/swimlane.less', './styles/es.less'],
  /**
   * Provide custom component logic and template for rendering the integration details block.  If you do not
   * provide a custom template and/or component then the integration will display data as a table of key value
   * pairs.
   *
   * @type Object
   * @optional
   */
  block: {
    component: {
      file: './components/swimlane-es-block.js'
    },
    template: {
      file: './templates/swimlane-es-block.hbs'
    }
  },
  summary: {
    component: {
      file: './components/swimlane-summary.js'
    },
    template: {
      file: './templates/swimlane-summary.hbs'
    }
  },
  request: {
    // Provide the path to your certFile. Leave an empty string to ignore this option.
    // Relative paths are relative to the STAXX integration's root directory
    cert: '',
    // Provide the path to your private key. Leave an empty string to ignore this option.
    // Relative paths are relative to the STAXX integration's root directory
    key: '',
    // Provide the key passphrase if required.  Leave an empty string to ignore this option.
    // Relative paths are relative to the STAXX integration's root directory
    passphrase: '',
    // Provide the Certificate Authority. Leave an empty string to ignore this option.
    // Relative paths are relative to the STAXX integration's root directory
    ca: '',
    // An HTTP proxy to be used. Supports proxy Auth with Basic Auth, identical to support for
    // the url parameter (by embedding the auth info in the uri)
    proxy: '',
    /**
     * If set to false, the integeration will ignore SSL errors.  This will allow the integration to connect
     * to STAXX servers without valid SSL certificates.  Please note that we do NOT recommending setting this
     * to false in a production environment.
     */
    rejectUnauthorized: true
  },
  logging: {
    level: 'info' //trace, debug, info, warn, error, fatal
  },
  /**
   * Options that are displayed to the user/admin in the Polarity integration user-interface.  Should be structured
   * as an array of option objects.
   *
   * @type Array
   * @optional
   */
  options: [
    {
      key: 'url',
      name: 'Swimlane URL',
      description: 'URL of the Swimlane instance to use including the schema (i.e., https://)',
      default: '',
      type: 'text',
      userCanEdit: true,
      adminOnly: false
    },
    {
      key: 'username',
      name: 'Swimlane Username',
      description: "The Swimlane user's username",
      default: '',
      type: 'text',
      userCanEdit: true,
      adminOnly: false
    },
    {
      key: 'password',
      name: 'Swimlane Password',
      description: "The Swimlane user's password",
      default: '',
      type: 'password',
      userCanEdit: true,
      adminOnly: false
    },
    {
      key: 'esUrl',
      name: 'Elasticsearch URL',
      description:
        'URL for your Elasticsearch REST API including the schema and port if applicable (e.g., https://elastic.prod:9200)',
      default: '',
      type: 'text',
      userCanEdit: true,
      adminOnly: false
    },
    {
      key: 'esUsername',
      name: 'Elasticsearch Username',
      description:
        'Elasticsearch account username (Leave this blank if you are not using Basic Auth via Shield)',
      default: '',
      type: 'text',
      userCanEdit: true,
      adminOnly: false
    },
    {
      key: 'esPassword',
      name: 'Elasticsearch Password',
      description:
        'Elasticsearch account password (Leave this blank if you are not using Basic Auth via Shield)',
      default: '',
      type: 'password',
      userCanEdit: true,
      adminOnly: false
    },
    {
      key: 'index',
      name: 'Index for Elasticsearch',
      description:
        'Comma delimited list of Elasticsearch indexes you want searched for results (no spaces between commas)',
      default: '',
      type: 'text',
      userCanEdit: true,
      adminOnly: false
    },
    {
      key: 'applications',
      name: 'Swimlane Applications',
      description:
        'A comma-delimited, case-insensitive list of Swimlane application names you would like to search.  Note these applications should match up with the indexes being searched in Elasticsearch.',
      default: '',
      type: 'text',
      userCanEdit: true,
      adminOnly: false
    },
    {
      key: 'detailFields',
      name: 'Swimlane Detail Fields',
      description:
        'A comma delimited list of Swimlane field names to include in the details block of the result.  This field should only be set as "Admin Only".',
      default: '',
      type: 'text',
      userCanEdit: false,
      adminOnly: true
    },
    {
      key: 'highlightEnabled',
      name: 'Enable Highlighting',
      description:
        'If checked, the integration will display highlighted search terms via the Elasticsearch Highlighter',
      default: true,
      type: 'boolean',
      userCanEdit: true,
      adminOnly: false
    },
    {
      key: 'numTags',
      name: 'Number of Summary Tags',
      description: 'The number of Swimlane Record IDs to show in the Polarity Overlay Window summary.',
      default: 5,
      type: 'number',
      userCanEdit: true,
      adminOnly: false
    }
  ]
};
