
/*
--------------------------------------------------------------------------------------------
export to Node.JS
(also works in the presence of qUnit "module")
--------------------------------------------------------------------------------------------
*/
if ("undefined" == typeof exports ) {
    exports = {} ;
}

/*
(c) dbj.org
The absolute core of the dbj cores ... perhaps we can call it a "kernel"
*/
exports.dbj = dbj = (function (undefined) {

    /*
    additions to ES5 intrinsics
    */
    /* moot point: what happens in the presence of another "".format() ? */
    if ("function" != typeof "".format)
        String.prototype.format = function () {
            var args = arguments;
            return this.replace(/\{(\d|\d\d)\}/g, function ($0) {
                var idx = 1 * $0.match(/\d+/)[0]; return args[idx] !== undefined ? args[idx] : (args[idx] === "" ? "" : $0);
            }
            );
        }

    var oprot = Object.prototype, aprot = Array.prototype, sprot = String.prototype;

    var /*implementation*/imp_ = {
        /* coercion to Int32 as required by asm.js */
        toInt32: function (v_) {
            return v_ | 0;
        },
        isEven: function (value) { return (imp_.toInt32(value) % 2 == 0); },
        /* dbj's type system */
        type: (function () {
            var rx = /\w+/g, tos = oprot.toString;
            return function (o) {
                if (typeof o === "undefined") return "undefined";
                if (o === null) return "null";
                if ("number" === typeof (o) && isNaN(o)) return "nan";
                return (tos.call(o).match(rx)[1]).toLowerCase();
            }
        }()),
        isObject: function (o)   { return "object" === imp_.type(o);   },
        isFunction: function (o) { return "function" === imp_.type(o); },
        isArray: function (o)    { return "array" === imp_.type(o);    },
        isString: function (o)   { return "string" === imp_.type(o);   }
    };

    return/*interface*/ {

        toString: function () { return "dbj(); kernel 1.2.0"; },
        /* 
        coercion to Int32 
        also required by asm.js
        */
        toInt32: imp_.toInt32,
        isEven: imp_.isEven,

        "oprot": oprot,
        "aprot": aprot,
        "sprot": sprot,

        type: imp_.type,
        isObject: imp_.isObject,
        isFunction: imp_.isFunction,
        isArray: imp_.isArray,
        isString: imp_.isString
    };

}());

/*
(c) 2011 by DBJ.ORG
 Dual licensed under the MIT (MIT-LICENSE.txt)
 and GPL (GPL-LICENSE.txt) licenses.

 depends on dbj.kernel
*/

