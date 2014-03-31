/*global nativeRequire*/
define(function(require, exports, module) {
    main.consumes = [
        "c9", "Plugin", "info", "menus", "ui", "commands"
    ];
    main.provides = ["projectManager"];
    return main;

    function main(options, imports, register) {
        var c9        = imports.c9;
        var Plugin    = imports.Plugin;
        var info      = imports.info;
        var menus     = imports.menus;
        var ui        = imports.ui;
        var commands  = imports.commands;

        // Some require magic to get nw.gui
        var nw  = nativeRequire("nw.gui"); 
        
        // Ref to window
        var win      = nw.Window.get();
        var app      = nw.App;
        var server   = window.server;
            
        /***** Initialization *****/
        
        var plugin = new Plugin("Ajax.org", main.consumes);
        // var emit   = plugin.getEmitter();
        
        var loaded = false;
        function load(){
            if (loaded) return false;
            loaded = true;
            
            commands.addCommand({
                name: "newWindow",
                exec: function () {
                    server.openWindow();
                }
            }, plugin);
            
            commands.addCommand({
                name: "newProject",
                exec: function () {
                    server.openWindow();
                }
            }, plugin);
            
            commands.addCommand({
                name: "saveProject",
                exec: function () {
                    server.openWindow();
                }
            }, plugin);
            
            commands.addCommand({
                name: "closeProject",
                exec: function () {
                    server.openWindow();
                }
            }, plugin);
             var c = 1000;
                
            menus.addItemByPath("Cloud9/~", new ui.divider(), c += 100, plugin);
            
            menus.addItemByPath("Cloud9/New Window To Current Project", new ui.item({
                value: "",
                command: "newWindow"
            }), c += 100, plugin);
            menus.addItemByPath("Cloud9/New Project", new ui.item({
                value: "",
                command: "newProject"
            }), c += 100, plugin);
            
            
            menus.addItemByPath("Cloud9/Save As Project", new ui.item({
                value: "",
                command: "saveProject"
            }), c += 100, plugin);
            menus.addItemByPath("Cloud9/Close Project", new ui.item({
                value: "",
                command: "closeProject"
            }), c += 100, plugin);
            
            var projectsPos = c += 100;
            menus.addItemByPath("Cloud9/Projects/", new ui.menu({}), projectsPos, plugin);
            menus.addItemByPath("Cloud9/Projects/~", new ui.divider(), c += 100, plugin);
            
            listProjects(function(err, projects) {
                var c = 0;
                if (menus.get("Cloud9/Projects").menu)
                    menus.remove("Cloud9/Projects");
                menus.addItemByPath("Cloud9/Projects/", new ui.menu({}), projectsPos, plugin);
            
                // projects menu
                var localProjects = ["localProject1", "localProject2"];
                
                localProjects && localProjects.forEach(function (x) {
                    menus.addItemByPath("Cloud9/Projects/" + x.replace(/[/]/, " "), new ui.item({
                        value   : x,
                        onclick : function(e) {
                            open(this.value);
                        }
                    }), c += 100, plugin);
                });
                
                menus.addItemByPath("Cloud9/Projects/~", new ui.divider(), c += 100, plugin);
                
                projects && projects.forEach(function (x) {
                    menus.addItemByPath("Cloud9/Projects/" + x.replace(/[/]/, " "), new ui.item({
                        value   : x,
                        onclick : function(e) {
                            open(this.value);
                        }
                    }), c += 100, plugin);
                });
            });
        }
        
        /***** Methods *****/
        
        // remote projects
        function loadData(url, callback) {
            win.cookies.getAll({domain: "c9.io"}, function(cookies){
                var request = nativeRequire("request");
                var jar = request.jar();
                cookies.forEach(function(c){   
                   jar.add(request.cookie(c.name + "=" + c.value));
                });
                request({
                    url: url,
                    followRedirect: true,
                    jar: jar
                }, function(error, response, body) {
                    callback(error, body);
                });
            });
        }
        
        // TODO add proper api to c9 server
        function listProjects(callback){
            var user = info.getUser();
            if (!user)
                return callback(null, []);
            var url = "https://c9.io/" + user.name;
            loadData(url, function(err, result) {
                if (err) return callback(err);
                var names = Object.create(null);
                try {
                    JSON.parse(result.match(/projects:\s*(.*),/)[1]).forEach(function(x){
                        var projectName = (x.owner_username || user.name) + "/" + x.name;
                        names[projectName] = 1;
                    });
                } catch(e) {
                    console.error(e);
                }
                
                callback(err, Object.keys(names));
            });
        }
        
        function getWorkspaceConfig(projectName, callback) {
            var url = "https://ide.c9.io/" + projectName;
            loadData(url, function(err, result) {
                var plugins = JSON.parse(result.match(/plugins\s*=\s*(\[[\s\S]*?]);\n/)[1]);
                callback(err, {
                    url: url,
                    plugins: plugins,
                    raw: result
                });
            });
        }
        
        function open(projectName) {
            if (!global.id)
                global.id = 0;
                
            server.openWindow({
                remoteWorkspace: projectName
            }, function(window) {
                getWorkspaceConfig(projectName, function(err, config) {
                    window.setBasePath(config.url);
                    window.plugins = config.plugins;
                    window.readConfig();
                });
            });
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
         * Draws the file tree
         * @event afterfilesave Fires after a file is saved
         * @param {Object} e
         *     node     {XMLNode} description
         *     oldpath  {String} description
         **/
        plugin.freezePublicAPI({
            /**
             * 
             */
            
        });
        
        register(null, {
            projectManager: plugin
        });
    }
});
