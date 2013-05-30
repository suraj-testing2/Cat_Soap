// Google BSD license http://code.google.com/google_bsd_license.html
// Copyright 2012 Google Inc. johnjbarton@google.com

(function() {

  'use strict';   
 
  var debug = DebugLogger.register('Log', function(flag){
    return debug = (typeof flag === 'boolean') ? flag : debug;
  });
  var totalLogs = 0;
  
  var messagePrototype = {
    tooltip: function() {
     totalLogs++;
     if (debug)
      console.log('Message.tooltip: total logs : '+totalLogs);

     return 'load: ' + this.loadNumber + ' turn: ' + this.turnNumber + '| ' + this.text;
    }
  };
  
  QuerypointPanel.Console = {
    __proto__: chrome.devtools.protocol.Console.prototype,
    onMessageAdded: {
      addListener: function(fnc) {
        QuerypointPanel.Console.messageAdded = fnc;
        if (!QuerypointPanel.Console._registered) {
          QuerypointPanel.Console.addListeners();
          QuerypointPanel.Console._registered = true;
        }
      }
    }
  };

  QuerypointPanel.Log = {

    initialize: function(project, loadListViewModel, turnScrubber) {
      this.project = project;
      this._loadListViewModel = loadListViewModel;
      this._turnScrubber = turnScrubber;
      
      QuerypointPanel.Console.onMessageAdded.addListener(this._onMessageAdded.bind(this));
      return this;
    },
    
    disconnect: function() {
      QuerypointPanel.Console.messageAdded = function(message) {}
    },
    
    _onMessageAdded: function(message) {
      this._reformatMessage(this._parse(message));
    },
    
    _onReload: function(segments) {
      var loadNumber = parseInt(segments[2], 10);
      this._loadListViewModel.onBeginLoad(loadNumber); 
      this._turnScrubber.onBeginLoad(loadNumber);
      this.currentLoad = this._loadListViewModel.lastLoad();
    },  

    _onLoadEvent: function(segments) {
      var loadNumber = parseInt(segments[2], 10);
      this._loadListViewModel.onEndLoad(loadNumber);
    },    
    
    _onStartTurn: function(segments, messageSource) {
      messageSource.qp = false;                       // Start turn message need will be displayed in console with severity 'turn'
      messageSource.severity = 'turn';
      this.currentLoad.onTurnStarted(JSON.parse(unescape(segments[2])));
      this._turnInProgress = this.currentLoad.currentTurn();

      if (this._turnInProgress.registrationTurnNumber)
        this._turnInProgress.registrationTurn = this.currentLoad.turns()[this._turnInProgress.registrationTurnNumber];
      else if (this._turnInProgress.turnNumber !== 1)
        console.error("No registrationTurnNumber for turn " + this._turnInProgress.turnNumber, this._turnInProgress);

      messageSource.text = 'Turn ' + this._turnInProgress.turnNumber + ' started. (' + this._turnInProgress.summary() + ')';
    },

    _onEndTurn: function(segments) {
      this.currentLoad.onTurnEnded(parseInt(segments[2], 10));
      this._turnScrubber.updateSize();
    },

    _onSetTimeout: function(segments) {
      this._turnInProgress.onSetTimeout( segments[2], segments[3] );
    },

    _onAddEventListener: function(segments) {
      this._turnInProgress.onAddEventListener( segments[2], segments[3] );      
    },
    
    _onReplayComplete: function() {
      this._turnScrubber.onReplayComplete();
    },

    _parse: function(messageSource) {
      var mark = messageSource.text.indexOf('qp|');
      if (mark === 0) {
        messageSource.qp = true;
        var segments = messageSource.text.split(' ');
        var keyword = segments[1];
        switch(keyword) {
          case 'loadEvent': this._onLoadEvent(segments); break;
          case 'reload': this._onReload(segments); break;
          case 'startTurn': this._onStartTurn(segments, messageSource); break;
          case 'endTurn': this._onEndTurn(segments); break;
          case 'script': this.project.addScript(segments[2]); break; 
          case 'debug': break;
          case 'setTimeout': this._onSetTimeout(segments); break;
          case 'addEventListener': this._onAddEventListener(segments); break;
          case 'replayComplete': this._onReplayComplete(); break;
          default: console.error('Log._parse: unknown keyword: '+messageSource.text); break;
        }
      } else {  // not a qp message
          var started = this.currentLoad.turnStarted();
          if ( started && started === this.currentLoad.turnEnded()) 
              console.error('QPRuntime error: No turn for message after turn %o', this._turnInProgress.turnNumber);
      }
      messageSource.loadNumber = this._loadListViewModel.loadStartedNumber();
      messageSource.turn = this._turnInProgress;
      return messageSource; 
    },

    _reformatMessage: function(messageSource) {
      if (messageSource.qp) return;
      messageSource.__proto__ = messagePrototype;
      messageSource.severity = messageSource.severity || messageSource.level;
      messageSource.position = this._turnInProgress.messages().length;
      this._turnInProgress.messages.push(messageSource);  // per turn view under turnScrubber
      this._turnScrubber.updateTurnIndicator(messageSource);
      if (debug){
        console.log('QuerypointPanel.Log._reformat messages.length ' + this._turnInProgress.messages().length);
      }
    },
    
    extractMessages: function(first, last) {  // TODO remove
      var visibleMessages = [];
      //messageSource.odd = (--visibleLines) % 2;
      return this._loadListViewModel.loadViewModels();
    },
    
    pageWasReloaded: function(runtimeInstalled, runtimeInstalling) {
      if (runtimeInstalled)
        this.initialize(this.project, this._loadListViewModel, this._turnScrubber);
      else
        this.disconnect();
    }
  };

}());
