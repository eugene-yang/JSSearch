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
		Number: /\d+(\,\d{3})*(\.\d+)?/ig,
		// This only match the format but do not check for the content
		Date: /(\w{3,}|\d{1,4})[\,\s\\\/\.-]{0,2}\d{1,2}(\s?(st|nd|th))?[\,\s\\\/\.-]{1,2}(\d{1,4}|'\d{2})/ig
	}

}))