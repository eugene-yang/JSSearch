var JSSQueryProcessor = require('./JSS/query-processor.js')
var log = function(obj){ console.log(JSON.stringify(obj, null, 2)) }

// var r = new JSSU.BufferManager({ fnd: "single.index", load: true})

// r.get(0)

// output = require("./buildBenchInvertedIndex")
// output.run()

var engine = new JSSQueryProcessor.QueryProcessor( "./_indexes/positional" );

// var result = engine.search("financial institutions in federal government over $100000", {similarity: "LM"} ) 

// var flat = [];
// for( let re of result.getIterator() ){
// 	flat.push({
// 		DocId: re.DocId,
// 		similarity: [...re._cache]
// 	})
// }
// log( flat );

// engine.search("find my iPhone quick")

engine.proximitySearch("Federal Programs")

debugger