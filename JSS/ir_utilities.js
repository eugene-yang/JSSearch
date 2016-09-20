(function(root, factory){
	if (typeof define === 'function' && define.amd) {
		// for require js
		define(['exports', 'JSSConst', "md5"], function(exports, JSSConst, md5) {
			root.JSSU = factory(root, JSSConst, null, md5, exports);
		});
	} else if (typeof exports !== 'undefined') {
		// for node js environment
		var JSSConst = require("./constants.js");
		factory(root, JSSConst, require("fs"), require("md5"), module.exports);
	} else {
		// for browser
		root.JSSU = factory(root, root.JSSConst, null, root.md5, {});
	}
}(this, function(root, JSSConst, fs, md5, JSSU){
	JSSU = JSSU || {};

	JSSU.Const = JSSConst;

	// for debug
	var log = function(obj){ console.log(JSON.stringify(obj, null, 2)) }

	// Basic Event Object
	JSSU.Eventable = function(){
		this.__event__stack__ = {};
	}
	JSSU.Eventable.prototype = {
		on: function(event, callback){
			this.__event__stack__[event] = this.__event__stack__[event] || [];
			this.__event__stack__[event].push( callback );
			return this.__event__stack__[event].length - 1;
		},
		off: function(event, key){
			if( !!key ) delete this.__event__stack__[event];
			else {
				for( var i=0; i<this.__event__stack__[event].length; i++ ){
					if( this.__event__stack__[event][i] === key ) delete this.__event__stack__[event][i];
				}
			}
		},
		fire: function(event, arg){
			if( !!this.__event__stack__[event] ){
				for( let handler of this.__event__stack__[event] ){
					!!handler && handler(arg);
				}
			}
		}
	}

	// Class for every document handler to create an instance
	// type: ("fixed", "varchar") default "fixed"
	// ext: file extension, default .tmp
	JSSU.BufferManager = function(id, schema, type, ext){
		JSSU.Eventable.call(this);

		if( typeof(id) == "object" ){
			schema = id.schmea, type = id.type, ext = id.ext;
			id = id.id;
		}

		this.inMemoryFirstIndex = 0;
		this.nextIndex = 0;

		// register this instance to BufferPoolManager
		// ...
		// initialize and open file pointer
		// ...
	}
	JSSU.BufferManager.prototype = {
		destruct: function(){
			this.flushAll();
		},

		// for memory operation
		flush: function(num){},
		flushAll: function(){},

		// fixed schema
		push: function(){},
		get: function(ind){},

		// varchar
		write: function(){},
		fetch: function(offset){}
	}
	JSSU.BufferManager.extend( JSSU.Eventable );
	Object.defineProperties(JSSU.BufferManager.prototype, {
		length: { get: function(){ return this.nextIndex; } },
		lengthInMemory: { get: function(){ return this.nextIndex - this.inMemoryFirstIndex; } }
	})


	// create global buffer manager instance for posting file
	var PostingListBufferManager = new JSSU.BufferManager({
		id: JSSConst.GetConfig("index_output_filename"),
		schema: null,
		type: "varchar",
		ext: "posting"
	})

	JSSU.Document = function(id, string, config){
		// private
		this.getId = () => id;

		// public
		this.config = config || {};
		this.String = new JSSU.String( string );
		this.bufferManager = new JSSU.bufferManager(id, 
			!!this.config.tokenPosition ? JSSConst.IndexSchema.Position : JSSConst.IndexSchema.NoPosition );
	}
	JSSU.Document.prototype = {
		createIndex: function(){
			for( let item of this.String.getFlatIterator() ){
				// write posting list
				
				// write entry
				this.bufferManager.push({
					"DocumentId": this.Id,
					"Type": item.type,
					"Term": item.term.length > 32 ? md5(item.term) : item.term,
					"Count": item.post.length,
					"PositionPointer": item.post
				})
			}
		}
	}
	Object.defineProperties(JSSU.Document.prototype, {
		Id: { get: function(){return this.getId();} }
	});


	JSSU.String = function(txt, config){
		// private
		this.getRawText = () => txt;

		// public
		this.config = config || {};
		this._cache = {};
	}
	JSSU.String.prototype = {
		tokenize: function(){
			if( typeof this._cache.token === 'undefined' )
				this._cache.token = JSSU.tokenize(this.text, this.config.tokenType)
			return this._cache.token;
		},
		getFlatIterator: function*(obj, type){
			obj = obj || this.token;
			type = type || "null"
			for( let item of obj.getIterator() ){
				if( obj[item] instanceof Array ){
					yield {
						type: type,
						term: item,
						post: obj[item]
					}
				}
				else{
					yield* this.getFlatIterator( obj[item], item );
				}
			}
		}
	}
	Object.defineProperties(JSSU.String.prototype, {
		text: {
			get: function(){ return this.getRawText(); }
		},
		token: {
			get: function(){ return this.tokenize(); }
		}
	})

	JSSU.eatSet = function(){
		this._set = [];
	}
	JSSU.eatSet.prototype = {
		push: function(match){
			this._set.push( [match.index, match.index+match[0].length-1] );
		},
		getRemain: function(text){
			var ntext = "";
			this._set.sort(function(a,b){ return a[0]-b[0]; })

			start = 0
			for(i=0; i<this._set.length; i++){
				leng = this._set[i][0] - start;
				ntext += text.substr(start, leng);
				start = this._set[i][1] + 1;
			}
			ntext += text.substr(start);
			return ntext;
		}
	}

	/** 
	 * Factory Function of tokenizer
	 * @param  {orignal text}
	 * @param  {type of tokenizer}
	 * @return {array of string token}
	 */
	JSSU.tokenize = function(txt, type){
		// TODO: add more different type of tokenizer
		var tokens = {};
		switch(type){
			default:
				tokens = (new JSSU.DefaultTokenizer(txt)).run();
		}
		return tokens;
	}
	JSSU.DefaultTokenizer = function(txt){
		this.txt = txt.replace(/[\n\r|\n|\n\r]+/g, " ").toLowerCase();
		this.tokens = { word: {}, rule: {}, terms: {} };
	}
	JSSU.DefaultTokenizer.prototype = {
		_increment: function(target, list){
			if(typeof list === 'undefined') return ;
			!Array.isArray(list) && ( list = [list] );
			list.forEach(function(elem){
				typeof target[elem] === 'undefined' ? (target[elem] = 1) : (target[elem]++);
			})
		},
		_addPosition: function(target, key, obj){
			// this method accepts list of {word, pos} 
			// obj accept either position, which is a pair(array) of number for [start,end] index,
			// or regex.exec result object
			if( typeof(obj) === 'undefined' && key instanceof Array ){
				l = key;
				for( i=0; i<l.length; i++ ){
					this._addPosition( target, l[i].word, l[i].pos );
				}
			}
			else {
				position = obj
				if( !!obj.index )
					position = [ obj.index, obj.index + obj[0].length - 1 ]

				if( !(target[key] instanceof Array) )
					target[key] = [];
				target[key].push(position);
			}
		},
		_eatTxt: function(eatSet){
			//this.txt = this.txt.substr(0, start) + this.txt.substr( start + leng - 1 );
			//this.txt = eatSet.getRemain(this.txt);
		},
		run: function(){
			// run all type identifiers in proper sequence

			// case f: Date
			this.tokens.rule.Date = this.parseDate();
			// case j: IP addresses
			this.tokens.rule.IP = this.parseIP();
			// case g: Number
			this.tokens.rule.Number = this.parseNumber();
			// case i: Email
			this.tokens.rule.Email = this.parseEmail();
			// case h: File Extension : don't eat
			this.tokens.rule.exts = this.parseFileExtension();
			// case k: URL
			this.tokens.rule.URL = this.parseURL();
			// case c,d,e: Hyphenated terms
			this._addPosition(this.tokens.word, this.parseHyphenatedTerms());
			// case a and general word parser
			this._addPosition(this.tokens.word, this.parseGeneralWord());

			return this.tokens;	
		},
		parseURL: function(){
			eatSet = new JSSU.eatSet();
			var res = {
				URL: {},
				protocol: {}, server: {}
			}
			while( (match=JSSConst.RE.URL.general.exec(this.txt)) != null ){
				url = match[0];
				this._addPosition(res.URL, url, [match.index, match.index + url.length - 1]);
				while( (p = JSSConst.RE.URL.Protocol.exec(url) ) !== null ){
					p = p[0].replace("://", "")
					this._addPosition(res.protocol, p, [match.index, match.index + p.length - 1]);
				}
				while( (s = JSSConst.RE.URL.Server.exec(url)) !== null )
					this._addPosition(res.server, s[0], [match.index + s.index, match.index + s.index + s[0].length - 1])

				eatSet.push(match)
			}
			this._eatTxt(eatSet);
			
			return res;
		},
		parseIP: function(){
			res = {}
			eatSet = new JSSU.eatSet();
			while( (match=JSSConst.RE.IP.v4.exec(this.txt)) != null ){
				ip = match[0]
				sp = ip.split('.');					
				if( sp.length == 4){
					check = true;
					sp.forEach(function(num,i){
						if( i==0 && parseInt(num) == 0 ) check = false;
						if( parseInt(num) < 0 || parseInt(num) > 254 ) check = false;
					})
					check && ( this._addPosition(res, ip, match), eatSet.push(match) );
				}
			}
			this._eatTxt(eatSet);

			return res;
		},
		parseEmail: function(){
			var res = { address: {}, username: {}, server: {} },
				eatSet = new JSSU.eatSet();
			while( (match = JSSConst.RE.Email.exec(this.txt)) != null ){
				add = match[0];
				this._addPosition( res.address, add, match );
				sp = add.split("@");
				this._addPosition( res.username, sp[0], [match.index, match.index + sp[0].length - 1] )
				this._addPosition( res.server, sp[1], [match.index + sp[0].length + 1, match.index + sp[0].length + sp[1].length] )
				eatSet.push( match )
			}
			this._eatTxt(eatSet);
			return res;
		},
		parseFileExtension: function(){
			var res = {},
				eatSet = new JSSU.eatSet();
			while( (match = JSSConst.RE.FileExtension.exec(this.txt)) != null ){
				var fn = match[0].split(".");
				this._addPosition( res, fn[1], [match.index + fn[0].length, match.index + match[0].length - 1 ] )
				eatSet.push( match )
			}
			// don't eat the word, save for url parsing
			//this._eatTxt(eatSet);

			return res;
		},
		parseNumber: function(){
			var res = {},
				eatSet = new JSSU.eatSet();
			while( (match = JSSConst.RE.Number.exec(this.txt)) != null ){
				this._addPosition( res, parseFloat(match[0].replace(/[^(\d|\.)]/g,"")), match );
				eatSet.push(match);
			}
			this._eatTxt(eatSet);
			return res;
		},
		parseDate: function(){
			var res = {},
				eatSet = new JSSU.eatSet();
			while( (match = JSSConst.RE.Date.exec(this.txt)) != null ){
				dat = match[0];
				(/\d\s?(st|nd|th)/).test(dat) && ( dat = dat.replace(/(st|nd|th)/, "") );
				if( !isNaN(Date.parse(dat)) ){
					this._addPosition( res, (new Date(dat)).toISOString(), [match.index, match.index + dat.length - 1] )
					eatSet.push( match )
				}
			}
			this._eatTxt(eatSet);

			return res;
		},
		parseHyphenatedTerms: function(){
			var rawTerms = this.txt.match( JSSConst.RE.Hyphenated ) || [],
				mix = [];

			while( (match = JSSConst.RE.Hyphenated.exec(this.txt)) != null ){
				elem = match[0];
				// mix.push({ word: elem.replace("-",""), pos: [match.index, match.index + elem.length - 1] });
				parts = elem.split("-")
				if( parts[0].length >= 3 )
					mix.push( { word: parts[0], pos: [match.index, match.index + parts[0].length - 1] } )
				if( parts[1].length >= 3 )
					mix.push( { word: parts[1], pos: [match.index + parts[0].length, match.index + elem.length - 1] } )

			}
			return mix;
		},
		parseGeneralWord: function(){
			var res = [],
				revisedText = this.txt.replace(/[\,\.\-_\!\?]/ig, "").replace(/[\///\(\)]/ig, " ");
			while( (match = JSSConst.RE.GeneralWord.exec(revisedText)) != null ){
				res.push({word: match[0], pos: [match.index, match.index + match[0].length -1 ]})
			}
			return res;
		}
	}



	// TODO: Add methods for non-nodejs environment
	JSSU.Buffer = function(){

	}

	// Singleton, universal buffer manager
	// handling the memory constraint by round robin
	JSSU.BufferPoolManager = {
		maxMemoryEntry: JSSConst.GetConfig("memory_limit") == -1 ? Infinity : JSSConst.GetConfig("index_output_filename"),
		bufferManagerList: [],
		bufferCount: 0,
		addManager: function(managerInstance){

			// return index
		},
		increment: function(managerIndex){
			// if over limit, then ask first buffer
		},
		decrement: function(managerIndex, num){
			// 
		}
	}






	 return JSSU;
}))