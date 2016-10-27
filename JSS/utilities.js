(function(root, factory){
	if (typeof define === 'function' && define.amd) {
		// for require js
		define(['exports', 'JSSConst', "stemmer", "sha256"], function(exports, JSSConst, stemmer, sha256) {
			root.JSSU = factory(root, JSSConst, null, stemmer, sha256, exports);
		});
	} else if (typeof exports !== 'undefined') {
		// for node js environment
		var JSSConst = require("./constants.js");
		factory(root, JSSConst, require("fs"), require("stemmer"), require("sha256"), module.exports);
	} else {
		// for browser
		root.JSSU = factory(root, root.JSSConst, null, stemmer, root.sha256, {});
	}
}(this, function(root, JSSConst, fs, porterStemmer, sha256, JSSU){
	JSSU = JSSU || {};

	JSSU.Const = JSSConst;

	// for debug
	var log = obj => console.log(JSON.stringify(obj, null, 2))

	//------------------ Basic Event Object ---------------------
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

	//------------------ Basic Storage Classes ------------------

	// Singleton, universal buffer manager
	// TODO: Perform different buffer swapping policy base on current state, like writing/reading state
	JSSU.BufferPoolManager = {
		tempDir: JSSConst.GetConfig("temp_directory"),
		maxMemoryEntry: JSSConst.GetConfig("memory_limit") == -1 ? Infinity : JSSConst.GetConfig("memory_limit"),
		flushBunch: JSSConst.GetConfig("default_flush_bunch") || 100,
		flushPointer: 0, // perform round-robin
		bufferManagerList: [],
		entryCount: 0,
		initialize: function(config){
			this.clean();

			this.bufferManager = [];
			this.flushPointer = 0;
			this.entryCount = 0;

			// read customized config
			if( config && typeof(config) === "object"){
				this.maxMemoryEntry = config.memoryLimit || this.maxMemoryEntry;
				this.flushBunch = config.flushBunch || this.flushBunch;
			}
		},
		clean: function(){
			// clean up all temp files by calling destruct method of each buffer manager
			// and delete if from bufferList, and call global.gc if it exists to collect garbage
			 
			// close all exist buffer manager
			for( let manager of this.bufferManagerList ){
				manager && manager.destroy && manager.destroy();
			}

			var tempDir = this.tempDir;
			try{ var files = fs.readdirSync( tempDir ) }
			catch( e ){ return false; }
			files.forEach(function(fn){
				if( fn.split(".")[1] == "tmp" )
					fs.unlinkSync( tempDir + "/" + fn );
			})

			global.gc && global.gc();
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
			fnd = id.fnd, load = id.load;
			parent = id.parent;
			id = id.id;
		}

		var load = !!load || false
		var ext = ext || "tmp";
		this.type = type || "fixed";

		this._parent = parent || undefined;

		if( load == true ){
			this.READONLY = true
			this.deleteAtTheEnd = false;

			// check main file existence
			try {
				this.FD = fs.openSync(fnd, "r")
			} catch(e){
				throw new Error("Index file does not exist", fnd)
			}
			// check schema file
			try {
				var settings = JSON.parse( fs.readFileSync(fnd + ".schema", "utf8") );
				this.schema = new JSSU.Schema( settings.schema );
				this.cacheConfig = settings.config;
				this.type = "fixed"
				this.inMemoryFirstIndex = fs.fstatSync(this.FD).size / this.schema.length;
				this.writebufferList = new Array( this.inMemoryFirstIndex );
			} catch(e){
				this.type = "varchar"
				this.inMemoryOffset = fs.fstatSync(this.FD).size;
			}
			// check meta data file
			try {
				var meta = JSON.parse( fs.readFileSync(fnd + ".meta", "utf8") );
				this._meta = meta;
				if( !!this._parent )
					this._parent.meta = this._meta;
			} catch(e){}
		}
		else{
			this.READONLY = false

			// destruction settings
			this.deleteAtTheEnd = false;
			if( ext == "tmp" && JSSConst.GetConfig("preserve_temp_files") == false )
				this.deleteAtTheEnd = true;

			// initialize and open file pointer
			this.fnd = ((ext == "tmp") ? JSSU.BufferPoolManager.tempDir : "") + id + "." + ext;
			this.FD = fs.openSync( this.fnd, 'w+' )
		}

		this.pinned = false;

		// for fixed schema
		if( this.type == "fixed" ){
			this.schema = this.schema || new JSSU.Schema( schema );
			this.writebufferList = this.writebufferList || [];
			this.readbufferList = [];
			this.readCounter = 0;
			this.inMemoryFirstIndex = this.inMemoryFirstIndex || 0;

			// register this instance to BufferPoolManager
			this.managerIndex = JSSU.BufferPoolManager.addManager( this );
		}

		// for varchar
		if( this.type == "varchar" ){
			this.autoFlush = true; // for now
			this.inMemoryOffset = this.inMemoryOffset || 0;
			this.inMemoryString = "";
			this.separator = JSSConst.VarCharSeparator;
			this.defaultReadChunck = JSSConst.GetConfig("default_varchar_read_chunck");
		}
	}
	JSSU.BufferManager.prototype = {
		toRealFile: function(fnd){
			this.deleteAtTheEnd = false;
			fs.renameSync( this.fnd, fnd );
			this.fnd = fnd;
			this.outputSchema();
		},
		outputSchema: function(){
			if( this.type == "fixed" )
				this.schema.toRealFile(this.fnd + ".schema");
		},
		destroy: function(){
			try{
				fs.closeSync( this.FD );
				if( this.deleteAtTheEnd && this.READONLY == false )
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
			if( this.READONLY === true ){
				// prevent from altering existing index files
				throw new Error("Buffer on READONLY mode", this.fnd)
			}

			// prevent special ascii encoding 
			// http://stackoverflow.com/questions/150033/regular-expression-to-match-non-english-characters
			str = str.replace(/[^\x00-\x7F]/ig, "?");

			if( offset )
				fs.writeSync( this.FD, str, offset, "utf8" );
			else{
				fs.writeSync( this.FD, str );
			}
		},
		_read: function(offset, len){
			var buf = new Buffer( len );
			fs.readSync( this.FD, buf, 0, len, offset );	
			return buf.toString();
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
				this._write( this.inMemoryString.substring(0, num), this.inMemoryFirstIndex );
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
				for( ; nextReadCache < this.length && this.readbufferList[ nextReadCache ] === undefined; nextReadCache++ ){}
				if( nextReadCache < this.length ) nextReadCache = Infinity
				
				var bunch = Math.min( nextReadCache - ind, this.inMemoryFirstIndex - ind, JSSU.BufferPoolManager.flushBunch),
					schemaLength = this.schema.length;
				this._requestSpace( bunch );
				
				var buf = this._read( ind * schemaLength, bunch * schemaLength )
				var counter = 0;
				while( buf.length > 0 ){
					this.readbufferList[ ind + counter ] = this.schema.parse( buf.substring(0, schemaLength) );
					buf = buf.substring( schemaLength );
					counter++;
				}
				get = this.readbufferList[ ind ];
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
				if( ret === undefined ) break;
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
		fetch: function(offset){
			if( this.type != "varchar" )
				throw new TypeError("Called fetch when BufferManager is not set as varchar")

			var str = "";
			while( true ){
				str += this._read( offset, this.defaultReadChunck );
				if( str.have( this.separator ) ){
					str = str.split( this.separator )[0];
					return str;
				}
			}
		}
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
		toRealFile: function(fnd){
			var FD = fs.openSync( fnd, 'w+' )
			fs.writeSync( FD, JSON.stringify({
				schema: this.schema,
				config: {
					"parse_single_term": JSSConst.GetConfig("parse_single_term"),
					"exclude_stop_words": JSSConst.GetConfig("exclude_stop_words"),
					"apply_stemmer": JSSConst.GetConfig("apply_stemmer"),
					"parse_phrase": JSSConst.GetConfig("parse_phrase"),
					"phrase_accept_length": JSSConst.GetConfig("phrase_accept_length"),
					"parse_special_term": JSSConst.GetConfig("parse_special_term"),
					"default_index_with_position": JSSConst.GetConfig("default_index_with_position")
				}
			}) )
			fs.close(FD)
		},
		hasField: function(field){
			for( let ent of this.schema ){
				if( ent.name == field )
					return true
			}
			return false;
		},
		parse: function(string){
			string = string.replace("\n","");
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
				if( obj[col.name] === 0 ) obj[col.name] = "0";
				str += ("" + ( obj[col.name] || "" )).fixLength( col.length );
			}
			return str + "\n";
		} 
	}
	Object.defineProperties(JSSU.Schema.prototype,{
		length: { 
			get: function(){ 
				if( !!this._len ) return this._len;
				var len = 1;
				for( let col of this.schema ){
					len += col.length;
				}
				return ( this._len = len );
			}
		}
	});

	// create global buffer manager instance for position list file
	function positionListBufferManagerGlobalMethods(){
		JSSU.PositionListBufferManager = JSSU.PositionListBufferManager || {}
		JSSU.PositionListBufferManager.createString = function(positionList){
			return positionList.join(",");
		}
		JSSU.PositionListBufferManager.parseString = function(string){
			var rawList = string.split(",");
			var ret = [];
			while(rawList.length > 0){
				ret.push( [ parseInt(rawList.shift()), parseInt(rawList.shift()) ] );
			}
			return ret;
		}
	}
	JSSU.createPositionListBufferManager = function(){
		JSSU.PositionListBufferManager = new JSSU.BufferManager({
			id: JSSConst.GetConfig("inverted_index_type"),
			schema: null,
			type: "varchar",
			ext: "position"
		})
		positionListBufferManagerGlobalMethods()
	}
	positionListBufferManagerGlobalMethods()
	

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

			this.meta = {};

			this.fire("documentAdded", doc);
		},
		toInvertedIndex: function(){
			// drop document temp files along merging
			// output an JSSU.IndexedList object with entries all flushed
			// finalList.finalize()
			var l = [];
			this.meta.length = {};
			for( let id of this.getIterator() ){
				l.push( new JSSU.IndexedList(null, this.set[ id ]) );
				this.meta.length[ id ] = this.set[id].tokenCount;
			}
			// unlink all document instance so that the garbage collection can collect 
			// these along merging
			this.set = {};

			this.fire("mergingStarted", this.length);
			var combinedIndex = JSSU.IndexedList.Merge( l );
			this.fire("mergingDone");

			
			var indexHT = new JSSU.IndexHashTable( combinedIndex, this.meta );
			indexHT.calculate();
			
			return indexHT;
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
		else if( typeof(target) === "string" ){
			// file name
			this.bufferManager = new JSSU.BufferManager({ fnd: target, load: true })
			this.config.tokenPosition = this.bufferManager.schema.hasField("PositionPointer");
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
		var newList = new JSSU.IndexedList( sha256( lista.Id + listb.Id ) ),
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
			var fnd = JSSConst.GetConfig("index_output_directory") + JSSConst.GetConfig("inverted_index_type") + "." + this.ext;
			this.fire("finalizingStarted");
			if( this.combinedIndex ) this.combinedIndex.finalize();
			this.bufferManager.flushAll();
			this.bufferManager.toRealFile( fnd );

			// write metaData
			if( !!this.meta ){
				var FD = fs.openSync( fnd + ".meta", 'w+' )
				fs.writeSync( FD, JSON.stringify(this.meta) )
				fs.close(FD)
			}

			this.fire("finalizingDone");
		},
		destroy: function(){
			this.bufferManager.destroy();
		},
		getIterator: function*(){
			yield* this.bufferManager.getIteratorFromHead();
		},
		push: function(obj){
			this.bufferManager.push(obj);
			this.fire("itemAdded", obj);
		},
		getIteratorByIndex: function*(ind, withSameWord, validation){
			if( !withSameWord )
				yield* this.bufferManager.getIteratorFromIndex( ind );
			else{
				yield* this._iterateWithinSameWord( this.bufferManager.getIteratorFromIndex( ind ), validation );	
			}
		},
		getIteratorByOffset: function*(offset, withSameWord, validation){
			// default withSameWord is false
			if( !withSameWord )
				yield* this.bufferManager.getIteratorFromOffset( offset );
			else{
				yield* this._iterateWithinSameWord( this.bufferManager.getIteratorFromOffset( offset ), validation );			
			}
		},
		_iterateWithinSameWord: function*(it, validation){
			var headItem = it.next();
			for( var i=0; i<10 && !headItem.done && headItem.value.Term != validation; i++ ){
				headItem = it.next();
				log( headItem.value.Term );
				log( validation )
				log( headItem.value.Term != validation );
			}
			headItem = headItem.value;
			yield headItem;
			for( let item of it ){
				if( item.Type != headItem.Type || item.Term != headItem.Term )
					break;
				yield item;
			}
		}
	}
	JSSU.IndexedList.extend( JSSU.Eventable );
	Object.defineProperties(JSSU.IndexedList.prototype, {
		schemaLength: {
			get: function(){ return this.bufferManager.schema.length; }
		},
		meta: {
			get: function(){ return this.bufferManager._meta || this._meta; }
		}
	})

	JSSU.LoadIndexHashTable = function(prefixName, dir){
		var dir = dir || ".";
		return new JSSU.IndexHashTable({
			mainFnd: dir + "/" + prefixName + ".index",
			postingFnd: dir + "/" + prefixName + ".posting",
			positionFnd: dir + "/" + prefixName + ".position"
		})
	}

	JSSU.IndexHashTable = function(combinedIndex, metaData){
		JSSU.Eventable.call(this);

		

		if( !( combinedIndex instanceof JSSU.IndexedList ) ){
			// specified everything
			var config = combinedIndex;
			this.bufferManager = new JSSU.BufferManager({ fnd: config.mainFnd, load:true, parent: this })
			this.combinedIndex = new JSSU.IndexedList(null, config.postingFnd );
			try {
				this.positionListBufferManager = new JSSU.BufferManager({ fnd: config.positionFnd, load:true })
			} catch(e){
				this.positionListBufferManager = null;
			}
		}

		this._meta = metaData || null;

		this.combinedIndex = this.combinedIndex || combinedIndex;
		this.bufferManager = this.bufferManager || new JSSU.BufferManager( "indexHT",  JSSConst.IndexSchema.HashTable );
		this.ext = "index";
		this.hashTable = {};
		this.hashedEntryCounter = 0;
		this.positionListBufferManager = this.positionListBufferManager || JSSU.PositionListBufferManager;
	}
	JSSU.IndexHashTable.prototype = {
		calculate: function(){
			var counter = 0;
			var postingHead = 0,
				currentType = null,
				currentTerm = null
				//dfCounter = 0;

			this.fire("buildInvertedIndexStarted")
			for( let item of this.combinedIndex.getIterator() ){
				if( item.Type !== currentType || item.Term !== currentTerm ){
					if( counter > 0 ){ // push
						if( isNaN(postingHead * this.combinedIndex.schemaLength) )debugger;
						this.push({
							Type: currentType,
							Term: currentTerm,
							DocFreq: counter - postingHead,
							PostingPointer: postingHead * this.combinedIndex.schemaLength
						})
					}
					// new term
					postingHead = counter;
					currentType = item.Type;
					currentTerm = item.Term;
					//dfCounter = 0;
				}
				//dfCounter++;
				counter++;
			}
			this.fire("buildInvertedIndexDone")
		},
		load: function(){
			// load all entries into memory, if still under memory constraint,
			// then would have to perform sequential access
			
			// without memory constraint version
			this.fire("buildHashTableStarted")
			this.hashTable = { 'word':{}, 'phrase': {} };
			this.hashedEntryCounter = 0;
			for( let item of this.getIterator() ){
				this.hashTable[ item.Type ] = this.hashTable[ item.Type ] || {};
				this.hashTable[ item.Type ][ item.Term ] = item;
				this.hashedEntryCounter++;
			}
			this.fire("buildHashTableDone")
		},
		getPostingListIteratorByOffset: function*(offset, validation){
			yield* this.combinedIndex.getIteratorByOffset( offset, true, validation )
		},
		findTerm: function(term, withPosting, type){
			var found = null
			if( this.hashedEntryCounter > 0 ){
				// by hash table
				if( type === undefined )
					found = this.hashTable['word'][ term ] || this.hashTable['phrase'][ term ];
				else {
					found = this.hashTable[type][term] || this.hashTable['word'][ term ] || this.hashTable['phrase'][ term ];
				}
			}
			else {
				// by sequential search
				for( let item of this.getIterator() ){
					if( item.Type == type && item.Term == term){
						found = item;
						break;
					}
					else if( type === undefined && (item.Type == "word" || item.Type == "phrase") && item.Term == term ){
						found = item;
						break;
					}
				}
			}

			if( found != null ){
				if( withPosting === true ){
					// get posting list
					found.Posting = [...this.getPostingListIteratorByOffset( found.PostingPointer, found.Term )];
				}
				else {
					delete found.Posting;
				}
				return found;
			}
		},
		getPositionListByOffset: function(offset){
			return JSSU.PositionListBufferManager.parseString( this.positionListBufferManager.fetch(offset) )
		},
		getPositionListByTermDocument: function(term, documentId, type){
			var termNode = this.findTerm(term, true, type);
			if( termNode === null ) return null;
			for( var i=0; i<termNode.Posting.length; i++ ){
				if( termNode.Posting[i].DocumentId === documentId ){
					if( !termNode.Posting[i].PositionPointer )
						return null;
					return this.getPositionListByOffset( termNode.Posting[i].PositionPointer )
				}
			}
		},
		getIterator: function*(){
			yield* this.bufferManager.getIteratorFromHead();
		},
		get: function(ind){
			return this.bufferManager.get(ind);
		}
	}
	JSSU.IndexHashTable.extend( JSSU.IndexedList );
	JSSU.IndexHashTable.extend( JSSU.Eventable );
	Object.defineProperties(JSSU.IndexHashTable.prototype, {
		configFromFile: {
			get: function(){
				return this.bufferManager.cacheConfig;
			}
		}
	})

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
		this.tokenCount = 0;
		this.bufferManager = new JSSU.BufferManager(id, 
			!!this.config.tokenPosition ? JSSConst.IndexSchema.Position : JSSConst.IndexSchema.NoPosition );

	}
	JSSU.Document.prototype = {
		createIndex: function(){
			// this will recursively call String object to perform tokenization
			var tokenList = [...this.String.getFlatIterator()];

			tokenList.sort(function(a,b){
				if( a.type == b.type ){
					var ta = a.term.length > 64 ? sha256( a.term ) : a.term,
						tb = b.term.length > 64 ? sha256( b.term ) : b.term;
					return (ta < tb)*(-1) + 0.5;
				}
				return (a.type < b.type)*(-1) + 0.5;
			})

			for( let item of tokenList ){
				// write posting list
				if( this.config.tokenPosition )
					var postPointer = JSSU.PositionListBufferManager.write( JSSU.PositionListBufferManager.createString(item.post) )
				// write entry
				if( item.term.length > 64 ) log(item.term.length + ": hashed")
				this.bufferManager.push({
					"DocumentId": this.Id,
					"Type": item.type,
					"Term": item.term.length > 64 ? sha256(item.term) : item.term,
					"TermFreq": item.post.length,
					"PositionPointer": postPointer
				})
				this.tokenCount++;
			}
			//log( this.bufferManager.writebufferList )
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

	var _stopList = fs.readFileSync( JSSConst.GetConfig("stop_word_list"), "utf8" ).split("\n");
	var stopRegExp = new RegExp("\\W((" + _stopList.join("|") + ")\\W)+|("+ ["\\,","\\.","\\!","\\?"].join("|") +")", "ig")
	JSSU.stopFilter = (word) => { return _stopList.indexOf(word) == -1 }
	
	JSSU.stemmer = (word) => { return porterStemmer(word) }


	/** 
	 * Factory Function of tokenizer
	 * @param  {orignal text}
	 * @param  {type of tokenizer}
	 * @return {array of string token}
	 */
	JSSU.tokenize = function(txt, type, config){
		// TODO: add more different type of tokenizer
		var tokens = {};
		switch(type){
			default:
				tokens = (new JSSU.DefaultTokenizer(txt, config)).run();
		}
		return tokens;
	}
	JSSU.DefaultTokenizer = function(txt, config){
		this.txt = txt.replace(/[\n\r|\n|\n\r]+/g, " ").toLowerCase();
		this.tokens = { word: {}, rule: {}, phrase: {} };

		this.config = config || {};

		var settingList = ["parse_single_term","exclude_stop_words","apply_stemmer","parse_phrase","phrase_accept_length","parse_special_term"]

		for( let se of settingList ){
			this.config[se] = this.config[se] === undefined ? JSSConst.GetConfig(se) : this.config[se];
		}
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

			if( this.config["parse_phrase"] ){
				this._addPosition( this.tokens.phrase, this.parsePhrase() )
				//log( this.tokens.phrase );
			}

			if( this.config["parse_special_term"] ){
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
			}

			if( this.config["parse_single_term"] || this.config["apply_stemmer"] ){
				// case a and general word parser
				this._addPosition(this.tokens.word, this.parseGeneralWord());
			}

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
					mix.push( { 
						word: this.config["apply_stemmer"] ? JSSU.stemmer(parts[0]) : parts[0], 
						pos: [match.index, match.index + parts[0].length - 1] 
					} )
				if( parts[1].length >= 3 )
					mix.push( { 
						word: this.config["apply_stemmer"] ? JSSU.stemmer(parts[1]) : parts[1], 
						pos: [match.index + parts[0].length, match.index + elem.length - 1] 
					} )

			}
			return mix;
		},
		parseGeneralWord: function(){
			var res = [],
				revisedText = this.txt.replace(/[\,\.\-_\!\?]/ig, "").replace(/[\///\(\)]/ig, " ");
			while( (match = JSSConst.RE.GeneralWord.exec(revisedText)) != null ){
				if( !this.config["exclude_stop_words"] || JSSU.stopFilter(match[0]) )
					res.push({
						word: this.config["apply_stemmer"] ? JSSU.stemmer(match[0]) : match[0], 
						pos: [match.index, match.index + match[0].length -1 ]
					})
			}
			return res;
		},
		parsePhrase: function(){
			// not implement positional index
			var res = [];
			var pieces = this.txt.replace( stopRegExp, "\u001f" ).split("\u001f").filter((word) => !!word.length)
			
			for( var i=0; i<pieces.length; i++ ){
				pieces[i] = pieces[i].split(" ").filter((word) => !!word.length)
			}

			for( let len of this.config["phrase_accept_length"] ){
				for( let piece of pieces ){
					if( piece.length < len ) continue;
					for( var i=len-1; i<piece.length; i++ ){
						var word = piece.slice( i-len+1, i+1 ).join(" "),
							m = word.match(/[\\\/@#\*\^-_\[\]\{\}\|\+\=&%~]|[0-9]/g );
						if( !m || m.length == 0)
							res.push({word: word, pos: [-1,-1]})
					}
				}
			}
			return res;
		}
	}

	//------------------------ Query Processing -------------------------
	
	var TokenTypeToKey = ( token, type ) => (token + JSSConst.TokenTypeSeparator + type);
	var DecodeTokenKey = key => ( {"Token": key.split(JSSConst.TokenTypeSeparator)[0], "Type": key.split(JSSConst.TokenTypeSeparator)[1] } )

	JSSU.Query = function(string, processor, config){
		this._processor = processor;
		this.config = config || {};

		this.df = {};
		this.idf = {};
		this.tf = {};

		this.string = new JSSU.String( string );
		
		// create term frequency list
		for( let token of this.getIterator() ){
			this.tf[ TokenTypeToKey(token.term, token.type) ] = token.post.length;
		}
	}
	JSSU.Query.prototype = {
		getIterator: function*(){
			yield* this.string.getFlatIterator();
		},
		addDfByKey: function(key, df){
			this.df[ key ] = df;
			this.idf[ key ] = Math.log( this._processor.documentCount - df + 0.5 ) - Math.log( df + 0.5 ) 
		}
	}
	Object.defineProperties( JSSU.Query.prototype, {
		tokens: {
			get: function(){ return this.string.tokenize(); }
		},
		length: {
			get: function(){ return this.tf.length }
		}
	} )

	JSSU.QueryProcessor = function(index, config){
		if( !(index instanceof JSSU.IndexHashTable) )
			throw new TypeError("index should be JSSU.IndexHashTable");

		this.index = index;
		this.index.load();

		this.config = config || {};
		this.config.similarity = this.config.similarity || JSSConst.GetConfig("similarity_measure");
		this.config.query = {
			tokenType : this.index.configFromFile
		}
		this.documentCount = Object.keys(this.index.meta.length).length;
	}
	JSSU.QueryProcessor.prototype = {
		search: function(query, config){
			var config = config || {};

			if( !(query instanceof JSSU.Query) )
				query = new JSSU.Query(query, this, this.config.query);

			// bind similarity function
			// gives error if similarity does not exist
			var simMeasure = JSSU.Similarity[ config.similarity || this.config.similarity ].bind(this.index, query); 

			var resultByTokens = [];
			for( let token of query.getIterator() ){
				// get document list, df and tf
				var re = this.index.findTerm( token.term, true, token.type );
				if( !!re ){
					resultByTokens.push( re );
					query.addDfByKey( TokenTypeToKey(token.term, token.type), re.DocFreq );
				}
			}
			// then reverse to document-keyed version
			var resultByDocs = {};
			for( var i=0; i<resultByTokens.length; i++ ){
				var token = resultByTokens[i];
				for( var j=0; j<token.Posting.length; j++ ){
					if( !resultByDocs[ token.Posting[j].DocumentId ] )
						resultByDocs[ token.Posting[j].DocumentId ] = {};
					resultByDocs[ token.Posting[j].DocumentId ][ TokenTypeToKey(token.Term, token.Type) ] = token.Posting[j];
				}
			}
			var docList = [];
			for( let docId of resultByDocs.getIterator() ){
				docList.push({ DocumentId: docId, tokens: resultByDocs[docId] })
			}
			// sort by similarity using sorting function and call similarity functions
			docList.sort( simMeasure );

			return docList;
		},
	}

	// Calculate similarity of query and document
	// input always takes query, doca, docb
	// and closure under inverted index
	JSSU.Similarity = {
		Cosine: function(query, doca, docb){
			if( !!doca.__CosineSimilarityCache && !!docb.__CosineSimilarityCache )
				return docb.__CosineSimilarityCache - doca.__CosineSimilarityCache

			// need tf and idf(in query)
			var docaWeights = _VSMWeights(query, doca).doc,
				docbWeights = _VSMWeights(query, docb).doc,
				queryWeights = _VSMWeights(query, doca).query;

			var keys = Object.keys( queryWeights );

			var scoreA = 0,
				scoreB = 0,
				sqQuery = 0,
				sqA = 0,
				sqB = 0;
			keys.forEach(function(key){
				scoreA += queryWeights[key] * docaWeights[key] || 0;
				scoreB += queryWeights[key] * docbWeights[key] || 0;
				sqQuery += queryWeights[key] * queryWeights[key] || 0;
				sqA += docaWeights[key] * docaWeights[key] || 0;
				sqB += docbWeights[key] * docbWeights[key] || 0;
			})
			scoreA = scoreA / ( Math.sqrt(sqQuery*sqA) );
			scoreB = scoreB / ( Math.sqrt(sqQuery*sqB) );

			doca.__CosineSimilarityCache = scoreA;
			docb.__CosineSimilarityCache = scoreB;

			return scoreB - scoreA;
		},
		BM25: function(query, doca, docb){
			// need tf and idf and count of document
			// average document length and length of each document
			// also need some hyper parameters
		},
		LM: function(query, doca, docb){
			// tf and document length
			// need # of terms in the entire collection -> length of inverted index
			// length of positing given term
		}
	}
	function _VSMWeights(query, doc){
		// save cache on instance
		// calculate query weights
		var queryWeights = {};
		if( !!query.__VSMCache )
			queryWeights = query.__VSMCache;
		else {
			var sqsum = 0;
			for( let key of query.tf.getIterator() ){
				queryWeights[ key ] = ( Math.log(query.tf[key]) + 1 ) * query.idf[ key ] || 0;
				sqsum += queryWeights[ key ] * queryWeights[ key ];
			}
			for( let key of query.tf.getIterator() ){
				queryWeights[key] = queryWeights[key] / sqsum;
			}
			query.__VSMCache = queryWeights;
		}
		var docWeights = {};
		if( !!doc.__VSMCache )
			docWeights = doc.__VSMCache;
		else {
			var sqsum = 0;
			for( let key of doc.tokens.getIterator() ){
				docWeights[ key ] = ( Math.log(doc.tokens[key].TermFreq) + 1 ) * query.idf[ key ] || 0;
				sqsum += docWeights[ key ] * docWeights[ key ];
			}
			for( let key of doc.tokens.getIterator() ){
				docWeights[key] = docWeights[key] / sqsum;
			}
			doc.__VSMCache = docWeights;
		}

		return {
			query: queryWeights,
			doc: docWeights
		}
	}

	// ----------------------- Running Container ------------------------
	// For initialize running framework to let script can run in a full
	// initialized environment.

	JSSU.DoneCounter = function(whenDone, closure){
		this._counter = 0;
		this.whenDone = whenDone;
		this._savedClosure = closure;
		this.stillAdding = true;
	}
	JSSU.DoneCounter.prototype = {
		add: function(){ this._counter++; },
		noMore: function(){
			this.stillAdding = false;
			this._realCheck()
		},
		check: function(){
			this._counter--;
			this._realCheck()
		},
		_realCheck: function(){
			if( this._counter == 0 && !this.stillAdding )
				this.whenDone.call(this._savedClosure);
		}
	}

	JSSU.RunningContainer = function(config, callList){
		JSSU.Eventable.call(this);

		this.config = config || {};
		this.DocumentSet = new JSSU.DocumentSet();

		this.addEventChild( this.DocumentSet );

		this.callList = callList || [];
		this.__terminated__ = false
	}
	JSSU.RunningContainer.prototype = {
		__init: function(){
			JSSU.createPositionListBufferManager();
			JSSU.BufferPoolManager.initialize(this.config.memory || null);
		},
		destroy: function(){
			JSSU.PositionListBufferManager.destroy();
			JSSU.BufferPoolManager.clean();
		},
		setConfig: function(config){
			for( let key of config.getIterator() ){
				this.config[key] = config[key]
			}
		},
		__callDeep: function(pointer, preResult){
			if( this.__terminated__ )
				return false;

			this.fire("invokeCallFunction", 
				{index: pointer, name: this.callList[pointer].name, instance: this.callList[pointer]})

			var _this = this;
			var currentResult = this.callList[pointer].call(this,preResult);

			if( pointer + 1 < this.callList.length ){
				if( currentResult instanceof Promise ){
					currentResult.then(function(data){
						_this.__callDeep(pointer+1, data )
					}, function(err){
						console.error(err);
					})
				}
				else {
					return this.__callDeep(pointer+1, currentResult )
				}
			}
			else {
				return currentResult;
			}
		},
		async: function(runnable){
			var _this = this;
			return new Promise(function(resolve, reject){
				runnable.call(_this, resolve, reject);
			},function(reason){
				throw Error(reason);
			})
		},
		createCounter: function(callback){ return new JSSU.DoneCounter(callback, this) },
		run: function(arg, callback){
			if( arg instanceof Function ){
				callback = arg;
				delete arg;
			}
			if( callback instanceof Function ){
				this.callList.push( function finalCallback(){ callback.apply(this, arguments) } )
			}

			this.__init();
			return this.result = this.__callDeep(0, arg);
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