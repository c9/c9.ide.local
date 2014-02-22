define(function(require, exports, module) {
    var assert = require("c9/assert");

    main.consumes = ["Plugin", "api", "fs"];
    main.provides = ["info"];
    return main;

    function main(options, imports, register) {
        var Plugin = imports.Plugin;
        var api = imports.api;
        var fs = imports.fs;
        
        var ANONYMOUS = -1;
        
        assert(options.user && options.project, 
            "Both options.user and options.project need to be set for 'info' to work");
        
        var user = options.user;
        var project = options.project;
        var installPath = options.installPath;
        
        /***** Initialization *****/
        
        var plugin = new Plugin("Ajax.org", main.consumes);
        
        var loaded = false;
        function load(){
            if (loaded) return false;
            loaded = true;
            
            // We'll always fetch the latest account, including any
            // special info like saucelabs keys, and store it to disk
            api.user.get("", function(err, _user) {
                if (err) {
                    // the user was logged in before so ignore the error
                    if (user.id !== ANONYMOUS) return;
                    // TODO show error dialog
                    alert("Error");
                    return;
                }
                
                user = _user;
                fs.writeFile(installPath + "/user.json", JSON.stringify(user, null, 2), "utf8", function(err) {
                    if (err) console.error(err);      
                });
            });
        }
        
        /***** Methods *****/
        
        function getUser(){
            return user;
        }
        
        function getWorkspace(){
            return project;
        }
        
        /***** Lifecycle *****/
        
        plugin.on("load", function(){
            load();
        });
        plugin.on("unload", function(){
            loaded = false;
        });
        
        /***** Register and define API *****/
        
        /**
         * Provides information about the loggedin user and workspace
         * @event afterfilesave Fires after a file is saved
         * @param {Object} e
         *     node     {XMLNode} description
         *     oldpath  {String} description
         **/
        plugin.freezePublicAPI({
            /**
             * Returns the logged in user.
             * @return {Object} The currently user
             */
            getUser : getUser,
            
            /**
             * Return the active workspace.
             * @return {Object} The currently active workspace
             */
            getWorkspace : getWorkspace
        });
        
        register(null, {
            info: plugin
        });
    }
});