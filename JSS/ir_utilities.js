(function(root, factory){
	if (typeof define === 'function' && define.amd) {
		// for require js
		define(['exports', 'JSSConst'], function(exports, JSSConst) {
			root.JSSU = factory(root, JSSConst, exports);
		});
	} else if (typeof exports !== 'undefined') {
		// for node js environment
		var JSSConst = require("./constants.js");
		factory(root, JSSConst, exports);
	} else {
		// for browser
		root.JSSU = factory(root, root.JSSConst,{});
	}
}(this, function(root, JSSConst, JSSU){
	JSSU = JSSU || {};

	// for debug
	var log = function(obj){ console.log(JSON.stringify(obj, null, 2)) }

	// define JS utility methods
	Array.prototype.dense = function(){
		var l = [];
		for( i=0; i<this.length; i++ ){ typeof this[i] === 'undefined' && l.push(this[i]) }
		return l;
	}

	JSSU.String = function(txt, config){
		this.config = config || {};
		this._cache = {};

		// true private
		var _text = txt;
		this.getRawText = function(){ return _text; }
	}
	JSSU.String.prototype = {
		tokenize: function(){
			if( typeof this._cache.token === 'undefined' )
				this._cache.token = JSSU.tokenize(this.text, this.config.tokenType)
			return this._cache.token;
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
		log( tokens )
		// tokens = txt.split(/[\s|!\W]+/);
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
		run: function(){
			// run all type identifiers in proper sequence

			// case k: URL
			this.tokens.rule.URL = this.parseURL();
			// case j: IP addresses
			this.tokens.rule.IP = this.parseIP();
			// case i: Email
			this.tokens.rule.Email = this.parseEmail();
			// case h: File Extension
			this.tokens.rule.exts = this.parseFileExtension();
			// case g: Number
			this.tokens.rule.Number = this.parseNumber();
			// case f: Date
			this.tokens.rule.Date = this.parseDate();
			// case c,d,e: Hyphenated terms
			this._increment(this.tokens.word, this.parseHyphenatedTerms());
			// case a and general word parser
			this._increment(this.tokens.word, this.parseGeneralWord());

			return this.tokens;	
		},
		parseURL: function(){
			var res = {
				URL: this.txt.match( JSSConst.RE.URL.general ) || [],
				protocol: [], server: []
			}
			res.URL.forEach(function(url){
				p = url.match( JSSConst.RE.URL.Protocol );
				p !== null && res.protocol.push( p[0].replace("://", "") );
				s = url.match( JSSConst.RE.URL.Server );
				s !== null && res.server.push( s[0] );
			})
			return res;
		},
		parseIP: function(){
			res = { v4:[], v6:[] };
			var v4 = this.txt.match( JSSConst.RE.IP.v4 ) || [],
				v6 = this.txt.match( JSSConst.RE.IP.v6 ) || [];
			v4.forEach(function(ip){
				sp = ip.split('.');					
				if( sp.length == 4){
					check = true;
					sp.forEach(function(num,i){
						if( i==0 && parseInt(num) == 0 ) check = false;
						if( parseInt(num) < 0 || parseInt(num) > 254 ) check = false;
					})
					check && res.v4.push( ip );
				}
			})
			return res;
		},
		parseEmail: function(){
			var res = {
				address: this.txt.match( JSSConst.RE.Email ) || [],
				local: [],
				domain: []
			}
			res.address.forEach(function(add){
				sp = add.split("@");
				res.local.push(sp[0]);
				res.domain.push(sp[1]);
			})
			return res;
		},
		parseFileExtension: function(){
			var raw = this.txt.match( JSSConst.RE.FileExtension ) || [],
				exts = [];
			raw.forEach(function(fn){
				exts.push( fn.split(".")[1] );
			})
			return exts;
		},
		parseNumber: function(){
			var org = this.txt.match( JSSConst.RE.Number ) || [],
				res = [];
			org.forEach(function(num){
				res.push( parseFloat(num.replace(/[^(\d|\.)]/g,"")) );
			})
			return res;
		},
		parseDate: function(){
			var org = this.txt.match( JSSConst.RE.Date ) || [],
				res = [];
			org.forEach(function(dat){
				// remove st,nd,th after number
				(/\d\s?(st|nd|th)/).test(dat) && ( dat = dat.replace(/(st|nd|th)/, "") );
				if( !isNaN(Date.parse(dat)) ){
					res.push( new Date(dat) );
				}
			})
			return res;
		},
		parseHyphenatedTerms: function(){
			var rawTerms = this.txt.match( JSSConst.RE.Hyphenated ) || [],
				mix = [];
			rawTerms.forEach(function(elem){
				mix.push(elem.replace("-",""));
				mix.push.apply(mix, elem.match(/[a-z]{3,}/ig) );
			})
			return mix;
		},
		parseGeneralWord: function(){
			return this.txt.replace(/[\,\.\-_\!\?]/ig, "").replace(/[\///\(\)]/ig, " ").match( JSSConst.RE.GeneralWord );
		}

	}

	 return JSSU;
}))