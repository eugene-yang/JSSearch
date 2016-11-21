var JSSQueryProcessor = require('./JSS/query-processor.js')
var log = function(obj){ console.log(JSON.stringify(obj, null, 2)) }

// var r = new JSSU.BufferManager({ fnd: "single.index", load: true})

// r.get(0)

// output = require("./buildBenchInvertedIndex")
// output.run()

var engine = new JSSQueryProcessor.QueryProcessor( "./_indexes/single" );

var outcome = engine.search("Control of Food Supplements", {expansion: true})

log( outcome._query.tf )


debugger