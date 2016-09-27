var fs = require('fs'),
	cheerio = require('cheerio'),
	JSSU = require('./JSS/ir_utilities.js');

var log = function(obj){ console.log(typeof(obj) == "string" ? obj : JSON.stringify(obj, null, 2)) }

var fileDir = "_data/BigSample/";

var executFlag = 0;
console.time("Read time");

// var fn = "fr940810.0";

// TODO: Split each document into independent files

var Documents = new JSSU.DocumentSet();

fs.readdirSync(fileDir).forEach(function(fn){
	executFlag++;
	var data = fs.readFileSync( fileDir + fn, 'utf8' );

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
		Doc.createIndex();

		Documents.addDocument( Doc );
	})


	log( "Finish " + fn );

})

console.timeEnd("Read time");

console.time("Merging time");

log( "Start building index" )
var invertedIndex = Documents.toInvertedIndex()
console.timeEnd("Merging time");

console.time("Flush time")
invertedIndex.HashTable.finalize();
invertedIndex.PostingList.finalize();
console.timeEnd("Flush time")






