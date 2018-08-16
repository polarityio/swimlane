polarity.export = PolarityComponent.extend({
  details: Ember.computed.alias('block.data.details'),
  summary: Ember.computed.alias('block.data.summary'),
  numAdditionalTags: Ember.computed('block.data.summary.length', 'block.userOptions.numTags', function() {
      return this.get('block.data.summary.length') - this.get('block.userOptions.numTags');
  })
});
