var JSSU = require('./JSS/utilities.js')
var log = function(obj){ console.log(JSON.stringify(obj, null, 2)) }

// var r = new JSSU.BufferManager({ fnd: "single.index", load: true})

// r.get(0)

// output = require("./buildBenchInvertedIndex")
// output.run()

r = JSSU.LoadIndexHashTable("single")

debugger