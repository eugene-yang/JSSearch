var JSSQueryProcessor = require('./JSS/query-processor.js')
var JSSU = require('./JSS/utilities.js')
var optimizer = require('./JSS/optimizer.js')
const execSync = require('child_process').execSync;

var log = function(obj){ console.log(typeof(obj) == "string" ? obj : JSON.stringify(obj, null, 2)) }

var fs = require("fs");
var tempDir = "./_tmp/"

// will be from cmd arguments
var indexDir = "./_indexes/",
	queryFile = "./_data/QueryFile/queryfile.txt",
	indexType = process.argv[2];


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
		query.narr_stem = new JSSU.String(query.narr, {tokenType: {
			"inverted_index_df_threshold": 0,
			"parse_single_term": true,
			"exclude_stop_words": false,
			"apply_stemmer": true,
			"parse_phrase": false,
			"phrase_accept_length": [2,3,4],
			"parse_special_term": false,
			"default_index_with_position": false
		}})
		queries.push(query)
	}
}

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
	var config = { similarity: model, reduction: params.threshold }
	if( model == "BM25" )
		config.BM25_parameters = { k1: params.k1, k2: params.k2, b: params.b }
	else if( model == "LM" )
		config.LM_Dirichlet_mu = params.mu

console.time("search time")
	for( let query of queries ){
		var outcome = engine.search( indexType == "stem" ? query.narr_stem : query.narr, config);
		var results = outcome.top(100);
		for( var i=0; i<results.length; i++ ){
			outputString += ( query.num + " 0 " + results[i].DocId + " " + i + " " + results[i].score.toFixed(5) + " JSS_" + indexType + "_" + model + "\n" );
		}
	}
	console.timeEnd("search time")
	return getMAP(outputString);
}

// grid search
var parameters = {
	Cosine: {
		threshold: [...Number.range(0.01, 1, 0.01)]
	},
	BM25: {
		threshold: [...Number.range(0.01, 1, 0.01)],
		k1: [...Number.range(0.01, 2, 0.02)],
		k2: [200],
		b: [...Number.range(0, 1, 0.02)]
	},
	LM: {
		threshold: [...Number.range(0.01, 1, 0.01)],
		mu: [...Number.range(0, 6000, 50)]
	}
}


for( let mod of ["Cosine"] ){
	log("run " + mod)

	var f = run.bind(null, mod);
	var opt = optimizer.gridSearch(f, parameters[mod], "max", true)
	log({ opt: opt.optValue, optParams: opt.params })

	// write file
	var keys = Object.keys(opt.record[0].params)
	var fp = fs.openSync( tempDir + "reduction_" + mod + "_" + indexType + ".csv", "w");
	fs.writeSync(fp, "Model,MAP," + keys.join(",") + "\n" )
	for( let entry of opt.record ){
		fs.writeSync(fp, mod + "," + entry.val + "," )
		for( let key of keys ){
			fs.writeSync(fp, entry.params[key] + "," )
		}
		fs.writeSync(fp, "\n");
	}
	fs.closeSync( fp )
}