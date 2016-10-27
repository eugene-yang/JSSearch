var JSSU = require('./JSS/utilities.js')
var log = function(obj){ console.log(JSON.stringify(obj, null, 2)) }

// var r = new JSSU.BufferManager({ fnd: "single.index", load: true})

// r.get(0)

// output = require("./buildBenchInvertedIndex")
// output.run()

var engine = new JSSU.QueryProcessor( JSSU.LoadIndexHashTable("single") );

log( engine.search("find my iPhone quick") )
// engine.search("find my iPhone quick")


debugger