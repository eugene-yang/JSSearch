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
	var log = obj => console.log(JSON.stringify(obj, null, 2))

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
					!!handler && handler.call(this, arg);
				}
			}
		}
	}

	//--------------- Basic Storage Classes ------------------

	// Singleton, universal buffer manager
	// TODO: Perform different buffer swapping policy base on current state, like writing/reading state
	JSSU.BufferPoolManager = {
		maxMemoryEntry: JSSConst.GetConfig("memory_limit") == -1 ? Infinity : JSSConst.GetConfig("memory_limit"),
		flushBunch: JSSConst.GetConfig("default_flush_bunch") || 100,
		flushPointer: 0, // perform round-robin
		bufferManagerList: [],
		entryCount: 0,
		addManager: function(managerInstance){
			this.bufferManagerList.push(managerInstance);
			var pool = this, 
				ind = this.bufferManagerList.length - 1;
			managerInstance.on("flush", function(num){
				pool.decrement(ind, num);
			});
			managerInstance.on("push", function(){
				pool.increment(ind, 1);
			})
			managerInstance.on("read", function(num){
				pool.increment(ind, num);
			})
			return ind;
		},
		removeManger: function(managerIndex){
			delete this.bufferManagerList[ managerIndex ];
		},
		increment: function(managerIndex, num){
			// if over limit, then ask first buffer manager to flush some slots
			this.entryCount += num;
			if( this.entryCount > this.maxMemoryEntry )
				this.askFlush();
		},
		decrement: function(managerIndex, num){
			this.entryCount -= num;
			log( "flush " + num + " remain " + this.entryCount);
		},
		askFlush: function(num){
			var remainFlushRequest = Math.max(num||0, this.flushBunch),
				deadCount = 0;
				// increase dead count when one buffer manager have no things to flush or pinned
			
			while( this.entryCount > this.maxMemoryEntry  ){
				var manager = this.bufferManagerList[ this.flushPointer ];
				this.flushPointer = ( this.flushPointer + 1 ) % this.bufferManagerList.length;

				if( deadCount == this.bufferManagerList.length ){
					// have gone through all buffer managers
					if( this.entryCount <= this.maxMemoryEntry )
						break;
					else {
						// dead lock detected
						// TODO: resolve dead lock by ask all manager to repin
						throw new Error("Dead lock detected")
					}
				}
				if( manager.isPinned() || manager.lengthInMemory == 0){
					deadCount++;
					continue;
				}

				if( manager.lengthInMemory > 0 && manager.lengthInMemory < remainFlushRequest ){
					remainFlushRequest -= manager.lengthInMemory;
					manager.flushAll();
					deadCount++;
				}
				else if( manager.lengthInMemory >= remainFlushRequest ){
					manager.flush( remainFlushRequest );
					break;
				}
			}
		},
		requestSpace: function(num, managerIndex){
			// If there empty slot is not enough, then ask flush
			if( this.entryCount + num >= this.maxMemoryEntry )
				this.askFlush(num, managerIndex);
		}
	}

	// Class for every document handler to create an instance
	// type: ("fixed", "varchar") default "fixed"
	// ext: file extension, default tmp
	JSSU.BufferManager = function(id, schema, type, ext){
		JSSU.Eventable.call(this);

		if( typeof(id) == "object" ){
			schema = id.schema, type = id.type, ext = id.ext;
			id = id.id;
		}
		ext = ext || "tmp";
		this.type = type || "fixed";

		// for fixed schema
		if( this.type == "fixed" ){
			this.schema = new JSSU.Schema( schema );
			this.bufferList = [];
			this.inMemoryFirstIndex = 0;
		}

		// for varchar
		if( this.type == "varchar" ){
			this.autoFlush = true; // for now
			this.inMemoryOffset = 0;
			this.inMemoryString = "";
			this.separator = JSSConst.VarCharSeparator;
		}

		// destruction settings
		this.deleteAtTheEnd = false;
		if( ext == "tmp" && JSSConst.GetConfig("preserve_temp_files") == false )
			this.deleteAtTheEnd = true;

		// register this instance to BufferPoolManager
		// TODO: only track fixed buffer manger at this time
		this.pinned = false;
		if( this.type == "fixed" ){
			this.managerIndex = JSSU.BufferPoolManager.addManager( this );
		}
		// initialize and open file pointer
		this.fnd = ((ext == "tmp") ? JSSConst.GetConfig("temp_directory") : "") + id + "." + ext;
		this.FD = fs.openSync( this.fnd, 'w+' )
	}
	JSSU.BufferManager.prototype = {
		toRealFile: function(fnd){
			this.deleteAtTheEnd = false;
			fs.renameSync( this.fnd, fnd );
			this.fnd = fnd;
		},
		destruct: function(){
			fs.closeSync( this.FD );
			if( this.deleteAtTheEnd )
				fs.unlinkSync( this.fnd );
		},

		// for memory operation
		_requestSpace: function(num){
			JSSU.BufferPoolManager.requestSpace(num);
		},
		_write: function(str, callback){
			fs.writeSync( this.FD, str );
		},
		pin: function(){
			this.pinned = true;
		},
		unpin: function(){
			this.pinned = false;
		},
		isPinned: function(){
			return this.pinned;
		},
		flush: function(num){
			if( this.type == "fixed" ){
				for( var i = 0; i<num; i++ ){
					this._write( this.schema.create(this.bufferList[ this.inMemoryFirstIndex + i ]) );
					delete this.bufferList[ this.inMemoryFirstIndex + i ]
				}
				this.inMemoryFirstIndex += num;
			}
			if( this.type == "varchar" ){
				this._write( this.inMemoryString.substring(0, num) );
				this.inMemoryString = this.inMemoryString.slice(num);
				this.inMemoryOffset += num;
			}
			this.fire("flush", num);
		},
		flushAll: function(){
			this.flush(this.lengthInMemory);
		},

		// fixed schema
		push: function(obj){
			if( this.type != "fixed" ) 
				throw new TypeError("Called push when BufferManager is not set as fixed")

			this.bufferList.push( obj );
			this.fire("push");
			return this.length - 1;
		},
		get: function(ind){
			// assume that there would be sequential access so load in advance
			var get = this.bufferList[ ind ];
			if( !get ){
				this.pin();
				var bunch = this.inMemoryFirstIndex - ind,
					schemaLength = this.schema.length;
				this._requestSpace( bunch );
				var buf = new Buffer( bunch * schemaLength );
				fs.readSync( this.FD, buf, 0, bunch * schemaLength, ind * schemaLength );
				
				buf = buf.toString();
				var counter = 0;
				while( buf.length > 0 ){
					this.bufferList[ ind + counter ] = this.schema.parse( buf.substring(0, schemaLength) );
					buf = buf.substring( schemaLength );
					counter++;
				}
				this.inMemoryFirstIndex = ind;
				get = this.bufferList[ ind ];
				this.fire("read", counter);
				this.unpin();
			}
			return get;
		},
		getIteratorFromHead: function* (){
			for( var i=0; i<this.length; i++ ){
				yield this.get( i );
			}
		},

		// varchar
		write: function(str){
			if( this.type != "varchar" ) 
				throw new TypeError("Called write when BufferManager is not set as varchar")

			// TODO: implement case when not auto flushing
			this.inMemoryString += ( str + this.separator );
			if( !!this.autoFlush )
				this.flushAll();

			return this.length - str.length;
		},
		fetch: function(offset){}
	}
	JSSU.BufferManager.extend( JSSU.Eventable );
	Object.defineProperties(JSSU.BufferManager.prototype, {
		length: { get: function(){ 
			if( this.type == "fixed" )
				return this.bufferList.length; 
			if( this.type == "varchar" )
				return this.inMemoryString.length + this.inMemoryOffset;
		} },
		lengthInMemory: { get: function(){
			if( this.type == "fixed" )
				return this.bufferList.length - this.inMemoryFirstIndex;
			if( this.type == "varchar" )
				return this.inMemoryString.length; 
		} },
	})

	JSSU.Schema = function(schema){
		this.schema = schema;
	}
	JSSU.Schema.prototype = {
		parse: function(string){
			var collect = {};
			for( let col of this.schema ){
				collect[ col.name ] = string.substring(0, col.length ).trim();
				if( col.type == "number" )
					collect[ col.name ] = parseFloat( collect[ col.name ] );
				string = string.substring( col.length );
			}
			return collect;
		},
		create: function(obj){
			var str = "";
			for( let col of this.schema ){
				str += ("" + ( obj[col.name] || "" )).fixLength( col.length );
			}
			return str;
		} 
	}
	Object.defineProperties(JSSU.Schema.prototype,{
		length: { 
			get: function(){ 
				if( !!this._len ) return this._len;
				var len = 0;
				for( let col of this.schema ){
					len += col.length;
				}
				return ( this._len = len );
			}
		}
	});

	// create global buffer manager instance for posting file
	var PostingListBufferManager = new JSSU.BufferManager({
		id: JSSConst.GetConfig("inverted_index_type"),
		schema: null,
		type: "varchar",
		ext: "posting"
	})
	PostingListBufferManager.createString = function(postingList){
		return postingList.join(",");
	}

	//---------------------- High Level Interface -----------------------


	JSSU.DocumentSet = function(){
		this.set = {};
		this._count = 0;
	}
	JSSU.DocumentSet.prototype = {
		addDocument: function(doc){
			if( !( doc instanceof JSSU.Document ) )
				throw new TypeError("Should be JSSU.Document")
			this.set[ doc.Id ] = doc;
			this._count++;
		},
		getIterator: function*(){
			yield* this.set.getIterator();
		},
		toInvertedIndex: function(){
			// drop document temp files along merging
			// output an JSSU.IndexedList object with entries all flushed
			// finalList.finalize()
		}
	}
	Object.defineProperties(JSSU.DocumentSet.prototype, {
		length: { get: function(){ return this._count; } }
	})

	JSSU.IndexedList = function(Id, target, config){
		// target accept both null or document instance
		target = target || null;

		this.Id = Id;
		this.config = config || {};
		this.config.tokenPosition = this.config.tokenPosition || JSSConst.GetConfig("default_index_with_position");

		if( target instanceof JSSU.Document ){
			this.Id = this.Id || target.Id;
			this.bufferManager = target.bufferManager;
		}
		else{
			this.bufferManager = new JSSU.BufferManager( Id, 
			!!this.config.tokenPosition ? JSSConst.IndexSchema.Position : JSSConst.IndexSchema.NoPosition );
		}
	}
	JSSU.IndexedList.soringFunction = function(a,b){
		if( a.type == b.type ){
			var ta = a.term.length > 32 ? md5( a.term ) : a.term,
				tb = b.term.length > 32 ? md5( b.term ) : b.term;
			return (ta < tb)*(-1) + 0.5;
		}
		return (a.type < b.type)*(-1) + 0.5;
	}
	JSSU.IndexedList.Merge =  function(lista, listb){
		var newList = new JSSU.IndexedList( md5( lista.Id + listb.Id ) ),
			Ita = lista.getIterator(), a = Ita.next(),
			Itb = listb.getIterator(), b = Itb.next(),
			movea = function(){ 
				newList.push(a.value); a = Ita.next(); 
			},
			moveb = function(){ 
				newList.push(b.value); b = Itb.next(); 
			};

		var compareSeq = ['Type', 'Term'];
		while( !a.done || !b.done ){
			if( a.done ) moveb();
			else if( b.done ) movea();
			else {
				var i=0;
				for( ; i<compareSeq.length; i++ ){
					if( a.value[ compareSeq[i] ] < b.value[ compareSeq[i] ] ){
						movea();
						break;
					}
					else if( b.value[ compareSeq[i] ] < a.value[ compareSeq[i] ] ){
						moveb();
						break;
					}
				}
				if( i == compareSeq.length ){
					// compare term frequency
					if( a.value.TermFreq > b.value.TermFreq )
						movea();
					else { moveb(); }
				}
			}
		}
		return newList;
	}
	JSSU.IndexedList.prototype = {
		finalize: function(){
			this.bufferManager.flushAll();
			this.bufferManager.toRealFile( 
				JSSConst.GetConfig("index_output_directory") + JSSConst.GetConfig("inverted_index_type") + ".index" );
		},
		getIterator: function*(){
			yield* this.bufferManager.getIteratorFromHead();
		},
		push: function(obj){
			this.bufferManager.push(obj);
		}
	}


	JSSU.Document = function(id, string, config){
		if( typeof(id) === "object" ){
			var string = id.string,
				config = id.config,
				id = id.id;
		}

		// read-only
		this.getId = () => id;

		// public
		this.config = config || {};
		this.config.tokenPosition = this.config.tokenPosition || JSSConst.GetConfig("default_index_with_position");

		this.String = new JSSU.String( string );
		this.bufferManager = new JSSU.BufferManager(id, 
			!!this.config.tokenPosition ? JSSConst.IndexSchema.Position : JSSConst.IndexSchema.NoPosition );
	}
	JSSU.Document.prototype = {
		createIndex: function(){
			// this will recursively call String object to perform tokenization
			var tokenList = [...this.String.getFlatIterator()];

			tokenList.sort(function(a,b){
				if( a.type == b.type ){
					var ta = a.term.length > 32 ? md5( a.term ) : a.term,
						tb = b.term.length > 32 ? md5( b.term ) : b.term;
					return (ta < tb)*(-1) + 0.5;
				}
				return (a.type < b.type)*(-1) + 0.5;
			})

			for( let item of tokenList ){
				// write posting list
				if( this.config.tokenPosition )
					var postPointer = PostingListBufferManager.write( PostingListBufferManager.createString(item.post) )
				// write entry
				this.bufferManager.push({
					"DocumentId": this.Id,
					"Type": item.type,
					"Term": item.term.length > 32 ? md5(item.term) : item.term,
					"TermFreq": item.post.length,
					"PositionPointer": postPointer
				})
			}
		},
		flushAll: function(){
			this.bufferManager.flushAll();
		}
	}
	Object.defineProperties(JSSU.Document.prototype, {
		Id: { get: function(){return this.getId();} }
	});


	JSSU.String = function(txt, config){
		// read-only
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
			this.tokens.rule.date = this.parseDate();
			// case j: IP addresses
			this.tokens.rule.ip = this.parseIP();
			// case g: Number
			this.tokens.rule.number = this.parseNumber();
			// case i: Email
			this.tokens.rule.email = this.parseEmail();
			// case h: File Extension : don't eat
			this.tokens.rule.exts = this.parseFileExtension();
			// case k: URL
			this.tokens.rule.url = this.parseURL();
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
					// Only use the date part, so set to GMT
					this._addPosition( res, (new Date(dat + " GMT")).toISOString(), [match.index, match.index + dat.length - 1] )
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








	 return JSSU;
}))