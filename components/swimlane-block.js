polarity.export = PolarityComponent.extend({
    details: Ember.computed.alias('block.data.details'),
    numRecords: Ember.computed.alias('block.data.summary.length')
});
