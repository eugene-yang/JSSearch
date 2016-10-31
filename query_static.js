var JSSQueryProcessor = require('./JSS/query-processor.js')
var log = function(obj){ console.log(JSON.stringify(obj, null, 2)) }

var fs = require("fs");
var tempDir = "./_tmp/"

// will be from cmd arguments
var indexDir = "./_indexes/",
	queryFile = "./_data/QueryFile/queryfile.txt",
	model = "BM25", // careful with argument input -> case
	indexType = "single",
	outputFile = "./_results/output.txt";

console.time("Search Time")

var outputDir = outputFile.split("/").slice(0,-1).join("/")
if( outputDir != '' && !fs.existsSync( outputDir ) ){
    fs.mkdirSync(outputDir);
}

var outputFS = fs.openSync(outputFile, "w");

var engine = new JSSQueryProcessor.QueryProcessor( indexDir + "/" + indexType );

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
	var outcome = engine.search( query.topic, { similarity: model } ),
		results = outcome.top(100);
	for( var i=0; i<results.length; i++ ){
		fs.writeSync( outputFS, query.num + " 0 " + results[i].DocId + " " + i + " " + results[i].score.toFixed(5) + " JSS_" + indexType + "_" + model + "\n" );
	}
}

console.timeEnd("Search Time")