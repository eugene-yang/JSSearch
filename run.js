var fs = require('fs')
var cheerio = require('cheerio')
var JSSU = require('./JSS/ir_utilities.js')	

var log = function(obj){ console.log(JSON.stringify(obj, null, 2)) }

var fileDir = "_data/BigSample/";

var docIndex = {}
var fn = "fr940104.2";

//fs.readdirSync(fileDir).forEach(function(fn){
	fs.readFile( fileDir + fn, 'utf8', function(err,data){
		// remove special chars
		JSSU.Const.SpecialChars.forEach(function(pair){
			data = data.replace(pair[0], pair[1]);
		})


		var $ = cheerio.load(data);

		$('DOC').eq(0).each(function(){
			var no = $(this).find('DOCNO').text().replace(" ", ""),
				text = new JSSU.String( $(this).find('TEXT').text() );
			//log( text.token );
			//log( [...text.getFlatIterator()] );
		})
	} )
//})






