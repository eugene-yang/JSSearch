var JSSQueryProcessor = require('./JSS/query-processor.js')
var log = function(obj){ console.log(JSON.stringify(obj, null, 2)) }

// var r = new JSSU.BufferManager({ fnd: "single.index", load: true})

// r.get(0)

// output = require("./buildBenchInvertedIndex")
// output.run()

var engine = new JSSQueryProcessor.QueryProcessor( "./single" );

var result = engine.search("financial institutions in federal government over $100000") 

for( let re of result.getIterator() ){
	console.log( re.DocId );
}

// engine.search("find my iPhone quick")


debugger