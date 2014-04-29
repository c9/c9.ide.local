define(function(require, exports, module) {
    var assert = require("c9/assert");

    main.consumes = ["Plugin", "api", "fs", "auth", "http", "c9", "dialog.alert"];
    main.provides = ["info"];
    return main;

    function main(options, imports, register) {
        var Plugin = imports.Plugin;
        var plugin = new Plugin("Ajax.org", main.consumes);
        var emit = plugin.getEmitter();
        var api = imports.api;
        var fs = imports.fs;
        var auth = imports.auth;
        var http = imports.http;
        var c9 = imports.c9;
        var showAlert = imports["dialog.alert"].show;
        
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
            
            auth.on("logout", function() {
                fs.exists(
                    installPath + "/profile.settings",
                    function(exists) {
                        if (exists)
                            fs.unlink(installPath + "/profile.settings", function() {});
                    }
                );
            });
            auth.on("login", login);
            auth.on("relogin", login);
            
            login();
        }
        
        /***** Methods *****/
        
        function login(allowPrompt, callback) {
            if (typeof allowPrompt === "function")
                return login(false, allowPrompt);
            if (!callback)
                callback = function() {};
            
            // We'll always fetch the latest account, to get any
            // special info like saucelabs keys & beta access, and store it to disk
            api.user.get("", { noLogin: !allowPrompt && user.id !== ANONYMOUS },
            function(err, _user) {
                if (err) {
                    // If the user wasn't logged in before, panic
                    if (user.id === ANONYMOUS) {
                        return canHasInternets(function(online) {
                            if (!online)
                                return callback(); // allow this one to slip
                            authError(null, callback);
                        });
                    }
                    authorizeCopy();
                    return callback(err);
                }
                
                authorizeCopy();
                
                var oldUser = user;
                user = _user;
                emit("change", { oldUser: oldUser, user: user, workspace: project });
                
                fs.writeFile(
                    installPath + "/profile.settings",
                    JSON.stringify(user, null, 2),
                    "utf8",
                    function(err) {
                        if (err) console.error(err);
                        
                        callback(err, user, project);
                    }
                );
            });
        }
        
        function authorizeCopy() {
            api.users.post(
                "authorize_desktop",
                {
                    body: { uid: user.id, version: c9.version },
                    noLogin: true
                },
                function(err, response) {
                    // ignore err; no-internet handling passed above
                    if (err)
                        return console.warn(err);
                    if (response && response.reason)
                        return authError(response.reason);
                }
            );
        }
        
        function authError(message, callback) {
            auth.logout();
            showAlert(
                "Authentication failed",
                "Could not authorize your copy of Cloud9 Desktop.",
                message,
                function() {
                    // Sigh. Ok, let the user in, but nag again later.
                    auth.logout();
                    setTimeout(function() {
                        window.app["dialog.alert"].show(
                            "Authorize Cloud9 Desktop",
                            "Please authorize your copy of Cloud9 Desktop.",
                            "Authorization is required for cloud connectivity.",
                            function() {
                                login(true, callback);
                            }
                        );
                    }, 20 * 60 * 100);
                }
            );
        }
        
        function canHasInternets(callback) {
            http.request("http://google.com", function(err, data) {
                callback(!err);
            });
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
            ],
            
            /**
             * Login 
             * 
             * @param allowPrompt  Allow showing a login prompt
             * @param callback
             */
            login: login
        });
        
        register(null, {
            info: plugin
        });
    }
});