(function (dbj,undefined) {

    /*
    Terminology and arguments requirements:

            dbj.cond( input_value,
                      check_val, out_val, // any number of check/out values
                      default_val ) ;

    Number of arguments must be even. 
	Standard  cond allows users to handle values with other values of the same type.
    Standard comparator is '==='. Order is "first found, first served". Example:

	         dbj.cond( 1, 1, "A", 2, "B", "C") //=> "A"

Arrays as arguments are not part of standard dbj.cond() functionality:  

	         dbj.cond( 1, [3,2,1],"A", 2, "B", "C") 
             //=> "C" , single and array can not be compared 
             // 1 === [1,2,3] => false

	Only intrinsic scalar types can be compared meaningfully. For example
	dbj.cond( /./, /./, "A", /$/, "B", "C") 
    //=> "C",  /./ === /./ => false

	*/
	dbj.cond = function ( v ) {

	    var comparator_ = dbj.cond.comparator = dbj.compare.standard;
	    /* jokers can fiddle with the above and set it to null */

	    dbj.cond = function (v) {
			if (!dbj.isEven(arguments.length)) throw "dbj.cond() not given even number of arguments";
			 var  j = 1, L = arguments.length;
			for (; j < L; j += 2) {
			    if ( true === comparator_(v, arguments[j])) return arguments[j + 1];
			}
			return arguments[L - 1];
	    };
	    /*
        be sure to pass all the arguments on the first run
        which is the only time the line bellow will be executed
        */
	    return dbj.cond.apply(this, Array.prototype.slice.call(arguments,0));
	} ;
	dbj.cond.comparator = null;

/*--------------------------------------------------------------------------------------------*/
} (dbj ));
/*--------------------------------------------------------------------------------------------*/
/*
(c) dbj
place for dbj comparators
dependancy: dbj.kernel and ES5

NOTE: currently ( 2013-07-19 ) this is in the same file as dbj.cond

cleanest implementation would be to have non standard comparators in separate file
so that standard usage does require very minimal dbj.cond.js
*/
(function (dbj, undefined) {
    "use strict";

    // also defines what is a comparator : 
    function strict_eq(a, b) { return a === b; }
    // as per ES5 spec this returns false on different types

    /*
    find single in the array
    only same types allowed to be compared 
    (as customary) returns -1 , on not found
    */
    var index_of = function (array, searchElement, comparator) {
        var found = -1;
        array.every(
            function (e, i) {
                if (comparator(e, searchElement)) {
                    found = i; return false;
                };
                return true;
            });
        return found;
    };

    /*
    multi_comparator  allows arrays v.s. singles to be compared 
    
    Examples:
    
    multi_comparator( 1, [3,2,1] ) --> true
    multi_comparator( [3,2,1], 1 ) --> true
    multi_comparator( function (){ return 1;}, [3,2,1] ) --> false
    multi_comparator( [3,2,1], ["x",[3,2,1]] ) --> true
    
    if rathe(a,b) is used then multi_comparator works for all types
    */
    var multi_comparator = function (a, b, comparator) {
        if (comparator(a, b)) return true;         /* covers arr to arr too */
        if (Array.isArray(b)) return index_of(b, a, comparator) > -1; /* sing to arr */
        if (ArrayisArray(a)) return index_of(a, b, comparator) > -1; /* arr to sing */
        return false;
    };

    // Test for equality any JavaScript type. Also used in QUnit
    // equiv({a:1},{b:2}) --> true
    //
    // Discussions and reference: http://philrathe.com/articles/equiv
    // Test suites: http://philrathe.com/tests/equiv
    // Author: Philippe Rath� <prathe@gmail.com>
    var rathe = function () {

        var innerEquiv, // the real equiv function
            callers = [], // stack to decide between skip/abort functions
            parents = []; // stack to avoiding loops from circular referencing

        // Call the o related callback with the given arguments.
        function bindCallbacks(o, callbacks, args) {
            var prop = dbj.type(o);
            if (prop) {
                if (dbj.type(callbacks[prop]) === "function") {
                    return callbacks[prop].apply(callbacks, args);
                } else {
                    return callbacks[prop]; // or undefined
                }
            }
        }

        var callbacks = function () {

            // expose it to be used by dbj.cond's default comparator
            // for string, boolean, number and null
            var useStrictEquality = function (b, a) {
                if (b instanceof a.constructor || a instanceof b.constructor) {
                    //  to catch short annotaion VS 'new' annotation of a
                    //  declaration
                    //  var k = 1, j = new Number(1); 
                    //  k would ne not equal to j without this function in use
                    return a == b;
                } else {
                    return a === b;
                }
            }

            // TODO! Check that dbj.type() returns these strings
            return {
                "string": useStrictEquality,
                "boolean": useStrictEquality,
                "number": useStrictEquality,
                "null": useStrictEquality,
                "undefined": useStrictEquality,

                "nan": function (b) {
                    return isNaN(b);
                },

                "date": function (b, a) {
                    return dbj.type(b) === "date"
                            && a.valueOf() === b.valueOf();
                },

                "regexp": function (b, a) {
                    return dbj.type(b) === "regexp"
                            && a.source === b.source && // the regex itself
                            a.global === b.global && // and its modifers
                                                        // (gmi) ...
                            a.ignoreCase === b.ignoreCase
                            && a.multiline === b.multiline;
                },

                // - skip when the property is a method of an instance (OOP)
                // - abort otherwise,
                // initial === would have catch identical references anyway
                "function": function () {
                    var caller = callers[callers.length - 1];
                    return caller !== Object && typeof caller !== "undefined";
                },

                "array": function (b, a) {
                    var i, j, loop;
                    var len;

                    // b could be an object literal here
                    if (!(dbj.type(b) === "array")) {
                        return false;
                    }

                    len = a.length;
                    if (len !== b.length) { // safe and faster
                        return false;
                    }

                    // track reference to avoid circular references
                    parents.push(a);
                    for (i = 0; i < len; i++) {
                        loop = false;
                        for (j = 0; j < parents.length; j++) {
                            if (parents[j] === a[i]) {
                                loop = true;// dont rewalk array
                            }
                        }
                        if (!loop && !innerEquiv(a[i], b[i])) {
                            parents.pop();
                            return false;
                        }
                    }
                    parents.pop();
                    return true;
                },

                "object": function (b, a) {
                    var i, j, loop;
                    var eq = true; // unless we can proove it
                    var aProperties = [], bProperties = []; // collection of
                    // strings

                    // comparing constructors is more strict than using
                    // instanceof
                    if (a.constructor !== b.constructor) {
                        return false;
                    }

                    // stack constructor before traversing properties
                    callers.push(a.constructor);
                    // track reference to avoid circular references
                    parents.push(a);

                    for (i in a) { // be strict: don't ensures hasOwnProperty
                        // and go deep
                        loop = false;
                        for (j = 0; j < parents.length; j++) {
                            if (parents[j] === a[i])
                                loop = true; // don't go down the same path
                            // twice
                        }
                        aProperties.push(i); // collect a's properties

                        if (!loop && !innerEquiv(a[i], b[i])) {
                            eq = false;
                            break;
                        }
                    }

                    callers.pop(); // unstack, we are done
                    parents.pop();

                    for (i in b) {
                        bProperties.push(i); // collect b's properties
                    }

                    // Ensures identical properties name
                    return eq
                            && innerEquiv(aProperties.sort(), bProperties
                                    .sort());
                }
            };
        }();

        innerEquiv = function () { // can take multiple arguments
            var args = dbj.aprot.slice.apply(arguments);
            if (args.length < 2) {
                return true; // end transition
            }

            return (function (a, b) {
                if (a === b) {
                    return true; // catch the most you can
                } else if (a === null || b === null || typeof a === "undefined"
                        || typeof b === "undefined"
                        || dbj.type(a) !== dbj.type(b)) {
                    return false; // don't lose time with error prone cases
                } else {
                    return bindCallbacks(a, callbacks, [b, a]);
                }

                // apply transition with (1..n) arguments
            })(args[0], args[1])
                    && arguments.callee.apply(this, args.splice(1,
                            args.length - 1));
        };

        return innerEquiv;

    }(); // eof rathe()

    /*
    Two arrays are considered equal when all their elements 
    fulfill the following conditions:

    1.  types are equal
    2.  positions are equal
    3. values are equal

    Sparse arrays are also compared for equality

    Solution using every() is fast because it uses native method for iteration
    but it requires two way check since every will 'skip' over undefined entries
    this checking [1,,2] vs [1,2] will be considered true.
    
    this is the tough test, that has to be satisfied:

                 equal_arrays([1, 2, , 3], [1, 2, 3]); // => false
    
    function has(element, index) {
        return this[index] === element;
    }

    function equal_arrays(a, b) {
        return (a.length === b.length) && a.every(has, b) && b.every(has, a);
    }
    
    optimised version of the above, also using the comparator
    */
    function equal_arrays_opt(a, b, comparator) {

        return (a.length === b.length) &&
        a.every(function (e, i) { return comparator(e, b[i]); }) &&
        b.every(function (e, i) { return comparator(e, a[i]); });
    }

    /* interface */
    dbj.compare = {
                standard: strict_eq ,
        /* 
        compare two arrays 
       if comparator is given uses it otherwise uses strict_eq().

       NOTE: this method is in here because it might prove faster than 
       dbj.compare.multi()
        */
        arr: function (a, b, /* optional */ comparator) {

            if (!Array.isArray(a)) throw TypeError("First argument must be array");
            if (!Array.isArray(b)) throw TypeError("Second argument must be array");

            if (!!comparator && "function" != typeof comparator)
                throw TypeError("Third argument is given but is not a function");

            return equal_arrays(
                a, b, comparator || strict_eq
                )
        },
        /*
        Can compare two arrays AND single to array AND array to single
        NOTE: if comparator is given use it otherwise use strict_eq().
        */
        multi: function (a, b, comparator) {
            return multi_comparator(a, b, comparator || strict_eq);
        },
        /*
        perform deep comparison of two objects or scalars
        NOTE: to construct multi+deep comparator, end users will do this :

         dbj.compare(a,b,dbj.compare.deep) ;

        */
        deep: function (a, b) {
            return rathe(a, b);
        }
    };

}(dbj));

