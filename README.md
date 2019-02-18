# Polarity Swimlane Integration

![8b6eb0e4-946d-4970-8b8b-48d4eb6a7b32](https://user-images.githubusercontent.com/306319/52977525-87096c80-339b-11e9-89a1-fd0abbef0550.GIF)

The Polarity Swimlane integration requires that you sync your Swimlane application data with an Elasticsearch cluster.
Please contact us if you're interested in using Polarity to provide real-time data awareness into your Swimlane data.

## Swimlane Integration Options

### Swimlane URL

URL of the Swimlane instance to use including the schema (i.e., https://)

### Swimlane Username

The user's username

### Swimlane Password

The user's password

### Elasticsearch URL

URL for your Elasticsearch REST API including the schema and port if applicable (e.g., https://elastic.prod:9200)

### Elasticsearch Username

Elasticsearch account username (Leave this blank if you are not using Basic Auth via Shield)

### Elasticsearch Password

Elasticsearch account password (Leave this blank if you are not using Basic Auth via Shield)

### Index for Elasticsearch

Comma delimited list of Elasticsearch indexes you want searched for results (no spaces between commas)

### Swimlane Applications

A comma-delimited, case-insensitive list of Swimlane application names you would like to search.  Note these applications should match up with the indexes being searched in Elasticsearch

### Swimlane Detail Fields

A comma delimited list of Swimlane field names to include in the details block of the result. This field should only be set as "Admin Only".

### Enable Highlighting

If checked, the integration will display highlighted search terms via the Elasticsearch Highlighter.

### Number of Summary Tags

The number of record IDs to show in the Polarity Overlay window summary

## Polarity

Polarity is a memory-augmentation platform that improves and accelerates analyst decision making.  For more information about the Polarity platform please see:

https://polarity.io/
