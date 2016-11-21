// package include
var fs = require('fs'),
	cheerio = require('cheerio'),
	JSSU = require('./JSS/utilities.js');

var log = function(obj){ console.log(typeof(obj) == "string" ? obj : JSON.stringify(obj, null, 2)) }

var indexSettings = {
	"single": {
		"inverted_index_df_threshold": 0,
		"parse_single_term": true,
		"exclude_stop_words": true,
		"apply_stemmer": false,
		"parse_phrase": false,
		"phrase_accept_length": [2,3,4],
		"parse_special_term": true,
		"default_index_with_position": false
	},
	"stem": {
		"inverted_index_df_threshold": 0,
		"parse_single_term": true,
		"exclude_stop_words": false,
		"apply_stemmer": true,
		"parse_phrase": false,
		"phrase_accept_length": [2,3,4],
		"parse_special_term": false,
		"default_index_with_position": false
	},
	"phrase": {
		"inverted_index_df_threshold": 2,
		"parse_single_term": false,
		"exclude_stop_words": false,
		"apply_stemmer": false,
		"parse_phrase": true,
		"phrase_accept_length": [2,3,4],
		"parse_special_term": false,
		"default_index_with_position": false
	},
	"positional": {
		"inverted_index_df_threshold": 0,
		"parse_single_term": true,
		"exclude_stop_words": false,
		"apply_stemmer": false,
		"parse_phrase": false,
		"phrase_accept_length": [2,3,4],
		"parse_special_term": false,
		"default_index_with_position": true
	}
}

var docDir = process.argv[2],
	indexType = process.argv[3],
	outputDir = process.argv[4];

if( !docDir || !indexType || !outputDir ){
	log("Usage: build [trec-files-directory-path] [index-type] [output-dir]");
	process.exit(1);
}
if( Object.keys(indexSettings).indexOf( indexType ) == -1 ){
	log("index-type: single, stem, phrase, positional")
	process.exit(1);
}

if (!fs.existsSync(outputDir)){
    fs.mkdirSync(outputDir);
}

JSSU.createRunningContainer({
	fileDir: docDir,
	settings: {
		"index_output_directory": outputDir,
		"inverted_index_type": indexType,
		"preprocessing_settings": indexSettings[ indexType ]
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
					string: $(this).find('TEXT').text()
				})

				_Container.DocumentSet.addDocument( Doc );
				Doc.createIndex();
			})
			// log( "Finish " + fn );
		}

		console.timeEnd("Read time");
	},
	function buildDocumentIndex(){
		console.time("Sequential Write Doc time")
		this.DocumentIndex = this.DocumentSet.toDocumentIndex()
		this.addEventChild( this.DocumentIndex );
		console.timeEnd("Sequential Write Doc time")
	},
	function buildInvertedIndex(){
		console.time("Merging time");

		log( "Start building index" )
		this.InvertedIndex = this.DocumentSet.toInvertedIndex()
		this.addEventChild( this.InvertedIndex );
		console.timeEnd("Merging time");
	},
	function FlushToDisk(){
		console.time("Flush time")
		this.InvertedIndex.finalize();
		this.DocumentIndex.finalize();
		console.timeEnd("Flush time")
	},
	function stopTotalTimer(){
		console.timeEnd("Total runtime")
	}
]).run()

