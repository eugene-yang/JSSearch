var fs = require('fs')
var cheerio = require('cheerio')
var JSSU = require('./JSS/ir_utilities.js')
var JSSConst = require('./JSS/constants.js')

var log = console.log.bind(console);

var fileDir = "_data/BigSample/";

var docIndex = {}
var fn = "fr940104.2";

//fs.readdirSync(fileDir).forEach(function(fn){
	fs.readFile( fileDir + fn, 'utf8', function(err,data){
		// remove special chars
		JSSConst.SpecialChars.forEach(function(pair){
			data = data.replace(pair[0], pair[1]);
		})


		var $ = cheerio.load(data);

		$('DOC').eq(0).each(function(){
			var no = $(this).find('DOCNO').text(),
				text = new JSSU.String( $(this).find('TEXT').text() );
			//log( text.text );
			text.token;
		})
	} )
//})






