var fs = require('fs'),
	cheerio = require('cheerio'),
	JSSU = require('./JSS/ir_utilities.js'),
	execTimer = require("execTimer");

var log = function(obj){ console.log(JSON.stringify(obj, null, 2)) }

var fileDir = "_data/BigSample/";

var executFlag = 0;
console.time("Runtime");

fs.readdirSync(fileDir).forEach(function(fn){
	executFlag++;
	fs.readFile( fileDir + fn, 'utf8', function(err,data){

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

			// var no = $(this).find('DOCNO').text().replace(" ", ""),
			// 	text = new JSSU.String( $(this).find('TEXT').text() );
			// log( text.text );
			// log( [...text.getFlatIterator()] );
		})

		log( "Finish " + fn );

		if( --executFlag === 0 ) done()
	} )
})


function done(){
	console.timeEnd("Runtime");
}





