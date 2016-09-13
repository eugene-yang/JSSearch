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
	JSSConst.SpecialChars = [{'&aacute;':'a'},{'&agrave;':'a'},{'&amp;':'&'},{'&atilde;':'a'},{'&blank;':' '},{'&bull;':'•'},{'&ccedil;':'c'},{'&cent;':'c'},{'&cir;':'○'},{'&eacute;':'e'},{'&egrave;':'e'},{'&ge;':'≥'},{'&gt;':'>'},{'&hyph;':'-'},{'&iacute;':'i'},{'&lt;':'<'},{'&mu;':'u'},{'&ntilde;':'n'},{'&oacute;':'o'},{'&ocirc;':'o'},{'&para;':'¶'},{'&racute;':'r'},{'&reg;':'®'},{'&rsquo;':'\''},{'&sect;':'§'},{'&times;':'×'},{'&uuml;':'u'}],
	JSSConst.RE = {
		URL: {
			general: /([a-z0-9]+\:\/\/)?[\w\-]+(\.[\w\-]+)+(\/?(([\w\-])+\/?)*(\.[\w\-]+!\/)?)?(\?[\w\-=&+;]+)?(#[\w\-=&+;]+)?/gi,
			//             protocol         domain               dir          file_ext         get-param         hashtag
			Protocol: /([a-z0-9]+\:\/\/)/ig,
			Server: /[\w\-]+(\.[\w\-]+)+/ig,
		},
		IP: {
			v4: /(\d{1,3}\.){3}\d{1,3}/g,
		},
		Email: /[\w-\.]+@[\w\-]+(\.[\w\-]+)+/ig,
		FileExtension: /\w+\.\w+/ig,
		Number: /(^|\s|\$)\d+(\,\d{3})*(\.\d+)?([\,\.\?\!\s]+|$)/ig,
		// This only match the format but do not check for the content
		// Date: /(\w{3,}|\d{1,4})[\,\s\\\/\.-]{0,2}\d{1,2}(\s?(st|nd|th))?[\,\s\\\/\.-]{1,2}(\d{1,4}|'\d{2})/ig,
		Date: /((\w{3}\.?|\w{4,})[\,\s-]{0,2}\d{1,2}(\s?(st|nd|th))?[\,\s-]{1,2}(\d{4}|'\d{2}))|(('?\d{1,2}|\d{4})[\,\s\/-]\d{1,2}[\,\s\/-](\d{4}|'?\d{1,2}))/ig,
		Hyphenated: /[a-z0-9]+-[a-z0-9]+/ig,
		GeneralWord: /([a-z\$][a-z0-9\$]*)|([a-z0-9\$]*[a-z])/ig
	}

}))