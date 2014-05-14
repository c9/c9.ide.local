/*global nativeRequire*/
define(function(require, exports, module) {
    main.consumes = [
        "c9", "Plugin", "info", "menus", "ui", "commands",
        "tabManager", "tree.favorites", "auth", "settings"
    ];
    main.provides = ["projectManager"];
    return main;

    function main(options, imports, register) {
        var c9 = imports.c9;
        var Plugin = imports.Plugin;
        var info = imports.info;
        var menus = imports.menus;
        var ui = imports.ui;
        var commands = imports.commands;
        var tabManager = imports.tabManager;
        var favs = imports["tree.favorites"];
        var auth = imports.auth;
        var settings = imports.settings;

        // Some require magic to get nw.gui
        var nw = nativeRequire("nw.gui"); 
        
        // Ref to window
        var win = nw.Window.get();
        var app = nw.App;
        var server = window.server;
        var windowManager = server.windowManager;
            
        /***** Initialization *****/
        
        var plugin = new Plugin("Ajax.org", main.consumes);
        // var emit = plugin.getEmitter();
        
        var loaded = false;
        function load(){
            if (loaded) return false;
            loaded = true;
            
            commands.addCommand({
                name: "newWindow",
                exec: function() {
                    var state = JSON.parse(JSON.stringify(settings.model.state));
                    var stateSettings = {
                        console: state.console,
                        panels: state.panels,
                        menus: state.menus
                    };
                    delete stateSettings.console["json()"];
                
                    server.openWindow({
                        stateSettings: stateSettings,
                        focus: true
                    }, showProgress());
                }
            }, plugin);
            
            commands.addCommand({
                name: "closeEmptyWindow",
                bindKey: {win: "ctrl-w", mac: "cmd-w"},
                exec: function () { win.close(); },
                isAvailable: function() {
                    return tabManager.getTabs().filter(function(t) {
                        return t.pane.visible;
                    }).length;
                }
            }, plugin);
            
            menus.addItemByPath("File/New Window", new ui.item({
                value: "",
                command: "newWindow"
            }), 150, plugin);
            
            var c = 900;
                
            menus.addItemByPath("Cloud9/~", new ui.divider(), c += 100, plugin);
            
            menus.addItemByPath("Cloud9/New Window", new ui.item({
                value: "",
                command: "newWindow"
            }), c += 100, plugin);
            
            // projects menu
            menus.addItemByPath("Cloud9/Recent Windows/", new ui.menu({
                "onprop.visible" : function(e) {
                    if (e.value) {
                        windowManager.getRecentWindows(function(err, recentWindows) {
                            recentWindows = recentWindows.sort(function(a, b) {
                                if (b.isOpen !== a.isOpen)
                                    return b.isOpen ? 1 : -1;
                                if (b.isEmpty !== a.isEmpty)
                                    return b.isEmpty ? -1 : 1;
                                return b.time - a.time;
                            });
                            
                            menus.remove("Cloud9/Recent Windows/");
                            var dividerAdded = false;
                            var c = 0;
                            recentWindows.forEach(function(x) {
                                if (!x.isOpen && !dividerAdded) {
                                    dividerAdded = true;
                                    menus.addItemByPath("Cloud9/Recent Windows/~", new ui.divider(), c+=100, plugin);
                                }
                                addMenuItem("Cloud9/Recent Windows/", x, c += 100);
                            });
                        });
                    }
                },
                "onitemclick" : function(e) {
                    var options = e.value;
                    options.focus = true;
                    server.openWindow(options, showProgress());
                }
            }), c += 100, plugin);
            
            menus.addItemByPath("Cloud9/Remote Workspaces/", new ui.menu({
                "onprop.visible": function(e) {
                    if (e.value) updateC9Projects();
                },
                "onitemclick" : function(e) {
                    var options = e.relatedNode.value;
                    if (options) {
                        options.focus = true;
                        server.openWindow(options, showProgress());
                    }
                }
            }), c += 100, plugin);
            
            menus.addItemByPath("Cloud9/Projects/~", new ui.divider(), c += 100, plugin);
            
            function updateC9Projects(){
                server.listC9Projects(info.getUser(), function(err, projects) {
                    var c = 0;
                    menus.remove("Cloud9/Remote Workspaces/");
                    
                    if (err || !projects) {
                        menus.addItemByPath("Cloud9/Remote Workspaces/Error while loading workspace list", 
                            new ui.item({disabled: true}), c, plugin);
                        return;
                    }
                    
                    if (projects.own) {
                        projects.own.sort(function (a, b) {
                            return a.name.localeCompare(b.name);
                        }).forEach(function (x) {
                            addMenuItem("Cloud9/Remote Workspaces/", x, c += 100);
                        });
                    }
                    if (projects.shared && projects.shared.length) {
                        menus.addItemByPath("Cloud9/Remote Workspaces/Shared with me/", new ui.menu({}), c += 100, plugin);
                        projects.shared.sort(function (a, b) {
                            return a.name.localeCompare(b.name);
                        }).forEach(function (x) {
                            addMenuItem("Cloud9/Remote Workspaces/Shared with me/", x, c += 100);
                        });
                    }
                });
            }
            
            function addMenuItem(menu, value, c) {
                menus.addItemByPath(menu + value.name.replace(/[/]/, "\u2044"),
                    new ui.item({value   : value}), c, plugin);
            }
            
            auth.on("login", updateC9Projects);
            auth.on("logout", updateC9Projects);
            favs.on("favoriteRemove", updateFavorites);
            favs.on("favoriteAdd", updateFavorites);
            favs.on("favoriteReorder", updateFavorites);
            function updateFavorites() {
                windowManager.setFavorites(win.options.id, favs.favorites);
            }
            updateFavorites();
            updateC9Projects();
        }
        
        /***** Methods *****/
        
        function showProgress() {
            // window needed for windows and win on mac
            window.addEventListener("blur", restoreCursor);
            win.on("blur", restoreCursor);
            window.addEventListener("mousedown", restoreCursor);
            ui.setStyleRule("*", "cursor", "progress!important");
            function restoreCursor() {
                ui.setStyleRule("*", "cursor", "");
                window.removeEventListener("blur", restoreCursor);
                win.removeListener("blur", restoreCursor);
                window.removeEventListener("mousedown", restoreCursor);
            }
            return restoreCursor;
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
