var JSSQueryProcessor = require('./JSS/query-processor.js')
var log = function(obj){ console.log(typeof(obj) == "string" ? obj : JSON.stringify(obj, null, 2)) }

var fs = require("fs");
var tempDir = "./_tmp/"

// will be from cmd arguments
var indexDir = process.argv[2] ,
	queryFile = process.argv[3],
	outputFile = process.argv[4],
	model = process.argv[5] || "Cosine";

if( process.argv.length < 5 ){
	log("Usage: query_static [index-directory-path] [query-file-path] [results-file] [optional: retrieval-model]")
	process.exit(1);
}

model = model.toUpperCase()
if( model == "COSINE" )
	model = "Cosine";

log("Dynamic searching with " + model );

console.time("Search Time")

var outputDir = outputFile.split("/").slice(0,-1).join("/")
if( outputDir != '' && !fs.existsSync( outputDir ) ){
    fs.mkdirSync(outputDir);
}

log("Output to " + outputFile + "\n");
var outputFS = fs.openSync(outputFile, "w");

// parse queries
var topics = [],
	qnum = [];
for( let line of fs.readFileSync(queryFile, 'utf-8').split("\n") ){
	if( line.match(/^<title>/ig) != null )
		topics.push( line.split(":")[1].trim() )
	else if( line.match(/^<num>/ig) != null )
		qnum.push( parseInt(line.split(":")[1]) )
}
var queries = [];
for( var i=0; i<topics.length; i++ ){
	queries.push({ topic: topics[i], num: qnum[i] });
}

var phrase_engine = new JSSQueryProcessor.QueryProcessor( indexDir + "/phrase" ),
	proximity_engine = new JSSQueryProcessor.QueryProcessor( indexDir + "/positional" ),
	general_engine = new JSSQueryProcessor.QueryProcessor( indexDir + "/stem" );

// search
for( let query of queries ){
	var outcome = phrase_engine.search( query.topic, { similarity: model } );
	if( outcome.size < 100 )
		outcome = JSSQueryProcessor.SearchResultSet.merge( outcome, 
					proximity_engine.proximitySearch( query.topic, { similarity: model } ) );
	if( outcome.size < 100 )
		outcome = JSSQueryProcessor.SearchResultSet.merge( outcome, 
					general_engine.search( query.topic, { similarity: model } ) );
	

	var results = outcome.top(100);
	// log( results.length  )
	for( var i=0; i<results.length; i++ ){
		fs.writeSync( outputFS, query.num + " 0 " + results[i].DocId + " " + i + " " + results[i].score.toFixed(5) + " JSS_dynamic_" + model + "\n" );
	}
}

fs.close( outputFS );

console.timeEnd("Search Time")
log( "Search Done" );