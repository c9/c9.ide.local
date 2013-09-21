/*global requireNode*/
define(function(require, exports, module) {
    main.consumes = [
        "c9", "Plugin", "menus", "tabManager", "settings", "preferences", 
        "ui", "proc", "fs"
    ];
    main.provides = ["local"];
    return main;

    /*
        * Add argv support
            https://github.com/rogerwang/node-webkit/wiki/Handling-files-and-arguments
            https://github.com/rogerwang/node-webkit/wiki/App
        / Add title bar replacement (buttons + drag)
        - Add real menus
            https://github.com/rogerwang/node-webkit/wiki/Menu
        * Add Tray Support
            https://github.com/rogerwang/node-webkit/wiki/Tray
        - Add Clipboard support
            https://github.com/rogerwang/node-webkit/wiki/Clipboard
        - Preserve window state
            https://github.com/rogerwang/node-webkit/wiki/Preserve-window-state-between-sessions
        - Preview:
            nwdisable (since 0.5.0) is used to disable Node support in the iframe and make it a Normal frame (see Security)
            nwfaketop (since 0.5.1) is used to trap the navigation and the access (such as window.top, window.parent) in this iframe.
        Note: On Mac, you should Register the File Types Your App Supports in the node-webkit.app/Contents/Info.plist.

        ISSUES:
        - First opened pane does not get the focus (errors, no loading)
        - Window doesn't get focus
        - After opening ace docs the UI becomes slow
    */

    function main(options, imports, register) {
        var c9       = imports.c9;
        var Plugin   = imports.Plugin;
        var settings = imports.settings;
        var menus    = imports.menus;
        var tabs     = imports.tabManager;
        var fs       = imports.fs;
        var prefs    = imports.preferences;
        var ui       = imports.ui;

        // Some require magic to get nw.gui
        var oldRequire = window.require; 
        window.require = requireNode;
        var nw  = window.require("nw.gui"); 
        window.require = oldRequire;
        
        // Ref to window
        var win      = nw.Window.get();
        var app      = nw.App;
        var Menu     = nw.Menu;
        var MenuItem = nw.MenuItem;
        var Tray     = nw.Tray;
        var tray, nativeTitle;
        
        if (c9.debug)
            win.showDevTools();
            
        /***** Initialization *****/
        
        var plugin = new Plugin("Ajax.org", main.consumes);
        // var emit   = plugin.getEmitter();
        
        var loaded = false;
        function load(){
            if (loaded) return false;
            loaded = true;
            
            // When the UI is loaded, show the window
            c9.on("ready", function(){
                win.show();
                win.focus();

                // Parse argv
                var argv = app.argv.slice(0);
                while (argv.length) {
                    if (argv[0].charAt(0) == "-") {
                        argv.shift(); argv.shift();
                        continue;
                    }
                    tabs.openFile(argv.shift(), function(){});
                }
            }, plugin);

            // Menu item to quit Cloud9 IDE
            menus.addItemByPath("File/Quit Cloud9 IDE", new apf.item({
                onclick : function(){
                    app.quit();
                }
            }), 2000000, plugin);

            // Event to open additional files (I hope)
            app.on('open', function(path) {
                console.log('Opening: ' + path);
            });

            // Tabs
            tabs.on("focus", function(e){
                win.title = e.tab.title + " - Cloud9 IDE";
            });
            tabs.on("tabDestroy", function(e){
                if (e.last)
                    win.title = "Cloud9 IDE";
            });

            // Settings
            settings.on("read", function(){
                settings.setDefaults("user/local", [
                    ["tray", "true"],
                    ["nativeTitle", "true"]
                ]);
                if (settings.getBool("user/local/@tray"))
                    toggleTray(true);

                nativeTitle = settings.getBool("user/local/@nativeTitle");
                setNativeTitle(!nativeTitle);
            }, plugin)
            settings.on("user/local", function(){
                if (!!tray !== settings.getBool("user/local/@tray"))
                    toggleTray(!tray);
                if (nativeTitle !== settings.getBool("user/local/@nativeTitle"))
                    switchNativeTitle(!nativeTitle);
            }, plugin);

            // Preferences
            prefs.add({
               "General" : {
                   position : 100,
                   "General" : {
                       "Show Tray Icon" : {
                           type : "checkbox",
                           path : "user/local/@tray",
                           position : 300
                       }
                       // "Use Native Title Bar (requires restart)" : {
                       //     type : "checkbox",
                       //     path : "user/local/@nativeTitle",
                       //     position : 300
                       // }
                   }
               }
            }, plugin);
        }
        
        /***** Methods *****/

        function toggleTray(to){
            if (to) {
                // Create a tray icon
                tray = new Tray({ icon: 'favicon.ico' });

                // Give it a menu
                var menu = new Menu();
                menu.append(new MenuItem({ 
                    label   : 'Visit c9.io', 
                    click : function(){
                        window.open("http://c9.io");
                    }
                }));
                menu.append(new MenuItem({ 
                    label   : 'Show Developer Tools', 
                    click : function(){
                        win.showDevTools();
                    }
                }));
                tray.menu = menu;
            }
            else {
                // Remove the tray
                tray.remove();
                tray = null;
            }
        }

        function switchNativeTitle(to){

        }

        function setNativeTitle(on){
            var div = document.body.appendChild(document.createElement("div"));
            div.style.position = "absolute";
            div.style.left = 0;
            div.style.right = 0;
            div.style.top = 0;
            div.style.height ="1px";
            div.style.zIndex = 10000000;

            if (on) {
                div.style.background = "white";
                div.style.opacity = 0.1;

                var menubar = document.querySelector(".c9-menu-bar");
                menubar.style.backgroundPosition = "0 -4px";
                menubar.style.webkitUserSelect   = "none";
                menubar.style.webkitAppRegion    = "drag";
                // document.querySelector(".c9-mbar-round").style.background = ""; //new picture

                ui.insertCss(".c9-menu-bar .c9-menu-btn { -webkit-app-region: no-drag; }", plugin);
            }
            else {
                div.style.background = "black";
                div.style.opacity = 0.3;
            }
        }
        
        function focusWindow(){
            win.focus();
        }
        
        function installMode(){
            win.show();
            win.focus();
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
            toggleTray(false);

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
            focusWindow : focusWindow,
            
            /**
             * 
             */
            installMode : installMode
        });
        
        register(null, {
            local: plugin
        });
    }
});