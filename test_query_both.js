var JSSQueryProcessor = require('./JSS/query-processor.js')
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
		queries.push(query)
	}
}

var engine = new JSSQueryProcessor.QueryProcessor( indexDir + "/" + indexType );

var getMAP = function(resultString){
	var fn = tempDir + parseInt( Math.random() * 10000000 ) + "eval.tmp",
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


function run(model, params){
	var outputString = "";
	var config = { 
		similarity: model, 
		expansion: {
			topDoc: params.topDoc,
			topToken: params.topToken,
			alpha: params.alpha
		},
		reduction: params.threshold
	}
	if( model == "BM25" )
		config.BM25_parameters = { k1: params.k1, k2: params.k2, b: params.b }
	else if( model == "LM" )
		config.LM_Dirichlet_mu = params.mu

	for( let query of queries ){
		var outcome = engine.search( query.topic, config);
		var results = outcome.top(100);
		for( var i=0; i<results.length; i++ ){
			outputString += ( query.num + " 0 " + results[i].DocId + " " + i + " " + results[i].score.toFixed(5) + " JSS_" + indexType + "_" + model + "\n" );
		}
	}
	return getMAP(outputString);
}

// grid search
var parameters = {
	Cosine: {
		threshold: [...Number.range(0.01, 1, 0.01)],
		topDoc: [...Number.range(1, 50, 2)],
		topToken: [...Number.range(5, 50, 5)],
		alpha: [...Number.range(0, 1, 0.1)]
	},
	BM25: {
		threshold: [...Number.range(0.01, 1, 0.01)],
		topDoc: [...Number.range(1, 50, 2)],
		topToken: [...Number.range(5, 50, 5)],
		alpha: [...Number.range(0, 1, 0.1)],
		k1: [...Number.range(0.01, 2, 0.02)],
		k2: [200],
		b: [...Number.range(0, 1, 0.02)]
	},
	LM: {
		threshold: [...Number.range(0.01, 1, 0.01)],
		topDoc: [...Number.range(1, 50, 2)],
		topToken: [...Number.range(5, 50, 5)],
		alpha: [...Number.range(0, 1, 0.1)],
		mu: [...Number.range(0, 6000, 50)]
	}
}


for( let mod of ["Cosine", "LM", "BM25"] ){
	log("run " + mod)

	var f = run.bind(null, mod);
	var opt = optimizer(f, parameters[mod], "max", true)
	log({ opt: opt.optValue, optParams: opt.params })

	// write file
	var keys = Object.keys(opt.record[0].params)
	var fp = fs.openSync( tempDir + "expansion_" + mod + "_" + indexType + ".csv", "w");
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