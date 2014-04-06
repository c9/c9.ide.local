/*global nativeRequire*/
define(function(require, exports, module) {
    main.consumes = [
        "c9", "Plugin", "menus", "tabManager", "settings", "preferences", 
        "ui", "proc", "fs", "tree.favorites", "upload", "dialog.alert",
        "commands", "bridge", "dialog.question", "openfiles", "dragdrop",
        "tree", "layout", "dialog.error", "util", "openPath"
    ];
    main.provides = ["local"];
    return main;

    /*
        - Add real menus
            https://github.com/rogerwang/node-webkit/wiki/Menu

        ISSUES:
        - First opened pane does not get the focus (errors, no loading)
        - After opening ace docs the UI becomes slow
    */

    function main(options, imports, register) {
        var c9        = imports.c9;
        var fs        = imports.fs;
        var Plugin    = imports.Plugin;
        var settings  = imports.settings;
        var menus     = imports.menus;
        var commands  = imports.commands;
        var dragdrop  = imports.dragdrop;
        var openPath  = imports.openPath;
        var util      = imports.util;
        var openfiles = imports.openfiles;
        var tabs      = imports.tabManager;
        var upload    = imports.upload;
        var favs      = imports["tree.favorites"];
        var tree      = imports.tree;
        var layout    = imports.layout;
        var prefs     = imports.preferences;
        var ui        = imports.ui;
        var alert     = imports["dialog.alert"].show;
        var question  = imports["dialog.question"];
        var bridge    = imports.bridge;
        var error     = imports["dialog.error"];

        // Some require magic to get nw.gui
        var nw  = nativeRequire("nw.gui"); 
        
        // Ref to window
        var win      = nw.Window.get();
        var app      = nw.App;
        var Menu     = nw.Menu;
        var MenuItem = nw.MenuItem;
        var Tray     = nw.Tray;
        var tray, nativeTitle, title, titlebar;
            
        /***** Initialization *****/
        
        var plugin = new Plugin("Ajax.org", main.consumes);
        // var emit   = plugin.getEmitter();
        
        var overrides = [
            [ "newfile", {"mac": "Command-N|Ctrl-N", "win": "Ctrl-N" } ],
            [ "newfiletemplate", {"mac": "Command-Shift-N|Ctrl-Shift-N", "win": "Ctrl-Shift-N" } ],
            [ "closeallbutme", {"mac": "Command-Option-W|Option-Ctrl-W", "win": "Ctrl-Alt-W" } ],
            [ "closealltabs", {"mac": "Command-Shift-W|Option-Shift-W", "win": "Ctrl-Shift-W" } ],
            [ "closetab", {"mac": "Command-W|Option-W", "win": "Ctrl-W" } ],
            [ "closepane", {"mac": "Command-Ctrl-W", "win": "Ctrl-Option-W" } ],
            [ "nextpane", {"mac": "Command-ESC|Option-ESC", "win": "Ctrl-ESC" } ],
            [ "previouspane", {"mac": "Command-Shift-ESC|Option-Shift-ESC", "win": "Ctrl-Shift-ESC" } ],
            [ "openterminal", {"mac": "Command-T|Option-T", "win": "Alt-T" } ],
            [ "gototableft", {"mac": "Command-Shift-[|Command-[", "win": "Ctrl-Alt-[" } ],
            [ "gototabright", {"mac": "Command-Shift-]|Command-]", "win": "Ctrl-Alt-]" } ]
        ];
        
        var loaded = false;
        function load(){
            if (loaded) return false;
            loaded = true;
            
            // When the UI is loaded, show the window
            c9.on("ready", function(){
                // focusWindow();
                
                // Set commands
                overrides.forEach(function(item){
                    commands.setDefault(item[0], item[1]);
                });
                
                // Check Window Location
                validateWindowGeometry();
            }, plugin);
            
            tabs.on("ready", function(){
                // Parse argv
                var argv = app.argv.slice(0);
                while (argv.length) {
                    if (argv[0].charAt(0) == "-") {
                        argv.shift(); argv.shift();
                        continue;
                    }
                    openPath.open(argv.shift());
                }
            }, plugin);

            // Menu item to quit Cloud9
            menus.addItemByPath("Cloud9/~", new ui.divider(), 2000000, plugin);
            menus.addItemByPath("Cloud9/Quit Cloud9", new ui.item({
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
                name    : "exit",
                bindKey : { mac: "Command-Q", win: "Alt-F4" },
                exec    : function() {
                    win.emit("close", "quit");
                }
            }, plugin);
            
            commands.addCommand({
                name    : "fallback",
                bindKey : { mac: "Command-W", win: "Ctrl-F4" },
                isAvailable : function(){
                    return true;
                },
                exec    : function() {
                    // Do nothing
                }
            }, plugin);
            
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
            
            tree.getElement("mnuCtxTree", function(mnuCtxTree){
                ui.insertByIndex(mnuCtxTree, new ui.item({
                    match   : "folder|file",
                    caption : process.platform == "darwin"
                        ? "Reveal in Finder"
                        : "Show item in Explorer",
                    onclick : function() {
                        var path = tree.selected;
                        if (!path) return;
                        if (process.platform == "win32")
                            path = path.substr(1).replace(/\//g, "\\");
                        nw.Shell.showItemInFolder(path);
                    }
                }), 1020, plugin);
            });

            // Event to open additional files (I hope)
            app.on("open", function(cmdLine) {
                var argv = cmdLine.match(/(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|((?:[^ \\]|\\.)+))/g)
                    .map(function(x) { return x.replace(/^["']|["']$/g, ""); });
                openPath.open(argv.pop());
                focusWindow();
            });
            
            // Deal with user reopening app
            app.on("reopen", function(){
                win.show();
            });
            
            // Deal with closing
            win.on("close", function(quit){
                if (quit || process.platform == "win32") {
                    // Save All State
                    c9.beforequit();
                    
                    if (window.onbeforeunload) {
                        var message = window.onbeforeunload();
                        if (message) {
                            question.show("Quit Cloud9?",
                                "Are you sure you want to exit Cloud9?",
                                "Cloud9 will preserve your entire state. "
                                    + "Even unsaved files or changes will still "
                                    + "be available the next time you start cloud9.",
                                function(){ // yes
                                    settings.set("user/general/@confirmexit", 
                                        !question.dontAsk);
                                    settings.save(true, true);
                                    
                                    win.close(true);
                                },
                                function(){ // no
                                    settings.set("user/general/@confirmexit", 
                                        !question.dontAsk);
                                    settings.save(true, true);
                                }, {
                                    showDontAsk: true
                                });
                            focusWindow();
                            return;
                        }
                    }
                    win.close(true);
                }
                else {
                    win.hide();
                }
            });

            // Tabs
            tabs.on("focusSync", function(e){
                win.title = e.tab.title + " - Cloud9";
                if (title)
                    title.innerHTML = win.title;
            });
            tabs.on("tabDestroy", function(e){
                if (e.last) {
                    win.title = "Cloud9";
                    if (title)
                        title.innerHTML = win.title;
                }
            });

            // Settings
            settings.on("read", function(){
                settings.setDefaults("user/local", [
                    ["tray", "false"],
                    ["nativeTitle", "true"]
                ]);
                if (settings.getBool("user/local/@tray"))
                    toggleTray(true);

                nativeTitle = settings.getBool("user/local/@nativeTitle");
                setNativeTitle(!nativeTitle);
            }, plugin);

            settings.on("user/local", function(){
                if (!!tray !== settings.getBool("user/local/@tray"))
                    toggleTray(!tray);
                if (nativeTitle !== settings.getBool("user/local/@nativeTitle"))
                    switchNativeTitle(!nativeTitle);
            }, plugin);
            
            // Drag&Drop upload
            upload.on("upload.drop", function(e){
                function transformPath(path) {
                    if (c9.platform == "win32")
                        path = "/" + path.replace(/\\/g, "/");
                    return path;
                }
                var files = e.entries;
                if (e.path.isTree && files.length == 1 && files[0].isDirectory) {
                    var path = e.files[0].path;
                    favs.addFavorite(transformPath(path));
                    openfiles.showTree();
                    return false;
                }
                else if (typeof e.path == "string") {
                    // Do nothing
                }
                else { //if (e.type == "tab") 
                    for (var i = 0; i < files.length; i++) {
                        if (!files[i].isDirectory)
                            tabs.openFile(transformPath(e.files[i].path), true);
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
                settings.set("state/local/window/@minimized", true);
            });
            win.on("restore", function(){
                settings.set("state/local/window/@minimized", false);
            });
            win.on("maximize", function(){
                settings.set("state/local/window/@maximized", true);
            });
            win.on("unmaximize", function(){
                settings.set("state/local/window/@maximized", false);
            });
            
            var handler = storeWindowSettings.bind(null, false);
            win.on("move", handler);
            win.on("resize", handler);
            win.on("enter-fullscreen", handler);
            win.on("leave-fullscreen", handler);

            // Focus when opening new files
            bridge.on("message", function(e) {
                if (e.message.type === "open")
                    focusWindow();
            });
        }
        
        /***** Methods *****/
        
        var timer;
        function storeWindowSettings(force){
            if (!force) {
                clearTimeout(timer);
                timer = setTimeout(storeWindowSettings.bind(null, true), 1000);
                return;
            }
            
            settings.set("state/local/window/@position", win.x + ":" + win.y);
            settings.set("state/local/window/@size", win.width + ":" + win.height);
            settings.set("state/local/window/@fullscreen", win.isFullscreen);
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
            ui.insertCss(require("text!./local.less"), options.staticPrefix, plugin);
            
            var platform = c9.platform
            var titleHeight = platform == "win32" ? 27 : 23;
            
            error.top = titleHeight + 1;
            
            var div = document.body.appendChild(document.createElement("div"));
            div.className = "window-border";
            
            // Move elements down to make room for the title bar
            layout.getElement("root").setAttribute("anchors", titleHeight + " 0 0 0");
            document.querySelector(".c9-mbar-round").style.display = "none";
            document.querySelector(".c9-mbar-logo").style.paddingTop = "0";
            // document.querySelector(".c9-menu-bar .c9-mbar-cont").style.paddingRight = "16px";
            
            ui.setStyleRule(".right .panelsbar", "top", "-1px");
            ui.setStyleRule(".right .panelsbar", "position", "absolute");
            
            var logobar = layout.getElement("logobar");
            logobar.setHeight(menus.minimized ? 8 : 27);
            logobar.$ext.style.maxHeight = "27px";
            
            titlebar = document.body.appendChild(document.createElement("div"));
            titlebar.className = "window-titlebar " + platform;

            // Caption
            title = titlebar.appendChild(document.createElement("div"));
            title.className = "caption";
            
            // Maximize
            var fullscreenbtn = titlebar.appendChild(document.createElement("div"));
            fullscreenbtn.className = "fullscreen";
            fullscreenbtn.addEventListener("click", function(){
                win.enterFullscreen();
            });
            
            // Buttons
            var closebtn = titlebar.appendChild(document.createElement("div"));
            closebtn.className = "closebtn";
            closebtn.addEventListener("click", function(){
                win.close();
            });
            var minbtn = titlebar.appendChild(document.createElement("div"));
            minbtn.className = "minbtn";
            minbtn.addEventListener("click", function(){
                win.minimize();
            });
            var maxbtn = titlebar.appendChild(document.createElement("div"));
            maxbtn.className = "maxbtn";
            maxbtn.addEventListener("click", function(){
                isMaximized && !apf.isMac
                    ? win.unmaximize()
                    : win.maximize();
            });
            
            var isMaximized = settings.get("state/local/window/@maximized");
            
            win.on("blur", function(){
                titlebar.className = titlebar.className.replace(/ focus/g, "");
            });
            win.on("focus", function(){
                titlebar.className += " focus";
            });
            win.on("maximize", function(){
                titlebar.className += " maximized";
                isMaximized = true;
            });
            win.on("unmaximize", function(){
                titlebar.className = titlebar.className.replace(/ maximized/g, "");
                isMaximized = false;
            });
            
            var timer;
            var lastScreen = util.extend({}, screen);
            win.on("move", function(x, y){
                clearTimeout(timer);
                timer = setTimeout(checkScreen, 500);
            });
            
            // Temporary Hack - need resolution event
            setInterval(checkScreen, 2000);
            
            function checkScreen(){
                var s = lastScreen;
                lastScreen = util.extend({}, screen);
                if (!util.isEqual(s, lastScreen))
                    validateWindowGeometry(true);
            }

            win.on("leave-fullscreen", function(){
                layout.getElement("root").setAttribute("anchors", titleHeight + " 0 0 0");
                    titlebar.style.display = "block";
            });
            win.on("enter-fullscreen", function(){
                layout.getElement("root").setAttribute("anchors", "0 0 0 0");
                titlebar.style.display = "none";
            });
            
            var menubar = document.querySelector(".c9-menu-bar");
            menubar.style.backgroundPosition = "0 -4px";
            menubar.style.webkitUserSelect   = "none";
        }
        
        function focusWindow(){
            // To support all platforms, we need to call both show and focus
            win.show();
            win.focus();
        }
        
        function validateWindowGeometry(fitInScreen){
            if (settings.get("state/local/window/@maximized"))
                return;
            // Check if Window Position is In view
            var changedSize;
            var changedPos;
            
            var width  = win.width;
            var height = win.height;
            
            if (width > screen.width) {
                width = screen.width;
                changedSize = true;
            }
            
            if (height > screen.height) {
                height = screen.height;
                changedSize = true;
            }
            
            var left = win.x;
            var top  = win.y;
            
            var isLTZero = left < 0 || top < 0;
            
            if (left < 0 || left > screen.width + screen.availLeft) {
                left = Math.max(0, screen.width + screen.availLeft - width) / 2;
                changedPos = true;
            }
            
            if (top < 0 || top > screen.height + screen.availTop) {
                top = Math.max(0, screen.height + screen.availTop - height) / 2;
                changedPos = true;
            }
            else if (fitInScreen && top + height > screen.height + screen.availTop) {
                height = screen.height - top + screen.availTop;
                changedSize = true;
            }
            
            if (changedPos && (!fitInScreen || isLTZero))
                win.moveTo(left, top);
            
            if (changedSize)
                win.resizeTo(width, height);
        }
        
        function installMode(){
            focusWindow();
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
