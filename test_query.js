var JSSQueryProcessor = require('./JSS/query-processor.js')
const execSync = require('child_process').execSync;

var log = function(obj){ console.log(typeof(obj) == "string" ? obj : JSON.stringify(obj, null, 2)) }

var fs = require("fs");
var tempDir = "./_tmp/"

// will be from cmd arguments
var indexDir = "./_indexes/",
	queryFile = "./_data/QueryFile/queryfile.txt",
	model = "BM25",
	indexType = "stem";


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

var getMAP = function(resultString){
	var fn = tempDir + parseInt( Math.random() * 10000 ) + "eval.tmp",
		outputFS = fs.openSync(fn, "w");

	fs.writeSync(outputFS, resultString);
	fs.closeSync(outputFS);

	// run TREC evaluation
	try{
		var rawOutcome = execSync("_data\\bin\\trec_eval_Windows ./_data/QueryFile/qrels.txt " + fn).toString();
	} catch(e){
		var rawOutcome = e.stdout.toString()
	}
	var map = parseFloat(rawOutcome.split("\r\n")[19])
	fs.unlink(fn)

	return map;
}



var engine = new JSSQueryProcessor.QueryProcessor( indexDir + "/" + indexType );

// search
thresholds = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 2, 3, 4, 5, 10]
for( let fa of thresholds ){
	var outputString = ""
	for( let query of queries ){
		var outcome = engine.search( query.narr, { similarity: model, reduction: fa } );
		var results = outcome.top(100);
		for( var i=0; i<results.length; i++ ){
			outputString += ( query.num + " 0 " + results[i].DocId + " " + i + " " + results[i].score.toFixed(5) + " JSS_" + indexType + "_" + model + "\n" );
		}
	}
	log( {threshold: fa, MAP:getMAP(outputString)} )
}
