// This script is for output the statistical report.
// The type of index is determined by config.json
 
// import packages
var fs = require("fs");

var log = function(obj){ console.log(typeof(obj) == "string" ? obj : JSON.stringify(obj, null, 2)) }

var memoryLimitList = [100000, 10000, 1000, Infinity]

for( let ml of memoryLimitList ){
	log( "--------------------------------------------------------" )
	log( "Memory Limit: " + ml );

	// import the container
	var output = require("./buildBenchInvertedIndex.js");
	output.setConfig({
		memory: {
			memoryLimit: ml,
			flushBunch: 66 * 4 // about 4 blocks(4K)
		}
	})
	// runtime timers are embedded in the container
	output.run(); 
	// Lexicon
	log( "Lexicon: " + output.IndexHashTable.bufferManager.length );
	// Index Size
	var htfz = fs.fstatSync( output.IndexHashTable.bufferManager.FD ).size,
		PLfz = fs.fstatSync( output.IndexHashTable.combinedIndex.bufferManager.FD ).size;
	log( "Index Size: " + (htfz+PLfz) );
	// df stats
	var list = [...output.IndexHashTable.getIterator()];
	list.sort(function(a,b){
		return a.DocFreq - b.DocFreq;
	})
	var stats = {
		max : list[ list.length - 1 ].DocFreq, 
		min : list[0].DocFreq,
		mean : 0, 
		median : list[ Math.floor( list.length / 2 ) ].DocFreq
	}
	for( let item of list ){
		stats.mean += item.DocFreq;
	}
	stats.mean = stats.mean / list.length;
	log( "df Stats" )
	log( stats );

	// clean up container
	output.destroy();
}