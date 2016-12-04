var JSSQueryProcessor = require('./JSS/query-processor.js')
var log = function(obj){ console.log(JSON.stringify(obj, null, 2)) }

// var r = new JSSU.BufferManager({ fnd: "single.index", load: true})

// r.get(0)

// output = require("./buildBenchInvertedIndex")
// output.run()

var engine = new JSSQueryProcessor.QueryProcessor( "./_indexes/single" );

var outcome = engine.search("Finance Support", {
	similarity: "LM",
	expansion: true,
	LM_Dirichlet_mu: 2000
})

// log( outcome.top(5) )
// 


// console.log(global.range)


debugger