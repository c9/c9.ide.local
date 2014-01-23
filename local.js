/*global nativeRequire*/
define(function(require, exports, module) {
    main.consumes = [
        "c9", "Plugin", "menus", "tabManager", "settings", "preferences", 
        "ui", "proc", "fs", "tree.favorites", "upload", "dialog.alert",
        "commands"
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
        var fs       = imports.fs;
        var Plugin   = imports.Plugin;
        var settings = imports.settings;
        var menus    = imports.menus;
        var commands = imports.commands;
        var tabs     = imports.tabManager;
        var upload   = imports.upload;
        var favs     = imports["tree.favorites"];
        var prefs    = imports.preferences;
        var ui       = imports.ui;
        var alert    = imports["dialog.alert"].show;

        // Some require magic to get nw.gui
        var nw  = nativeRequire("nw.gui"); 
        
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
        
        var overrides = [
            [ "newfile", {"mac": "Command-N", "win": "Ctrl-N" } ],
            [ "newfiletemplate", {"mac": "Command-Shift-N", "win": "Ctrl-Shift-N" } ],
            [ "closeallbutme", {"mac": "Command-Ctrl-W", "win": "Ctrl-Alt-W" } ],
            [ "closealltabs", {"mac": "Command-Shift-W", "win": "Ctrl-Shift-W" } ],
            [ "closetab", {"mac": "Command-W", "win": "Ctrl-W" } ],
            [ "closepane", {"mac": "Ctrl-Option-W", "win": "Ctrl-Option-W" } ],
            [ "nextpane", {"mac": "Command-ESC", "win": "Ctrl-ESC" } ],
            [ "previouspane", {"mac": "Command-Shift-ESC", "win": "Ctrl-Shift-ESC" } ],
            [ "openterminal", {"mac": "Command-T", "win": "Alt-T" } ],
            [ "gototableft", {"mac": "Command-Shift-[", "win": "Ctrl-Alt-[" } ],
            [ "gototabright", {"mac": "Command-Shift-]", "win": "Ctrl-Alt-]" } ]
        ];
        
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
                
                // Set commands
                overrides.forEach(function(item){
                    commands.setDefault(item[0], item[1]);
                });
            }, plugin);

            // Menu item to quit Cloud9 IDE
            menus.addItemByPath("File/Quit Cloud9 IDE", new ui.item({
                onclick : function(){
                    app.quit();
                }
            }), 2000000, plugin);

            menus.addItemByPath("Window/Developer Tools", new ui.item({
                onclick : function(){
                    win.showDevTools();
                }
            }), 2000000, plugin);
            
            menus.addItemByPath("View/~", new ui.divider(), 800, plugin);
            
            var itemFullscreen = 
              menus.addItemByPath("View/Enter Full Screen", new ui.item({
                isAvailable: function(){
                    itemFullscreen.setAttribute("caption", 
                        win.isFullscreen 
                            ? "Leave Full Screen" 
                            : "Enter Full Screen");
                    return true;
                },
                command: "toggleFullscreen"
            }), 900, plugin);
            
            commands.addCommand({
                name    : "toggleFullscreen",
                exec    : function() {
                    setTimeout(function(){
                        win.isFullscreen 
                            ? win.leaveFullscreen()
                            : win.enterFullscreen(); 
                    }, 100);
                }
            }, plugin);

            // Event to open additional files (I hope)
            app.on("open", function(path) {
                fs.stat(path, function(err, stat){
                    if (err) return alert("Invalid File",
                        "Could not open file: " + path,
                        "Please check the path and try again");
                    
                    if (~stat.mime.indexOf("directory"))
                        favs.addFavorite(path);
                    else
                        tabs.openFile(path, true, function(){});
                });
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
                
                if (settings.getBool("user/local/window/@minized"))
                    win.minimize();
                if (settings.getBool("user/local/window/@maximized"))
                    win.maximize();
                if (settings.getBool("user/local/window/@fullscreen"))
                    win.enterFullscreen();
                    
                var pos  = settings.get("user/local/window/@position");
                if (pos) {
                    pos = pos.split(":");
                    win.moveTo(pos[0], pos[1]);
                }
                    
                var size = settings.get("user/local/window/@size");
                if (size) {
                    size = size.split(":");
                    win.resizeTo(size[0], size[1]);
                }
            }, plugin)
            settings.on("user/local", function(){
                if (!!tray !== settings.getBool("user/local/@tray"))
                    toggleTray(!tray);
                if (nativeTitle !== settings.getBool("user/local/@nativeTitle"))
                    switchNativeTitle(!nativeTitle);
            }, plugin);
            
            // Drag&Drop upload
            upload.on("upload.drop", function(e){
                var files = e.entries;
                if (e.type == "tree" && files.length == 1 && files[0].isDirectory) {
                    favs.addFavorite(e.files[0].path);
                    return false;
                }
                else if (e.type == "tab") {
                    for (var i = 0; i < files.length; i++) {
                        if (!files[i].isDirectory)
                            tabs.openFile(e.files[i].path, true, function(){});
                    }
                    return false;
                }
            });

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
            
            // Window
            win.on("minimize", function(){
                settings.set("user/local/window/@minized", true);
            });
            win.on("restore", function(){
                settings.set("user/local/window/@minized", false);
            });
            win.on("maximize", function(){
                settings.set("user/local/window/@maximized", true);
            });
            win.on("unmaximize", function(){
                settings.set("user/local/window/@maximized", false);
            });
            
            var handler = storeWindowSettings.bind(null, false);
            win.on("move", handler);
            win.on("resize", handler);
            win.on("enter-fullscreen", handler);
            win.on("leave-fullscreen", handler);
        }
        
        /***** Methods *****/
        
        var timer;
        function storeWindowSettings(force){
            if (!force) {
                clearTimeout(timer);
                timer = setTimeout(storeWindowSettings.bind(null, true), 1000);
                return;
            }
            
            settings.set("user/local/window/@position", win.x + ":" + win.y);
            settings.set("user/local/window/@size", win.width + ":" + win.height);
            settings.set("user/local/window/@fullscreen", win.isFullscreen);
        }

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
