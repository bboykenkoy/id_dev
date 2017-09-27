var express = require('express');
var router = express.Router();
var mysql = require('mysql');
var config = require('../config.js');
var bodyParser = require('body-parser');
var escapeSQL = require('sqlstring');
var jwt = require('jsonwebtoken');
var moment = require('moment-timezone');

var atob = require('atob');
var btoa = require('btoa');

var async = require('async');

//-- APNS
var apn = require('apn');
var apnService = new apn.Provider({
    cert: "certificates/cert.pem",
    key: "certificates/key.pem",
});

var fetchUrl = require("fetch").fetchUrl;
var cheerio = require("cheerio");
var imgur = require('imgur');
imgur.setClientId('7cb30e33649106f');
imgur.setAPIUrl('https://api.imgur.com/3/');

// parse application/x-www-form-urlencoded
var urlParser = bodyParser.urlencoded({extended: false});
// parse application/json
router.use(bodyParser.json());

/// ----- MAIL
var nodemailer = require('nodemailer');
let transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // secure:true for port 465, secure:false for port 587
    auth: {
        user: 'spitfirewar1995@gmail.com',
        pass: 'kzjcnfgjdrjwgwhl'
    }
});

/*********--------------------------*********
 **********------- MYSQL CONNECT ----*********
 **********--------------------------*********/
var client;
function startConnection() {
    console.error('CONNECTING');
    client = mysql.createConnection({
        host: config.mysql_host,
        user: config.mysql_user,
        password: config.mysql_pass,
        database: config.mysql_data
    });
    client.connect(function (err) {
        if (err) {
            console.error('CONNECT FAILED USERS', err.code);
            startConnection();
        } else {
            console.error('CONNECTED USERS');
        }
    });
    client.on('error', function (err) {
        if (err.fatal)
            startConnection();
    });
}
startConnection();
client.query("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci", function (error, results, fields) {
    if (error) {
        console.log(error);
    } else {
        console.log("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
    }
});
client.query("SET CHARACTER SET utf8mb4", function (error, results, fields) {
    if (error) {
        console.log(error);
    } else {
        console.log("SET CHARACTER SET utf8mb4");
    }
});
/*********--------------------------*********
 **********------- FUNCTION ------*********
 **********--------------------------*********/

/*********--------SIGNIN----------*********/
router.post('/signin', urlParser, function (req, res) {
    var userSQL = "SELECT * FROM `administrator` WHERE `username`='" + req.body.username + "' AND `password`='" + req.body.password + "'";
    client.query(userSQL, function (error, data, fields) {
        if (error) {
            console.log(error);
            return res.sendStatus(300);
        } else {
            if (data.length > 0) {

                var currentTime = moment().tz('Asia/Ho_Chi_Minh').format('YYYY-MM-DD hh:mm:ss');
                var data_key = data[0].id;
                var data_name = data[0].username;
                var data_pass = data[0].password;

                var json = {pass: data_pass, current_time: currentTime, id: data_key, username: data_name};
                var token = jwt.sign(json, config.secretAdmin, {expiresIn: '1h'});

                var dataSQL = "UPDATE `administrator` SET `access_token`='" + token + "' WHERE `username`='" + req.body.username + "' AND `password`='" + req.body.password + "'";
                client.query(dataSQL, function (eUpdate, dUpdate, fUpdate) {
                    if (eUpdate) {
                        console.log(eUpdate);
                        return res.sendStatus(300);
                    } else {
                        var datafull = data;
                        datafull.access_token = token;
                        return res.send(echoResponse(200, datafull, 'success', false));
                    }
                });
            } else {
                return res.send(echoResponse(404, 'This administrator is not exists.', 'success', true));
            }
        }
    });
});

/*********--------GET ALL USER----------*********/
router.get('/type=users', function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'] || req.params.access_token;
    if (token) {
        jwt.verify(token, config.secretAdmin, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                ///-----Check nếu tồn tại access_token thì chạy xuống dưới
                var userSQL = "SELECT `facebook_id` FROM `users` WHERE `key` NOT IN (SELECT `users_key` FROM `facebook_informations`)";
                var dk3 = " AND `key` NOT IN (SELECT `users_key` FROM `facebook_friends`)";
                var dk4 = " AND `facebook_id` NOT IN (SELECT `facebook_id` FROM `facebook_bot`)";
                var limit = "LIMIT 10";
                client.query(userSQL+dk3+dk4+limit, function (error, data, fields) {
                    if (error) {
                        console.log(error);
                        return res.sendStatus(300);
                    } else {
                        if (data.length > 0) {
                            var n = getRandomInt(0,100);
                            var nameBot = "BOT"+n;
                            async.forEachOf(data, function(element, i, callback){
                                client.query("INSERT INTO `facebook_bot`(`name`,`facebook_id`) VALUES ('"+nameBot+"','"+data[i].facebook_id+"')");
                                if (i === data.length-1) {
                                    return res.send(echoResponse(200, data, "success", false));
                                }
                            });
                        } else {
                            return res.send(echoResponse(404, 'No user.', 'success', true));
                        }
                    }
                });
                //---- Kết thúc đoạn xử lý data
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});

/*********--------------------------*********
 **********------ ECHO RESPONSE -----*********
 **********--------------------------*********/
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
function isBase64(str) {
    try {
        return btoa(atob(str)) == str;
    } catch (err) {
        return false;
    }
}
function echoResponse(status, data, message, error) {
    return JSON.stringify({
        status: status,
        data: data,
        message: message,
        error: error
    });
}
function echo5Response(status, data, other, message, error) {
    return JSON.stringify({
        status: status,
        data: data,
        other: other,
        message: message,
        error: error
    });
}

module.exports = router;
