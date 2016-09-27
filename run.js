var output = require("./buildBenchInvertedIndex.js");

output.onAllEvents(function(event){
	console.log( event.event );
})

output.run();