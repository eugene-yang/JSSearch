var JSSU = require('./JSS/ir_utilities.js')
var log = function(obj){ console.log(JSON.stringify(obj, null, 2)) }

// var text = new JSSU.String("I want to go to https://www.google.com/webhp?sourceid=chrome-instant&rlz=1C1CHZL_zh-TWTW699;;TW699&ion=1&espv=2&ie=UTF-8#q=regular+expres;;sion+special+ascii and http://www.facebook.com");
// var text = new JSSU.String("I'm a Ph.D Student enrolled in PhD program in Georgetown University");
// var text = new JSSU.String("For more information, please check www.google.com/?aaa=123");
// var text = new JSSU.String("my domain tv.com is at ip 6.6.6.6 and 8.8.8.8");
// var text = new JSSU.String("my email is eugene@leadinfo.com.tw with money 1,333,555.32 and 13154.32 and 45687 and 789789.00");
// var text = new JSSU.String("10/12/1992   10-10-2016   November 25 '99   Jan-10-1992   Apr-44-5555  10-12-'16  October 12 th 1992");
// var text = new JSSU.String("I-20 i-20 Alpha-GO CDC-50 1-hour asdklfj ewkrjkrq;lkda hahaha")
// var text = new JSSU.String("haha.txt 100.00 live.m3u8")
// var text = new JSSU.String("J.F. Kennedy have haha.txt contains the information downloaded from livestream.com, which is sent to me from john.smith@aaa.bc.tw. It's about a 24-hour streaming video(started from 8/1/2016) link that can only be open on VLC. The stream info is in the file live.m3u8! This worth NTD$500.50!!!")
// var text = new JSSU.String("@include<haha>")
// log( [...text.getFlatIterator()] );


// var fs = require("fs");
// fw = fs.createWriteStream("./test.tmp");
// fw.write("aaa");
// fw.write("bbb");
// fw.end();
 
// var sch = new JSSU.Schema( JSSU.Const.IndexSchema.NoPosition );
// console.log( sch.create({
// 	DocumentId: "haha-123",
// 	Type: "word",
// 	Term: "good",
// 	Count: 12
// }) )



// var Inda = new JSSU.IndexedList( Doca.Id, Doca ),
// 	Indb = new JSSU.IndexedList( Docb.Id, Docb ),
// 	Indc = new JSSU.IndexedList( Docc.Id, Docc ),
// 	Indd = new JSSU.IndexedList( Docd.Id, Docd );


// var ivin = JSSU.IndexedList.Merge( Inda, Indb, Indc, Indd );
// ivin.finalize();
// log( JSSU.BufferPoolManager.entryCount )
// log( ivin.bufferManager.writebufferList )
// log( ivin.bufferManager.readbufferList )
// log( ivin.bufferManager.length );
// log( ivin.bufferManager.inMemoryFirstIndex )
// log( ivin.bufferManager.get(17) );

module.exports = JSSU.createRunningContainer({},[
	function loadDocuments(fnList){
		var Doca = new JSSU.Document({
			id: 1,
			string: "Google.com is really a good htc site and a good and good consider to be nice"
		})
		Doca.createIndex()
		this.DocumentSet.addDocument(Doca)

		var Docb = new JSSU.Document({
			id: 2,
			string: "I have a google glass and a HTC Vive consideration is good"
		})
		Docb.createIndex()
		this.DocumentSet.addDocument(Docb)

		var Docc = new JSSU.Document({
			id: 3,
			string: "aaaaaa bbbbbbbbbbbbbb i-20 a considers"
		})
		Docc.createIndex()
		this.DocumentSet.addDocument(Docc)

		var Docd = new JSSU.Document({
			id: 4,
			string: "bbcc aaaaaa considered"
		})
		Docd.createIndex()
		this.DocumentSet.addDocument(Docd)
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