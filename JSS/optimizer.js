(function(root, factory){
	if (typeof define === 'function' && define.amd) {
		// for require js
		define(['exports'], function(exports) {
			root.JSSQueryProcessor = factory(root, exports);
		});
	} else if (typeof exports !== 'undefined') {
		// for node js environment
		factory(root, module);
	} else {
		// for browser
		root.JSSQueryProcessor = factory(root, {});
	}
}(this, function(root, module){

	Object.prototype.clone = function(){
		return JSON.parse( JSON.stringify(this) )
	}

	function* iterParams(paramKeys, params) {
		if( paramKeys.length == 0 )
			yield params;
		else { 
			var cloneKeys = paramKeys.clone(),
				currentKey = cloneKeys.pop();
			// if( typeof(params[currentKey][Symbol.iterator]) !== 'function' )
			// 	params[currentKey] = [ params[currentKey] ]
			for( var num of params[currentKey] ){
				var deep = params.clone();
				deep[currentKey] = num;
				yield* iterParams(cloneKeys, deep);
			}
		}
	}

	// f must take object as input to get the parameters right
	module.exports = function(f, params, opt, record){
		var opt = typeof(opt) === 'undefined' ? "max" : opt;
		var record = typeof(record) === 'undefined' ? false : record;
		var optValue = null, optParam = null, results = [];
		for( let paramSet of iterParams(Object.keys(params), params) ){
			var val = f(paramSet);
			console.log( paramSet, val )

			if( optValue == null || ( opt == "max" && optValue < val ) || ( opt == "min" && optValue > val ) ){
				optValue = val;
				optParam = paramSet.clone();
			}
			if( record )
				results.push({val: val, params: paramSet.clone()})
		}
		return {
			optValue: optValue, params: optParam, record: results
		}
	}

}))