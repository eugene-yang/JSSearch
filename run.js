var fs = require('fs'),
	cheerio = require('cheerio'),
	JSSU = require('./JSS/ir_utilities.js');

var log = function(obj){ console.log(JSON.stringify(obj, null, 2)) }

var fileDir = "_data/BigSample/";

var executFlag = 0;
console.time("Runtime");

var fn = "fr940810.0";

// TODO: Split each document into independent files

// fs.readdirSync(fileDir).forEach(function(fn){
	executFlag++;
	var data = fs.readFileSync( fileDir + fn, 'utf8' );

	log( "Handling " + fn );

	// remove special chars
	JSSU.Const.SpecialChars.forEach(function(pair){
		data = data.replace(pair[0], pair[1]);
	})

	var $ = cheerio.load(data);

	$('DOC').eq(0).each(function(){

		var Doc = new JSSU.Document({
			id: $(this).find('DOCNO').text().replace(/\s/g, ""),
			string: $(this).find('TEXT').text()
		})
		Doc.createIndex();

		log( Doc.bufferManager.get(8) );

		// var no = $(this).find('DOCNO').text().replace(" ", ""),
		// 	text = new JSSU.String( $(this).find('TEXT').text() );
		// log( text.text );
		// log( [...text.getFlatIterator()] );
	})


	log( "Finish " + fn );

// })

console.timeEnd("Runtime");





