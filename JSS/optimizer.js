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

	var chunkHyperParam = 5;

	function* iterParams(paramKeys, params, feedback) {
		if( paramKeys.length == 0 )
			yield params;
		else { 
			var cloneKeys = paramKeys.clone(),
				currentKey = cloneKeys.pop();
			if( typeof(params[currentKey][Symbol.iterator]) !== 'function' )
				params[currentKey] = [ params[currentKey] ]

			var ran = [];
			var gloOpt = null
			var i=0
			var j=params[currentKey].length - 1;
			do{
				// chunk i ~ j
				var optInd = null
				var optVal = null
				var step = Math.max( (j-i)/(chunkHyperParam-1), 1);
				
				for( var k=i; k<=j; k+=step ){
					var ind = Math.round(k)
					if( !!ran[ind] )
						continue;
					ran[ind] = true

					var deep = params.clone();
					deep[currentKey] = params[currentKey][ind];
					yield* iterParams(cloneKeys, deep, feedback);
					var val = feedback.value;
					if( optVal == null || ( feedback.opt == "max" && optVal < val ) || ( feedback.opt == "min" && optVal > val ) ){
						optVal = val;
						optInd = ind
					}
				}
				// update i, j
				i = 0 >= optInd - Math.round(step) ? 0 : optInd - Math.round(step);
				j = params[currentKey].length - 1 <= optInd + Math.round(step) ? params[currentKey].length - 1 : optInd + Math.round(step);
				console.log(currentKey, i, params[currentKey][i], j, params[currentKey][j], Math.round(step))

			} while( i < j-1 )
		}
	}

	// f must take object as input to get the parameters right
	module.exports = function(f, params, opt, record){
		var opt = typeof(opt) === 'undefined' ? "max" : opt;
		var record = typeof(record) === 'undefined' ? false : record;
		var optValue = null, optParam = null, results = [];
		var feedback = { value: null, opt: opt }
		for( let paramSet of iterParams(Object.keys(params), params, feedback) ){
			var val = f(paramSet);
			feedback.value = val;
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