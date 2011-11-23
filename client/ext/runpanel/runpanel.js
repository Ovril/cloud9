/**
 * Node Runner Module for the Cloud9 IDE
 *
 * @copyright 2010, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */

define(function(require, exports, module) {

var ide = require("core/ide");
var ext = require("core/ext");
var noderunner = require("ext/noderunner/noderunner");
var panels = require("ext/panels/panels");
var settings = require("ext/settings/settings");
var save = require("ext/save/save");
var markup = require("text!ext/runpanel/runpanel.xml");
var buttonsMarkup = require("text!ext/runpanel/runbuttons.xml");

module.exports = ext.register("ext/runpanel/runpanel", {
    name    : "Run Panel",
    dev     : "Ajax.org",
    type    : ext.GENERAL,
    alone   : true,
    //offline : false,
    markup  : markup,
    deps    : [noderunner],
    commands : {
        "run": {
            "hint": "run and debug a node program on the server",
            "commands": {
                "[PATH]": {"hint": "path pointing to an executable. Autocomplete with [TAB]"}
            }
        },
        "stop": {
            "hint": "stop a running node program on the server",
            "commands": {
                "[PATH]": {"hint": "path pointing to an executable. Autocomplete with [TAB]"}
            }
        }
    },
    
    hotitems: {},

    nodes : [],
    nodesRest : [],
    
    hook : function(){
        panels.register(this);

        var btn = this.button = navbar.insertBefore(new apf.button({
            skin    : "mnubtn",
            state   : "true",
            "class" : "project_files",
            caption : "Run"
        }), navbar.lastChild.previousSibling);
        
        var _self = this;
        btn.addEventListener("mousedown", function(e){
            var value = this.value;
            if (navbar.current && (navbar.current != _self || value)) {
                navbar.current.disable(navbar.current == _self);
                if (value)
                    return;
            }

            panels.initPanel(_self);
            _self.enable(true);
        });
      
        apf.document.body.insertMarkup(buttonsMarkup);
        
        this.nodesRest.push(
            mnuRunCfg,
            mnuDebugSettings
        );
        
        while(tbRun.childNodes.length) {
            var button = tbRun.firstChild;
            
            ide.barTools.appendChild(button);
            if (button.nodeType == 1) {
                this.nodesRest.push(button);
            }
        }
        
        mdlRunConfigurations.addEventListener("afterload", function(e) {
            _self.$updateMenu();
        });
        mdlRunConfigurations.addEventListener("update", function(e) {
            settings.save();
            if (e.action == "add" || e.action == "redo-remove" || e.action == "attribute")
                _self.$updateMenu();
        });

        ide.addEventListener("loadsettings", function(e){
            var runConfigs = e.model.queryNode("auto/configurations");
            if (!runConfigs)
                runConfigs = apf.createNodeFromXpath(e.model.data, "auto/configurations");

            mdlRunConfigurations.load(runConfigs);
            
            if (!runConfigs.selectSingleNode("config[@curfile]")) {
                var cfg = apf.n("<config />")
                    .attr("name", "Currently Active File")
                    .attr("curfile", "1").node();
                runConfigs.insertBefore(cfg, runConfigs.firstChild);
            }
        });
        
        this.hotitems["run"]  = [btnRun];
        this.hotitems["stop"] = [btnStop];
    },

    init : function(amlNode){
        this.panel = winRunPanel;

        colLeft.appendChild(winRunPanel);
        
        var page = tabEditors.getPage();
        if (page) {
            var path = page.$model.queryValue("@path").replace(/^\/workspace\//, "");
            mdlRunConfigurations.setQueryValue("config[@curfile]/@path", path);
            mdlRunConfigurations.setQueryValue("config[@curfile]/@name", 
                path.split("/").pop() + " (active file)");
        }
        
        tabEditors.addEventListener("afterswitch", function(e){
            var page = e.nextPage;
            var path = page.$model.queryValue("@path").replace(/^\/workspace\//, "");
            mdlRunConfigurations.setQueryValue("config[@curfile]/@path", path);
            mdlRunConfigurations.setQueryValue("config[@curfile]/@name", 
                path.split("/").pop() + " (active file)");
        });
    },

    duplicate : function() {
        var config = lstRunCfg.selected;
        if (!config)
            return;

        var duplicate = config.cloneNode(true);
        apf.b(config).after(duplicate);
        lstRunCfg.select(duplicate);
        winRunPanel.show();
    },

    addConfig : function() {
        var file = ide.getActivePageModel();
        var extension = "";

        if (!file || (file.getAttribute("contenttype") || "").indexOf("application/javascript") != 0 && (file.getAttribute("contenttype") || "").indexOf("text/x-script.python") != 0) {
            var path = "";
            var name = "server";
        }
        else {
            path  = file.getAttribute("path").slice(ide.davPrefix.length + 1);
            name  = file.getAttribute("name").replace(/\.(js|py)$/, function(full, ext){ extension = ext; return ""; });
        }

        var cfg = apf.n("<config />")
            .attr("path", path)
            .attr("name", name)
            .attr("extension", extension)
            .attr("args", "").node();

        mdlRunConfigurations.appendXml(cfg);
        lstRunCfg.select(cfg);
    },

    showRunConfigs : function() {
        this.enable();
    },

    run : function(debug) {
        this.runConfig(self.winRunPanel && winRunPanel.visible
            ? lstRunCfg.selected
            : (this.$lastRun 
                || mdlRunConfigurations.queryNode("config[@curfile]")), 
            itmDebug.checked);
        ide.dispatchEvent("track_action", {type: debug ? "debug" : "run"});
    },

    $updateMenu : function() {
        var menus = [mnuRunCfg];

        for (var j=0; j<menus.length; j++) {
            var menu = menus[j];

            var item = menu.firstChild;
            while(item && item.tagName !== "a:divider") {
                menu.removeChild(item);
                item = menu.firstChild;
            }
            var divider = item;

            var configs = mdlRunConfigurations.queryNodes("config");
            if (!configs.length)
                menu.insertBefore(new apf.item({disabled:true, caption: "no run history"}), divider);
            else {
                for (var i=0,l=configs.length; i<l; i++) {
                    var item = new apf.item({
                        caption: configs[i].getAttribute("name"),
                        type : "check",
                        checked : (this.$lastRun 
                            ? this.$lastRun == configs[i] 
                            : configs[i].getAttribute("curfile")) ? true : false
                    });
                    item.$config = configs[i];

                    var _self = this;
                    item.onclick = function() {
                        _self.runConfig(this.$config, itmDebug.checked);
                        lstRunCfg.select(this.$config);
                    }.bind(item);
                    menu.insertBefore(item, menu.childNodes[menu.childNodes.length - 2]);
                }
            }
        }
    },

    runConfig : function(config, debug) {
        var model = settings.model;
        var saveallbeforerun = model.queryValue("general/@saveallbeforerun");
        if (saveallbeforerun) save.saveall();
        
        if (debug === undefined)
            debug = config.parentNode.getAttribute("debug") == "1";

        this.$lastRun = config;
        this.$updateMenu();

        noderunner.run(config.getAttribute("path"), config.getAttribute("args").split(" "), debug);
    },

    stop : function() {
        noderunner.stop();
    },

    enable : function(noButton){
        ext.initExtension(this);
        
        if (self.winRunPanel) {
            winRunPanel.show();
            winRunPanel.parentNode.setWidth(this.$lastWidth || 400);
        }
        colLeft.show();
        
        if (!noButton) {
            this.button.setValue(true);
            if(navbar.current && (navbar.current != this))
                navbar.current.disable(false);
        }
        
        splitterPanelLeft.show();
        navbar.current = this;
        
        if (this.$lastRun)
            lstRunCfg.select(this.$lastRun);
        
        this.nodes.each(function(item){
            item.enable();
        });
    },

    disable : function(noButton){
        if (self.winRunPanel) {
            this.$lastWidth = winRunPanel.parentNode.width;
            winRunPanel.hide();
        }
        if (!noButton)
            this.button.setValue(false);
        
        splitterPanelLeft.hide();
        
        this.nodes.each(function(item){
            item.disable();
        });
    },

    destroy : function(){
        this.nodes.each(function(item){
            item.destroy(true, true);
        });
        this.nodesRest.each(function(item){
            item.destroy(true, true);
        });
        this.nodes = [];
        this.nodesRest = [];
    }
});

});