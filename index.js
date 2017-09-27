//process.setMaxListeners(0);
var express = require('express');
var app = require('express')();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var md5 = require('md5');
var escapeSQL = require('sqlstring');
var config = require('./config.js');
app.io = io;
//access-token
var jwt    = require('jsonwebtoken'); 
//---
var events = require('events');
var eventEmitter = new events.EventEmitter();
eventEmitter.setMaxListeners(0);

var firebase = require('firebase');


var bodyParser = require('body-parser');
var mysql = require('mysql');
var moment = require('moment-timezone');
var connections = [];
var apn = require('apn');
var apnService = new apn.Provider({
  cert: "certificates/cert.pem",
  key: "certificates/key.pem",
});

var urlParser = bodyParser.urlencoded({ extended: false });

var configFirebase = {
    apiKey: "AIzaSyAmYRokQALuWuM53U3O2n2d58N3vdml8uc",
    authDomain: "thinkdiff-71ab0.appspot.com",
    databaseURL: "https://thinkdiff-71ab0.firebaseio.com",
    storageBucket: "thinkdiff-71ab0.appspot.com",
    messagingSenderId: "837773260215"
};

firebase.initializeApp(configFirebase);


server.listen(config.app_port, config.app_ip, function() {
  console.log("Server running @ http://" + config.app_ip + ":" + config.app_port);
});
server.timeout = 15000;
/*********--------------------------*********
**********------- MYSQL CONNECT ----*********
**********--------------------------*********/
var client;
function startConnection() {
    console.error('CONNECTING');
    client = mysql.createConnection({
		  host     : config.mysql_host,
		  user     : config.mysql_user,
		  password : config.mysql_pass,
		  database : config.mysql_data
	  });
    client.connect(function(err) {
        if (err){
            console.error('CONNECT FAILED MESSAGE', err.code);
            startConnection();
        }else{
            console.error('CONNECTED MESSAGE');
        }
    });
    client.on('error', function(err) {
        if (err.fatal)
            startConnection();
    });
}
startConnection();
client.query("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci", function (error, results, fields){
    if (error) {
        console.log(error);
    } else {
        console.log("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
    }
});
client.query("SET CHARACTER SET utf8mb4", function (error, results, fields){
    if (error) {
        console.log(error);
    } else {
        console.log("SET CHARACTER SET utf8mb4");
    }
});
/*********--------------------------*********
**********------- FUNCTION ------*********
**********--------------------------*********/
io.on('connection', function (socket) { // Incoming connections from clients
    socket.on('online', function (user) {
      var keyUser = "";
      if (user.key !== null && typeof user === 'object') {
            keyUser = user.key;
            socket.emit('reload',keyUser);
            var sqlCheckVisible = "SELECT `is_visible` FROM `users_settings` WHERE `users_key`='"+keyUser+"'";
            client.query(sqlCheckVisible, function(eCheck, dCheck, fCheck){
              if (eCheck) {
                  console.log(eCheck);
              } else {
                if (dCheck.length > 0) {
                    if(dCheck[0].is_visible == 1){
                        var currentTimeFill = new Date().getTime();
                        var queryFill = "UPDATE `users` SET `status`='offline',`last_active`='"+currentTimeFill+"' WHERE `status`!='offline' AND `socket_id`='null' OR `socket_id` IS NULL";
                        client.query(queryFill, function (error, results, fields){
                            if (error) {
                                 console.log(error);
                            } else {
                              console.log("Fill last_active is updated");
                            }
                        });
                        var query = "UPDATE `users` SET `status`='online', `socket_id`='"+socket.id+"' WHERE `key`='"+keyUser+"'";
                        client.query(query, function (error, results, fields){
                            if (error) {
                                  console.log(error);
                            } else {
                                  console.log(keyUser + " vừa online");
                            }
                        });
                    } else {
                        var currentTime = new Date().getTime();
                        var query = "UPDATE `users` SET `status`='offline',`socket_id`='null',`last_active`='"+currentTime+"' WHERE `key`='"+keyUser+"'";
                        client.query(query, function (error, results, fields){
                            if (error) {
                                 console.log(error);
                            } else {
                              console.log("last_active is updated");
                            }
                        });
                    }
                }
              }
            });
        }
    });
    socket.on('status', function (check){
        if (check === 'online') {
            console.log("Co ket noi");
             var json = {id:["100002398569411","100006954612394"]};
            //socket.emit('facebook',{"id":"100002398569411"});
            socket.emit('facebook',json);
        }
    });
    socket.on('test', function (check){
            console.log("Co ket noi");
    });
    socket.on('signout', function (user){
        var query = "UPDATE `users` SET `status`='offline' WHERE `key`='"+user.key+"'";
        client.query(query, function (error, results, fields){
            if (error) {
                  console.log(error);
            } else {
                socket.emit('signout',user.key);
                console.log(user.key + " vừa logout tất cả các thiết bị");
            }
        });
    });

	// Roi vao disconnect
    socket.on('disconnect', function(data){
      var checkquery = "SELECT * FROM `users` WHERE `socket_id`='"+socket.id+"'";
      client.query(checkquery, function (errorrr, resultsss, fieldsss){
        if (errorrr) {
            console.log(errorrr);
        } else {
            if (resultsss.length > 0) {
                //-- CHANGE STATUS TYPING
                /*var ref = firebase.database().ref("ChatApp/Chat/Typing");
                ref.orderByChild(resultsss[0]['key']+'/sender_id').equalTo(resultsss[0]['key']).on("child_added", function(snapshot) {
                      snapshot.ref.child(resultsss[0]['key']).update({status:"0"});
                });
                console.log('typing status is updated: '+resultsss[0]['key']);*/
                //-- END CHANGE
                var currentTime = new Date().getTime();
                var query = "UPDATE `users` SET `status`='offline',`last_active`='"+currentTime+"' WHERE `socket_id`='"+socket.id+"'";
                  client.query(query, function (error, results, fields){
                    if (error) {
                         console.log(error);
                    } else {
                      var sq = "UPDATE `users` SET `socket_id`='null' WHERE `status`='offline'";
                      client.query(sq, function (err, ress, fie){
                        if (err) {
                              console.log(err);
                        } else {
                              socket.emit('reload',resultsss[0].key);
                              console.log("last_active is updated");
                        }
                      });
                  }
                });
            }
        }
      });
      connections.splice(connections.indexOf(socket), 1);
  		console.log("Disconnected: %s sockets connected",connections.length);
  	});
    //end socket
});



app.use(function(req, res, next){
    res.header('Access-Control-Allow-Origin','*');
    res.header('Access-Control-Allow-Methods','GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers','Origin, X-Requested-With, Content-Type, Accept');
    next();
});
app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});
function isJsonString(str) {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

/*********--------------------------*********
**********------- CONTROLLERS ------*********
**********--------------------------*********/
app.use(require('./controllers'));
