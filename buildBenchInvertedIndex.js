// the container of running the benchmark
// output the JSSU.RunningContainer Object
// with event that can be listened

// package include
var fs = require('fs'),
	cheerio = require('cheerio'),
	JSSU = require('./JSS/ir_utilities.js');

var log = function(obj){ console.log(typeof(obj) == "string" ? obj : JSON.stringify(obj, null, 2)) }

module.exports = JSSU.createRunningContainer({
	fileDir: "_data/BigSample/"
},[
	function startTotalTimer(){
		log( "Memory Limit: " + JSSU.BufferPoolManager.maxMemoryEntry )

		console.time("Total runtime")
	},
	function getDocFileNames(){
		// load file names in the data directory
		return fs.readdirSync(this.config.fileDir);
	},
	function loadDocuments(fnList){
		console.time("Read time");

		return this.async(function(resolve,reject){
			var counter = this.createCounter(function(){
				console.timeEnd("Read time");
				resolve();
			})

			var _Container = this;
			for( let fn of fnList ){
				var data = fs.readFileSync( this.config.fileDir + fn, 'utf8' );

				// log( "Handling " + fn );

				// remove special chars
				JSSU.Const.SpecialChars.forEach(function(pair){
					data = data.replace(pair[0], pair[1]);
				})
				var $ = cheerio.load(data);
				$('DOC').each(function(){
					var Doc = new JSSU.Document({
						id: $(this).find('DOCNO').text().replace(/\s/g, ""),
						string: $(this).find('TEXT').text()
					})

					counter.add();
					_Container.DocumentSet.addDocument( Doc );
					Doc.createIndex(function(){ counter.check() });
				})
				// log( "Finish " + fn );
			}

			counter.noMore()
		})

		
	},
	function buildInvertedIndex(){
		console.time("Merging time");

		log( "Start building index" )
		this.IndexHashTable = this.DocumentSet.toInvertedIndex()
		this.addEventChild( this.IndexHashTable );
		console.timeEnd("Merging time");
	},
	function FlushToDisk(){
		console.time("Flush time")
		this.IndexHashTable.finalize();
		console.timeEnd("Flush time")
	},
	function stopTotalTimer(){
		console.timeEnd("Total runtime")
	}
])