(function(root, factory){
	// extensions without creating a namespace
	if (typeof define === 'function' && define.amd) {
		// for require js
		define(['exports'], function(exports) {
			root.JSSConst = factory(root, exports);
		});
	} else if (typeof exports !== 'undefined') {
		// for node js environment
		factory(root, exports);
	} else {
		// for browser
		root.JSSConst = factory(root, {});
	}
}(this, function(root, JSSConst){
	JSSConst = JSSConst || {};

	// TODO: Add method for non-nodejs environment
	JSSConst.Config = JSON.parse( require("fs").readFileSync("./config.json") );
	JSSConst.GetConfig = (key) => JSSConst.Config[key];
	
	JSSConst.SpecialChars = [['&aacute;','a'], ['&agrave;','a'], ['&amp;','&'], ['&atilde;','a'], ['&blank;',' '], ['&bull;','•'], ['&ccedil;','c'], ['&cent;','c'], ['&cir;','○'], ['&eacute;','e'], ['&egrave;','e'], ['&ge;','≥'], ['&gt;','>'], ['&hyph;','-'], ['&iacute;','i'], ['&lt;','<'], ['&mu;','u'], ['&ntilde;','n'], ['&oacute;','o'], ['&ocirc;','o'], ['&para;','¶'], ['&racute;','r'], ['&reg;','®'], ['&rsquo;','\''], ['&sect;','§'], ['&times;','×'], ['&uuml;','u']],
	
	JSSConst.RE = {
		URL: {
			general: /([a-z0-9]+\:\/\/)?[a-z0-9\-]{1,63}(\.[a-z0-9\-]{1,63})*(\.[a-z]{2,63})(\/?(([\w\-])+\/?)*(\.[\w\-]+!\/)?)?(\?[\w\-=&+;]+)?(#[\w\-=&+;]+)?/gi,
			//             protocol                                 domain                            dir          file_ext         get-param         hashtag
			Protocol: /([a-z0-9]+\:\/\/)/ig,
			Server: /[a-z0-9\-]{1,63}(\.[a-z]{1,63})*(\.[a-z0-9\-]{2,63})/ig,
		},
		IP: {
			v4: /(\d{1,3}\.){3}\d{1,3}/g,
		},
		Email: /[\w-\.]+@[\w\-]+(\.[\w\-]+)+/ig,
		FileExtension: /\w+\.\w+/ig,
		Number: /(^|\s|\$)\d+(\,\d{3})*(\.\d+)?([\,\.\?\!\s]+|$)/ig,
		// This only match the format but do not check for the content
		Date: /((\w{3}\.?|\w{4,})[\,\s-]{0,2}\d{1,2}(\s?(st|nd|th))?[\,\s-]{1,2}(\d{4}|'\d{2}))|(('?\d{1,2}|\d{4})[\,\s\/-]\d{1,2}[\,\s\/-](\d{4}|'?\d{1,2}))/ig,
		Hyphenated: /[a-z0-9]+-[a-z0-9]+/ig,
		GeneralWord: /([a-z\$][a-z0-9\$]*)|([a-z0-9\$]*[a-z])/ig
	}

	JSSConst.IndexSchema = {
		HashTable: [
			{ name: "Type", length: 10, type: "string" },
			{ name: "Term", length: 32, type: "string" },
			{ name: "DocFreq", length: 6, type: "number" },
			{ name: "PostingPointer", length: 12, type: "number" }
		],
		Position: [
			{ name: "Type", length: 10, type: "string" },
			{ name: "Term", length: 32, type: "string" },
			{ name: "DocumentId", length: 16, type: "string" },
			{ name: "TermFreq", length: 4, type: "number" },
			{ name: "PositionPointer", length: 12, type: "number" }
		],
		NoPosition: [
			{ name: "Type", length: 10, type: "string" },
			{ name: "Term", length: 32, type: "string" },
			{ name: "DocumentId", length: 16, type: "string" },
			{ name: "TermFreq", length: 4, type: "number" },
		]
	}
	JSSConst.VarCharSeparator = "\u001d"; // ASCII code group separator  


	// Add utility method directly to JS Objects
	Object.prototype.getIterator = function*(){
		for(var property in this) {
			if( this.hasOwnProperty(property) ) {
				yield property;
			}
		}
	}
	String.prototype.fixLength = function(len){
		var blank = ""
		for( var i=0; i<len;i++ ){ blank += " " }
		return ( blank + this ).substring( this.length );
	}
	Object.prototype.extend = function(sup){
		this.__super = sup;
		var proto = {}
		for( let prop of sup.prototype.getIterator() ){
			proto[ prop ] = sup.prototype[ prop ];
		}
		for( let prop of this.prototype.getIterator() ){
			proto[ prop ] = this.prototype[ prop ];
		}
		this.prototype = proto;
		this.constructor = this;
	}

}))