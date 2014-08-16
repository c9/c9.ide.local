/*global nativeRequire nwDispatcher windowManager*/
define(function(require, exports, module) {
    main.consumes = [
        "c9", "Plugin", "menus", "tabManager", "settings", "ui", "proc", 
        "tree.favorites", "upload", "commands", "dialog.question", "openfiles", 
        "tree", "layout", "dialog.error", "util", "openPath", "preview",
        "MenuItem", "terminal", "auth"
    ];
    main.provides = ["local"];
    return main;

    function main(options, imports, register) {
        var c9 = imports.c9;
        var ui = imports.ui;
        var menus = imports.menus;
        var Plugin = imports.Plugin;
        var settings = imports.settings;
        var C9MenuItem = imports.MenuItem;
        var openfiles = imports.openfiles;
        var commands = imports.commands;
        var openPath = imports.openPath;
        var upload = imports.upload;
        var util = imports.util;
        var tabs = imports.tabManager;
        var favs = imports["tree.favorites"];
        var tree = imports.tree;
        var layout = imports.layout;
        var preview = imports.preview;
        var question = imports["dialog.question"];
        var terminal = imports.terminal;
        var error = imports["dialog.error"];
        var auth = imports.auth;

        // Some require magic to get nw.gui
        var nw = nativeRequire("nw.gui"); 
        
        // Ref to window
        var win = nw.Window.get();
        var Menu = nw.Menu;
        var MenuItem = nw.MenuItem;
        var Tray = nw.Tray;
        var tray, nativeTitle, title, titlebar;
            
        /***** Initialization *****/
        
        var plugin = new Plugin("Ajax.org", main.consumes);
        // var emit = plugin.getEmitter();
        
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
            
            // Load native title
            setNativeTitle();
            
            // When the UI is loaded, show the window
            c9.once("ready", function(){
                // focusWindow();
                
                // Set commands
                overrides.forEach(function(item) {
                    commands.setDefault(item[0], item[1]);
                });
                
                // Check Window Location
                validateWindowGeometry();
            }, plugin);
            
            c9.on("quit", function(){
                win.removeAllListeners();
            });
            
            tabs.once("ready", function(){
                // Parse argv
                if (win.options) {
                    var path = win.options.filePath;
                    delete win.options.filePath;
                    path && open(path);
                }
                win.on("openFile", function(e) {
                    var path = e.path;
                    path && open(path, function(err, tab) {
                        if (tab && !favs.favorites.length && tree.area.activePanel == "tree") {
                            tree.expandAndSelect(tab.path);
                        }
                    });
                });
            }, plugin);
            
            win.on("focusWindow", focusWindow);

            // Menu Items
            menus.addItemByPath("Cloud9/~", new ui.divider(), 2000000, plugin);
            menus.addItemByPath("Cloud9/Quit Cloud9", new ui.item({
                selector: "closeAllWindowsQuit:",
                command: "exit"
            }), 2000100, plugin);

            menus.addItemByPath("Window/Developer Tools", new ui.item({
                onclick: function(){
                    win.showDevTools();
                }
            }), 2000000, plugin);
            
            menus.addItemByPath("View/~", new ui.divider(), 800, plugin);
            
            var itemFullscreen = new ui.item({
                isAvailable: function(){
                    itemFullscreen.setAttribute("caption", 
                        win.isFullscreen 
                            ? "Leave Full Screen" 
                            : "Enter Full Screen");
                    return true;
                },
                command: "toggleFullscreen"
            });
            menus.addItemByPath("View/Enter Full Screen", 
                itemFullscreen, 900, plugin);
            
            commands.addCommand({
                name: "exit",
                bindKey: { mac: "Command-Q", win: "" },
                exec: function() { windowManager.quit(); }
            }, plugin);
            
            commands.addCommand({
                name: "closeWindow",
                bindKey: { mac: "", win: "Alt-F4" },
                exec: function() { win.emit("close", "quit"); }
            }, plugin);
            
            commands.addCommand({
                name: "fallback",
                bindKey: { mac: "Command-W", win: "Ctrl-F4" },
                isAvailable: function(){
                    return true;
                },
                exec: function() {
                    // Do nothing
                }
            }, plugin);
            
            commands.addCommand({
                name: "toggleFullscreen",
                exec: function() {
                    setTimeout(function(){
                        win.isFullscreen 
                            ? win.leaveFullscreen()
                            : win.enterFullscreen(); 
                    }, 100);
                }
            }, plugin);
            
            tree.getElement("mnuCtxTree", function(mnuCtxTree) {
                ui.insertByIndex(mnuCtxTree, new ui.item({
                    match: "folder|file",
                    caption: process.platform == "darwin"
                        ? "Reveal in Finder"
                        : "Show item in Explorer",
                    onclick: function() {
                        var path = tree.selected;
                        if (!path) return;
                        if (process.platform == "win32")
                            path = path.substr(1).replace(/\//g, "\\");
                        nw.Shell.showItemInFolder(path);
                    }
                }), 1020, plugin);
            });

            // Deal with closing
            win.on("askForQuit", function(quit) {
                var acceptQuit = quit ? windowManager.quitAll : saveAndQuit;
                // Fetch quit message, if any
                var message = window.onbeforeunload && window.onbeforeunload();
                if (message) {
                    question.show("Quit Cloud9?",
                        "Are you sure you want to " + (quit ? "exit Cloud9?" : "close this window"),
                        "Cloud9 will preserve your entire state. "
                            + "Even unsaved files or changes will still "
                            + "be available the next time you start cloud9.",
                        function(){ // yes
                            settings.set("user/general/@confirmexit", 
                                !question.dontAsk);
                            
                            acceptQuit();
                        },
                        function(){ // no
                            settings.set("user/general/@confirmexit", 
                                !question.dontAsk);
                            
                            if (quit)
                                windowManager.unquit();
                        }, {
                            showDontAsk: true
                        });
                    focusWindow();
                } else {
                    acceptQuit();
                }
            });
            
            win.on("saveAndQuit", saveAndQuit);
            
            win.on("close", function(quit) {
                win.emit("askForQuit", quit);
            });
            
            // saving can be slow for remote workspaces
            // so we hide window, Save All State and then quit
            function saveAndQuit() {
                win.hide();
                
                // Prepare cloud9 for quitting
                c9.beforequit();
                
                // Notify plugins that we're quitting
                c9.quit();
                
                // Unregister the window
                windowManager.onClose(window.win.options.id);
                
                win.close(true);
            }

            // Tabs
            tabs.on("focusSync", function(e) {
                win.title = e.tab.title + (win.displayName ? " - " + win.displayName : "") + " - Cloud9";
                if (title)
                    title.innerHTML = win.title;
            });
            tabs.on("tabDestroy", function(e) {
                if (e.last) {
                    win.title = (win.displayName ? win.displayName + " - " : "") + "Cloud9";
                    if (title)
                        title.innerHTML = win.title;
                }
            });

            // Settings
            settings.on("read", function(){
                settings.setDefaults("user/local", [
                    ["tray", "false"]
                ]);
                if (settings.getBool("user/local/@tray"))
                    toggleTray(true);
            }, plugin);

            settings.on("user/local", function(){
                if (Boolean(tray) !== settings.getBool("user/local/@tray"))
                    toggleTray(!tray);
                if (nativeTitle !== settings.getBool("user/local/@nativeTitle"))
                    switchNativeTitle(!nativeTitle);
            }, plugin);
            
            // Drag&Drop upload
            upload.on("upload.drop", function(e) {
                function transformPath(path) {
                    if (c9.platform == "win32")
                        path = "/" + path.replace(/\\/g, "/");
                    return path;
                }
                var files = e.entries;
                if (files.length == 1 && files[0].isDirectory) {
                    var path = e.files[0].path;
                    favs.addFavorite(c9.toInternalPath(path));
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
            
            tree.once("draw", function(){
                // todo click event from tree isn't fired for empty tree
                tree.tree.container.addEventListener("click", function() {
                    if (favs.favorites.length || tree.tree.provider.visibleItems.length)
                        return;
                    var input = document.createElement("input");
                    input.type = "file";
                    input.nwdirectory = true;
                    input.onchange = function() {
                        var path = input.files[0].path;
                        favs.addFavorite(c9.toInternalPath(path));
                        openfiles.showTree();
                    };
                    input.click();
                });
            });
            
            // Preview
            preview.settingsMenu.append(new C9MenuItem({ 
                caption: "Show Dev Tools", 
                onclick: function(){
                    var previewTab = tabs.focussedTab;
                    var previewEditor = previewTab.editor;
                    
                    var reload = function (iframe){
                        win.once("devtools-opened", function wait(url) {
                            devtools.iframe.src = url;
                        });
                        win.showDevTools(iframe, true);
                    }
                    
                    var session = previewTab.document.getSession();
                    var devtools = previewEditor.meta.$devtools;
                    var iframe = session.iframe;
                    
                    // Clear console
                    if (!console.fake) {
                        console.clear();
                        console = { fake: true };
                        console.clear = console.log = console.warn = 
                        console.error = function(){};
                    }
                    
                    if (!devtools) {
                        previewEditor.meta.$devtools = devtools = {};
                        
                        devtools.container = new ui.vsplitbox({
                            htmlNode: iframe.parentNode,
                            anchors: "0 0 0 0",
                            splitter: true,
                            childNodes: [
                                new ui.bar({ height: "50%" }),
                                devtools.pane = new ui.bar({ 
                                    style: "background:#f1f1f1"
                                })
                            ]
                        });
                        
                        // Reparent Iframe
                        devtools.container.firstChild.$ext.appendChild(iframe);
                        
                        // Create dev tools iframe
                        var deviframe = devtools.container.lastChild.$ext
                                .appendChild(document.createElement("iframe"));
                        devtools.iframe = deviframe;
                        
                        deviframe.style.width = "100%";
                        deviframe.style.height = "100%";
                        deviframe.style.border = "0";
                        
                        deviframe.addEventListener("load", function(){
                            function wait(){
                                setTimeout(function(){
                                    var doc = deviframe.contentWindow.document;
                                    var btn = doc.querySelector(".close-button");
                                    if (!btn) return wait();
                                    
                                    btn.addEventListener("click", function(){
                                        devtools.pane.hide();
                                    });
                                }, 10);
                            }
                            wait();
                        });
                        
                        // Update url when session switches or navigates is loaded
                        var update = function(e){
                            var session = e.session || e.doc.getSession();
                            if (devtools.pane.visible)
                                reload(session.iframe);
                        };
                        previewEditor.on("navigate", update);
                        previewEditor.on("reload", update);
                        previewEditor.on("documentActivate", update);
                    }
                    else {
                        devtools.pane.show();
                    }
                    
                    reload(iframe);
                } 
            }));
            
            // Preferences
            // prefs.add({
            //   "General" : {
            //       position: 100,
            //       "General" : {
            //           "Show Tray Icon" : {
            //               type: "checkbox",
            //               path: "user/local/@tray",
            //               position: 300
            //           }
            //           // "Use Native Title Bar (requires restart)" : {
            //           //     type : "checkbox",
            //           //     path : "user/local/@nativeTitle",
            //           //     position : 300
            //           // }
            //       }
            //   }
            // }, plugin);
            
            // Window
            win.on("minimize", function(){
                win.isMinimized = true;
                settings.set("state/local/window/@minimized", true);
            });
            win.on("restore", function(){
                win.isMinimized = false;
                settings.set("state/local/window/@minimized", false);
            });
            win.on("maximize", function(){
                win.isMaximized = true;
                settings.set("state/local/window/@maximized", true);
            });
            win.on("unmaximize", function(){
                win.isMaximized = false;
                settings.set("state/local/window/@maximized", false);
            });
            
            var handler = storeWindowSettings.bind(null, false);
            win.on("move", handler);
            win.on("resize", handler);
            win.on("enter-fullscreen", handler);
            win.on("leave-fullscreen", handler);

            terminal.on("setTerminalCwd", function() {
                return favs.favorites[0];
            });
            
            // login/logout
            auth.on("logout", function(argument) {
                clearCookies("c9.io");
                clearCookies("github.com");
                clearCookies("bitbucket.org");
            });
            
            // Add undo redo support for html elements
            var ta = {"INPUT":1, "TEXTAREA":1, "SELECT":1, "PRE": 1};
            document.addEventListener("focusin", function(e){
                var html = e.target;
                
                if (html.contentEditable || ta[html.tagName]) {
                    windowManager.connection.send(0, {
                        type: "enableUndoRedo"
                    });
                }
            });
        }
        
        /***** Methods *****/
        
        var timer;
        function storeWindowSettings(force) {
            if (!force) {
                clearTimeout(timer);
                timer = setTimeout(storeWindowSettings.bind(null, true), 1000);
                return;
            }
            
            settings.set("state/local/window/@fullscreen", win.isFullscreen);
                

            win.emit("savePosition");
            
            if (win.isFullscreen || win.isMaximized || win.isMinimized)
                return;
            
            settings.set("state/local/window/@position", win.x + ":" + win.y);
            settings.set("state/local/window/@size", win.width + ":" + win.height);
        }

        function toggleTray(to) {
            if (to) {
                // Create a tray icon
                tray = new Tray({ icon: 'favicon.ico' });

                // Give it a menu
                var menu = new Menu();
                menu.append(new MenuItem({ 
                    label: 'Visit c9.io', 
                    click: function(){
                        window.open("http://c9.io");
                    }
                }));
                menu.append(new MenuItem({ 
                    label: 'Show Developer Tools', 
                    click: function(){
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

        function switchNativeTitle(to) {

        }

        function setNativeTitle() {
            ui.insertCss(require("text!./local.less"), options.staticPrefix, plugin);
            
            var platform = process.platform; // c9.platform is remote os platform so we use process instead
            var titleHeight = platform == "win32" ? 27 : 23;
            
            var isMaximized = settings.get("state/local/window/@maximized");
            
            error.top = titleHeight + 1;
            
            var div = document.body.appendChild(document.createElement("div"));
            div.className = "window-border";
            
            // Move elements down to make room for the title bar
            layout.getElement("root").setAttribute("anchors", titleHeight + " 0 0 0");
            document.querySelector(".c9-mbar-round").style.display = "none";
            document.querySelector(".c9-mbar-logo").style.paddingTop = "0";
            document.querySelector(".c9-menu-bar .c9-mbar-cont").style.paddingRight = "16px";
            
            ui.setStyleRule(".right .panelsbar", "top", "-1px");
            ui.setStyleRule(".right .panelsbar", "position", "absolute");
            
            var logobar = layout.getElement("logobar");
            if (!menus.minimized)
                logobar.setHeight(27);
            logobar.$ext.style.maxHeight = "27px";
            
            titlebar = document.body.appendChild(document.createElement("div"));
            titlebar.className = "window-titlebar focus " + platform + (isMaximized ? " maximized" : "");

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
            win.on("move", function(x, y) {
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
                document.body.classList.remove("fullscreen");
            });
            var enterFullscreen = function(){
                layout.getElement("root").setAttribute("anchors", "0 0 0 0");
                titlebar.style.display = "none";
                document.body.classList.add("fullscreen");
            }
            win.on("enter-fullscreen", enterFullscreen);
            
            if (win.isFullscreen) enterFullscreen();
            
            var menubar = document.querySelector(".c9-menu-bar");
            menubar.style.backgroundPosition = "0 -4px";
            menubar.style.webkitUserSelect = "none";
        }
        
        function focusWindow(){
            // To support all platforms, we need to call both show and focus
            win.show();
            win.focus();
        }
        
        function validateWindowGeometry(fitInScreen) {
            if (settings.get("state/local/window/@maximized"))
                return;
                
            // Check if Window Position is In view
            var changedSize;
            var changedPos;
            
            var width = Math.max(400, win.width);
            var height = Math.max(300, win.height);
            
            if (width > screen.availWidth) {
                width = screen.availWidth;
                changedSize = true;
            }
            
            if (height > screen.availHeight) {
                height = screen.availHeight;
                changedSize = true;
            }
            
            var left = win.x;
            var top = win.y;
            
            var minLeft = screen.width - screen.availWidth; // Guestimate
            if (left < minLeft) {
                left = screen.availLeft;
                changedPos = true;
            }
            else if (left > screen.availWidth + screen.availLeft) {
                left = screen.availWidth + screen.availLeft - 100;
                changedPos = true;
            }
            
            if (top < screen.availTop) {
                top = screen.availTop;
                changedPos = true;
            }
            else if (top > screen.availHeight + screen.availTop) {
                top = screen.availHeight + screen.availTop - 100;
                changedPos = true;
            }
            else if (fitInScreen && height + top > screen.availTop + screen.availHeight) {
                top = screen.availTop;
                height = screen.availHeight;
                changedPos = true;
                changedSize = true;
            }
            
            if (changedPos)
                win.moveTo(left, top);
            
            if (changedSize)
                win.resizeTo(width, height);
        }
        
        function installMode(){
            focusWindow();
        }
        
        function open(path, cb) {
            openPath.open(path, cb);
            focusWindow();
        }
        
        function clearCookies(domain) {
            win.cookies.getAll(domain ? {domain: domain} : {}, function(cookies) {
                cookies.forEach(function(c) {
                    win.cookies.remove({
                        url: "http" + (c.secure ? "s" : "") + "://" + c.domain + c.path,
                        name: c.name
                    });
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
            focusWindow: focusWindow,
            
            /**
             * 
             */
            installMode: installMode,
            
            /**
             * 
             */
            open: open
        });
        
        register(null, {
            local: plugin
        });
    }
});
