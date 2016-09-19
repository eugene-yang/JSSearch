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
var text = new JSSU.String("haha.txt contains the information downloaded from livestream.com, which is sent to me from john.smith@aaa.bc.tw. It's about a 24-hour streaming video(started from 8/1/2016) link that can only be open on VLC. The stream info is in the file live.m3u8! This worth NTD$500.50!!!")
// var text = new JSSU.String("@include<haha>")
log( [...text.getFlatIterator()] );