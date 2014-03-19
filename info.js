define(function(require, exports, module) {
    var assert = require("c9/assert");

    main.consumes = ["Plugin", "api", "fs", "auth"];
    main.provides = ["info"];
    return main;

    function main(options, imports, register) {
        var Plugin = imports.Plugin;
        var plugin = new Plugin("Ajax.org", main.consumes);
        var emit = plugin.getEmitter();
        var api = imports.api;
        var fs = imports.fs;
        var auth = imports.auth;
        
        var ANONYMOUS = -1;
        
        assert(options.user && options.project, 
            "Both options.user and options.project need to be set for 'info' to work");
        
        var user = options.user;
        var project = options.project;
        var installPath = options.installPath;

        var loaded = false;
        function load() {
            if (loaded) return false;
            loaded = true;
            
            // HACK: avoid circular dependency
            setTimeout(function() {
                assert(window.app["dialog.alert"], "Can't find dialog.alert");
            });
            
            // We'll always fetch the latest account, to get any
            // special info like saucelabs keys & beta access, and store it to disk
            api.user.get("", { noLogin: user.id !== ANONYMOUS }, function(err, _user) {
                if (err) {
                    // If the user wasn't logged in before, panic
                    if (user.id === ANONYMOUS)
                        authError();
                    return;
                }
                if ("alpha" in _user && (!_user.alpha && !_user.beta))
                    return authError("Please log in with a registered beta trial account.");
                
                var oldUser = user;
                user = _user;
                emit("change", { oldUser: oldUser, user: user, workspace: project });
                
                fs.writeFile(installPath + "/profile.settings", JSON.stringify(user, null, 2), "utf8", function(err) {
                    if (err) console.error(err);      
                });
            });
        }
        
        /***** Methods *****/
        
        function authError(message) {
            message = message || "Please make sure you have an internet "
                + "connection when you first run Cloud9 Desktop. This way we "
                + "can authorize your copy and enable cloud connectivity "
                + "features.";
            auth.logout();
            window.app["dialog.alert"].show(
                "Authentication failed",
                "Could not authorize your copy of Cloud9 Desktop.",
                message,
                function() {
                    // TODO: just quit?
                    loaded = false;
                    load();
                }
            );
            return;
        }
        
        function getUser(callback) {
            if (!callback) return user;
            if (user) return callback(null, user);
            plugin.once("change", function(e){ callback(null, e.user); });
        }
        
        function getWorkspace(callback) {
            if (!callback) return project;
            if (project) return callback(null, user);
            plugin.once("change", function(e){ callback(null, e.workspace); });
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
            getWorkspace : getWorkspace,
            
            _events: [
                /**
                 * Fired when the user information changes.
                 * 
                 * @param {Object} [oldUser]
                 * @param {Object} [oldWorkspace]
                 * @param {Object} user
                 * @param {Object} workspace
                 * @event change
                 */
                "change"
            ]
        });
        
        register(null, {
            info: plugin
        });
    }
});