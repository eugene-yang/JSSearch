var JSSQueryProcessor = require('./JSS/query-processor.js')
var log = function(obj){ console.log(typeof(obj) == "string" ? obj : JSON.stringify(obj, null, 2)) }

var fs = require("fs");
var tempDir = "./_tmp/"

// will be from cmd arguments
var indexDir = process.argv[2],
	queryFile = process.argv[3],
	model = process.argv[4],
	indexType = process.argv[5],
	outputFile = process.argv[6];
	
if( process.argv.length < 7 ){
	log("Usage: query_static [index-directory-path] [query-file-path] [retrieval-model] [index-type] [results-file]")
	process.exit(1);
}

model = model.toUpperCase()
if( model == "COSINE" )
	model = "Cosine";

log("Searching in " + indexType + " index with " + model );



var outputDir = outputFile.split("/").slice(0,-1).join("/")
if( outputDir != '' && !fs.existsSync( outputDir ) ){
    fs.mkdirSync(outputDir);
}

log("Output to " + outputFile + "\n");
var outputFS = fs.openSync(outputFile, "w");

var engine = new JSSQueryProcessor.QueryProcessor( indexDir + "/" + indexType );

console.time("Search Time")

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

// search
for( let query of queries ){
	if( indexType == "positional" )
		var outcome = engine.proximitySearch( query.topic, { similarity: model } );
	else{
		var outcome = engine.search( query.topic, { similarity: model } );
	}
	var results = outcome.top(100);
	for( var i=0; i<results.length; i++ ){
		fs.writeSync( outputFS, query.num + " 0 " + results[i].DocId + " " + i + " " + results[i].score.toFixed(5) + " JSS_" + indexType + "_" + model + "\n" );
	}
}

fs.close( outputFS );

console.timeEnd("Search Time")
log( "Search Done" );