/*

Oliver Steele's "x * y".lambda() implementation
to be used (cautiously) as a helper when dbj.cond() outcome values are best coded as anonymoys functions.
see the "Caution & Recursion" page on the Wiki

*/
(function (dbj) {

    /*
     * Author: Oliver Steele
     * Copyright: Copyright 2007 by Oliver Steele.  All rights reserved.
     * License: MIT License
     * Homepage: http://osteele.com/javascripts/functional
     * Created: 2007-07-11
     * Version: 1.0.2
     *
     *
     * This defines "string lambdas", that allow strings such as `x+1` and
     * `x -> x+1` to be used in some contexts as functions.
     *
     * string.lambda() turns a string that contains a JavaScript expression into a
     * `Function` that returns the value of that expression.
     *
     * If the string contains a `->`, this separates the parameters from the body:
     * >> 'x -> x + 1'.lambda()(1) -> 2
     * >> 'x y -> x + 2*y'.lambda()(1, 2) -> 5
     * >> 'x, y -> x + 2*y'.lambda()(1, 2) -> 5
     *
     * Otherwise, if the string contains a `_`, this is the parameter:
     * >> '_ + 1'.lambda()(1) -> 2
     *
     * Otherwise if the string begins or ends with an operator or relation,
     * prepend or append a parameter.  (The documentation refers to this type
     * of string as a "section".)
     * >> '/2'.lambda()(4) -> 2
     * >> '2/'.lambda()(4) -> 0.5
     * >> '/'.lambda()(2,4) -> 0.5
     * Sections can end, but not begin with, `-`.  (This is to avoid interpreting
     * e.g. `-2*x` as a section).  On the other hand, a string that either begins
     * or ends with `/` is a section, so an expression that begins or ends with a
     * regular expression literal needs an explicit parameter.
     *
     * Otherwise, each variable name is an implicit parameter:
     * >> 'x + 1'.lambda()(1) -> 2
     * >> 'x + 2*y'.lambda()(1, 2) -> 5
     * >> 'y + 2*x'.lambda()(1, 2) -> 5
     *
     * Implicit parameter detection ignores strings literals, variable names that
     * start with capitals, and identifiers that precede `:` or follow `.`:
     * >> map('"im"+root', ["probable", "possible"]) -> ["improbable", "impossible"]
     * >> 'Math.cos(angle)'.lambda()(Math.PI) -> -1
     * >> 'point.x'.lambda()({x:1, y:2}) -> 1
     * >> '({x:1, y:2})[key]'.lambda()('x') -> 1
     *
     * Implicit parameter detection mistakenly looks inside regular expression
     * literals for variable names.  It also doesn't know to ignore JavaScript
     * keywords and bound variables.  (The only way you can get these last two is
     * with a function literal inside the string.  This is outside the intended use
     * case for string lambdas.)
     *
     * Use `_` (to define a unary function) or `->`, if the string contains anything
     * that looks like a free variable but shouldn't be used as a parameter, or
     * to specify parameters that are ordered differently from their first
     * occurrence in the string.
     *
     * Chain `->`s to create a function in uncurried form:
     * >> 'x -> y -> x + 2*y'.lambda()(1)(2) -> 5
     * >> 'x -> y -> z -> x + 2*y+3*z'.lambda()(1)(2)(3) -> 14
     *
     * `this` and `arguments` are special:
     * >> 'this'.call(1) -> 1
     * >> '[].slice.call(arguments, 0)'.call(null,1,2) -> [1, 2]
     */
    dbj.lambda = String.prototype.lambda = function () {
        var params = [],
            expr = this,
            sections = expr.ECMAsplit(/\s*->\s*/m);
        if (sections.length > 1) {
            while (sections.length) {
                expr = sections.pop();
                params = sections.pop().split(/\s*,\s*|\s+/m);
                sections.length && sections.push('(function(' + params + '){return (' + expr + ')})');
            }
        } else if (expr.match(/\b_\b/)) {
            params = '_';
        } else {
            // test whether an operator appears on the left (or right), respectively
            var leftSection = expr.match(/^\s*(?:[+*\/%&|\^\.=<>]|!=)/m),
                rightSection = expr.match(/[+\-*\/%&|\^\.=<>!]\s*$/m);
            if (leftSection || rightSection) {
                if (leftSection) {
                    params.push('$1');
                    expr = '$1' + expr;
                }
                if (rightSection) {
                    params.push('$2');
                    expr = expr + '$2';
                }
            } else {
                // `replace` removes symbols that are capitalized, follow '.',
                // precede ':', are 'this' or 'arguments'; and also the insides of
                // strings (by a crude test).  `match` extracts the remaining
                // symbols.
                var vars = this.replace(/(?:\b[A-Z]|\.[a-zA-Z_$])[a-zA-Z_$\d]*|[a-zA-Z_$][a-zA-Z_$\d]*\s*:|this|arguments|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, '').match(/([a-z_$][a-z_$\d]*)/gi) || []; // '
                for (var i = 0, v; v = vars[i++];)
                    params.indexOf(v) >= 0 || params.push(v);
            }
        }
        return new Function(params, 'return (' + expr + ')');
    }


    /*
     Some mobile browsers (and IE6) String split() is not ES3 or ES5 compliant  
     That breaks '->1'.lambda().
     ECMAsplit is an ECMAScript-compliant `split`, although only for
     one argument.
    */
    String.prototype.ECMAsplit =
        // The test is from the ECMAScript reference.
        ('ab'.split(/a*/).length > 1
         ? String.prototype.split
         : function (separator, limit) {
             if (typeof limit != 'undefined')
                 throw "ECMAsplit: limit is unimplemented";
             var result = this.split.apply(this, arguments),
                 re = RegExp(separator),
                 savedIndex = re.lastIndex,
                 match = re.exec(this);
             if (match && match.index == 0)
                 result.unshift('');
             // in case `separator` was already a RegExp:
             re.lastIndex = savedIndex;
             return result;
         });


}(dbj));