// the container of running the benchmark
// output the JSSU.RunningContainer Object
// with event that can be listened

// package include
var fs = require('fs'),
	cheerio = require('cheerio'),
	JSSU = require('../JSS/utilities.js');

var log = function(obj){ console.log(typeof(obj) == "string" ? obj : JSON.stringify(obj, null, 2)) }

module.exports = JSSU.createRunningContainer({
	fileDir: "../_data/BigSample/",
	settings: {
		"inverted_index_type": "temp"
	}
},[
	function startTotalTimer(){
		log( "Memory Limit: " + JSSU.BufferPoolManager.maxMemoryEntry )

		console.time("Total runtime")
	},
	function settings(){
		this.config.preprocessing_settings = JSSU.Const.GetConfig("preprocessing_settings");
	},
	function getDocFileNames(){
		// load file names in the data directory
		return fs.readdirSync(this.config.fileDir);
	},
	function loadDocuments(fnList){
		console.time("Read time");

		this.DocumentSet = new JSSU.DocumentSet(this.config);
		this.addEventChild( this.DocumentSet );

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
					string: $(this).find('TEXT').text(),
					config: { tokenType: _Container.config.preprocess }
				})

				_Container.DocumentSet.addDocument( Doc );
				Doc.createIndex();
			})
			// log( "Finish " + fn );
		}

		console.timeEnd("Read time");
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