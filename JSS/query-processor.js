(function(root, factory){
	if (typeof define === 'function' && define.amd) {
		// for require js
		define(['exports', 'JSSConst', 'JSSU'], function(exports, JSSConst, JSSU) {
			root.JSSQueryProcessor = factory(root, JSSConst, JSSU, exports);
		});
	} else if (typeof exports !== 'undefined') {
		// for node js environment
		factory(root, require("./constants.js"), require("./utilities.js"), module.exports);
	} else {
		// for browser
		root.JSSQueryProcessor = factory(root, root.JSSConst, root.JSSU, {});
	}
}(this, function(root, JSSConst, JSSU , JSSQueryProcessor){

	JSSQueryProcessor = JSSQueryProcessor || {};

	// for debug
	var log = obj => console.log(JSON.stringify(obj, null, 2))
	
	var ToKey = function(v){ return (v instanceof Array?v:[...arguments]).join( JSSConst.TokenTypeSeparator ) };
	var DecodeTokenKey = key => ( key.split( JSSConst.TokenTypeSeparator ) )

	JSSQueryProcessor.Query = function(string, processor, config){
		this._processor = processor;
		this.config = config || {};

		this.df = {};
		this.idf = {};
		this.tf = {};
		this.ttf = {};

		this._cache = new Map();

		if( config.proximity === true && config.preprocess == true ){
			var tokenType = JSSConst.GetConfig("preprocessing_settings")
			for( let se of Object.keys(tokenType) ){ tokenType[ se ] = false; }
			tokenType["parse_single_term"] = true
			this.string = new JSSU.String( string, { tokenType: tokenType } );
		}
		else if( config.proximity === true && config.preprocess == false ){
			var tokenType = JSSConst.GetConfig("preprocessing_settings")
			for( let se of Object.keys(tokenType) ){ tokenType[ se ] = false; }
			tokenType["parse_phrase"] = true
			tokenType["phrase_accept_length"] = [ config.phrase_size ]
			this.string = new JSSU.String( string, { tokenType: tokenType } );
		}
		else {
			this.string = new JSSU.String( string, this.config );
		}

		// create term frequency list
		for( let token of this.getTokenIterator() ){
			this.tf[ ToKey(token.term, token.type) ] = token.post.length;
		}
	}
	JSSQueryProcessor.Query.prototype = {
		getTokenIterator: function*(){
			yield* this.string.getFlatIterator();
		},
		getKeyIterator: function*(){
			yield* this.tf.getIterator();
		},
		addDfByKey: function(df){
			var key = ToKey([...arguments].slice(1))
			df = parseInt(df);
			this.df[ key ] = df;
			// smoothed id
			this.idf[ key ] = Math.log( this._processor.documentCount - df + 0.5 ) - Math.log( df + 0.5 ) 
		},
		addTtfByKey: function(ttf){
			var key = ToKey([...arguments].slice(1))
			this.ttf[ key ] = parseInt(ttf);
		},
		getTf: function(){ return this.tf[ ToKey([...arguments]) ] || 0.5; },
		getDf: function(){ return this.df[ ToKey([...arguments]) ] || 0.5 },
		getiDf: function(){ 
			return this.idf[ ToKey([...arguments]) ] || 
					Math.log( this._processor.documentCount + 0.5 ) - Math.log( 0.5 ) ; 
		},
		getTtf: function(){ 
			return this.ttf[ ToKey([...arguments]) ] || 0.5;
		},


		cacheSimilarityData: function(key, value){
			if( value != undefined )
				this._cache.set(key, value);
			else{
				return this._cache.get(key);
			}
		},
		hasSimilarityData: function(key){
			return this._cache.has(key);
		},
		removeSimilarityData: function(key){
			this._cache.delete(key);
		}
	}
	Object.defineProperties( JSSQueryProcessor.Query.prototype, {
		tokens: {
			get: function(){ return this.string.tokenize(); }
		},
		length: {
			get: function(){ return this.tf.length }
		}
	} )

	JSSQueryProcessor.SearchResult = function(DocId){
		this._cache = new Map();
		this._TfSet = new Map();
		this._postingMatched = new Map();
		this.DocId = DocId;
	}
	JSSQueryProcessor.SearchResult.prototype = {
		addToken: function(tf){
			if( typeof(tf) == 'number' ){
				var argv = [...arguments].slice(1);
				this._TfSet.set( ToKey(argv), tf );
			}
			else {
				// send posting element directly
				this._postingMatched.set( ToKey([tf.Term, tf.Type]), tf);
				this._TfSet.set( ToKey([tf.Term, tf.Type]), tf.TermFreq );
			}
		},
		getKeyIterator: function*(){
			yield* this._TfSet.keys();
		},
		getTf: function(){
			return this._TfSet.get( ToKey( [...arguments] ) ) || 0.5;
		},

		cacheSimilarityData: function(key, value){
			if( value != undefined )
				this._cache.set(key, value);
			else{
				return this._cache.get(key);
			}
		},
		hasSimilarityData: function(key){
			return this._cache.has(key);
		},
		removeSimilarityData: function(key){
			this._cache.delete(key);
		}
	}
	Object.defineProperties(JSSQueryProcessor.SearchResult.prototype, {
		matchedSize: {
			get: function(){ return this._TfSet.size; }
		}
	})

	JSSQueryProcessor.SearchResultSet = function(processor, query){
		this._processor = processor;
		this._query = query
		// set of results
		this._set = new Map(); 
		// convert to array when sort 
		this._sorted = null;
	}
	JSSQueryProcessor.SearchResultSet.prototype = {
		// initializing
		addSearchResult: function(result){
			if( !(result instanceof JSSQueryProcessor.SearchResult) )
				return this.addSearchResult( new JSSQueryProcessor.SearchResult(result) );
			this._set.set( result.DocId, result );
		},
		// utilities
		toDocumentSet: function(){
			// convert to document set for further search
		},
		getIterator: function*(){
			if( this._sorted == null )
				yield* this._set;
			else{
				yield* this._sorted;
			}
		},
		findDoc: function(docId){
			// return rank and result instance
			// undefined if does not exists
			if( this._set.has(docId) )
				return {
					rank: this._sorted != null ? this._sorted.indexOf( this._set.get(docId) ) : undefined,
					result: this._set.get(docId)
				}
			return undefined;
		},

		// sort the docs
		rankBy: function(simMeasure){
			// bind similarity function
			// gives error if similarity does not exist
			var simMeasure = JSSQueryProcessor.Similarity[ simMeasure ].bind(this._processor.index, this._query); 

			this._sorted = [...this._set.values()]
			this._sorted.sort( simMeasure );
		},

		// after sorting
		top: function(count){
			if( this._sorted != null )
				return this._sorted.slice(0, count);
			return [];
		},
		rank: function(ind){
			// return result instance
			if( this._sorted != null )
				return this._sorted[ ind ];
			return undefined;
		},
		
	}
	JSSQueryProcessor.SearchResultSet.merge = function(){
		// for merging result sets when distributes engines
	}

	// Calculate similarity of query and document
	// input always takes query, doca, docb
	// and closure under inverted index
	JSSQueryProcessor.Similarity = {
		Cosine: function(query, doca, docb){
			if( !!doca.hasSimilarityData("CosineSimilarity") && !!docb.hasSimilarityData("CosineSimilarity") )
				return docb.cacheSimilarityData("CosineSimilarity") - doca.cacheSimilarityData("CosineSimilarity")

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

			doca.cacheSimilarityData("CosineSimilarity", scoreA);
			docb.cacheSimilarityData("CosineSimilarity", scoreB);

			return scoreB - scoreA;
		},
		BM25: function(query, doca, docb){
			// need tf and idf and count of document
			// average document length and length of each document
			// also need some hyper parameters
			if( !doca.hasSimilarityData("BM25Similarity") )
				doca.cacheSimilarityData("BM25Similarity", _BM25Score(query, doca) );
			if( !docb.hasSimilarityData("BM25Similarity") )
				docb.cacheSimilarityData("BM25Similarity", _BM25Score(query, docb) );
			return docb.cacheSimilarityData("BM25Similarity") - doca.cacheSimilarityData("BM25Similarity")
		},
		LM: function(query, doca, docb){
			// tf and document length
			// need # of terms in the entire collection -> length of inverted index
			// length of posting given term
			if( !doca.hasSimilarityData("LMSimilarity") )
				doca.cacheSimilarityData("LMSimilarity", _LM_DS_Score(query, doca) );
			if( !docb.hasSimilarityData("LMSimilarity") )
				docb.cacheSimilarityData("LMSimilarity", _LM_DS_Score(query, docb) );
			return docb.cacheSimilarityData("LMSimilarity") - doca.cacheSimilarityData("LMSimilarity")
		}
	}
	function _VSMWeights(query, doc){
		// save cache on instance
		// calculate query weights
		var queryWeights = {};
		if( query.hasSimilarityData("VSMCache") )
			queryWeights = query.cacheSimilarityData("VSMCache");
		else {
			var sqsum = 0;
			for( let key of query.getKeyIterator() ){
				queryWeights[ key ] = ( Math.log(query.getTf(key)) + 1 ) * query.getiDf(key);
				sqsum += queryWeights[ key ] * queryWeights[ key ];
			}
			for( let key of query.getKeyIterator() ){
				queryWeights[key] = queryWeights[key] / sqsum;
			}
			query.__VSMCache = queryWeights;
		}
		var docWeights = {};
		if( !!doc.hasSimilarityData("VSMCache") )
			docWeights = doc.cacheSimilarityData("VSMCache");
		else {
			var sqsum = 0;
			for( let key of doc.getKeyIterator() ){
				docWeights[ key ] = ( Math.log(doc.getTf(key)) + 1 ) * query.getiDf(key);
				sqsum += docWeights[ key ] * docWeights[ key ];
			}
			for( let key of doc.getKeyIterator() ){
				docWeights[key] = docWeights[key] / sqsum;
			}
			doc.__VSMCache = docWeights;
		}

		return {
			query: queryWeights,
			doc: docWeights
		}
	}
	function _BM25Score(query, doc){
		var index = query._processor.index;
		var avgdl = query._processor.avgdl;
		if( avgdl === undefined ){
			// calculate parameter
			avgdl = 0;
			for( let doc of Object.keys(index.meta.length) ){ avgdl += index.meta.length[doc] }
			avgdl = avgdl / Object.keys(index.meta.length).length;
			query._processor.avgdl = avgdl;
		}
		var param = JSSConst.GetConfig("query_settings","BM25_parameters")
		var K = param.k1 * ( 1 - param.b + param.b*index.meta.length[doc.DocId]/avgdl )
		var sum = 0;
		for( let key of query.getKeyIterator() ){
			sum += ( query.getiDf(key) * ( ((param.k1+1)*doc.getTf(key))/(doc.getTf(key)+K) *
					 					   (1+query.getTf(key)/(param.k2+query.getTf(key)))   ) );
		}
		return sum;
	}
	function _LM_DS_Score(query, doc){
		var index = query._processor.index;
		var collection_size = query._processor.collection_size;
		if( collection_size === undefined ){
			collection_size = 0;
			for( let doc of Object.keys(index.meta.length) ){ collection_size += index.meta.length[doc] }
			query._processor.collection_size = collection_size;
		}

		var mu = JSSConst.GetConfig("query_settings","LM_Dirichlet_mu");
		var sum = 0;
		for( let key of query.getKeyIterator() ){
			// log( doc.getTf(key) / index.meta.length[doc.DocId] )
			sum += Math.log( (doc.getTf(key) + mu*query.getTtf(key)/collection_size) / (index.meta.length[doc.DocId] + mu) )
		}
		return sum;
	}

	JSSQueryProcessor.LoadIndexHashTable = JSSU.LoadIndexHashTable;
	JSSQueryProcessor.QueryProcessor = function(index, config){
		if( !(index instanceof JSSU.IndexHashTable) ){
			var index = JSSU.LoadIndexHashTable.apply({}, index instanceof Array ? index : [index]);
		}

		this.index = index;
		this.index.load();

		this.config = config || {};
		this.config.similarity = this.config.similarity || JSSConst.GetConfig("query_settings","similarity_measure");
		this.config.query = {
			tokenType : this.index.configFromFile
		}
		this.documentCount = Object.keys(this.index.meta.length).length;
	}
	JSSQueryProcessor.QueryProcessor.prototype = {
		_retrieveDocs: function(query){

			var resultByTokens = [];
			for( let token of query.getTokenIterator() ){
				// get document list, df and tf
				var re = this.index.findTerm( token.term, true, token.type );
				if( !!re ){
					resultByTokens.push( re );
					query.addDfByKey( re.DocFreq, token.term, token.type);
				}
			}
			// then reverse to document-keyed version
			var resultByDocs = new JSSQueryProcessor.SearchResultSet(this, query);
			for( var i=0; i<resultByTokens.length; i++ ){
				var token = resultByTokens[i];
				var ttf = 0;
				for( var j=0; j<token.Posting.length; j++ ){
					if( resultByDocs.findDoc( token.Posting[j].DocumentId ) === undefined )
						resultByDocs.addSearchResult( token.Posting[j].DocumentId );
					resultByDocs.findDoc( token.Posting[j].DocumentId ).result.addToken( token.Posting[j] )

					// count tf under collection(ttf) for LM
					ttf += token.Posting[j].TermFreq;
				}
				query.addTtfByKey(ttf, token.Term, token.Type);
			}
			return resultByDocs;
		},
		search: function(query, config){
			var config = config || {};
			
			if( !(query instanceof JSSQueryProcessor.Query) )
				query = new JSSQueryProcessor.Query(query, this, this.config.query);
			
			// get document set
			var resultSet = this._retrieveDocs(query);
			
			// sort by similarity using sorting function and call similarity functions
			resultSet.rankBy( config.similarity || this.config.similarity );

			return resultSet;
		},
		proximitySearch: function(query, config){
			var config = config || {};
			// need to have phrase_size(int), max_dis(int) in config and gave default values before hand
			config.phrase_size = config.phrase_size || JSSConst.GetConfig("query_settings", "proximity_phrase_size");
			config.max_dis = config.max_dis || JSSConst.GetConfig("query_settings", "proximity_max_dis");
			config.sequence = config.sequence !== undefined ? config.sequence : JSSConst.GetConfig("query_settings", "proximity_sequence");
			config.proximity = true

			// create new query instance to find single term
			if( query instanceof JSSQueryProcessor.Query )
				query = query.string.getRawText();
			config.preprocess = true;
			query = new JSSQueryProcessor.Query(query, this, config);
			var rawResultSet = this._retrieveDocs(query);

			// --proximity search
			// change to phrase query
			config.preprocess = false
			query = new JSSQueryProcessor.Query(query.string.getRawText(), this, config);
			var phraseResultSet = new JSSQueryProcessor.SearchResultSet(this, query);


			for( let pair of rawResultSet.getIterator() ){

				var rawResult = pair[1];
				var phraseResult = new JSSQueryProcessor.SearchResult( rawResult.DocId );

				// get positional list
				for( let posting of rawResult._postingMatched ){
					posting[1].positionalList = this.index.getPositionListByOffset( posting[1].PositionPointer );
				}

				for( let key of query.getKeyIterator() ){
					var termList = DecodeTokenKey(key)[0].split(" "),
						pivot = termList[ termList.length - 1 ];
					if( rawResult._postingMatched.get(ToKey(pivot,"word")) === undefined )
						continue;

					// test every possible phrases
					var posList = rawResult._postingMatched.get(ToKey(pivot,"word")).positionalList,
						tfCounter = 0;

					for( let pos of posList ){
						if( config.sequence == true ){
							// with sequence
							var checkList = termList.slice(0,-1)
							for( var j=pos-config.max_dis; j<pos; j++ ){
								var pre = rawResult._postingMatched.get(ToKey(checkList[0],"word"));
								if( pre != undefined && pre.positionalList.indexOf(j) > -1 ){
									checkList.shift();
								}
							}
							if( checkList.length == 0 ) // matched
								tfCounter++;
						}
						else {
							// omit sequence
							for( var j=pos-config.max_dis; j<=pos; j++ ){
								var checkList = termList.slice(0);
								for( var k=j; k<=j+config.max_dis; k++ ){
									// check term
									for( let t of checkList ){
										var pre = rawResult._postingMatched.get(ToKey(t,"word"));
										if( pre != undefined && pre.positionalList.indexOf(k) > -1 ){
											checkList.splice( checkList.indexOf(t), 1 );
											break;
										}
									}
								}
								if( checkList.length == 0 )
									tfCounter++;
							}
						}
					}

					if( tfCounter > 0 ){
						phraseResult.addToken( tfCounter, key )
						query.addTtfByKey( query.getTtf( key ) + tfCounter, key);
						query.addDfByKey( query.getDf( key ) + 1, key );
					}

				}

				if( phraseResult.matchedSize > 0 ){
					phraseResultSet.addSearchResult( phraseResult );
				}
			}

			// sort by similarity using sorting function and call similarity functions
			phraseResultSet.rankBy( config.similarity || this.config.similarity );

			return phraseResultSet;
		},

	}

	return JSSQueryProcessor;

}))