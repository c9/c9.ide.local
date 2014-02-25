/*global nativeRequire*/
define(function(require, exports, module) {
    main.consumes = [
        "c9", "Plugin", "fs", "util", "proc", "dialog.alert", "dialog.confirm",
        "http"
    ];
    main.provides = ["local.update"];
    return main;

    function main(options, imports, register) {
        var c9       = imports.c9;
        var Plugin   = imports.Plugin;
        var confirm  = imports["dialog.confirm"].show;
        var alert    = imports["dialog.alert"].show;
        var fs       = imports.fs;
        var proc     = imports.proc;
        var http     = imports.http;
        
        var join     = require("path").join;
        var dirname  = require("path").dirname;

        /***** Initialization *****/
        
        var plugin = new Plugin("Ajax.org", main.consumes);
        // var emit   = plugin.getEmitter();
        
        var HOST        = options.host || "localhost";
        var PORT        = options.port || "8282";
        var BASH        = options.bashBin || "bash";
        var installPath = options.installPath.replace(/^~/, c9.home);
        
        var loaded = false;
        function load(){
            if (loaded) return false;
            loaded = true;

            // At startup check for updates
            checkForUpdates();
            
            // Then check for updates once every 15 minutes
            setInterval(checkForUpdates, 60 * 15 * 1000);
        }
        
        /***** Methods *****/
        
        function checkForUpdates(){
            var url = "http://" + HOST + ":" + PORT + "/update";
            http.request(url, {}, function(err, date, res){
                isNewer(date, function(err, newer){
                    if (err) return;
                
                    if (newer)
                        downloadLatest(date);
                });
            });
        }
        
        function isNewer(date, callback){
            fs.readFile(installPath + "/version", function(err, currentDate){
                if (!currentDate) currentDate = 0;
                
                var newer = parseInt(currentDate, 10) < parseInt(date, 10);
                callback(null, newer);
            });
        }
        
        function downloadLatest(date){
            if (!c9.has(c9.NETWORK))
                return;
            
            fs.exists(installPath + "/updates/" + date, function(exists){
                var url    = "http://" + HOST + ":" + PORT + "/update/" + c9.platform + "/" + date;
                var target = installPath + "/updates/" + date;
                
                if (exists) {
                    return decompress(date, target);
                }
                
                fs.mkdir(installPath + "/updates", function(){
                    proc.execFile("curl", {
                        args : [url, "-o", target, "--post301", "--post302"],
                    }, function(err1, stdout, stderr){
                        if (err1) {
                            var minP = "-P" + installPath + "/updates";
                            
                            proc.execFile("wget", {
                                args : [url, minP, "--no-check-certificate"],
                            }, function(err2, stdout, stderr){
                                if (err2) {
                                    alert(
                                        "Unable to download update",
                                        "Got errors while attempting to download update to Cloud9",
                                        "I tried to download using curl and wget. See the browser's log for more info. "
                                            + "Contact support@c9.io to help your resolve this issue."
                                    );
                                    
                                    console.error(err1.message);
                                    console.error(err2.message);
                                    return;
                                }
                                
                                decompress(date, target);
                            });
                            return;
                        }
                        decompress(date, target);
                    });
                });
            });
        }
        
        function decompress(date, target){
            fs.rmdir(installPath + "/updates/app.nw", { recursive: true }, function(){
                proc.execFile("tar", {
                    args : ["-zxf", target],
                    cwd  : dirname(target)
                }, function(err, stdout, stderr){
                    if (err) {
                        fs.unlink(target, function(){});
                        return;
                    }
                
                    // fs.writeFile(installPath + "/updates/app.nw/version", date, function(){
                        update(date);
                    // });
                });
            });
        }
        
        function flagUpdate(date){
            if (typeof document === "undefined")
                return;
            
            var mainlogo = document.querySelector(".c9-mbar-round .mainlogo");
            mainlogo.className += " update";
            
            mainlogo.title     = "Update Cloud9 to a newer version";
            mainlogo.href      = "javascript:void(0)";
            mainlogo.target    = "";
            mainlogo.innerHTML = "Update";
            
            mainlogo.addEventListener("mousedown", function(e){
                e.stopPropagation();
            });
            
            mainlogo.addEventListener("click", function(e){
                showUpdatePopup(date);
            });
        }
        
        function showUpdatePopup(date){
            confirm("Cloud9 needs to be updated", 
                "Update Available", 
                "There is an update available of Cloud9. "
                    + "Click OK to restart and update Cloud9.", 
                function(){
                    restart();
                }, 
                function(){
                    // Do nothing
                });
        }
        
        //@TODO needs to be platform specific
        function getC9Path(){
            return options.path + "/bin/c9";
        }
        
        function update(date){
            var script = join(getC9Path(), "../../scripts/checkforupdates.sh");
            
            var path = options.path;
            var appRoot, appPath;
            
            if (c9.platform == "linux") {
                // @todo
                return alert("Unsupported Platform");
            }
            else if (c9.platform == "win32") {
                appPath = path;
                appRoot = path.substr(0, path.lastIndexOf("/"));
            }
            else if (c9.platform == "darwin") {
                if (path.indexOf("Contents/Resources") == -1)
                    path = "/Applications/Cloud9.app/Contents/Resources/app.nw";
                
                appPath = path;
                appRoot = path.substr(0, path.lastIndexOf("/"));
            }
            
            proc.spawn(BASH, {
                args: [script, appRoot, appPath, installPath, date]
            }, function(err, child){
                if (err) return console.error(err);
                
                child.stdout.on("data", function(chunk){
                    console.log(chunk);
                });
                
                child.stderr.on("data", function(chunk){
                    console.log(chunk);
                });
                
                child.on("exit", function(code){
                    if (code !== 0) {
                        console.log("Update Failed.");
                        // @todo cleanup
                    }
                    else {
                        // restart();
                        flagUpdate(date)
                    }
                });
            });
        }
        
        function restart(){
            proc.spawn(getC9Path(), {
                args     : ["restart"],
                detached : true
            }, function(err, process){
                if (err) return;

                // required so the parent can exit
                process.unref();
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
            checkForUpdates : checkForUpdates,
            restart: restart,
        });
        
        register(null, {
            "local.update": plugin
        });
    }
});
