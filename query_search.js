var JSSQueryProcessor = require('./JSS/query-processor.js')
const execSync = require('child_process').execSync;

var log = function(obj){ console.log(typeof(obj) == "string" ? obj : JSON.stringify(obj, null, 2)) }

var fs = require("fs");
var tempDir = "./_tmp/"

// will be from cmd arguments
// var indexDir = "./_indexes/",
// 	queryFile = "./_data/QueryFile/queryfile.txt",
// 	indexType = process.argv[2];

if( process.argv[2] == "-a" ){
	var indexDir = "./_indexes/",
		queryFile = "./_data/QueryFile/queryfile.txt",
		model = process.argv[3],
		indexType = process.argv[4],
		searchType = process.argv[5]
		outputFile = process.argv[6];

	if( process.argv.length < 6 ){
		log("Usage: query_search -a [retrieval-model] [index-type] [search-type] [optional: results-file]")
		process.exit(1);
	}
}
else {
	var indexDir = process.argv[2],
		queryFile = process.argv[3],
		model = process.argv[4],
		indexType = process.argv[5],
		searchType = process.argv[6]
		outputFile = process.argv[7];

	if( process.argv.length < 7 ){
		log("Usage: query_search [index-directory-path] [query-file-path] [retrieval-model] [index-type] [search-type] [optional: results-file]")
		process.exit(1);
	}
}

if( (["expand", "reduce", "expand-reduce", "none", "normal"]).indexOf(searchType) < 0  ){
	log("[search-type: expand, reduce, expand-reduce or none]")
	log("[set to default 'none']\n")
}

model = model.toUpperCase()
if( model == "COSINE" )
	model = "Cosine";

console.time("parsing query file")

// parse queries
var lines = fs.readFileSync(queryFile, 'utf-8').split("\n");
var queries = [];
for( var i=0; i<lines.length; i++ ){
	if( lines[i].match(/^<top>/ig) != null ){
		finish = false, nar = false;
		query = {narr:""}
		for( ; !finish; i++ ){
			if( lines[i].match(/^<\/top>/ig) != null )
				finish = true
			else if( nar )
				query.narr += (lines[i] + " \n")
			else if( lines[i].match(/^<narr>/ig) != null )
				nar = true
			else if( lines[i].match(/^<title>/ig) != null )
				query.topic = lines[i].split(":")[1].trim()
			else if( lines[i].match(/^<num>/ig) != null )
				query.num = parseInt(lines[i].split(":")[1])
		}
		queries.push(query)
	}
}

console.timeEnd("parsing query file")

var engine = new JSSQueryProcessor.QueryProcessor( indexDir + "/" + indexType );

var getMAP = function(resultString, remainFile){
	if( remainFile == true )
		var fn = outputFile;
	else {
		var fn = tempDir + parseInt( Math.random() * 10000000 ) + "eval.tmp";
	}
	var outputFS = fs.openSync(fn, "w");

	fs.writeSync(outputFS, resultString);
	fs.closeSync(outputFS);

	// run TREC evaluation
	
	var ostype = require("os").type().split("_")[0];
	var exefn = "./_data/bin/trec_eval_" + ostype;

	if( ostype == "Windows" ){
		try{
			var rawOutcome = execSync( ".\\_data\\bin\\trec_eval_Windows ./_data/QueryFile/qrels.txt " + fn).toString();
		} catch(e){
			var rawOutcome = e.stdout.toString()
		}
		var map = parseFloat(rawOutcome.split("\n")[5].split("\t")[2])
	}
	else {
		try{
			var rawOutcome = execSync( exefn + " ./_data/QueryFile/qrels.txt " + fn).toString();
		} catch(e){
			var rawOutcome = e.stdout.toString()
		}
		var map = parseFloat(rawOutcome.split("\n")[5].split("\t")[2])
	}

	if( remainFile != true )
		fs.unlinkSync(fn)

	return map;
}


function run(model, params){
	var outputString = "";
	var config = { 
		similarity: model, 
		expansion: params.expansion,
		reduction: params.reduction
	}

	console.time("search time")
	for( let query of queries ){
		var q = query.topic;
		if( params.reduction == true && params.expansion == false )
			q = query.narr
		var outcome = engine.search( q, config);
		var results = outcome.top(100);
		for( var i=0; i<results.length; i++ ){
			outputString += ( query.num + " 0 " + results[i].DocId + " " + i + " " + results[i].score.toFixed(5) + " JSS_" + indexType + "_" + model + "\n" );
		}
	}
	console.timeEnd("search time")
	return getMAP(outputString, params.remainFile);
}

var parmameters = {
	expansion: ( searchType == "expand" || searchType == "expand-reduce" ) ? true : false,
	reduction: ( searchType == "reduce" || searchType == "expand-reduce" ) ? true : false,
	remainFile: (outputFile != undefined) ? true : false
}



log("MAP: " + run(model, parmameters))

