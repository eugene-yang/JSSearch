(function(root, factory){
	if (typeof define === 'function' && define.amd) {
		// for require js
		define(['exports', 'JSSConst', "stemmer", "md5"], function(exports, JSSConst, stemmer, md5) {
			root.JSSU = factory(root, JSSConst, null, stemmer, md5, exports);
		});
	} else if (typeof exports !== 'undefined') {
		// for node js environment
		var JSSConst = require("./constants.js");
		factory(root, JSSConst, require("fs"), require("stemmer"), require("md5"), module.exports);
	} else {
		// for browser
		root.JSSU = factory(root, root.JSSConst, null, stemmer, root.md5, {});
	}
}(this, function(root, JSSConst, fs, porterStemmer, md5, JSSU){
	JSSU = JSSU || {};

	JSSU.Const = JSSConst;

	// for debug
	var log = obj => console.log(JSON.stringify(obj, null, 2))

	//--------------- Basic Event Object ---------------------
	JSSU.Eventable = function(){
		this.__event__stack__ = {};
		this.__event__universal__listeners = [];
		this.__event__parent__ = null;
	}
	JSSU.Eventable.prototype = {
		addEventChild: function(child){
			if( child.__proto__.__super === JSSU.Eventable ){
				child.__event__parent__ = this;
			}
		},
		onAllEvents: function(callback){
			this.__event__universal__listeners.push( callback );
			return this.__event__universal__listeners.length - 1;
		},
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
			var eveObj = {
				event: event,
				target: this,
				argument: arg
			};
			this.__dispatch( eveObj, arg )
		},
		__dispatch: function(eveObj, arg){
			var goPropagate = true;
			eveObj.stopPropagation = function(){ goPropagate = false; }

			// invoke the specified event listeners first
			// then invoke the universal event listeners
			if( this.__event__stack__[eveObj.event] !== undefined ){
				for( let handler of this.__event__stack__[eveObj.event] ){
					!!handler && handler.call(this, eveObj, arg );
				}
			}
			for( let ul of this.__event__universal__listeners ){
				!!ul && ul.call(this, eveObj, arg );
			}
			if( goPropagate && !!this.__event__parent__ )
				this.__event__parent__.__dispatch(eveObj, arg);
		}
	}

	//--------------- Basic Storage Classes ------------------

	// Singleton, universal buffer manager
	// TODO: Perform different buffer swapping policy base on current state, like writing/reading state
	JSSU.BufferPoolManager = {
		tempDir: JSSConst.GetConfig("temp_directory"),
		maxMemoryEntry: JSSConst.GetConfig("memory_limit") == -1 ? Infinity : JSSConst.GetConfig("memory_limit"),
		flushBunch: JSSConst.GetConfig("default_flush_bunch") || 100,
		flushPointer: 0, // perform round-robin
		bufferManagerList: [],
		entryCount: 0,
		initialize: function(){
			// clear temp files
			try{ var files = fs.readdirSync( this.tempDir ) }
			catch( e ){ return false; }
			files.forEach(function(fn){
				if( fn.split(".")[1] == "tmp" )
					fs.unlinkSync( this.tempDir + "/" + fn );
			})
			this.bufferManager = [];
			this.flushPointer = 0;
			this.entryCount = 0;
		},
		clean: function(){
			// clean up all temp files by calling destruct method of each buffer manager
			// and delete if from bufferList, and call global.gc if it exists to collect garbage
		},
		addManager: function(managerInstance){
			this.bufferManagerList.push(managerInstance);
			var pool = this, 
				ind = this.bufferManagerList.length - 1;
			managerInstance.on("flush", function(event, num){
				pool.decrement(ind, num);
			});
			managerInstance.on("push", function(){
				pool.increment(ind, 1);
			})
			managerInstance.on("read", function(event, num){
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
			// log( "flush " + num + " remain " + this.entryCount);
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
				if( manager === undefined || manager.isPinned() || manager.lengthInMemory == 0){
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
			if( this.entryCount + num > this.maxMemoryEntry )
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
			this.writebufferList = [];
			this.readbufferList = [];
			this.readCounter = 0;
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
		this.fnd = ((ext == "tmp") ? JSSU.BufferPoolManager.tempDir : "") + id + "." + ext;
		this.FD = fs.openSync( this.fnd, 'w+' )
	}
	JSSU.BufferManager.prototype = {
		toRealFile: function(fnd){
			this.deleteAtTheEnd = false;
			fs.renameSync( this.fnd, fnd );
			this.fnd = fnd;
		},
		destroy: function(){
			try{
				fs.closeSync( this.FD );
				if( this.deleteAtTheEnd )
					fs.unlinkSync( this.fnd );
				JSSU.BufferPoolManager.removeManger( this.managerIndex );
			}
			catch(e){
				log( "closed already" )
				return;
			}
		},

		// for memory operation
		_requestSpace: function(num){
			JSSU.BufferPoolManager.requestSpace(num);
		},
		_write: function(str, offset, callback){
			if( this.FD == 6 ) debugger;
			if( offset )
				fs.writeSync( this.FD, str, offset, "utf8" );
			else{
				fs.writeSync( this.FD, str );
			}
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
		dropCache: function(ind){
			if( this.readbufferList[ind] !== undefined ){
				delete this.readbufferList[ ind ];
				this.readCounter--;
				this.fire("flush", 1);
				return true;
			}
			return false;
		},
		flush: function(num){
			if( this.type == "fixed" ){
				var deleteCounter = num;
				for( var j = 0; j<this.readbufferList.length && deleteCounter>0; j++ ){
					this.dropCache(j) && deleteCounter--;
				}
				var str = "";
				for( var i = 0; i<deleteCounter; i++ ){
					str += this.schema.create(this.writebufferList[ this.inMemoryFirstIndex + i ]);
					delete this.writebufferList[ this.inMemoryFirstIndex + i ]
				}
				this._write( str, this.schema.length * this.inMemoryFirstIndex );
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

			this._requestSpace(1);
			this.writebufferList.push( obj );
			this.fire("push");
			return this.length - 1;
		},
		get: function(ind){
			// assume that there would be sequential access so load in advance
			var get = this.writebufferList[ ind ] || this.readbufferList[ ind ];
			if( !get ){
				var nextReadCache = ind + 1;
				for( ; nextReadCache < this.readbufferList.length && this.readbufferList[ nextReadCache ] === undefined; nextReadCache++ ){}
				
				var bunch = Math.min( nextReadCache - ind, this.inMemoryFirstIndex - ind, JSSU.BufferPoolManager.flushBunch),
					schemaLength = this.schema.length;
				this._requestSpace( bunch );
				
				var buf = new Buffer( bunch * schemaLength );
				fs.readSync( this.FD, buf, 0, bunch * schemaLength, ind * schemaLength );
				
				buf = buf.toString();
				var counter = 0;
				while( buf.length > 0 ){
					this.readbufferList[ ind + counter ] = this.schema.parse( buf.substring(0, schemaLength) );
					buf = buf.substring( schemaLength );
					counter++;
				}
				get = this.readbufferList[ ind ];
				if( isNaN(get.TermFreq) )debugger;
				this.readCounter += counter;
				this.fire("read", counter);
			}
			return get;
		},
		getByOffset: function(offset){
			return this.get( Math.floor(offset / this.schema.length) );
		},
		getIteratorFromIndex: function*(ind){
			for( var i=ind; i<this.length; i++ ){
				var ret = this.get( i );
				this.dropCache( i )
				yield ret;
			}
		},
		getIteratorFromOffset: function*(offset){
			yield* this.getIteratorFromIndex(Math.floor(offset / this.schema.length));
		},
		getIteratorFromHead: function* (){
			yield* this.getIteratorFromIndex(0);
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
				return this.writebufferList.length; 
			if( this.type == "varchar" )
				return this.inMemoryString.length + this.inMemoryOffset;
		} },
		lengthInMemory: { get: function(){
			if( this.type == "fixed" )
				return this.writebufferList.length - this.inMemoryFirstIndex + this.readCounter;
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

	// create global buffer manager instance for position list file
	var PositionListBufferManager = new JSSU.BufferManager({
		id: JSSConst.GetConfig("inverted_index_type"),
		schema: null,
		type: "varchar",
		ext: "position"
	})
	PositionListBufferManager.createString = function(positionList){
		return positionList.join(",");
	}

	//---------------------- High Level Interface -----------------------


	JSSU.DocumentSet = function(){
		JSSU.Eventable.call(this);

		this.set = {};
		this._count = 0;
	}
	JSSU.DocumentSet.prototype = {
		addDocument: function(doc){
			if( !( doc instanceof JSSU.Document ) )
				throw new TypeError("Should be JSSU.Document")
			this.set[ doc.Id ] = doc;
			this.addEventChild( doc );
			this._count++;

			this.fire("documentAdded", doc);
		},
		toInvertedIndex: function(){
			// drop document temp files along merging
			// output an JSSU.IndexedList object with entries all flushed
			// finalList.finalize()
			var l = [];
			for( let id of this.getIterator() ){
				l.push( new JSSU.IndexedList(null, this.set[ id ]) );
			}
			// unlink all document instance so that the garbage collection can collect 
			// these along merging
			this.set = {};

			this.fire("mergingStarted", this.length);
			var combinedIndex = JSSU.IndexedList.Merge( l );
			this.fire("mergingDone");

			
			var indexHT = new JSSU.IndexHashTable( combinedIndex );
			indexHT.calculate();
			
			return {
				HashTable: indexHT,
				PostingList: combinedIndex
			}
		},
		getIterator: function*(){
			yield* this.set.getIterator();
		}
	}
	JSSU.DocumentSet.extend( JSSU.Eventable );

	Object.defineProperties(JSSU.DocumentSet.prototype, {
		length: { get: function(){ return this._count; } }
	})

	JSSU.IndexedList = function(Id, target, config){
		JSSU.Eventable.call(this);

		// target accept both null or document instance
		target = target || null;

		this.Id = Id;
		this.config = config || {};
		this.config.tokenPosition = this.config.tokenPosition || JSSConst.GetConfig("default_index_with_position");

		this.ext = "posting";

		if( target instanceof JSSU.Document ){
			this.Id = this.Id || target.Id;
			this.bufferManager = target.bufferManager;
		}
		else{
			this.bufferManager = new JSSU.BufferManager( Id, 
			!!this.config.tokenPosition ? JSSConst.IndexSchema.Position : JSSConst.IndexSchema.NoPosition );
		}
	}
	JSSU.IndexedList.Merge = function(unmerged){
		if( unmerged instanceof JSSU.IndexedList )
			unmerged = [...arguments];
		if( unmerged.length <= 1 )
			return unmerged[0] || null;
		var merged = [];
		while( unmerged.length > 0 ){
			if( unmerged.length == 1 )
				merged.push( unmerged.shift() );
			else {
				var a = unmerged.shift(), b = unmerged.shift();
				merged.push( JSSU.IndexedList.MergePair( a, b ) )
				a.destroy();
				b.destroy();
			}
		}
		return JSSU.IndexedList.Merge( merged );
	}
	JSSU.IndexedList.MergePair =  function(lista, listb){
		var newList = new JSSU.IndexedList( md5( lista.Id + listb.Id ) ),
			Ita = lista.createIterator(), a = Ita.next(),
			Itb = listb.createIterator(), b = Itb.next(),
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
			this.fire("finalizingStarted");
			this.bufferManager.flushAll();
			this.bufferManager.toRealFile( 
				JSSConst.GetConfig("index_output_directory") + JSSConst.GetConfig("inverted_index_type") + "." + this.ext );
			this.fire("finalizingDone");
		},
		destroy: function(){
			this.bufferManager.destroy();
		},
		createIterator: function*(){
			yield* this.bufferManager.getIteratorFromHead();
		},
		push: function(obj){
			this.bufferManager.push(obj);
			this.fire("itemAdded", obj);
		},
		createIteratorByIndex: function(ind){
			return this.bufferManager.getIteratorFromIndex(ind);
		},
		createIteratorByOffset: function(offset){
			return this.bufferManager.getIteratorFromOffset( offset );
		}
	}
	JSSU.IndexedList.extend( JSSU.Eventable );
	Object.defineProperties(JSSU.IndexedList.prototype, {
		schemaLength: {
			get: function(){ return this.bufferManager.schema.length; }
		}
	})

	JSSU.IndexHashTable = function(combinedIndex){
		JSSU.Eventable.call(this);

		this.combinedIndex = combinedIndex;
		this.bufferManager = new JSSU.BufferManager( "indexHT",  JSSConst.IndexSchema.HashTable );
		this.ext = "index";
		this.hashTable = {};
	}
	JSSU.IndexHashTable.prototype = {
		calculate: function(){
			var counter = 0;
			var postingHead = null,
				currentType = null,
				currentTerm = null,
				dfCounter = 0;

			this.fire("buildHashTableStarted")
			for( let item of this.combinedIndex.createIterator() ){
				if( currentType == null || item.Type != currentType || item.Term != currentTerm ){
					if( currentType != null ){ // push
						this.push({
							Type: currentType,
							Term: currentTerm,
							DocFreq: dfCounter,
							PostingPointer: postingHead * this.combinedIndex.schemaLength
						})
					}
					// new term
					postingHead = counter;
					currentType = item.Type;
					currentTerm = item.Term;
					dfCounter = 0;
				}
				dfCounter++;
				counter++;
			}
			this.fire("buildHashTableDone")
		},
		getPostingIteratorByOffset: function*(offset){
			var It = this.combinedIndex.createIteratorByOffset(offset);
			var opItem = It.next().value;
			yield opItem;
			for( let item of It ){
				if( item.Type != opItem.Type || item.Term != opItem.Term )
					break;
				yield item;
			}
		},
		load: function(){
			// load all entries into memory, if still under memory constraint,
			// then would have to perform sequential access
			
			// without memory constraint version
			this.hashTable = {};
			for( let item of this.createIterator() ){
				this.hashTable[ item.Type ] = this.hashTable[ item.Type ] || {};
				this.hashTable[ item.Type ][ item.Term ] = item;
			}
		}
	}
	JSSU.IndexHashTable.extend( JSSU.IndexedList );
	JSSU.IndexHashTable.extend( JSSU.Eventable );

	JSSU.Document = function(id, string, config){
		JSSU.Eventable.call(this);

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
					var postPointer = PositionListBufferManager.write( PositionListBufferManager.createString(item.post) )
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
	JSSU.Document.extend( JSSU.Eventable );
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

	// Maintain a true filter only if we want to exclude stop words
	// return true if the word is not on stop list
	if( JSSConst.GetConfig("exclude_stop_words") ){
		// load stop words
		var _stopList = fs.readFileSync( JSSConst.GetConfig("stop_word_list"), "utf8" ).split("\n");
		JSSU.stopFilter = (word) => { return _stopList.indexOf(word) == -1 }
	}
	else {
		JSSU.stopFilter = () => true;
	}

	// Maintain true stemmer if we want to use it
	if( JSSConst.GetConfig("apply_stemmer") ){
		JSSU.stemmer = (word) => { return porterStemmer(word) }
	}
	else {
		JSSU.stemmer = (word) => word;
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

		this.useStemmer = JSSConst.GetConfig("apply_stemmer");
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
					mix.push( { word: JSSU.stemmer(parts[0]), pos: [match.index, match.index + parts[0].length - 1] } )
				if( parts[1].length >= 3 )
					mix.push( { word: JSSU.stemmer(parts[1]), pos: [match.index + parts[0].length, match.index + elem.length - 1] } )

			}
			return mix;
		},
		parseGeneralWord: function(){
			var res = [],
				revisedText = this.txt.replace(/[\,\.\-_\!\?]/ig, "").replace(/[\///\(\)]/ig, " ");
			while( (match = JSSConst.RE.GeneralWord.exec(revisedText)) != null ){
				if( JSSU.stopFilter(match[0]) )
					res.push({word: JSSU.stemmer(match[0]), pos: [match.index, match.index + match[0].length -1 ]})
			}
			return res;
		}
	}

	// -------------------- Running Container -------------------------
	// For initialize running framework to let script can run in a full
	// initialized environment.

	JSSU.RunningContainer = function(config, callList){
		JSSU.Eventable.call(this);

		this.config = config || {};
		this.DocumentSet = new JSSU.DocumentSet();

		this.addEventChild( this.DocumentSet );

		this.callList = callList || [];
		this.__terminated__ = false
	}
	JSSU.RunningContainer.prototype = {
		__callDeep: function(pointer, preResult){
			if( this.__terminated__ )
				return false;

			this.fire("invokeCallFunction", 
				{index: pointer, name: this.callList[pointer].name, instance: this.callList[pointer]})
			if( pointer + 1 < this.callList.length ){
				return this.__callDeep(pointer+1, this.callList[pointer].call(this,preResult) )
			}
			else {
				return this.callList[pointer].call(this, preResult);
			}
		},
		run: function(arg){
			return this.__callDeep(0, arg);
		},
		terminate: function(){
			this.__terminated__ = true;
		}
	}
	JSSU.RunningContainer.extend( JSSU.Eventable );

	JSSU.createRunningContainer = function(config, callList){
		// function version of creating RunningContainer
		return new JSSU.RunningContainer(config, callList);
	}

	return JSSU;
}))