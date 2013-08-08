var util = require('util'),
  stream = require('stream'),
  exec = require('child_process').exec;
var http = require('http');
var https = require('https');
var fs = require('fs');

util.inherits(Driver,stream);
util.inherits(Device,stream);

var log = console.log;

function Driver(opts,app) {
  var self = this;

  app.on('client::up',function(){
    self.emit('register', new Device(app));
  });

}

function Device(app) {
  var self = this;

  this._app = app;
  this.writeable = false;
  this.readable = true;
  this.V = 0;
  this.D = 256;
  this.G = 'ScreenCapture';
  this.name = 'Screen Capture - ' + require('os').hostname();

}

Device.prototype.write = function() {
  var self = this;
  var filename = '/tmp/ninja-screen-capture-' + new Date().getTime() + '.jpg';
  exec('screencapture -x -C -t jpg ' + filename, function(error, stdout, stderr) {
    if (!error && !stderr) {
      exec('sips -Z 640 ' + filename, function(error, stdout, stderr) {
        if (!error) {
          console.log('Sending screen shot', filename);
          self.sendScreenshot(filename);
        } else {
          console.error(error, stderr);
        }
      });
    } else {
      console.error(error, stderr);
    }
  });
};


Device.prototype.sendScreenshot = function(filename) {

  var length = fs.statSync(filename).size;

  console.log('Stats', fs.statSync(filename));

  var self = this;

  var postOptions = {
    host:self._app.opts.streamHost,
    port:self._app.opts.streamPort,
    path:'/rest/v0/camera/'+self._guid+'/snapshot',
    method:'POST',
    headers: {
      'X-Ninja-Token': self._app.token
      , 'Content-Type' : 'image/jpeg'
      , 'Content-Length': length
      , 'Expires' : 'Mon, 3 Jan 2000 12:34:56 GMT'
      , 'Pragma' : 'no-cache'
      , 'transfer-encoding' : 'chunked'
      , 'Connection' : 'keep-alive'
    }
  };

  var proto = (self._app.opts.streamPort==443) ? https:http;

  //send a file to the server
  var fileStream = fs.createReadStream(filename);

  var postReq = proto.request(postOptions,function(postRes) {
      postRes.on('end',function() {
        log('Stream Server ended');
      });
      postRes.resume();
  });

  postReq.on('error',function(err) {
    log('Error sending screen capture: ');
    log(err);
  });

  var lenWrote=0;
  fileStream.on('data',function(data) {
    postReq.write(data,'binary');
    lenWrote+=data.length;
  });

  fileStream.on('end',function() {
    postReq.end();
    log("Screen capture sent %s",lenWrote);
  });
  fileStream.resume();

  fileStream.on('error',function(error) {
    log(error);
  });
 // fileStream.end();

};

module.exports = Driver;
