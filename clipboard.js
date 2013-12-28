/*global nativeRequire*/
define(function(require, exports, module) {
    main.consumes = ["Plugin"];
    main.provides = ["clipboard.provider"];
    return main;

    function main(options, imports, register) {
        var Plugin   = imports.Plugin;
        
        /***** Initialization *****/
        
        var plugin = new Plugin("Ajax.org", main.consumes);
        var emit   = plugin.getEmitter();
        
        var clipboard;
        
        var loaded = false;
        function load(){
            if (loaded) return false;
            loaded = true;
            
            // Get System Clipbaord
            clipboard = nativeRequire('nw.gui').Clipboard.get();
        }
        
        /***** Methods *****/
        
        function clear(){
            clipboard.clear();
        }
        
        function set(type, data){
            clipboard.set(data, "text");
        }
        
        function get(type){
            return clipboard.get("text");
        }
        
        /***** Lifecycle *****/
        
        plugin.on("load", function(){
            load();
        });
        plugin.on("enable", function(){
            
        });
        plugin.on("disable", function(){
            
        });
        plugin.on("unload", function(){
            loaded = false;
        });
        
        /***** Register and define API *****/
        
        /**
         * Clipboard Provider Using the node-webkit interface
         **/
        plugin.freezePublicAPI({
            wrap   : function(){},
            unwrap : function(){},
            
            /**
             * Clears the clipboard
             * @param {Function} callback(err)
             */
            clear : clear,
            
            /**
             * Sets the clipboard
             * @param {String} type
             * @param {String} data
             * @param {Function} callback(err)
             */
            set : set,
            
            /**
             * Gets the current value of the clipboard
             * @param {String} type
             * * @param {Function} callback(err, data)
             */
            get : get
        });
        
        register(null, {
            "clipboard.provider": plugin
        });
    }
});