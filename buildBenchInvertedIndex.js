// the container of running the benchmark
// output the JSSU.RunningContainer Object
// with event that can be listened

// package include
var fs = require('fs'),
	cheerio = require('cheerio'),
	JSSU = require('./JSS/ir_utilities.js');

// basic settings
var log = function(obj){ console.log(typeof(obj) == "string" ? obj : JSON.stringify(obj, null, 2)) }
var fileDir = "_data/BigSample/";

module.exports = JSSU.createRunningContainer({
	fileDir: "_data/BigSample/"
},[
	function getDocFileNames(){
		// load file names in the data directory
		return fs.readdirSync(this.config.fileDir);
	},
	function loadDocuments(fnList){
		console.time("Read time");

		var _Container = this;
		for( let fn of fnList ){
			var data = fs.readFileSync( this.config.fileDir + fn, 'utf8' );

			log( "Handling " + fn );

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

				_Container.DocumentSet.addDocument( Doc );
				Doc.createIndex();
			})
			log( "Finish " + fn );
		}

		console.timeEnd("Read time");
	},
	function buildInvertedIndex(){
		console.time("Merging time");

		log( "Start building index" )
		var invertedIndex = this.DocumentSet.toInvertedIndex()
		this.IndexHashTable = invertedIndex.HashTable;
		this.PostingList = invertedIndex.PostingList;
		this.addEventChild( this.IndexHashTable );
		this.addEventChild( this.PostingList );
		console.timeEnd("Merging time");
	},
	function FlushToDisk(){
		console.time("Flush time")
		this.IndexHashTable.finalize();
		this.PostingList.finalize();
		console.timeEnd("Flush time")
	}
])