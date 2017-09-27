var express = require('express');
var router = express.Router();
var mysql = require('mysql');
var config = require('../config.js');
var bodyParser = require('body-parser');
var escapeSQL = require('sqlstring');
var jwt = require('jsonwebtoken');
var moment = require('moment-timezone');
var _ = require('lodash');

var atob = require('atob');
var btoa = require('btoa');

var async = require('async');

//-- APNS
var apn = require('apn');
var apnService = new apn.Provider({
    cert: "certificates/cert.pem",
    key: "certificates/key.pem",
});
//-- FCM
var FCM = require('fcm-push');
var serverKey = config.android;
var collapse_key = 'com.android.abc';
var fcm = new FCM(serverKey);



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
var avatarApp = "http://i.imgur.com/rt1NU2t.png";

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



function fillPointDate(){
    var sql = "INSERT INTO `facebook_point`(facebook_id, users_key) SELECT `facebook_id`,`key` FROM `users` WHERE `key` NOT IN (SELECT `users_key` FROM `facebook_point`)";
    client.query(sql, function(error, data, fields){
        if (error) {
            console.log(error);
        } else {
            console.log("Fill Point Data Successfully");
        }  
    });
}

/*********--------SIGNUP----------*********/
router.post('/signup', urlParser, function (req, res) {
    if (!req.body.key) {
        return res.sendStatus(400);
    }
    var userSQL = "SELECT * FROM `users` WHERE `key`='" + req.body.key + "'";
    client.query(userSQL, function (error, data, fields) {
        if (error) {
            console.log(error);
            return res.sendStatus(300);
        } else {
            if (data.length > 0) {
                return res.send(echoResponse(404, 'This user already exists', 'success', true));
            } else {
                var value = [];
                var insert = [];
                for (var k in req.body) {
                    insert.push("`" + k + "`");
                    value.push("'" + req.body[k] + "'");
                }
                var sql = escapeSQL.format('INSERT INTO `users` SET ?', req.body);
                //var dataSQL = "INSERT INTO `users`(" + insert.toString() + ") VALUES(" + value.toString() + ")";
                client.query(sql, function (eInsert, dInsert, fInsert) {
                    if (eInsert) {
                        console.log(eInsert);
                        return res.sendStatus(300);
                    } else {
                        console.log("Vừa đăng ký thành công với email " + req.body.email + " bằng thiết bị " + req.body.device_name);
                        return res.send(echoResponse(200, 'Registered successfully.', 'success', false));
                    }
                });
                fillPointDate();
                client.query("INSERT INTO `users_settings`(`users_key`) VALUES('" + req.body.key + "')");
            }
        }
    });
});


/*********--------SIGNIN----------*********/
router.post('/signin', urlParser, function (req, res) {
    if (!req.body.key) {
        return res.sendStatus(400);
    }
    var userSQL = "SELECT * FROM `users` WHERE `key`='" + req.body.key + "'";
    client.query(userSQL, function (error, data, fields) {
        if (error) {
            console.log(error);
            return res.sendStatus(300);
        } else {
            if (data.length > 0) {

                var currentTime = moment().tz('Asia/Ho_Chi_Minh').format('YYYY-MM-DD hh:mm:ss');
                var data_key = data[0].key;
                var data_name = data[0].nickname;

                var json = {current_time: currentTime, key: data_key, nickname: data_name};
                var token = jwt.sign(json, config.secret, {expiresIn: '365d'});

                var insert = [];
                for (var k in req.body) {
                    if (k != 'access_token') {
                        insert.push("`" + k + "`=" + "'" + req.body[k] + "'");
                    }
                }
                var dataSQL = "UPDATE `users` SET " + insert.toString() + ", `access_token`='" + token + "' WHERE `key`='" + req.body.key + "'";
                
                client.query(dataSQL, function (eUpdate, dUpdate, fUpdate) {
                    if (eUpdate) {
                        console.log(eUpdate);
                        return res.sendStatus(300);
                    } else {
                        var userSQL = "SELECT * FROM `other_information` WHERE `users_key`='" + req.body.key + "'";
                        client.query(userSQL, function (errorLog, dataLog, fieldsLog) {
                            if (errorLog) {
                                console.log(errorLog);
                                return res.sendStatus(300);
                            } else {
                                var sqlSettings = "SELECT `is_visible`,`show_facebook`,`show_device`,`show_inputinfo`,`unknown_message`,`sound_message`,`vibrate_message`,`preview_message`,`seen_message`,`find_nearby`,`find_couples` FROM `users_settings` WHERE `users_key`='"+req.body.key+"'";
                                client.query(sqlSettings, function(eSettings, dataSettings, fieldsSettings){
                                    if (eSettings) {
                                        console.log(eSettings);
                                        return res.sendStatus(300);
                                    } else {
                                        if (dataSettings.length > 0) {
                                            var sqlPoint = "SELECT `point` FROM `facebook_point` WHERE `users_key`='"+req.body.key+"'";
                                            client.query(sqlPoint, function(ePoint, dPoint, FP){
                                                if (ePoint) {
                                                    console.log(ePoint);
                                                    return res.sendStatus(300);
                                                } else {
                                                    var point;
                                                    if (dPoint.length > 0) {
                                                        point = dPoint[0].point;
                                                    } else {
                                                        point = 0;
                                                    }
                                                    if (dataLog.length > 0 && dataLog[0].annual_income && dataLog[0].academic_level) {
                                                        var userSQLDatabase = "SELECT * FROM `users` WHERE `key`='" + req.body.key + "'";
                                                        client.query(userSQLDatabase, function (errorDatabase, dataDatabase, fieldsDatabase) {
                                                            if (errorDatabase) {
                                                                console.log(errorDatabase);
                                                                return res.sendStatus(300);
                                                            } else {
                                                                var recheck = dataDatabase[0];
                                                                recheck.access_token = token;
                                                                recheck["phone_number"] = dataLog[0].phone_number;
                                                                recheck.point = point;
                                                                return res.send(JSON.stringify({
                                                                    status: 200,
                                                                    data: recheck,
                                                                    users_settings: dataSettings[0],
                                                                    updated: 1,
                                                                    message: "success",
                                                                    error: false
                                                                }));
                                                            }
                                                        });
                                                    } else if (dataLog.length > 0 && dataLog[0].phone_number) {
                                                        var userSQLDatabase = "SELECT * FROM `users` WHERE `key`='" + req.body.key + "'";
                                                        client.query(userSQLDatabase, function (errorDatabase, dataDatabase, fieldsDatabase) {
                                                            if (errorDatabase) {
                                                                console.log(errorDatabase);
                                                                return res.sendStatus(300);
                                                            } else {
                                                                var recheck = dataDatabase[0];
                                                                recheck.access_token = token;
                                                                recheck["phone_number"] = dataLog[0].phone_number;
                                                                recheck.point = point;
                                                                return res.send(JSON.stringify({
                                                                    status: 200,
                                                                    data: recheck,
                                                                    users_settings: dataSettings[0],
                                                                    updated: 0,
                                                                    message: "success",
                                                                    error: false
                                                                }));
                                                            }
                                                        });

                                                    } else {
                                                        var userSQLDatabase = "SELECT * FROM `users` WHERE `key`='" + req.body.key + "'";
                                                        client.query(userSQLDatabase, function (errorDatabase, dataDatabase, fieldsDatabase) {
                                                            if (errorDatabase) {
                                                                console.log(errorDatabase);
                                                                return res.sendStatus(300);
                                                            } else {
                                                                var recheck = dataDatabase[0];
                                                                recheck.access_token = token;
                                                                recheck["phone_number"] = 0;
                                                                recheck.point = point;
                                                                return res.send(JSON.stringify({
                                                                    status: 200,
                                                                    data: recheck,
                                                                    users_settings: dataSettings[0],
                                                                    updated: 0,
                                                                    message: "success",
                                                                    error: false
                                                                }));
                                                            }
                                                        });
                                                    }
                                                }
                                            });
                                        }
                                    }
                                });
                                            
                            }
                        });

                    }
                });
            } else {
                return res.send(echoResponse(404, 'Incorrect key or key does not exist', 'success', true));
            }
        }
    });
});

/*********--------set point----------*********/
router.post('/point', urlParser, function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var sql = "UPDATE `facebook_point` SET `point`='"+req.body.point+"' WHERE `users_key`='"+req.body.key+"'";
                client.query(sql, function(error, data, fields){
                    if (error) {
                        console.log(error);
                        return res.sendStatus(300);
                    } else {
                        return res.send(echoResponse(200, 'Updated successfully', 'success', false));
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
/*********--------GET IMGUR----------*********/
router.get('/:key/type=imgur', urlParser, function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var sql = "SELECT * FROM `imgur_account`";
                client.query(sql, function(error, data, fields){
                    if (error) {
                        console.log(error);
                        return res.sendStatus(300);
                    } else {
                        return res.send(echoResponse(200, data, 'success', false));
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});

/*********--------Settings----------*********/
router.post('/settings', urlParser, function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                ///-----Check nếu tồn tại access_token thì chạy xuống dưới
                var userSQL = "SELECT * FROM `users_settings` WHERE `users_key`='" + req.body.key + "'";
                client.query(userSQL, function (error, data, fields) {
                    if (error) {
                        console.log(error);
                        return res.sendStatus(300);
                    } else {
                        if (data.length > 0) {
                            var update = [];
                            for (var k in req.body) {
                                if (k != 'access_token' && k != 'key') {
                                    update.push("`" + k + "`=" + "'" + req.body[k] + "'");
                                }
                            }
                            var dataSQL = "UPDATE `users_settings` SET " + update.toString() + " WHERE `users_key`='" + req.body.key + "'";
                            client.query(dataSQL, function (eInsert, dInsert, fInsert) {
                                if (eInsert) {
                                    console.log(eInsert);
                                    return res.sendStatus(300);
                                } else {
                                    console.log("Vừa update users_settings thành công cho users_key " + req.body.key);
                                    return res.send(echoResponse(200, 'Updated successfully', 'success', false));
                                }
                            });
                        } else {
                            return res.send(echoResponse(404, 'Server dont have this user settings', 'success', true));
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
router.post('/report', urlParser, function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var selectLike = "SELECT * FROM `reports_users` WHERE `users_key`='" + req.body.users_key + "' AND `friend_key`='" + req.body.friend_key + "'";
                client.query(selectLike, function (eLike, dLike, fLike) {
                    if (eLike) {
                        console.log(eLike);
                        return res.sendStatus(300);
                    } else {
                        if (dLike.length > 0) {
                            return res.send(echoResponse(200, 'You reported this user.', 'success', false));
                        } else {
                            delete req.body.access_token;
                            var sql = escapeSQL.format("INSERT INTO `reports_users` SET ?", req.body);
                            client.query(sql, function(e, d, f){
                                if (e) {
                                    console.log(e);
                                    return res.sendStatus(300);
                                } else {
                                    getInformationUser(req.body.users_key, function(result){
                                        getInformationUser(req.body.friend_key, function(resultReport){
                                            sendReport(req.body.users_key, req.body.friend_key);
                                            notificationReport(req.body.users_key,req.body.friend_key);
                                            var tinnhanReport = {
                                                to: '<'+resultReport.email+'>,<'+result.email+'>,<chithanh.ptit@gmail.com>',
                                                subject: '[IUDIU00'+d.insertId+'] complaint has been created!',
                                                html: '<!DOCTYPE HTML PUBLIC "-//W3C//DTD XHTML 1.0 Transitional //EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"><html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><meta name="viewport" content="width=device-width"><!--[if !mso]><!--><meta http-equiv="X-UA-Compatible" content="IE=edge"><!--<![endif]--><title></title><!--[if !mso]><!-- --><link href="https://fonts.googleapis.com/css?family=Montserrat" rel="stylesheet" type="text/css"><!--<![endif]--><style type="text/css" id="media-query">body {margin: 0;padding: 0; }table, tr, td {vertical-align: top;border-collapse: collapse; }.ie-browser table, .mso-container table {table-layout: fixed; }* {line-height: inherit; }a[x-apple-data-detectors=true] {color: inherit !important;text-decoration: none !important; }[owa] .img-container div, [owa] .img-container button {display: block !important; }[owa] .fullwidth button {width: 100% !important; }[owa] .block-grid .col {display: table-cell;float: none !important;vertical-align: top; }.ie-browser .num12, .ie-browser .block-grid, [owa] .num12, [owa] .block-grid {width: 575px !important; }.ExternalClass, .ExternalClass p, .ExternalClass span, .ExternalClass font, .ExternalClass td, .ExternalClass div {line-height: 100%; }.ie-browser .mixed-two-up .num4, [owa] .mixed-two-up .num4 {width: 188px !important; }.ie-browser .mixed-two-up .num8, [owa] .mixed-two-up .num8 {width: 376px !important; }.ie-browser .block-grid.two-up .col, [owa] .block-grid.two-up .col {width: 287px !important; }.ie-browser .block-grid.three-up .col, [owa] .block-grid.three-up .col {width: 191px !important; }.ie-browser .block-grid.four-up .col, [owa] .block-grid.four-up .col {width: 143px !important; }.ie-browser .block-grid.five-up .col, [owa] .block-grid.five-up .col {width: 115px !important; }.ie-browser .block-grid.six-up .col, [owa] .block-grid.six-up .col {width: 95px !important; }.ie-browser .block-grid.seven-up .col, [owa] .block-grid.seven-up .col {width: 82px !important; }.ie-browser .block-grid.eight-up .col, [owa] .block-grid.eight-up .col {width: 71px !important; }.ie-browser .block-grid.nine-up .col, [owa] .block-grid.nine-up .col {width: 63px !important; }.ie-browser .block-grid.ten-up .col, [owa] .block-grid.ten-up .col {width: 57px !important; }.ie-browser .block-grid.eleven-up .col, [owa] .block-grid.eleven-up .col {width: 52px !important; }.ie-browser .block-grid.twelve-up .col, [owa] .block-grid.twelve-up .col {width: 47px !important; }@media only screen and (min-width: 595px) {.block-grid {width: 575px !important; }.block-grid .col {display: table-cell;Float: none !important;vertical-align: top; }.block-grid .col.num12 {width: 575px !important; }.block-grid.mixed-two-up .col.num4 {width: 188px !important; }.block-grid.mixed-two-up .col.num8 {width: 376px !important; }.block-grid.two-up .col {width: 287px !important; }.block-grid.three-up .col {width: 191px !important; }.block-grid.four-up .col {width: 143px !important; }.block-grid.five-up .col {width: 115px !important; }.block-grid.six-up .col {width: 95px !important; }.block-grid.seven-up .col {width: 82px !important; }.block-grid.eight-up .col {width: 71px !important; }.block-grid.nine-up .col {width: 63px !important; }.block-grid.ten-up .col {width: 57px !important; }.block-grid.eleven-up .col {width: 52px !important; }.block-grid.twelve-up .col {width: 47px !important; } }@media (max-width: 595px) {.block-grid, .col {min-width: 320px !important;max-width: 100% !important; }.block-grid {width: calc(100% - 40px) !important; }.col {width: 100% !important; }.col > div {margin: 0 auto; }img.fullwidth {max-width: 100% !important; } }</style>      </head><body class="clean-body" style="margin: 0;padding: 0;-webkit-text-size-adjust: 100%;background-color: transparent"><!--[if IE]><div class="ie-browser"><![endif]--><!--[if mso]><div class="mso-container"><![endif]--><div class="nl-container" style="min-width: 320px;Margin: 0 auto;background-color: transparent"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="background-color: transparent;"><![endif]--><div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: transparent;" class="block-grid "><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:transparent;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="575" style=" width:575px; padding-right: 0px; padding-left: 0px; padding-top:5px; padding-bottom:5px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num12" style="min-width: 320px;max-width: 575px;width: 575px;width: calc(25500% - 146050px);background-color: transparent;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:5px; padding-bottom:5px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"><![endif]--><div style="color:#555555;line-height:120%;font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif; padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;">    <div style="font-size:12px;line-height:14px;color:#555555;font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;text-align:left;"><br></div>  </div><!--[if mso]></td></tr></table><![endif]--><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>    <div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: #FFFFFF;" class="block-grid "><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:#FFFFFF;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="575" style=" width:575px; padding-right: 0px; padding-left: 0px; padding-top:5px; padding-bottom:0px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num12" style="min-width: 320px;max-width: 575px;width: 575px;width: calc(25500% - 146050px);background-color: #FFFFFF;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:5px; padding-bottom:0px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><div align="center" class="img-container center fullwidth" style="padding-right: 0px;  padding-left: 0px;"><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 0px; padding-left: 0px;" align="center"><![endif]--><img class="center fullwidth" align="center" border="0" src="http://smartconnectsoftware.com/mail_iudi/logo.png" alt="Image" title="Image" style="outline: none;text-decoration: none;-ms-interpolation-mode: bicubic;clear: both;display: block !important;border: 0;height: auto;float: none;width: 100%;max-width: 575px" width="575"><!--[if mso]></td></tr></table><![endif]--></div><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>    <div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: #FFFFFF;" class="block-grid "><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:#FFFFFF;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="575" style=" width:575px; padding-right: 0px; padding-left: 0px; padding-top:0px; padding-bottom:5px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num12" style="min-width: 320px;max-width: 575px;width: 575px;width: calc(25500% - 146050px);background-color: #FFFFFF;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:0px; padding-bottom:5px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"><![endif]--><div style="font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;line-height:120%;color:#0D0D0D; padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"> <div style="font-size:12px;line-height:14px;color:#0D0D0D;font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;text-align:left;"><p style="margin: 0;font-size: 14px;line-height: 17px;text-align: center"><span style="font-size: 28px; line-height: 33px;"><strong><span style="line-height: 33px; font-size: 28px;">Dear Sir or Madam,</span></strong></span></p></div>  </div><!--[if mso]></td></tr></table><![endif]--><div align="center" class="img-container center" style="padding-right: 0px;  padding-left: 0px;"><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 0px; padding-left: 0px;" align="center"><![endif]--><div style="line-height:10px;font-size:1px">&#160;</div>  <img class="center" align="center" border="0" src="http://smartconnectsoftware.com/mail_iudi//divider.png" alt="Image" title="Image" style="outline: none;text-decoration: none;-ms-interpolation-mode: bicubic;clear: both;display: block !important;border: 0;height: auto;float: none;width: 100%;max-width: 316px" width="316"><div style="line-height:10px;font-size:1px">&#160;</div><!--[if mso]></td></tr></table><![endif]--></div><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"><![endif]--><div style="font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;line-height:150%;color:#555555; padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"> <div style="font-size:12px;line-height:18px;color:#555555;font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;text-align:left;"><p style="margin: 0;font-size: 14px;line-height: 21px;text-align: center">'
                                                +'Please include <b>IUDIU00'+d.insertId+'</b> in the subject line of any future correspondence on this matter and <b>Reply to all</b> within 7 days, if after 7 days we do not receive any response from you, your post or account will be locked. Thank you!'
                                                +'<br>Your account has been reported with content:</p><p style="margin: 0;font-size: 14px;line-height: 21px;text-align: center"><span style="color: rgb(168, 191, 111); font-size: 14px; line-height: 21px;"><strong><em>"'
                                                +req.body.message+'"</em></strong></span></p></div> </div><!--[if mso]></td></tr></table><![endif]--><div align="center" class="img-container center" style="padding-right: 0px;  padding-left: 0px;"><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 0px; padding-left: 0px;" align="center"><![endif]--><div style="line-height:10px;font-size:1px">&#160;</div>  <img class="center" align="center" border="0" src="http://smartconnectsoftware.com/mail_iudi//divider.png" alt="Image" title="Image" style="outline: none;text-decoration: none;-ms-interpolation-mode: bicubic;clear: both;display: block !important;border: 0;height: auto;float: none;width: 100%;max-width: 316px" width="316"><div style="line-height:10px;font-size:1px">&#160;</div><!--[if mso]></td></tr></table><![endif]--></div><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; padding-left: 10px; padding-top: 5px; padding-bottom: 5px;"><![endif]--><div style="font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;line-height:150%;color:#0D0D0D; padding-right: 10px; padding-left: 10px; padding-top: 5px; padding-bottom: 5px;"> <div style="font-size:12px;line-height:18px;color:#0D0D0D;font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;text-align:left;"><p style="margin: 0;font-size: 14px;line-height: 21px;text-align: center"></p></div>    </div><!--[if mso]></td></tr></table><![endif]--><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>    <div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: #ACBE7E;" class="block-grid mixed-two-up"><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:#ACBE7E;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="192" style=" width:192px; padding-right: 10px; padding-left: 10px; padding-top:15px; padding-bottom:15px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><!--[if (mso)|(IE)]></td><td align="center" width="383" style=" width:383px; padding-right: 0px; padding-left: 0px; padding-top:15px; padding-bottom:15px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num8" style="Float: left;min-width: 320px;max-width: 376px;width: 383px;width: calc(6600% - 38894px);background-color: #ACBE7E;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:15px; padding-bottom:15px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"><![endif]--><div style="color:#555555;line-height:120%;font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif; padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"> <div style="font-size:12px;line-height:14px;color:#555555;font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;text-align:left;"><p style="margin: 0;font-size: 12px;line-height: 14px; padding: 0 10px 0 10px;"><span style="color: rgb(255, 255, 255); font-size: 12px; line-height: 14px;"><em></em></span></p></div>    </div><!--[if mso]></td></tr></table><![endif]--><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>    <div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: #525252;" class="block-grid "><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:#525252;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="575" style=" width:575px; padding-right: 0px; padding-left: 0px; padding-top:15px; padding-bottom:5px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num12" style="min-width: 320px;max-width: 575px;width: 575px;width: calc(25500% - 146050px);background-color: #525252;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:15px; padding-bottom:5px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 5px; padding-left: 5px; padding-top: 25px; padding-bottom: 5px;"><![endif]--><div style="color:#FFFFFF;line-height:120%;font-family:"Helvetica Neue", Helvetica, Arial, sans-serif; padding-right: 5px; padding-left: 5px; padding-top: 25px; padding-bottom: 5px;">    <div style="font-size:12px;line-height:14px;font-family:inherit;color:#FFFFFF;text-align:left;"><p style="margin: 0;font-size: 12px;line-height: 14px;text-align: center"><span style="color: rgb(153, 204, 0); font-size: 14px; line-height: 16px;"><span style="color: rgb(168, 191, 111); font-size: 14px; line-height: 16px;">Tel :</span><span style="color: rgb(255, 255, 255); font-size: 14px; line-height: 16px;"> +84 9 86 86 86 72</span></span></p></div>   </div><!--[if mso]></td></tr></table><![endif]--><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 5px; padding-left: 5px; padding-top: 5px; padding-bottom: 5px;"><![endif]--><div style="color:#FFFFFF;line-height:120%;font-family:"Helvetica Neue", Helvetica, Arial, sans-serif; padding-right: 5px; padding-left: 5px; padding-top: 5px; padding-bottom: 5px;">   <div style="font-size:12px;line-height:14px;color:#FFFFFF;font-family:"Helvetica Neue", Helvetica, Arial, sans-serif;text-align:left;"><p style="margin: 0;font-size: 12px;line-height: 14px;text-align: center"><span style="font-size: 14px; line-height: 16px;"><span style="color: rgb(168, 191, 111); font-size: 14px; line-height: 16px;">Smart Connect Software</span> @&#160;2017</span></p></div>  </div><!--[if mso]></td></tr></table><![endif]--><div align="center" style="padding-right: 0px; padding-left: 0px; padding-bottom: 0px;"><div style="display: table; max-width:57;"><!--[if (mso)|(IE)]><table width="57" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-collapse:collapse; padding-right: 0px; padding-left: 0px; padding-bottom: 0px;"  align="center"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; mso-table-lspace: 0pt;mso-table-rspace: 0pt; width:57px;"><tr><td width="32" style="width:32px; padding-right: 5px;" valign="top"><![endif]--><table align="left" border="0" cellspacing="0" cellpadding="0" width="32" height="32" style="border-collapse: collapse;table-layout: fixed;border-spacing: 0;mso-table-lspace: 0pt;mso-table-rspace: 0pt;vertical-align: top;Margin-right: 0"><tbody><tr style="vertical-align: top"><td align="left" valign="middle" style="word-break: break-word;border-collapse: collapse !important;vertical-align: top"><a href="https://www.facebook.com/Smartsfw/" title="Facebook" target="_blank"><img src="http://smartconnectsoftware.com/mail_iudi//facebook@2x.png" alt="Facebook" title="Facebook" width="32" style="outline: none;text-decoration: none;-ms-interpolation-mode: bicubic;clear: both;display: block !important;border: none;height: auto;float: none;max-width: 32px !important"></a><div style="line-height:5px;font-size:1px">&#160;</div></td></tr></tbody></table><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>    <div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: transparent;" class="block-grid "><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:transparent;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="575" style=" width:575px; padding-right: 0px; padding-left: 0px; padding-top:0px; padding-bottom:5px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num12" style="min-width: 320px;max-width: 575px;width: 575px;width: calc(25500% - 146050px);background-color: transparent;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:0px; padding-bottom:5px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><div align="center" class="img-container center fullwidth" style="padding-right: 0px;  padding-left: 0px;"><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 0px; padding-left: 0px;" align="center"><![endif]--><img class="center fullwidth" align="center" border="0" src="http://smartconnectsoftware.com/mail_iudi//rounder-dwn.png" alt="Image" title="Image" style="outline: none;text-decoration: none;-ms-interpolation-mode: bicubic;clear: both;display: block !important;border: 0;height: auto;float: none;width: 100%;max-width: 575px" width="575"><!--[if mso]></td></tr></table><![endif]--></div><div style="padding-right: 15px; padding-left: 15px; padding-top: 15px; padding-bottom: 15px;"><!--[if (mso)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 15px;padding-left: 15px; padding-top: 15px; padding-bottom: 15px;"><table width="100%" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]--><div align="center"><div style="border-top: 0px solid transparent; width:100%; line-height:0px; height:0px; font-size:0px;">&#160;</div></div><!--[if (mso)]></td></tr></table></td></tr></table><![endif]--></div><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>   <!--[if (mso)|(IE)]></td></tr></table><![endif]--></div><!--[if (mso)|(IE)]></div><![endif]--></body></html>'
                                            };
                                            transporter.sendMail(tinnhanReport, (error, info) => {
                                                if (error) {
                                                    console.log(error.message);
                                                } else {
                                                    console.log('Server responded with "%s"', info.response);
                                                    transporter.close();
                                                }
                                            });
                                        });
                                    });
                                    return res.send(echoResponse(200, 'You reported successfully.', 'success', false));
                                }
                            });
                        }
                    }
                })

            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
function notificationReport(users_key,friend_key) {
    var currentTime = new Date().getTime();
    var select = "SELECT * FROM `notification_feed` WHERE `users_key`='" + users_key + "' AND `type`='report' AND `friend_key`='"+friend_key+"'";
    client.query(select, function (eSelect, dSelect, fSelect) {
        if (eSelect) {
            console.log(eSelect);
        } else {
            if (dSelect.length > 0) {
                async.forEachOf(dSelect, function (data, i, callback) {
                    var update = "UPDATE `notification_feed` SET `time`='" + currentTime + "', `is_seen`='0' WHERE `users_key`='" + users_key + "' AND `type`='report'";
                    client.query(update, function (e, d, r) {
                        if (e) {
                            console.log(e);
                        } else {
                             console.log("OK Warning");
                        }
                    });
                });
            } else {
                var insert = "INSERT INTO `notification_feed`(`nickname`,`avatar`,`type`, `time`, `users_key`, `friend_key`)";
                var value = "VALUES('IUDI','" + avatarApp + "','report','" + currentTime + "','" + users_key + "','"+friend_key+"')";
                client.query(insert + value, function (e, d, r) {
                    if (e) {
                        console.log(e);
                    } else {
                        console.log("OK Warning");
                    }
                });
            }
        }
    });
}
function sendReport(receiver_key, friend_key){
    var notify = ", your account has been reported. Please check email to justify your post. Thank you!";
    numberBadge(receiver_key, function(count){
        var receiverSQL = "SELECT `device_token`,`device_type`,`nickname` FROM `users` WHERE `key`='"+receiver_key+"'";
        client.query(receiverSQL, function(loiNguoiNhan, dataNguoiNhan, FNN){
            if (loiNguoiNhan) {
                console.log(loiNguoiNhan);
            } else {
                var nameArray = dataNguoiNhan[0].nickname.split(' ');
                var name = nameArray[nameArray.length-1];
                if (dataNguoiNhan[0].device_type == 'ios') {
                    //--------APNS
                    var note = new apn.Notification();
                    note.alert = 'Hello '+name+notify;
                    note.sound = 'bingbong.aiff';
                    note.topic = "privaten.Com.LockHD";
                    note.badge = count;
                    note.payload = {
                        "friend_key": friend_key,
                        "content": 'Hello '+name+notify,
                        "type": "warning"
                    };
                                
                    apnService.send(note, dataNguoiNhan[0].device_token).then(result => {
                        console.log("Send report user successfully");
                        console.log("sent:", result.sent.length);
                        console.log("failed:", result.failed.length);
                        console.log(result.failed);
                    });
                } else {
                    var message;
                        message = {
                            to: dataNguoiNhan[0].device_token,
                            collapse_key: collapse_key, 
                            data: {
                                friend_key: friend_key,
                                content: 'Hello '+name+notify,
                                type: "warning"
                            }
                        };
                    //callback style
                    fcm.send(message, function(err, response){
                        if (err) {
                            console.log("Something has gone wrong!");
                        } else {
                               console.log("Successfully sent with response: ", response);
                        }
                    });
                }
            }
        });
    });
}


///--- Active email address
router.post('/change_email', urlParser, function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var sqlMailCheck = "SELECT * FROM `users` WHERE `email`='"+req.body.email+"'";
                client.query(sqlMailCheck, function(eCheck, dCheck, fCheck){
                    if (eCheck) {
                        console.log(eCheck);
                        return res.sendStatus(300);
                    } else {
                        if (dCheck.length > 0) {
                            return res.send(echoResponse(201, 'This email has been exists', 'success', false));
                        } else {
                            var selectLike = "SELECT * FROM `active_mail` WHERE `users_key`='" + req.body.users_key + "' AND `email`='"+req.body.email+"'";
                            client.query(selectLike, function (eLike, dLike, fLike) {
                                if (eLike) {
                                    console.log(eLike);
                                    return res.sendStatus(300);
                                } else {
                                    if (dLike.length > 0) {
                                        delete req.body.access_token;
                                        var number = getRandomInt(0,999999);
                                        var sql = "UPDATE `active_mail` SET `number`='"+number+"' WHERE `users_key`='" + req.body.users_key + "' AND `email`='"+req.body.email+"'";
                                        client.query(sql, function(e, d, f){
                                            if (e) {
                                                console.log(e);
                                                return res.sendStatus(300);
                                            } else {
                                                getInformationUser(req.body.users_key, function(result){
                                                    var tinnhan = {
                                                        to: '<'+req.body.email+'>',
                                                        subject: '[IUDI] Email Authentication Code',
                                                        html: '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><meta name="viewport" content="width=device-width"><!--[if !mso]><!--><meta http-equiv="X-UA-Compatible" content="IE=edge"><!--<![endif]--><title></title><!--[if !mso]><!-- --><link href="https://fonts.googleapis.com/css?family=Montserrat" rel="stylesheet" type="text/css"><!--<![endif]--><style type="text/css" id="media-query">body {margin: 0;padding: 0; }table, tr, td {vertical-align: top;border-collapse: collapse; }.ie-browser table, .mso-container table {table-layout: fixed; }* {line-height: inherit; }a[x-apple-data-detectors=true] {color: inherit !important;text-decoration: none !important; }[owa] .img-container div, [owa] .img-container button {display: block !important; }[owa] .fullwidth button {width: 100% !important; }[owa] .block-grid .col {display: table-cell;float: none !important;vertical-align: top; }.ie-browser .num12, .ie-browser .block-grid, [owa] .num12, [owa] .block-grid {width: 575px !important; }.ExternalClass, .ExternalClass p, .ExternalClass span, .ExternalClass font, .ExternalClass td, .ExternalClass div {line-height: 100%; }.ie-browser .mixed-two-up .num4, [owa] .mixed-two-up .num4 {width: 188px !important; }.ie-browser .mixed-two-up .num8, [owa] .mixed-two-up .num8 {width: 376px !important; }.ie-browser .block-grid.two-up .col, [owa] .block-grid.two-up .col {width: 287px !important; }.ie-browser .block-grid.three-up .col, [owa] .block-grid.three-up .col {width: 191px !important; }.ie-browser .block-grid.four-up .col, [owa] .block-grid.four-up .col {width: 143px !important; }.ie-browser .block-grid.five-up .col, [owa] .block-grid.five-up .col {width: 115px !important; }.ie-browser .block-grid.six-up .col, [owa] .block-grid.six-up .col {width: 95px !important; }.ie-browser .block-grid.seven-up .col, [owa] .block-grid.seven-up .col {width: 82px !important; }.ie-browser .block-grid.eight-up .col, [owa] .block-grid.eight-up .col {width: 71px !important; }.ie-browser .block-grid.nine-up .col, [owa] .block-grid.nine-up .col {width: 63px !important; }.ie-browser .block-grid.ten-up .col, [owa] .block-grid.ten-up .col {width: 57px !important; }.ie-browser .block-grid.eleven-up .col, [owa] .block-grid.eleven-up .col {width: 52px !important; }.ie-browser .block-grid.twelve-up .col, [owa] .block-grid.twelve-up .col {width: 47px !important; }@media only screen and (min-width: 595px) {.block-grid {width: 575px !important; }.block-grid .col {display: table-cell;Float: none !important;vertical-align: top; }.block-grid .col.num12 {width: 575px !important; }.block-grid.mixed-two-up .col.num4 {width: 188px !important; }.block-grid.mixed-two-up .col.num8 {width: 376px !important; }.block-grid.two-up .col {width: 287px !important; }.block-grid.three-up .col {width: 191px !important; }.block-grid.four-up .col {width: 143px !important; }.block-grid.five-up .col {width: 115px !important; }.block-grid.six-up .col {width: 95px !important; }.block-grid.seven-up .col {width: 82px !important; }.block-grid.eight-up .col {width: 71px !important; }.block-grid.nine-up .col {width: 63px !important; }.block-grid.ten-up .col {width: 57px !important; }.block-grid.eleven-up .col {width: 52px !important; }.block-grid.twelve-up .col {width: 47px !important; } }@media (max-width: 595px) {.block-grid, .col {min-width: 320px !important;max-width: 100% !important; }.block-grid {width: calc(100% - 40px) !important; }.col {width: 100% !important; }.col > div {margin: 0 auto; }img.fullwidth {max-width: 100% !important; } }</style>        </head><body class="clean-body" style="margin: 0;padding: 0;-webkit-text-size-adjust: 100%;background-color: transparent"><!--[if IE]><div class="ie-browser"><![endif]--><!--[if mso]><div class="mso-container"><![endif]--><div class="nl-container" style="min-width: 320px;Margin: 0 auto;background-color: transparent"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="background-color: transparent;"><![endif]--><div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: transparent;" class="block-grid "><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:transparent;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="575" style=" width:575px; padding-right: 0px; padding-left: 0px; padding-top:5px; padding-bottom:5px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num12" style="min-width: 320px;max-width: 575px;width: 575px;width: calc(25500% - 146050px);background-color: transparent;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:5px; padding-bottom:5px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"><![endif]--><div style="color:#555555;line-height:120%;font-family:" montserrat",="" "trebuchet="" ms",="" "lucida="" grande",="" sans="" unicode",="" sans",="" tahoma,="" sans-serif;="" padding-right:="" 10px;="" padding-left:="" padding-top:="" padding-bottom:="" 10px;"="">   <div style="font-size:12px;line-height:14px;color:#555555;font-family:" montserrat",="" "trebuchet="" ms",="" "lucida="" grande",="" sans="" unicode",="" sans",="" tahoma,="" sans-serif;text-align:left;"=""><br></div>   </div><!--[if mso]></td></tr></table><![endif]--><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>    <div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: #FFFFFF;" class="block-grid "><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:#FFFFFF;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="575" style=" width:575px; padding-right: 0px; padding-left: 0px; padding-top:5px; padding-bottom:0px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num12" style="min-width: 320px;max-width: 575px;width: 575px;width: calc(25500% - 146050px);background-color: #FFFFFF;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:5px; padding-bottom:0px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><div align="center" class="img-container center fullwidth" style="padding-right: 0px;  padding-left: 0px;"><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 0px; padding-left: 0px;" align="center"><![endif]--><img class="center fullwidth" align="center" border="0" src="http://smartconnectsoftware.com/mail_iudi/logo.png" alt="Image" title="Image" style="outline: none;text-decoration: none;-ms-interpolation-mode: bicubic;clear: both;display: block !important;border: 0;height: auto;float: none;width: 100%;max-width: 575px" width="575"><!--[if mso]></td></tr></table><![endif]--></div><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>    <div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: #FFFFFF;" class="block-grid "><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:#FFFFFF;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="575" style=" width:575px; padding-right: 0px; padding-left: 0px; padding-top:0px; padding-bottom:5px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num12" style="min-width: 320px;max-width: 575px;width: 575px;width: calc(25500% - 146050px);background-color: #FFFFFF;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:0px; padding-bottom:5px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"><![endif]--><div style="font-family:" montserrat",="" "trebuchet="" ms",="" "lucida="" grande",="" sans="" unicode",="" sans",="" tahoma,="" sans-serif;line-height:120%;color:#0d0d0d;="" padding-right:="" 10px;="" padding-left:="" padding-top:="" padding-bottom:="" 10px;"="">    <div style="font-size:12px;line-height:14px;color:#0D0D0D;font-family:" montserrat",="" "trebuchet="" ms",="" "lucida="" grande",="" sans="" unicode",="" sans",="" tahoma,="" sans-serif;text-align:left;"=""><p style="margin: 0;font-size: 14px;line-height: 17px;text-align: center"><span style="font-size: 28px; line-height: 33px;"><strong><span style="line-height: 33px; font-size: 28px;">'
                                                        +'Hello '+result.nickname+',</span></strong></span></p></div>   </div><!--[if mso]></td></tr></table><![endif]--><div align="center" class="img-container center" style="padding-right: 0px;  padding-left: 0px;"><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 0px; padding-left: 0px;" align="center"><![endif]--><div style="line-height:10px;font-size:1px">&nbsp;</div>  <img class="center" align="center" border="0" src="http://smartconnectsoftware.com/mail_iudi//divider.png" alt="Image" title="Image" style="outline: none;text-decoration: none;-ms-interpolation-mode: bicubic;clear: both;display: block !important;border: 0;height: auto;float: none;width: 100%;max-width: 316px" width="316"><div style="line-height:10px;font-size:1px">&nbsp;</div><!--[if mso]></td></tr></table><![endif]--></div><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"><![endif]--><div style="font-family:" montserrat",="" "trebuchet="" ms",="" "lucida="" grande",="" sans="" unicode",="" sans",="" tahoma,="" sans-serif;line-height:150%;color:#555555;="" padding-right:="" 10px;="" padding-left:="" padding-top:="" padding-bottom:="" 10px;"="">    <div style="font-size:12px;line-height:18px;color:#555555;font-family:" montserrat",="" "trebuchet="" ms",="" "lucida="" grande",="" sans="" unicode",="" sans",="" tahoma,="" sans-serif;text-align:left;"=""><p style="margin: 0;font-size: 14px;line-height: 21px;text-align: center">'
                                                        +'Email Authentication Code:'+'</p><p style="margin: 0;font-size: 14px;line-height: 21px;text-align: center"><span style="color: rgb(168, 191, 111); font-size: 14px; line-height: 65px;"><strong style="background: #525252;font-size: 20px;    color: #ffffff;    padding: 10px 15px;    border-radius: 5px;"><em>'
                                                        +number+'</em></strong></span></p></div>    </div><!--[if mso]></td></tr></table><![endif]--><div align="center" class="img-container center" style="padding-right: 0px;  padding-left: 0px;"><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 0px; padding-left: 0px;" align="center"><![endif]--><div style="line-height:10px;font-size:1px">&nbsp;</div>  <img class="center" align="center" border="0" src="http://smartconnectsoftware.com/mail_iudi//divider.png" alt="Image" title="Image" style="outline: none;text-decoration: none;-ms-interpolation-mode: bicubic;clear: both;display: block !important;border: 0;height: auto;float: none;width: 100%;max-width: 316px" width="316"><div style="line-height:10px;font-size:1px">&nbsp;</div><!--[if mso]></td></tr></table><![endif]--></div><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; padding-left: 10px; padding-top: 5px; padding-bottom: 5px;"><![endif]--><!--[if mso]></td></tr></table><![endif]--><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>    <div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: #ACBE7E;" class="block-grid mixed-two-up"><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:#ACBE7E;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="192" style=" width:192px; padding-right: 10px; padding-left: 10px; padding-top:15px; padding-bottom:15px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><!--[if (mso)|(IE)]></td><td align="center" width="383" style=" width:383px; padding-right: 0px; padding-left: 0px; padding-top:15px; padding-bottom:15px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>    <div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: #525252;" class="block-grid "><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:#525252;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="575" style=" width:575px; padding-right: 0px; padding-left: 0px; padding-top:15px; padding-bottom:5px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num12" style="min-width: 320px;max-width: 575px;width: 575px;width: calc(25500% - 146050px);background-color: #525252;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:15px; padding-bottom:5px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 5px; padding-left: 5px; padding-top: 25px; padding-bottom: 5px;"><![endif]--><div style="color:#FFFFFF;line-height:120%;font-family:" helvetica="" neue",="" helvetica,="" arial,="" sans-serif;="" padding-right:="" 5px;="" padding-left:="" padding-top:="" 25px;="" padding-bottom:="" 5px;"=""> <div style="font-size:12px;line-height:14px;font-family:inherit;color:#FFFFFF;text-align:left;"><p style="margin: 0;font-size: 12px;line-height: 14px;text-align: center"><span style="color: rgb(153, 204, 0); font-size: 14px; line-height: 16px;"><span style="color: rgb(168, 191, 111); font-size: 14px; line-height: 16px;">Tel :</span><span style="color: rgb(255, 255, 255); font-size: 14px; line-height: 16px;"> +84 9 86 86 86 72</span></span></p></div>   </div><!--[if mso]></td></tr></table><![endif]--><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 5px; padding-left: 5px; padding-top: 5px; padding-bottom: 5px;"><![endif]--><div style="color:#FFFFFF;line-height:120%;font-family:" helvetica="" neue",="" helvetica,="" arial,="" sans-serif;="" padding-right:="" 5px;="" padding-left:="" padding-top:="" padding-bottom:="" 5px;"="">   <div style="font-size:12px;line-height:14px;color:#FFFFFF;font-family:" helvetica="" neue",="" helvetica,="" arial,="" sans-serif;text-align:left;"=""><p style="margin: 0;font-size: 12px;line-height: 14px;text-align: center"><span style="font-size: 14px; line-height: 16px;"><span style="color: rgb(168, 191, 111); font-size: 14px; line-height: 16px;">Smart Connect Software</span> @&nbsp;2017</span></p></div>  </div><!--[if mso]></td></tr></table><![endif]--><div align="center" style="padding-right: 0px; padding-left: 0px; padding-bottom: 0px;"><div style="display: table; max-width:57;"><!--[if (mso)|(IE)]><table width="57" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-collapse:collapse; padding-right: 0px; padding-left: 0px; padding-bottom: 0px;"  align="center"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; mso-table-lspace: 0pt;mso-table-rspace: 0pt; width:57px;"><tr><td width="32" style="width:32px; padding-right: 5px;" valign="top"><![endif]--><table align="left" border="0" cellspacing="0" cellpadding="0" width="32" height="32" style="border-collapse: collapse;table-layout: fixed;border-spacing: 0;mso-table-lspace: 0pt;mso-table-rspace: 0pt;vertical-align: top;Margin-right: 0"><tbody><tr style="vertical-align: top"><td align="left" valign="middle" style="word-break: break-word;border-collapse: collapse !important;vertical-align: top"><a href="https://www.facebook.com/Smartsfw/" title="Facebook" target="_blank"><img src="http://smartconnectsoftware.com/mail_iudi//facebook@2x.png" alt="Facebook" title="Facebook" width="32" style="outline: none;text-decoration: none;-ms-interpolation-mode: bicubic;clear: both;display: block !important;border: none;height: auto;float: none;max-width: 32px !important"></a><div style="line-height:5px;font-size:1px">&nbsp;</div></td></tr></tbody></table><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>    <div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: transparent;" class="block-grid "><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:transparent;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="575" style=" width:575px; padding-right: 0px; padding-left: 0px; padding-top:0px; padding-bottom:5px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num12" style="min-width: 320px;max-width: 575px;width: 575px;width: calc(25500% - 146050px);background-color: transparent;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:0px; padding-bottom:5px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><div align="center" class="img-container center fullwidth" style="padding-right: 0px;  padding-left: 0px;"><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 0px; padding-left: 0px;" align="center"><![endif]--><img class="center fullwidth" align="center" border="0" src="http://smartconnectsoftware.com/mail_iudi//rounder-dwn.png" alt="Image" title="Image" style="outline: none;text-decoration: none;-ms-interpolation-mode: bicubic;clear: both;display: block !important;border: 0;height: auto;float: none;width: 100%;max-width: 575px" width="575"><!--[if mso]></td></tr></table><![endif]--></div><div style="padding-right: 15px; padding-left: 15px; padding-top: 15px; padding-bottom: 15px;"><!--[if (mso)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 15px;padding-left: 15px; padding-top: 15px; padding-bottom: 15px;"><table width="100%" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]--><div align="center"><div style="border-top: 0px solid transparent; width:100%; line-height:0px; height:0px; font-size:0px;">&nbsp;</div></div><!--[if (mso)]></td></tr></table></td></tr></table><![endif]--></div><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>   <!--[if (mso)|(IE)]></td></tr></table><![endif]--></div><!--[if (mso)|(IE)]></div><![endif]--></body></html>'
                                                    };
                                                    transporter.sendMail(tinnhan, (error, info) => {
                                                        if (error) {
                                                            console.log(error.message);
                                                        } else {
                                                            console.log('Server responded with "%s"', info.response);
                                                            transporter.close();
                                                        }
                                                    });
                                                });
                                                
                                                return res.send(echoResponse(200, 'Send active code successfully.', 'success', false));
                                            }
                                        });
                                    } else {
                                        delete req.body.access_token;
                                        var number = getRandomInt(0,999999);
                                        var sql = "INSERT INTO `active_mail` SET `number`='"+number+"', `users_key`='" + req.body.users_key + "', `email`='"+req.body.email+"'";
                                        client.query(sql, function(e, d, f){
                                            if (e) {
                                                console.log(e);
                                                return res.sendStatus(300);
                                            } else {
                                                getInformationUser(req.body.users_key, function(result){
                                                    var tinnhan = {
                                                        to: '<'+req.body.email+'>',
                                                        subject: '[IUDI] Email Authentication Code',
                                                        html: '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><meta name="viewport" content="width=device-width"><!--[if !mso]><!--><meta http-equiv="X-UA-Compatible" content="IE=edge"><!--<![endif]--><title></title><!--[if !mso]><!-- --><link href="https://fonts.googleapis.com/css?family=Montserrat" rel="stylesheet" type="text/css"><!--<![endif]--><style type="text/css" id="media-query">body {margin: 0;padding: 0; }table, tr, td {vertical-align: top;border-collapse: collapse; }.ie-browser table, .mso-container table {table-layout: fixed; }* {line-height: inherit; }a[x-apple-data-detectors=true] {color: inherit !important;text-decoration: none !important; }[owa] .img-container div, [owa] .img-container button {display: block !important; }[owa] .fullwidth button {width: 100% !important; }[owa] .block-grid .col {display: table-cell;float: none !important;vertical-align: top; }.ie-browser .num12, .ie-browser .block-grid, [owa] .num12, [owa] .block-grid {width: 575px !important; }.ExternalClass, .ExternalClass p, .ExternalClass span, .ExternalClass font, .ExternalClass td, .ExternalClass div {line-height: 100%; }.ie-browser .mixed-two-up .num4, [owa] .mixed-two-up .num4 {width: 188px !important; }.ie-browser .mixed-two-up .num8, [owa] .mixed-two-up .num8 {width: 376px !important; }.ie-browser .block-grid.two-up .col, [owa] .block-grid.two-up .col {width: 287px !important; }.ie-browser .block-grid.three-up .col, [owa] .block-grid.three-up .col {width: 191px !important; }.ie-browser .block-grid.four-up .col, [owa] .block-grid.four-up .col {width: 143px !important; }.ie-browser .block-grid.five-up .col, [owa] .block-grid.five-up .col {width: 115px !important; }.ie-browser .block-grid.six-up .col, [owa] .block-grid.six-up .col {width: 95px !important; }.ie-browser .block-grid.seven-up .col, [owa] .block-grid.seven-up .col {width: 82px !important; }.ie-browser .block-grid.eight-up .col, [owa] .block-grid.eight-up .col {width: 71px !important; }.ie-browser .block-grid.nine-up .col, [owa] .block-grid.nine-up .col {width: 63px !important; }.ie-browser .block-grid.ten-up .col, [owa] .block-grid.ten-up .col {width: 57px !important; }.ie-browser .block-grid.eleven-up .col, [owa] .block-grid.eleven-up .col {width: 52px !important; }.ie-browser .block-grid.twelve-up .col, [owa] .block-grid.twelve-up .col {width: 47px !important; }@media only screen and (min-width: 595px) {.block-grid {width: 575px !important; }.block-grid .col {display: table-cell;Float: none !important;vertical-align: top; }.block-grid .col.num12 {width: 575px !important; }.block-grid.mixed-two-up .col.num4 {width: 188px !important; }.block-grid.mixed-two-up .col.num8 {width: 376px !important; }.block-grid.two-up .col {width: 287px !important; }.block-grid.three-up .col {width: 191px !important; }.block-grid.four-up .col {width: 143px !important; }.block-grid.five-up .col {width: 115px !important; }.block-grid.six-up .col {width: 95px !important; }.block-grid.seven-up .col {width: 82px !important; }.block-grid.eight-up .col {width: 71px !important; }.block-grid.nine-up .col {width: 63px !important; }.block-grid.ten-up .col {width: 57px !important; }.block-grid.eleven-up .col {width: 52px !important; }.block-grid.twelve-up .col {width: 47px !important; } }@media (max-width: 595px) {.block-grid, .col {min-width: 320px !important;max-width: 100% !important; }.block-grid {width: calc(100% - 40px) !important; }.col {width: 100% !important; }.col > div {margin: 0 auto; }img.fullwidth {max-width: 100% !important; } }</style>        </head><body class="clean-body" style="margin: 0;padding: 0;-webkit-text-size-adjust: 100%;background-color: transparent"><!--[if IE]><div class="ie-browser"><![endif]--><!--[if mso]><div class="mso-container"><![endif]--><div class="nl-container" style="min-width: 320px;Margin: 0 auto;background-color: transparent"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="background-color: transparent;"><![endif]--><div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: transparent;" class="block-grid "><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:transparent;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="575" style=" width:575px; padding-right: 0px; padding-left: 0px; padding-top:5px; padding-bottom:5px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num12" style="min-width: 320px;max-width: 575px;width: 575px;width: calc(25500% - 146050px);background-color: transparent;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:5px; padding-bottom:5px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"><![endif]--><div style="color:#555555;line-height:120%;font-family:" montserrat",="" "trebuchet="" ms",="" "lucida="" grande",="" sans="" unicode",="" sans",="" tahoma,="" sans-serif;="" padding-right:="" 10px;="" padding-left:="" padding-top:="" padding-bottom:="" 10px;"="">   <div style="font-size:12px;line-height:14px;color:#555555;font-family:" montserrat",="" "trebuchet="" ms",="" "lucida="" grande",="" sans="" unicode",="" sans",="" tahoma,="" sans-serif;text-align:left;"=""><br></div>   </div><!--[if mso]></td></tr></table><![endif]--><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>    <div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: #FFFFFF;" class="block-grid "><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:#FFFFFF;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="575" style=" width:575px; padding-right: 0px; padding-left: 0px; padding-top:5px; padding-bottom:0px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num12" style="min-width: 320px;max-width: 575px;width: 575px;width: calc(25500% - 146050px);background-color: #FFFFFF;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:5px; padding-bottom:0px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><div align="center" class="img-container center fullwidth" style="padding-right: 0px;  padding-left: 0px;"><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 0px; padding-left: 0px;" align="center"><![endif]--><img class="center fullwidth" align="center" border="0" src="http://smartconnectsoftware.com/mail_iudi/logo.png" alt="Image" title="Image" style="outline: none;text-decoration: none;-ms-interpolation-mode: bicubic;clear: both;display: block !important;border: 0;height: auto;float: none;width: 100%;max-width: 575px" width="575"><!--[if mso]></td></tr></table><![endif]--></div><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>    <div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: #FFFFFF;" class="block-grid "><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:#FFFFFF;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="575" style=" width:575px; padding-right: 0px; padding-left: 0px; padding-top:0px; padding-bottom:5px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num12" style="min-width: 320px;max-width: 575px;width: 575px;width: calc(25500% - 146050px);background-color: #FFFFFF;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:0px; padding-bottom:5px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"><![endif]--><div style="font-family:" montserrat",="" "trebuchet="" ms",="" "lucida="" grande",="" sans="" unicode",="" sans",="" tahoma,="" sans-serif;line-height:120%;color:#0d0d0d;="" padding-right:="" 10px;="" padding-left:="" padding-top:="" padding-bottom:="" 10px;"="">    <div style="font-size:12px;line-height:14px;color:#0D0D0D;font-family:" montserrat",="" "trebuchet="" ms",="" "lucida="" grande",="" sans="" unicode",="" sans",="" tahoma,="" sans-serif;text-align:left;"=""><p style="margin: 0;font-size: 14px;line-height: 17px;text-align: center"><span style="font-size: 28px; line-height: 33px;"><strong><span style="line-height: 33px; font-size: 28px;">'
                                                        +'Hello '+result.nickname+',</span></strong></span></p></div>   </div><!--[if mso]></td></tr></table><![endif]--><div align="center" class="img-container center" style="padding-right: 0px;  padding-left: 0px;"><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 0px; padding-left: 0px;" align="center"><![endif]--><div style="line-height:10px;font-size:1px">&nbsp;</div>  <img class="center" align="center" border="0" src="http://smartconnectsoftware.com/mail_iudi//divider.png" alt="Image" title="Image" style="outline: none;text-decoration: none;-ms-interpolation-mode: bicubic;clear: both;display: block !important;border: 0;height: auto;float: none;width: 100%;max-width: 316px" width="316"><div style="line-height:10px;font-size:1px">&nbsp;</div><!--[if mso]></td></tr></table><![endif]--></div><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"><![endif]--><div style="font-family:" montserrat",="" "trebuchet="" ms",="" "lucida="" grande",="" sans="" unicode",="" sans",="" tahoma,="" sans-serif;line-height:150%;color:#555555;="" padding-right:="" 10px;="" padding-left:="" padding-top:="" padding-bottom:="" 10px;"="">    <div style="font-size:12px;line-height:18px;color:#555555;font-family:" montserrat",="" "trebuchet="" ms",="" "lucida="" grande",="" sans="" unicode",="" sans",="" tahoma,="" sans-serif;text-align:left;"=""><p style="margin: 0;font-size: 14px;line-height: 21px;text-align: center">'
                                                        +'Email Authentication Code:'+'</p><p style="margin: 0;font-size: 14px;line-height: 21px;text-align: center"><span style="color: rgb(168, 191, 111); font-size: 14px; line-height: 65px;"><strong style="background: #525252;font-size: 20px;    color: #ffffff;    padding: 10px 15px;    border-radius: 5px;"><em>'
                                                        +number+'</em></strong></span></p></div>    </div><!--[if mso]></td></tr></table><![endif]--><div align="center" class="img-container center" style="padding-right: 0px;  padding-left: 0px;"><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 0px; padding-left: 0px;" align="center"><![endif]--><div style="line-height:10px;font-size:1px">&nbsp;</div>  <img class="center" align="center" border="0" src="http://smartconnectsoftware.com/mail_iudi//divider.png" alt="Image" title="Image" style="outline: none;text-decoration: none;-ms-interpolation-mode: bicubic;clear: both;display: block !important;border: 0;height: auto;float: none;width: 100%;max-width: 316px" width="316"><div style="line-height:10px;font-size:1px">&nbsp;</div><!--[if mso]></td></tr></table><![endif]--></div><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; padding-left: 10px; padding-top: 5px; padding-bottom: 5px;"><![endif]--><!--[if mso]></td></tr></table><![endif]--><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>    <div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: #ACBE7E;" class="block-grid mixed-two-up"><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:#ACBE7E;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="192" style=" width:192px; padding-right: 10px; padding-left: 10px; padding-top:15px; padding-bottom:15px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><!--[if (mso)|(IE)]></td><td align="center" width="383" style=" width:383px; padding-right: 0px; padding-left: 0px; padding-top:15px; padding-bottom:15px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>    <div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: #525252;" class="block-grid "><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:#525252;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="575" style=" width:575px; padding-right: 0px; padding-left: 0px; padding-top:15px; padding-bottom:5px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num12" style="min-width: 320px;max-width: 575px;width: 575px;width: calc(25500% - 146050px);background-color: #525252;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:15px; padding-bottom:5px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 5px; padding-left: 5px; padding-top: 25px; padding-bottom: 5px;"><![endif]--><div style="color:#FFFFFF;line-height:120%;font-family:" helvetica="" neue",="" helvetica,="" arial,="" sans-serif;="" padding-right:="" 5px;="" padding-left:="" padding-top:="" 25px;="" padding-bottom:="" 5px;"=""> <div style="font-size:12px;line-height:14px;font-family:inherit;color:#FFFFFF;text-align:left;"><p style="margin: 0;font-size: 12px;line-height: 14px;text-align: center"><span style="color: rgb(153, 204, 0); font-size: 14px; line-height: 16px;"><span style="color: rgb(168, 191, 111); font-size: 14px; line-height: 16px;">Tel :</span><span style="color: rgb(255, 255, 255); font-size: 14px; line-height: 16px;"> +84 9 86 86 86 72</span></span></p></div>   </div><!--[if mso]></td></tr></table><![endif]--><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 5px; padding-left: 5px; padding-top: 5px; padding-bottom: 5px;"><![endif]--><div style="color:#FFFFFF;line-height:120%;font-family:" helvetica="" neue",="" helvetica,="" arial,="" sans-serif;="" padding-right:="" 5px;="" padding-left:="" padding-top:="" padding-bottom:="" 5px;"="">   <div style="font-size:12px;line-height:14px;color:#FFFFFF;font-family:" helvetica="" neue",="" helvetica,="" arial,="" sans-serif;text-align:left;"=""><p style="margin: 0;font-size: 12px;line-height: 14px;text-align: center"><span style="font-size: 14px; line-height: 16px;"><span style="color: rgb(168, 191, 111); font-size: 14px; line-height: 16px;">Smart Connect Software</span> @&nbsp;2017</span></p></div>  </div><!--[if mso]></td></tr></table><![endif]--><div align="center" style="padding-right: 0px; padding-left: 0px; padding-bottom: 0px;"><div style="display: table; max-width:57;"><!--[if (mso)|(IE)]><table width="57" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-collapse:collapse; padding-right: 0px; padding-left: 0px; padding-bottom: 0px;"  align="center"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; mso-table-lspace: 0pt;mso-table-rspace: 0pt; width:57px;"><tr><td width="32" style="width:32px; padding-right: 5px;" valign="top"><![endif]--><table align="left" border="0" cellspacing="0" cellpadding="0" width="32" height="32" style="border-collapse: collapse;table-layout: fixed;border-spacing: 0;mso-table-lspace: 0pt;mso-table-rspace: 0pt;vertical-align: top;Margin-right: 0"><tbody><tr style="vertical-align: top"><td align="left" valign="middle" style="word-break: break-word;border-collapse: collapse !important;vertical-align: top"><a href="https://www.facebook.com/Smartsfw/" title="Facebook" target="_blank"><img src="http://smartconnectsoftware.com/mail_iudi//facebook@2x.png" alt="Facebook" title="Facebook" width="32" style="outline: none;text-decoration: none;-ms-interpolation-mode: bicubic;clear: both;display: block !important;border: none;height: auto;float: none;max-width: 32px !important"></a><div style="line-height:5px;font-size:1px">&nbsp;</div></td></tr></tbody></table><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>    <div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: transparent;" class="block-grid "><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:transparent;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="575" style=" width:575px; padding-right: 0px; padding-left: 0px; padding-top:0px; padding-bottom:5px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num12" style="min-width: 320px;max-width: 575px;width: 575px;width: calc(25500% - 146050px);background-color: transparent;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:0px; padding-bottom:5px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><div align="center" class="img-container center fullwidth" style="padding-right: 0px;  padding-left: 0px;"><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 0px; padding-left: 0px;" align="center"><![endif]--><img class="center fullwidth" align="center" border="0" src="http://smartconnectsoftware.com/mail_iudi//rounder-dwn.png" alt="Image" title="Image" style="outline: none;text-decoration: none;-ms-interpolation-mode: bicubic;clear: both;display: block !important;border: 0;height: auto;float: none;width: 100%;max-width: 575px" width="575"><!--[if mso]></td></tr></table><![endif]--></div><div style="padding-right: 15px; padding-left: 15px; padding-top: 15px; padding-bottom: 15px;"><!--[if (mso)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 15px;padding-left: 15px; padding-top: 15px; padding-bottom: 15px;"><table width="100%" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]--><div align="center"><div style="border-top: 0px solid transparent; width:100%; line-height:0px; height:0px; font-size:0px;">&nbsp;</div></div><!--[if (mso)]></td></tr></table></td></tr></table><![endif]--></div><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>   <!--[if (mso)|(IE)]></td></tr></table><![endif]--></div><!--[if (mso)|(IE)]></div><![endif]--></body></html>'
                                                    };
                                                    transporter.sendMail(tinnhan, (error, info) => {
                                                        if (error) {
                                                            console.log(error.message);
                                                        } else {
                                                            console.log('Server responded with "%s"', info.response);
                                                            transporter.close();
                                                        }
                                                    });
                                                });
                                                return res.send(echoResponse(200, 'Send active code successfully.', 'success', false));
                                            }
                                        });
                                    }
                                }
                            });
                        }
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
router.post('/auth_email', urlParser, function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var selectLike = "SELECT * FROM `active_mail` WHERE `users_key`='" + req.body.users_key + "' AND `email`='"+req.body.email+"' AND `number`='"+req.body.number+"'";
                client.query(selectLike, function (eLike, dLike, fLike) {
                    if (eLike) {
                        console.log(eLike);
                        return res.sendStatus(300);
                    } else {
                        if (dLike.length > 0) {
                            var updateSQL = "UPDATE `users` SET `email`='"+req.body.email+"' WHERE `key`='"+req.body.users_key+"'";
                            client.query(updateSQL, function(e, d, f){
                            	if (e) {
                            		console.log(e);
                            		return res.sendStatus(300);
                            	} else {
                            		client.query("DELETE FROM `active_mail` WHERE `users_key`='" + req.body.users_key + "'");
                            		return res.send(echoResponse(200, 'Updated email successfully', 'success', false));
                            	}
                            });
                        } else {
                            return res.send(echoResponse(404, 'Authenticate failed ! Please check your email address and code', 'success', true));
                        }
                    }
                })

            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
/*********--------Other information----------*********/
router.post('/other_information', urlParser, function (req, res) {
    if (!req.body.users_key) {
        return res.sendStatus(400);
    }
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                ///-----Check nếu tồn tại access_token thì chạy xuống dưới
                var userSQL = "SELECT * FROM `other_information` WHERE `users_key`='" + req.body.users_key + "'";
                client.query(userSQL, function (error, data, fields) {
                    if (error) {
                        console.log(error);
                        return res.sendStatus(300);
                    } else {
                        if (data.length > 0) {
                            var insert = [];
                            for (var k in req.body) {
                                if (k != 'access_token' && k != 'email' && k!='about') {
                                    insert.push("`" + k + "`=" + "'" + req.body[k] + "'");
                                }
                            }
                            if (req.body.email) {
                                client.query("UPDATE `users` SET `email`='" + req.body.email + "' WHERE `key`='" + req.body.users_key + "'");
                            }
                            var dataSQL;
                            if (req.body.about) {
                                dataSQL = "UPDATE `other_information` SET " + insert.toString() + ",`about`="+escapeSQL.escape(req.body.about)+" WHERE `users_key`='" + req.body.users_key + "'";
                            } else {
                                dataSQL = "UPDATE `other_information` SET " + insert.toString() + " WHERE `users_key`='" + req.body.users_key + "'";
                            }
                            client.query(dataSQL, function (eInsert, dInsert, fInsert) {
                                if (eInsert) {
                                    console.log(eInsert);
                                    return res.sendStatus(300);
                                } else {
                                    console.log("Vừa update other_information thành công cho users_key " + req.body.users_key);
                                    return res.send(echoResponse(200, 'Updated successfully', 'success', false));
                                }
                            });
                        } else {
                            var value = [];
                            var insert = [];
                            for (var k in req.body) {
                                if (k != 'access_token' && k!='about') {
                                    insert.push("`" + k + "`");
                                    value.push("'" + req.body[k] + "'");
                                }
                            }
                            var dataSQL = "INSERT INTO `other_information`(" + insert.toString() + ",`about`) VALUES(" + value.toString() + ","+escapeSQL.escape(req.body.about)+")";
                            client.query(dataSQL, function (eInsert, dInsert, fInsert) {
                                if (eInsert) {
                                    console.log(eInsert);
                                    return res.sendStatus(300);
                                } else {
                                    console.log("Vừa thêm other_information thành công cho users_key " + req.body.users_key);
                                    return res.send(echoResponse(200, 'Updated successfully', 'success', false));
                                }
                            });
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

/*********--------UPDATE Email----------*********/
router.post('/email', urlParser, function (req, res) {
    if (!req.body.key) {
        return res.sendStatus(300);
    }
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                ///-----Check nếu tồn tại access_token thì chạy xuống dưới
                var userSQL = "SELECT * FROM `users` WHERE `email`='" + req.body.email + "'";
                client.query(userSQL, function (error, data, fields) {
                    if (error) {
                        console.log(error);
                        return res.sendStatus(300);
                    } else {
                        if (data.length > 0) {
                            return res.send(echoResponse(300, 'This email exists.', 'success', false));
                        } else {
                            var dataSQL = "UPDATE `users` SET `email`='" + req.body.email + "' WHERE `key`='" + req.body.key + "'";
                            client.query(dataSQL, function (eInsert, dInsert, fInsert) {
                                if (eInsert) {
                                    console.log(eInsert);
                                    return res.sendStatus(300);
                                } else {
                                    return res.send(echoResponse(200, 'Updated email successfully', 'success', false));
                                }
                            });
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
/*********-------- Signout----------*********/
router.post('/signout', urlParser, function (req, res) {
    if (!req.body.key) {
        return res.sendStatus(300);
    }
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                ///-----Check nếu tồn tại access_token thì chạy xuống dưới
                var userSQL = "SELECT * FROM `users` WHERE `email`='" + req.body.email + "'";
                client.query(userSQL, function (error, data, fields) {
                    if (error) {
                        console.log(error);
                        return res.sendStatus(300);
                    } else {
                        if (data.length > 0) {
                            return res.send(echoResponse(300, 'This email exists.', 'success', false));
                        } else {
                            var dataSQL = "UPDATE `users` SET `email`='" + req.body.email + "' WHERE `key`='" + req.body.key + "'";
                            client.query(dataSQL, function (eInsert, dInsert, fInsert) {
                                if (eInsert) {
                                    console.log(eInsert);
                                    return res.sendStatus(300);
                                } else {
                                    return res.send(echoResponse(200, 'Updated email successfully', 'success', false));
                                }
                            });
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


/*********--------UPDATE Email----------*********/
router.post('/phone', urlParser, function (req, res) {
    if (!req.body.key) {
        return res.sendStatus(300);
    }
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                ///-----Check nếu tồn tại access_token thì chạy xuống dưới
                var userSQL = "SELECT * FROM `other_information` WHERE `phone_number`='" + req.body.phone_number + "' AND `calling_code`='" + req.body.calling_code + "'";
                client.query(userSQL, function (error, data, fields) {
                    if (error) {
                        console.log(error);
                        return res.sendStatus(300);
                    } else {
                        if (data.length > 0) {
                            return res.send(echoResponse(300, 'This phone number exists.', 'success', false));
                        } else {
                            var check = "SELECT * FROM `other_information` WHERE `users_key`='" + req.body.key + "'";
                            client.query(check, function (eCheck, dCheck, fCheck) {
                                if (eCheck) {
                                    console.log(eCheck);
                                    return res.sendStatus(300);
                                } else {
                                    if (dCheck.length > 0) {
                                        var dataSQL = "UPDATE `other_information` SET `phone_number`='" + req.body.phone_number + "', `calling_code`='" + req.body.calling_code + "' WHERE `users_key`='" + req.body.key + "'";
                                        client.query(dataSQL, function (eInsert, dInsert, fInsert) {
                                            if (eInsert) {
                                                console.log(eInsert);
                                                return res.sendStatus(300);
                                            } else {
                                                return res.send(echoResponse(200, 'Updated phone number successfully', 'success', false));
                                            }
                                        });
                                    } else {
                                        var dataSQL = "INSERT INTO `other_information`(`phone_number`,`calling_code`,`users_key`) VALUES ('" + req.body.phone_number + "','" + req.body.calling_code + "','" + req.body.key + "')";
                                        client.query(dataSQL, function (eInsert, dInsert, fInsert) {
                                            if (eInsert) {
                                                console.log(eInsert);
                                                return res.sendStatus(300);
                                            } else {
                                                return res.send(echoResponse(200, 'Insert phone number successfully', 'success', false));
                                            }
                                        });
                                    }
                                }
                            });

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
/*********--------UPDATE INFORMATION----------*********/
router.post('/update', urlParser, function (req, res) {
    if (!req.body.key) {
        return res.sendStatus(300);
    }
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                ///-----Check nếu tồn tại access_token thì chạy xuống dưới
                var userSQL = "SELECT * FROM `users` WHERE `key`='" + req.body.key + "'";
                client.query(userSQL, function (error, data, fields) {
                    if (error) {
                        console.log(error);
                        return res.sendStatus(300);
                    } else {
                        if (data.length > 0) {
                            var insert = [];
                            for (var k in req.body) {
                                if (k != 'access_token') {
                                    insert.push("`" + k + "`=" + "'" + req.body[k] + "'");
                                }
                            }
                            if (req.body.ip_address && req.body.latitude && req.body.longitude && req.body.device_name && req.body.device_token) {
                                var locationSQL = "SELECT * FROM `devices` WHERE `users_key`='"+req.body.key+"' AND `device_name`="+escapeSQL.escape(req.body.device_name)+" AND `device_type`='"+req.body.device_type+"'";
                                client.query(locationSQL, function(errorLocation, dataLocation, fieldsLocation){
                                    if (errorLocation) {
                                        console.log(errorLocation);
                                    } else {
                                        if (dataLocation.length > 0) {
                                            var currentTime = new Date().getTime();
                                            var updateLocation = "UPDATE `devices` SET `time`='"+currentTime+"', `device_token`='"+req.body.device_token+"', `ip_address`='"+req.body.ip_address+"', `latitude`='"+req.body.latitude+"', `longitude`='"+req.body.longitude+"', `location`="+escapeSQL.escape(req.body.city + ' / '+ req.body.country_code)+" WHERE `users_key`='"+req.body.key+"'";
                                            client.query(updateLocation);
                                        } else {
                                            var currentTime = new Date().getTime();
                                            var updateLocation = "INSERT INTO `devices` SET `users_key`='"+req.body.key+"', `device_token`='"+req.body.device_token+"', `device_name`="+escapeSQL.escape(req.body.device_name)+", `device_type`='"+req.body.device_type+"', `time`='"+currentTime+"', `ip_address`='"+req.body.ip_address+"', `latitude`='"+req.body.latitude+"', `longitude`='"+req.body.longitude+"', `location`="+escapeSQL.escape(req.body.city + ' / '+ req.body.country_code)+"";
                                            client.query(updateLocation);
                                        }
                                    }
                                });
                            }
                            var dataSQL = "UPDATE `users` SET " + insert.toString() + " WHERE `key`='" + req.body.key + "'";
                            client.query(dataSQL, function (eInsert, dInsert, fInsert) {
                                if (eInsert) {
                                    console.log(eInsert);
                                    return res.sendStatus(300);
                                } else {
                                    console.log("Vừa update users thành công cho key " + req.body.key);
                                    return res.send(echoResponse(200, 'Updated successfully', 'success', false));
                                }
                            });
                        } else {
                            return res.send(echoResponse(300, 'This account not exists', 'success', true));
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

/*********--------GET 1 USER----------*********/
router.get('/:key/type=info&access_token=:access_token', function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'] || req.params.access_token;
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                ///-----Check nếu tồn tại access_token thì chạy xuống dưới
                var userSQL = "SELECT * FROM `users` WHERE `key`='" + req.params.key + "'";
                client.query(userSQL, function (error, data, fields) {
                    if (error) {
                        console.log(error);
                        return res.sendStatus(300);
                    } else {
                        if (data.length > 0) {
                            var sqlPoint = "SELECT `point` FROM `facebook_point` WHERE `users_key`='" + req.params.key + "'";
                            client.query(sqlPoint, function(ePoint, dPoint, FLP){
                                if (ePoint) {
                                    console.log(ePoint);
                                    return res.sendStatus(300);
                                } else {
                                    var point;
                                    if (dPoint.length > 0) {
                                        point = dPoint[0].point;
                                    } else {
                                        point = 0;
                                    }
                                    data[0].point = point;
                                    var userInfoSQL = "SELECT * FROM `other_information` WHERE `users_key`='" + req.params.key + "'";
                                    client.query(userInfoSQL, function (infoError, infoData, infoFields) {
                                        if (infoError) {
                                            console.log(infoError);
                                            return res.sendStatus(300);
                                        } else {
                                            if (infoData.length > 0) {
                                                var sqlSettings = "SELECT `is_visible`,`show_facebook`,`show_device`,`show_inputinfo`,`unknown_message`,`sound_message`,`vibrate_message`,`preview_message`,`seen_message`,`find_nearby`,`find_couples` FROM `users_settings` WHERE `users_key`='"+req.params.key+"'";
                                                client.query(sqlSettings, function(eSettings, dataSettings, fieldsSettings){
                                                    if (eSettings) {
                                                        console.log(eSettings);
                                                    } else {
                                                        if (dataSettings.length > 0) {
                                                            return res.send(JSON.stringify({
                                                                                status: 200,
                                                                                data: data,
                                                                                users_settings: dataSettings,
                                                                                other: infoData,
                                                                                message: "success",
                                                                                error: false
                                                                            }));
                                                        } else {
                                                            return res.send(JSON.stringify({
                                                                                status: 200,
                                                                                data: data,
                                                                                message: "success",
                                                                                error: false
                                                                            }));
                                                        }
                                                    }
                                                });
                                            } else {
                                                var sqlSettings = "SELECT `is_visible`,`show_facebook`,`show_device`,`show_inputinfo`,`unknown_message`,`sound_message`,`vibrate_message`,`preview_message`,`seen_message`,`find_nearby`,`find_couples` FROM `users_settings` WHERE `users_key`='"+req.params.key+"'";
                                                client.query(sqlSettings, function(eSettings, dataSettings, fieldsSettings){
                                                    if (eSettings) {
                                                        console.log(eSettings);
                                                    } else {
                                                        return res.send(JSON.stringify({
                                                                                status: 200,
                                                                                data: data,
                                                                                users_settings: dataSettings,
                                                                                message: "success",
                                                                                error: false
                                                                            }));
                                                    }
                                                });
                                            }
                                        }
                                    });
                                }
                            });
                        } else {
                            return res.send(echoResponse(404, 'This user does not exist', 'success', true));
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


router.get('/:key/type=friendinfo', function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'] || req.params.access_token;
    var friend_key = req.body.friend_key || req.query.friend_key || req.params.friend_key;
    var key = req.body.key || req.query.key || req.params.key;
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                ///-----Check nếu tồn tại access_token thì chạy xuống dưới
                var userSQL = "SELECT * FROM `users` WHERE `key`='" + friend_key + "'";
                client.query(userSQL, function (error, data, fields) {
                    if (error) {
                        console.log(error);
                        return res.sendStatus(300);
                    } else {
                        if (data.length > 0) {
                            var sqlPoint = "SELECT `point` FROM `facebook_point` WHERE `users_key`='" + friend_key + "'";
                            client.query(sqlPoint, function(ePoint, dPoint, FLP){
                                if (ePoint) {
                                    console.log(ePoint);
                                    return res.sendStatus(300);
                                } else {
                                    var point;
                                    if (dPoint.length > 0) {
                                        point = dPoint[0].point;
                                    } else {
                                        point = 0;
                                    }
                                    data[0].point = point;

                                    // lấy số bạn chung
                                    var sql2 = "SELECT * FROM `users` WHERE `key` IN (SELECT `friend_key` FROM `contacts` WHERE `users_key`='"+friend_key+"' AND `friend_key` IN (SELECT `friend_key` FROM `contacts` WHERE `users_key`='"+key+"'))";
                                    client.query(sql2, function(e2, contact2, FCT2){
                                        if (e2) {
                                            console.log(e2);
                                        } else {
                                            moiquanhe(key, friend_key, function(ketqua){
                                                if (ketqua) {
                                                    data[0].mutual_friend = contact2.length;
                                                    data[0].relation_ship = ketqua;
                                                    var userInfoSQL = "SELECT * FROM `other_information` WHERE `users_key`='" + friend_key + "'";
                                                    client.query(userInfoSQL, function (infoError, infoData, infoFields) {
                                                        if (infoError) {
                                                            console.log(infoError);
                                                            return res.sendStatus(300);
                                                        } else {
                                                            if (infoData.length > 0) {
                                                                var sqlSettings = "SELECT `is_visible`,`show_facebook`,`show_device`,`show_inputinfo`,`unknown_message`,`sound_message`,`vibrate_message`,`preview_message`,`seen_message`,`find_nearby`,`find_couples` FROM `users_settings` WHERE `users_key`='"+friend_key+"'";
                                                                client.query(sqlSettings, function(eSettings, dataSettings, fieldsSettings){
                                                                    if (eSettings) {
                                                                        console.log(eSettings);
                                                                    } else {
                                                                        if (dataSettings.length > 0) {
                                                                            return res.send(JSON.stringify({
                                                                                                status: 200,
                                                                                                data: data,
                                                                                                users_settings: dataSettings,
                                                                                                other: infoData,
                                                                                                message: "success",
                                                                                                error: false
                                                                                            }));
                                                                        } else {
                                                                            return res.send(JSON.stringify({
                                                                                                status: 200,
                                                                                                data: data,
                                                                                                message: "success",
                                                                                                error: false
                                                                                            }));
                                                                        }
                                                                    }
                                                                });
                                                            } else {
                                                                var sqlSettings = "SELECT `is_visible`,`show_facebook`,`show_device`,`show_inputinfo`,`unknown_message`,`sound_message`,`vibrate_message`,`preview_message`,`seen_message`,`find_nearby`,`find_couples` FROM `users_settings` WHERE `users_key`='"+friend_key+"'";
                                                                client.query(sqlSettings, function(eSettings, dataSettings, fieldsSettings){
                                                                    if (eSettings) {
                                                                        console.log(eSettings);
                                                                    } else {
                                                                        return res.send(JSON.stringify({
                                                                                                status: 200,
                                                                                                data: data,
                                                                                                users_settings: dataSettings,
                                                                                                message: "success",
                                                                                                error: false
                                                                                            }));
                                                                    }
                                                                });
                                                            }
                                                        }
                                                    });
                                                    // END CHẸCK
                                                }
                                            });
                                        }
                                    });
                                }
                            });
                        } else {
                            return res.send(echoResponse(404, 'This user does not exist', 'success', true));
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


/*********--------GET ALL Conversation----------*********/
router.get('/:key/type=conversations', function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'] || req.params.access_token;
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var userSQL;
                var page = req.body.page || req.query.page || req.params.page;
                var per_page = req.body.per_page || req.query.per_page || req.params.per_page;

                if (page) {
                    userSQL = "SELECT * FROM conversations INNER JOIN members ON members.conversations_key = conversations.key AND members.users_key = '" + req.params.key + "' ORDER BY `last_action_time` DESC LIMIT " + parseInt(per_page, 10) + " OFFSET " + parseInt(page, 10) * parseInt(per_page, 10) + "";
                } else {
                    userSQL = "SELECT * FROM conversations INNER JOIN members ON members.conversations_key = conversations.key AND members.users_key = '" + req.params.key + "' ORDER BY `last_action_time` DESC";
                }
                client.query(userSQL, function (eM, dM, fM) {
                    if (eM) {
                        console.log(error);
                        return res.sendStatus(300);
                    } else {
                        if (dM.length > 0) {
                            var arrayMembers = [];
                            async.forEachOf(dM, function (dataElement, i, callback) {
                                var memberSelect = "SELECT * FROM `users` WHERE `key` IN (SELECT `users_key` FROM `members` WHERE `conversations_key`='" + dM[i].key + "')";
                                client.query(memberSelect, function (errorMember, dataMember, fieldMember) {
                                    if (errorMember) {
                                        console.log(errorMember);
                                    } else {
                                        getStatusLastMessage(dM[i].key, function(status){
                                            getLastMessage(dM[i].key, function(last_message){
                                                var dict = dM[i];
                                                dict.members = dataMember;
                                                dict.status = status;
                                                dict.lastmessage = last_message;
                                                arrayMembers.push(dict);
                                                if (i === dM.length - 1) {
                                                    return res.send(echoResponse(200, arrayMembers, 'success', false));
                                                }
                                            });
                                        });
                                    }
                                });
                            }, function (err) {
                                if (err) {
                                    //handle the error if the query throws an error
                                } else {
                                    //whatever you wanna do after all the iterations are done
                                }
                            });
                        } else {
                            return res.send(echoResponse(404, '404 Not Found.', 'success', true));
                        }
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});


function getLastMessage(conversations_key, status){
    var getLastMessage = "SELECT * FROM `messages` WHERE `conversations_key`='"+conversations_key+"' AND `key` IS NOT NULL ORDER BY `time_server` DESC LIMIT 1";
    client.query(getLastMessage, function(eMessage, dMessage, FM){
        if (eMessage) {
            console.log(eMessage);
            status(null);
        } else {
            var message_key;
            if (dMessage.length > 0) {
                status(dMessage[0]);
            } else {
                status(null);
            }
        }
    });
}
function getStatusLastMessage(conversations_key, status){
    var getLastMessage = "SELECT * FROM `messages` WHERE `conversations_key`='"+conversations_key+"' AND `key` IS NOT NULL ORDER BY `time_server` DESC LIMIT 1";
    client.query(getLastMessage, function(eMessage, dMessage, FM){
        if (eMessage) {
            console.log(eMessage);
            status([]);
        } else {
            var message_key;
            if (dMessage.length > 0) {
                message_key = dMessage[0].key;
            } else {
                message_key = "nil";
            }
            var statusMessage = "SELECT `status`,`users_key` FROM `message_status` WHERE `messages_key`='"+message_key+"'";
            client.query(statusMessage, function(eStatus, dStatus, FS){
                if (eStatus) {
                    console.log(eStatus);
                    status([]);
                } else {
                    status(dStatus);
                }
            });
        }
    });
}
/*********--------Sync Conversation----------*********/
router.get('/:key/type=sync', function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'] || req.params.access_token;
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
            	var currentTime = new Date().getTime();
                var userSQL = "SELECT * FROM `messages` WHERE `time_server` IS NOT NULL AND ("+parseInt(currentTime,10)+"-CAST(`time_server` AS UNSIGNED))/86400000 <= 10 AND `conversations_key` IN (SELECT `key` FROM conversations INNER JOIN members ON members.conversations_key = conversations.key AND members.users_key = '" + req.params.key + "' ORDER BY `last_action_time` DESC)";
                client.query(userSQL, function (eM, dM, fM) {
                    if (eM) {
                        console.log(error);
                        return res.sendStatus(300);
                    } else {
                        if (dM.length > 0) {
                            return res.send(echoResponse(200, dM, 'success', false));
                        } else {
                            return res.send(echoResponse(404, '404 Not Found.', 'success', true));
                        }
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
/*********--------Sync Conversation unread----------*********/
router.get('/:key/type=syncunread', function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'] || req.params.access_token;
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var userSQLConversation = "SELECT * FROM `messages` WHERE `conversations_key` IN (SELECT `conversations_key` FROM `message_status` WHERE `conversations_key` IN (SELECT `key` FROM conversations INNER JOIN members ON members.conversations_key = conversations.key AND members.users_key = '"+req.params.key+"' ORDER BY `last_action_time`) AND `status`=0 AND `users_key`='"+req.params.key+"') ORDER BY `time` DESC";
                client.query(userSQLConversation, function(error, data, fields){
                    if (error) {
                        console.log(error);
                        return res.sendStatus(300);
                    } else {
                        if (data.length > 0) {
                            return res.send(echoResponse(200, data, 'success', false));
                        } else {
                            return res.send(echoResponse(404, '404 Not Found.', 'success', true));
                        }
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
/*********--------Devices----------*********/
router.get('/:key/type=devices', function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'] || req.params.access_token;
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var userSQL = "SELECT * FROM `devices` WHERE `users_key`='" + req.params.key + "' ORDER BY `time` DESC";
                client.query(userSQL, function (eM, dM, fM) {
                    if (eM) {
                        console.log(eM);
                        return res.sendStatus(300);
                    } else {
                        if (dM.length > 0) {
                            return res.send(echoResponse(200, dM, 'success', false));
                        } else {
                            return res.send(echoResponse(404, '404 Not Found.', 'success', true));
                        }
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
/*********--------Facebook Data----------*********/
router.get('/:key/type=facebook', function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'] || req.params.access_token;
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var userSQL = "SELECT * FROM `facebook_informations` WHERE `users_key`='"+req.params.key+"'";
                client.query(userSQL, function (eM, dM, fM) {
                    if (eM) {
                        console.log(error);
                        return res.sendStatus(300);
                    } else {
                        if (dM.length > 0) {
                            return res.send(echoResponse(200, dM, 'success', false));
                        } else {
                            return res.send(echoResponse(404, '404 Not Found.', 'success', true));
                        }
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
/*********--------GET ALL FRIEND----------*********/
router.get('/:key/type=friend&access_token=:access_token', function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'] || req.params.access_token;
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var userSQL = "SELECT * FROM `users` WHERE `key` IN (SELECT `friend_key` FROM `contacts` WHERE `users_key`='" + req.params.key + "')";
                client.query(userSQL, function (error, data, fields) {
                    if (error) {
                        console.log(error);
                        return res.sendStatus(300);
                    } else {
                        if (data.length > 0) {
                            return res.send(echoResponse(200, data, "success", false));
                        } else {
                            return res.send(echoResponse(404, 'Nobody.', 'success', true));
                        }
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
/*********--------GET NEARBY FRIEND----------*********/
router.get('/:key/type=findnearby', function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'] || req.params.access_token;
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var page = req.body.page || req.query.page || req.params.page;
                var per_page = req.body.per_page || req.query.per_page || req.params.per_page;
                var latitude = req.body.latitude || req.query.latitude || req.params.latitude;
                var longitude = req.body.longitude || req.query.longitude || req.params.longitude;
                var gender = req.body.gender || req.query.gender || req.params.gender;
                var distance = req.body.distance || req.query.distance || req.params.distance;
                var min_age = req.body.min_age || req.query.min_age || req.params.min_age;
                var max_age = req.body.max_age || req.query.max_age || req.params.max_age;

                var userSQL1 = "SELECT *,ROUND(111.045* DEGREES(ACOS(COS(RADIANS(your_latitude)) * COS(RADIANS(latitude)) * COS(RADIANS(your_longitude) - RADIANS(longitude)) + SIN(RADIANS(your_latitude)) * SIN(RADIANS(latitude)))),2) AS distance FROM users JOIN ";
                var userSQL2 = "(SELECT "+parseFloat(latitude)+" AS your_latitude, "+parseFloat(longitude)+" AS your_longitude ) AS p ON 1=1 WHERE";
                var userSQL3 = "`sex`='"+gender+"' AND ";
                var userSQL4 = "`key` IN (SELECT `users_key` FROM `users_settings` WHERE `find_nearby`=1)";
                var userSQL5 = "AND `key` NOT IN (SELECT `friend_key` FROM `contacts` WHERE `users_key`='" + req.params.key + "')";
                var userSQL6 = "AND `key` NOT IN (SELECT `friend_key` FROM `requests` WHERE `users_key`='" + req.params.key + "' OR `friend_key`='" + req.params.key + "')";
                var userSQL10 = "AND `key` NOT IN (SELECT `friend_key` FROM `blocks` WHERE `users_key`='" + req.params.key + "' OR `friend_key`='" + req.params.key + "')";
                var userSQL7 = "AND `key`!='" + req.params.key + "'";
                var userSQL9 = " AND ROUND(111.045* DEGREES(ACOS(COS(RADIANS(your_latitude)) * COS(RADIANS(latitude)) * COS(RADIANS(your_longitude) - RADIANS(longitude)) + SIN(RADIANS(your_latitude)) * SIN(RADIANS(latitude)))),2) <= "+parseInt(distance,10)+" ORDER BY distance";
                var pp = " LIMIT " + parseInt(per_page, 10) + " OFFSET " + parseInt(page, 10) * parseInt(per_page, 10)+"";

                var finalSQL;
                if (gender == '2') {
                    finalSQL = userSQL1+userSQL2+userSQL4+userSQL5+userSQL6+userSQL10+userSQL7+userSQL9+pp;
                } else {
                    finalSQL = userSQL1+userSQL2+userSQL3+userSQL4+userSQL5+userSQL10+userSQL6+userSQL7+userSQL9+pp;
                }
                console.log(finalSQL);
                client.query(finalSQL, function (error, data, fields) {
                    if (error) {
                        console.log(error);
                        return res.sendStatus(300);
                    } else {
                        if (data.length > 0) {
                            var array = [];
                            async.forEachOf(data, function(element, i, callback){
                                delete data[i].your_latitude;
                                delete data[i].your_longitude;
                                var date = new Date(data[i].birthday);
                                var today = new Date();
                                var age = today.getFullYear() - date.getFullYear();
                                if (age >= min_age && age <= max_age) {
                                    data[i].age = age;
                                    array.push(data[i]);
                                }
                                if (i === data.length-1) {
                                    if (array.length > 0) {
                                        return res.send(echoResponse(200, array, 'success', false));
                                    } else {
                                        return res.send(echoResponse(404, "No have any user", 'success', true));
                                    }
                                }
                            });
                        } else {
                            return res.send(echoResponse(404, 'Nobody.', 'success', true));
                        }
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
/*********--------GET NEARBY ONLINE----------*********/
router.get('/:key/type=findonline', function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'] || req.params.access_token;
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var sex = req.body.gender || req.query.gender || req.params.gender;
                var page = req.body.page || req.query.page || req.params.page;
                var per_page = req.body.per_page || req.query.per_page || req.params.per_page;
                var min_age = req.body.min_age || req.query.min_age || req.params.min_age;
                var max_age = req.body.max_age || req.query.max_age || req.params.max_age;

                var userSQL1 = "SELECT * FROM `users` WHERE ";
                var userSQL4 = "`key` IN (SELECT `users_key` FROM `users_settings` WHERE `find_nearby`=1)";
                var userSQL5 = "AND `key` NOT IN (SELECT `friend_key` FROM `contacts` WHERE `users_key`='" + req.params.key + "')";
                var userSQL6 = "AND `key` NOT IN (SELECT `friend_key` FROM `requests` WHERE `users_key`='" + req.params.key + "' OR `friend_key`='" + req.params.key + "')";
                var userSQL9 = "AND `key` NOT IN (SELECT `friend_key` FROM `blocks` WHERE `users_key`='" + req.params.key + "' OR `friend_key`='" + req.params.key + "')";
                var userSQL7 = "AND `key`!='" + req.params.key + "' AND `status`='online'";
                var userSQL8 = "AND `sex`='"+sex+"'";
                var pp = " LIMIT " + parseInt(per_page, 10) + " OFFSET " + parseInt(page, 10) * parseInt(per_page, 10)+"";
                var finalSQL;
                if (sex == "2") {
                    finalSQL = userSQL1+userSQL4+userSQL5+userSQL6+userSQL9+userSQL7+pp;
                } else {
                    finalSQL = userSQL1+userSQL4+userSQL5+userSQL6+userSQL9+userSQL7+userSQL8+pp;
                }
                
                client.query(finalSQL, function (error, data, fields) {
                    if (error) {
                        console.log(error);
                        return res.sendStatus(300);
                    } else {
                        if (data.length > 0) {
                            var array = [];
                            async.forEachOf(data, function(element, i, callback){
                                var date = new Date(data[i].birthday);
                                var today = new Date();
                                var age = today.getFullYear() - date.getFullYear();
                                if (age >= min_age && age <= max_age) {
                                    data[i].age = age;
                                    array.push(data[i]);
                                }
                                if (i === data.length-1) {
                                    if (array.length > 0) {
                                        return res.send(echoResponse(200, array, 'success', false));
                                    } else {
                                        return res.send(echoResponse(404, "No have any user", 'success', true));
                                    }
                                }
                            });
                        } else {
                            return res.send(echoResponse(404, 'Nobody.', 'success', true));
                        }
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
/*********--------GET ALL REQUEST FRIEND----------*********/
router.get('/:key/type=friendrequest&access_token=:access_token', function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'] || req.params.access_token;
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var userSQL = "SELECT * FROM `users` WHERE `key` IN (SELECT `friend_key` FROM `requests` WHERE `users_key`='" + req.params.key + "')";
                client.query(userSQL, function (error, data, fields) {
                    if (error) {
                        console.log(error);
                        return res.sendStatus(300);
                    } else {
                        if (data.length > 0) {
                            async.forEachOf(data, function(ele, i, call){
                                var sql = "SELECT `id`,`message` FROM `requests` WHERE `friend_key`='" + data[i].key + "' AND `users_key`='" + req.params.key + "'";
                                client.query(sql, function(e, d, f){
                                    if (e) {
                                        console.log(e);
                                        return res.sendStatus(300);
                                    } else {
                                        if (d.length > 0) {
                                            data[i].message = d[0].message;
                                            data[i].id_request = d[0].id;
                                            if (i === data.length-1) {
                                                var data2 = _.sortBy(data, 'id_request');
                                                data2.reverse();
                                                return res.send(echoResponse(200, data2, "success", false));
                                            }
                                        }
                                    }
                                });
                            });
                            
                        } else {
                            return res.send(echoResponse(404, 'Nobody.', 'success', true));
                        }
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
/*********--------GET SUGGEST FRIEND----------*********/
router.get('/:key/type=friendsuggest', function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'] || req.params.access_token;
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var userSQL = "SELECT * FROM `users` WHERE `key` IN (SELECT `friend_key` FROM `contacts` WHERE `users_key` IN (SELECT `friend_key` FROM `contacts` WHERE `users_key`='"+req.params.key+"')) AND `key`!='"+req.params.key+"' AND `key` NOT IN (SELECT `friend_key` FROM `contacts` WHERE `users_key`='"+req.params.key+"')";
                var notin = "AND `key` NOT IN (SELECT `friend_key` FROM `requests` WHERE `users_key`='" + req.params.key + "')";
                var notin1 = "AND `key` NOT IN (SELECT `users_key` FROM `requests` WHERE `friend_key`='" + req.params.key + "')";
                var block1 = "AND `key` NOT IN (SELECT `users_key` FROM `blocks` WHERE `friend_key`='" + req.params.key + "')";
                var block2 = "AND `key` NOT IN (SELECT `friend_key` FROM `blocks` WHERE `users_key`='" + req.params.key + "')";
                var notinUnsuggest = "AND `key` NOT IN (SELECT `friend_key` FROM `unsuggest` WHERE `users_key`='" + req.params.key + "')";
                client.query(userSQL+notin+notin1+block1+block2+notinUnsuggest, function (error, data, fields) {
                    if (error) {
                        console.log(error);
                        return res.sendStatus(300);
                    } else {
                        if (data.length > 0) {
                            var dataUser = [];
                            async.forEachOf(data, function(element, i, callback){
                            	// lấy số bạn chung
                            	var sql = "SELECT * FROM `users` WHERE `key` IN (SELECT `friend_key` FROM `contacts` WHERE `users_key`='"+data[i].key+"' AND `friend_key` IN (SELECT `friend_key` FROM `contacts` WHERE `users_key`='"+req.params.key+"'))";
                            	client.query(sql, function(e, contact, FCT){
                            		if (e) {
                            			console.log(e);
                            		} else {
                            			data[i].mutual_friend = contact.length;
                                        if (contact.length > 0) {
                                            dataUser.push(data[i]);
                                        }
                            			if (i === data.length-1) {
                            				return res.send(echoResponse(200, dataUser, "success", false));
                            			}
                            		}
                            	});
                            });
                        } else {
                            return res.send(echoResponse(404, 'Nobody.', 'success', true));
                        }
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
/*********--------Unsuggest----------*********/
router.post('/unsuggest', urlParser, function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                ///-----Check nếu tồn tại access_token thì chạy xuống dưới
                var userSQL = "SELECT * FROM `unsuggest` WHERE `users_key`='" + req.body.users_key + "' AND `friend_key`='" + req.body.friend_key + "'";
                client.query(userSQL, function (error, data, fields) {
                    if (error) {
                        console.log(error);
                        return res.sendStatus(300);
                    } else {
                        if (data.length > 0) {
                           	return res.send(echoResponse(200, 'Unsuggest this user successfully', 'success', true));
                        } else {
                        	var sqlinsert = "INSERT INTO `unsuggest` SET `users_key`='" + req.body.users_key + "',`friend_key`='" + req.body.friend_key + "'";
                        	client.query(sqlinsert, function(e, d, f){
                        		if (e) {
                        			console.log(e);
                        			return res.sendStatus(300);
                        		} else {
                        			return res.send(echoResponse(200, 'Unsuggest this user successfully', 'success', true));
                        		}
                        	});
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
/*********--------GET SUGGEST FRIEND----------*********/
router.get('/:key/type=mutual_friend', function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'] || req.params.access_token;
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                // lấy số bạn chung
                var friend_key = req.body.friend_key || req.query.friend_key || req.params.friend_key;
                var key = req.body.key || req.query.key || req.params.key;
                var sql = "SELECT * FROM `users` WHERE `key` IN (SELECT `friend_key` FROM `contacts` WHERE `users_key`='"+friend_key+"' AND `friend_key` IN (SELECT `friend_key` FROM `contacts` WHERE `users_key`='"+key+"'))";
                client.query(sql, function(e, contact, FCT){
                	if (e) {
                		console.log(e);
                	} else {
                		if (contact.length > 0) {
                			async.forEachOf(contact, function(element, i, callback){
                            	// lấy số bạn chung
                            	var sql2 = "SELECT * FROM `users` WHERE `key` IN (SELECT `friend_key` FROM `contacts` WHERE `users_key`='"+contact[i].key+"' AND `friend_key` IN (SELECT `friend_key` FROM `contacts` WHERE `users_key`='"+req.params.key+"'))";
                            	client.query(sql2, function(e2, contact2, FCT2){
                            		if (e2) {
                            			console.log(e2);
                            		} else {
                            			contact[i].mutual_friend = contact2.length;
                            			if (i === contact.length-1) {
                                            return res.send(echoResponse(200, contact, "success", false));
                            			}
                            		}
                            	});
                            });
                		} else {
                			return res.send(echoResponse(404, "404 not found", "success", true));
                		}
                	}
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
/*********--------GET ALL BLOCK FRIEND----------*********/
router.get('/:key/type=friendblock&access_token=:access_token', function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'] || req.params.access_token;
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var userSQL = "SELECT * FROM `users` WHERE `key` IN (SELECT `friend_key` FROM `blocks` WHERE `users_key`='" + req.params.key + "')";
                client.query(userSQL, function (error, data, fields) {
                    if (error) {
                        console.log(error);
                        return res.sendStatus(300);
                    } else {
                        if (data.length > 0) {
                            return res.send(echoResponse(200, data, "success", false));
                        } else {
                            return res.send(echoResponse(404, 'Nobody.', 'success', true));
                        }
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
/*********--------CHECK Exits conversation 1-1----------*********/
router.get('/:key/exists=:friend_key', function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'] || req.params.access_token;
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var condition1 = req.params.key + '-' + req.params.friend_key;
                var condition2 = req.params.friend_key + '-' + req.params.key;
                var userSQL = "SELECT * FROM `conversations` WHERE `key`='" + condition1 + "' OR `key`='" + condition2 + "'";
                client.query(userSQL, function (error, data, fields) {
                    if (error) {
                        console.log(error);
                        return res.sendStatus(300);
                    } else {
                        if (data.length > 0) {
                            return res.send(echoResponse(200, data, 'success', true));
                        } else {
                            return res.send(echoResponse(404, 'Conversation not found.', 'success', true));
                        }
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
/*********--------GET FRIEND ONLINE----------*********/
router.get('/:key/type=friendonline&access_token=:access_token', function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'] || req.params.access_token;
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var userSQL = "SELECT * FROM `users` WHERE `key` IN (SELECT `friend_key` FROM `contacts` WHERE `users_key`='" + req.params.key + "') AND `status`='online'";
                client.query(userSQL, function (error, data, fields) {
                    if (error) {
                        console.log(error);
                        return res.sendStatus(300);
                    } else {
                        if (data.length > 0) {
                            return res.send(echoResponse(200, data, "success", false));
                        } else {
                            return res.send(echoResponse(404, 'Nobody.', 'success', true));
                        }
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
/*********--------GET FRIEND OFFLINE----------*********/
router.get('/:key/type=friendoffline&access_token=:access_token', function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'] || req.params.access_token;
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var userSQL = "SELECT * FROM `users` WHERE `key` IN (SELECT `friend_key` FROM `contacts` WHERE `users_key`='" + req.params.key + "') AND `status`='offline'";
                client.query(userSQL, function (error, data, fields) {
                    if (error) {
                        console.log(error);
                        return res.sendStatus(300);
                    } else {
                        if (data.length > 0) {
                            return res.send(echoResponse(200, data, "success", false));
                        } else {
                            return res.send(echoResponse(404, 'Nobody.', 'success', true));
                        }
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
/*********--------------------------*********
 **********------- FRIENDS ----------*********
 **********--------------------------*********/

/*********--------REQUEST----------*********/
router.post('/request', urlParser, function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var isFriendSQL = "SELECT * FROM `contacts` WHERE `friend_key`='" + req.body.users_key + "' AND `users_key`='" + req.body.friend_key + "' OR `friend_key`='" + req.body.friend_key + "' AND `users_key`='" + req.body.users_key + "'";
                client.query(isFriendSQL, function(eFriends, dataFriends, fieldsFriend){
                    if (eFriends) {
                        console.log(eFriends);
                        return res.sendStatus(300);
                    } else {
                        if (dataFriends.length > 0) {
                            return res.send(echoResponse(404, 'This user was your friends.', 'success', true));
                        } else {
                            var userSQL = "SELECT * FROM `requests` WHERE `friend_key`='" + req.body.users_key + "' AND `users_key`='" + req.body.friend_key + "'";
                            client.query(userSQL, function (error, data, fields) {
                                if (error) {
                                    console.log(error);
                                    return res.sendStatus(300);
                                } else {
                                    if (data.length > 0) {
                                        return res.send(echoResponse(404, 'You requested.', 'success', true));
                                    } else {
                                        var insertSQL = "INSERT INTO `requests`(`friend_key`,`message`,`users_key`)";
                                        var dataSQL = "VALUES('" + req.body.users_key + "','" + req.body.message + "','" + req.body.friend_key + "')";
                                        client.query(insertSQL + dataSQL, function (eInsert, dInsert, fInsert) {
                                            if (eInsert) {
                                                console.log(eInsert);
                                                return res.sendStatus(300);
                                            } else {
                                                console.log(req.body.users_key + " gửi lời mời kết bạn tới " + req.body.friend_key);
                                                return res.send(echoResponse(200, 'Requested successfully', 'success', false));
                                            }
                                        });
                                        var currentUser = "SELECT `nickname`,`avatar` FROM `users` WHERE `key`='"+req.body.users_key+"'";
                                        client.query(currentUser, function(eCurrent, dCurrent, fCurren){
                                            if (eCurrent) {
                                                console.log(eCurrent);
                                            } else {
                                                // Insert Notification
                                                var currentTime = new Date().getTime();
                                                insertNotificationNoImage(res, req.body.users_key, dCurrent[0].nickname, dCurrent[0].avatar, "request", currentTime, req.body.friend_key, 0);
                                                sendNotification(req.body.users_key, req.body.friend_key, "send friend request", "request", null);
                                                //-----
                                            }
                                        });
                                        
                                    }
                                }
                            });
                        }
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
router.post('/removerequest', urlParser, function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var userSQL = "SELECT * FROM `requests` WHERE `friend_key`='" + req.body.friend_key + "' AND `users_key`='" + req.body.key + "'";
                client.query(userSQL, function (error, data, fields) {
                    if (error) {
                        console.log(error);
                        return res.sendStatus(300);
                    } else {
                        if (data.length > 0) {
                        	client.query("DELETE FROM `requests` WHERE `friend_key`='" + req.body.friend_key + "' AND `users_key`='" + req.body.key + "'");
                            return res.send(echoResponse(200, 'You requested.', 'success', true));
                        } else {
                            return res.send(echoResponse(404, 'No request.', 'success', true));
                        }
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
/*********--------GET notification----------*********/
router.get('/:key/notifications', urlParser ,function(req, res){
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function(err, decoded) {
            if (err) {
                return res.json({ success: false, message: 'Failed to authenticate token.' });
            } else {
                var key = req.body.key || req.query.key || req.params.key;
                var page = req.body.page || req.query.page || req.params.page;
                var per_page = req.body.per_page || req.query.per_page || req.params.per_page;

                var userSQL = "SELECT * FROM `notification_feed` WHERE `users_key`='"+key+"' ORDER BY `time` DESC LIMIT " + parseInt(per_page, 10) + " OFFSET " + parseInt(page, 10) * parseInt(per_page, 10)+"";
                client.query(userSQL, function(error, data, fields){
                    if (error) {
                        console.log(error);
                        return res.sendStatus(300);
                    } else {
                        if (data.length > 0) {
                        	updateRefreshNotifications(req.params.key);
                            return res.send(echoResponse(200,data,'success',false));
                        } else {
                            return res.send(echoResponse(404,'No have notification.','success',true));
                        }
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403,'Authenticate: No token provided.','success',true));
    }
});
function updateRefreshNotifications(users_key){
	var sql = "SELECT * FROM `notification_refresh` WHERE `users_key`='"+users_key+"'";
	client.query(sql, function(error, data, fields){
		if (error) {
			console.log(error);
		} else {
			if (data.length > 0) {
				var currentTime = new Date().getTime();
				var sqlUpdate = "UPDATE `notification_refresh` SET `time`='"+currentTime+"' WHERE `users_key`='"+users_key+"'";
				client.query(sqlUpdate);
			} else {
				var currentTime = new Date().getTime();
				var sqlUpdate = "INSERT INTO `notification_refresh` SET `time`='"+currentTime+"',`users_key`='"+users_key+"'";
				client.query(sqlUpdate);
			}
		}
	});
}


/*********--------GET Mối quan hệ giữa 2 người----------*********/
router.get('/:key/friend=:friend_key&access_token=:access_token', function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'] || req.params.access_token;
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var userSQL = "SELECT * FROM `blocks` WHERE `friend_key`='" + req.params.friend_key + "' AND `users_key`='" + req.params.key + "'";
                client.query(userSQL, function (eBlock, dBlock, fBlock) {
                    if (eBlock) {
                        console.log(eBlock);
                        return res.sendStatus(300);
                    } else {
                        if (dBlock.length > 0) {
                            return res.send(echo5Response(200, 'You blocked friend', 0, 'success', false));
                        } else {
                            var userSQL = "SELECT * FROM `blocks` WHERE `friend_key`='" + req.params.key + "' AND `users_key`='" + req.params.friend_key + "'";
                            client.query(userSQL, function (eBlock, dBlock, fBlock) {
                                if (eBlock) {
                                    console.log(eBlock);
                                    return res.sendStatus(300);
                                } else {
                                    if (dBlock.length > 0) {
                                        return res.send(echo5Response(200, 'Friend blocked you', 1, 'success', false));
                                    } else {
                                        var userSQL = "SELECT * FROM `requests` WHERE `friend_key`='" + req.params.key + "' AND `users_key`='" + req.params.friend_key + "'";
                                        client.query(userSQL, function (error, data, fields) {
                                            if (error) {
                                                console.log(error);
                                                return res.sendStatus(300);
                                            } else {
                                                if (data.length > 0) {
                                                    return res.send(echo5Response(200, 'You requested', 2, 'success', false));
                                                } else {
                                                    //---
                                                    var userSQL2 = "SELECT * FROM `requests` WHERE `friend_key`='" + req.params.friend_key + "' AND `users_key`='" + req.params.key + "'";
                                                    client.query(userSQL2, function (error1, data1, fields1) {
                                                        if (error1) {
                                                            console.log(error1);
                                                            return res.sendStatus(300);
                                                        } else {
                                                            if (data1.length > 0) {
                                                                return res.send(echo5Response(200, data1[0].message, 3, 'success', false));
                                                            } else {
                                                                //---
                                                                var userSQL2 = "SELECT * FROM `contacts` WHERE `friend_key`='" + req.params.friend_key + "' AND `users_key`='" + req.params.key + "'";
                                                                client.query(userSQL2, function (error2, data2, fields2) {
                                                                    if (error2) {
                                                                        console.log(error2);
                                                                        return res.sendStatus(300);
                                                                    } else {
                                                                        if (data2.length > 0) {
                                                                            return res.send(echo5Response(200, 'Friends', 4, 'success', false));
                                                                        } else {
                                                                            return res.send(echo5Response(200, 'No relationship.', 5, 'success', false));
                                                                        }
                                                                    }
                                                                });
                                                            }
                                                        }
                                                    });
                                                }
                                            }
                                        });

                                    }
                                }
                            });
                        }
                        //-------------
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
/*********--------UNREQUEST----------*********/
router.post('/unrequest', urlParser, function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var userSQL = "SELECT * FROM `requests` WHERE `friend_key`='" + req.body.users_key + "' AND `users_key`='" + req.body.friend_key + "'";
                client.query(userSQL, function (error, data, fields) {
                    if (error) {
                        console.log(error);
                        return res.sendStatus(300);
                    } else {
                        if (data.length > 0) {
                            removeNotification(res, req.body.friend_key, req.body.users_key, "request");
                            var deleteSQL = "DELETE FROM `requests` WHERE `friend_key`='" + req.body.users_key + "' AND `users_key`='" + req.body.friend_key + "'";
                            client.query(deleteSQL, function (eDelete, dDelete, fDelete) {
                                if (eDelete) {
                                    console.log(eDelete);
                                    return res.sendStatus(300);
                                } else {
                                    return res.send(echoResponse(200, 'Unrequest successfully', 'success', false));
                                }
                            });
                        } else {
                            return res.send(echoResponse(404, 'This request not exists.', 'success', true));
                        }
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
/*********--------UNFRIEND----------*********/
router.post('/unfriend', urlParser, function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                //var removeNotifi = "DELETE FROM `notification_feed` WHERE `users_key`='"+req.body.users_key+"' AND `friend_key`='"+req.body.friend_key+"' OR `friend_key`='" + req.body.users_key + "' AND `users_key`='" + req.body.friend_key + "'";
                //client.query(removeNotifi);
                var currentUser = "SELECT `nickname`,`avatar` FROM `users` WHERE `key`='"+req.body.users_key+"'";
                client.query(currentUser, function(eCurrent, dCurrent, fCurren){
                    if (eCurrent) {
                        console.log(eCurrent);
                    } else {
                        if (dCurrent.length > 0) {
                            // Insert Notification
                            var currentTime = new Date().getTime();
                            insertNotificationNoImage(res, req.body.users_key, dCurrent[0].nickname, dCurrent[0].avatar, "unfriend", currentTime, req.body.friend_key, 0);
                            sendNotification(req.body.users_key, req.body.friend_key, "has unfriend with you", "unfriend", null);
                            
                            client.query("SELECT `id` FROM `posts` WHERE `users_key`='"+req.body.friend_key+"' OR `users_key`='"+req.body.users_key+"'", function(e,d,f){
                                if (e) {
                                    console.log(e);
                                } else {
                                    if (d.length > 0) {
                                        async.forEachOf(d, function(dt, i, call){
                                            var deleteRelate = "DELETE FROM `notification_relate` WHERE `posts_id`='" + d[i].id + "' AND `users_key`='" + req.body.users_key + "' OR `users_key`='" + req.body.friend_key + "'";
                                            client.query(deleteRelate);
                                        });
                                    }
                                }
                            });
                            //-----
                            var userSQL = "DELETE FROM `contacts` WHERE `friend_key`='" + req.body.users_key + "' AND `users_key`='" + req.body.friend_key + "' OR `friend_key`='" + req.body.friend_key + "' AND `users_key`='" + req.body.users_key + "'";
                            client.query(userSQL, function (error, data, fields) {
                                if (error) {
                                    console.log(error);
                                    return res.sendStatus(300);
                                } else {
                                    return res.send(echoResponse(200, 'Unfriend successfully', 'success', false));
                                }
                            });
                        } else {
                            return res.send(echoResponse(404, 'This users_key not exits', 'success', false));
                        }
                        
                    }
                });
                

                
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});

/*********--------BLOCK----------*********/
router.post('/block', urlParser, function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var removeNotifi = "DELETE FROM `notification_feed` WHERE `users_key`='"+req.body.users_key+"' AND `friend_key`='"+req.body.friend_key+"' OR `friend_key`='" + req.body.users_key + "' AND `users_key`='" + req.body.friend_key + "'";
                client.query(removeNotifi);
                var deleteSQL = "DELETE FROM `requests` WHERE `friend_key`='" + req.body.users_key + "' AND `users_key`='" + req.body.friend_key + "' OR `friend_key`='" + req.body.friend_key + "' AND `users_key`='" + req.body.users_key + "'";
                client.query(deleteSQL);
                var userSQL = "DELETE FROM `contacts` WHERE `friend_key`='" + req.body.users_key + "' AND `users_key`='" + req.body.friend_key + "' OR `friend_key`='" + req.body.friend_key + "' AND `users_key`='" + req.body.users_key + "'";
                client.query(userSQL);

                var coupleLike = "DELETE FROM `couple_like` WHERE `friend_key`='" + req.body.users_key + "' AND `users_key`='" + req.body.friend_key + "' OR `friend_key`='" + req.body.friend_key + "' AND `users_key`='" + req.body.users_key + "'";
                client.query(coupleLike);
                var coupleUnLike = "DELETE FROM `couple_unlike` WHERE `friend_key`='" + req.body.users_key + "' AND `users_key`='" + req.body.friend_key + "' OR `friend_key`='" + req.body.friend_key + "' AND `users_key`='" + req.body.users_key + "'";
                client.query(coupleUnLike);

                deleteTag(req.body.users_key, req.body.friend_key);

                client.query("SELECT `id` FROM `posts` WHERE `users_key`='"+req.body.friend_key+"' OR `users_key`='"+req.body.users_key+"'", function(e,d,f){
                    if (e) {
                        console.log(e);
                    } else {
                        if (d.length > 0) {
                            async.forEachOf(d, function(dt, i, call){
                                var deleteRelate = "DELETE FROM `notification_relate` WHERE `posts_id`='" + d[i].id + "' AND `users_key`='" + req.body.users_key + "' OR `users_key`='" + req.body.friend_key + "'";
                                client.query(deleteRelate);
                            });
                        }
                    }
                });

                var insertSQL = "INSERT INTO `blocks`(`friend_key`,`users_key`) VALUES('" + req.body.friend_key + "','" + req.body.users_key + "')";
                client.query(insertSQL, function (error, data, fields) {
                    if (error) {
                        console.log(error);
                        return res.sendStatus(300);
                    } else {
                        return res.send(echoResponse(200, 'Blocked successfully', 'success', false));
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});

function deleteTag(users_key, friend_key){
    var sql = "SELECT * FROM `posts` WHERE `users_key`='"+users_key+"'";
    client.query(sql, function(error, data, fields){
        if (error) {
            console.log(error);
        } else {
            async.forEachOf(data, function(element, i, callback){
                var userSQL = "DELETE FROM `tags` WHERE `posts_id`='" + data[i].id + "' AND `users_key`='"+friend_key+"'";
                client.query(userSQL);
                var userSQL1 = "DELETE FROM `permissions` WHERE `posts_id`='" + data[i].id + "' AND `users_key`='"+friend_key+"'";
                client.query(userSQL1);
                var userSQL2 = "DELETE FROM `notification_relate` WHERE `posts_id`='" + data[i].id + "' AND `users_key`='"+friend_key+"'";
                client.query(userSQL2);
            });
        }
    });
}

/*********--------UNBLOCK----------*********/
router.post('/unblock', urlParser, function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var insertSQL = "SELECT * FROM `blocks` WHERE `friend_key`='" + req.body.friend_key + "' AND `users_key`='" + req.body.users_key + "'";
                client.query(insertSQL, function (error, data, fields) {
                    if (error) {
                        console.log(error);
                        return res.sendStatus(300);
                    } else {
                        if (data.length > 0) {
                            var userSQL = "DELETE FROM `blocks` WHERE `friend_key`='" + req.body.friend_key + "' AND `users_key`='" + req.body.users_key + "'";
                            client.query(userSQL);
                            return res.send(echoResponse(200, 'Unblock successfully', 'success', false));
                        } else {
                            return res.send(echoResponse(404, 'You not block this friend', 'success', false));
                        }
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});

/*********--------ACCEPT----------*********/
router.post('/accept', urlParser, function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var userSQL = "SELECT * FROM `requests` WHERE `friend_key`='" + req.body.friend_key + "' AND `users_key`='" + req.body.users_key + "'";
                client.query(userSQL, function (error, data, fields) {
                    if (error) {
                        console.log(error);
                        return res.sendStatus(300);
                    } else {
                        if (data.length > 0) {
                            var insertSQL = "INSERT INTO `contacts` (`id`, `friend_key`, `relationship`, `created_time`, `users_key`) VALUES (NULL, '" + req.body.friend_key + "', '" + req.body.relationship + "', '" + req.body.created_time + "', '" + req.body.users_key + "');";

                            client.query(insertSQL, function (eInsert, dInsert, fInsert) {
                                if (eInsert) {
                                    console.log(eInsert);
                                    return res.sendStatus(300);
                                } else {
                                    var relationship = 0;
                                    if (req.body.relationship) {
                                        relationship = req.body.relationship;
                                    }
                                    var insertSQLfriend = "INSERT INTO `contacts` (`id`, `friend_key`, `relationship`, `created_time`, `users_key`) VALUES (NULL, '" + req.body.users_key + "', '" + relationship + "', '" + req.body.created_time + "', '" + req.body.friend_key + "');";
                                    client.query(insertSQLfriend);
                                    console.log(req.body.users_key + " đã chấp nhận lời mời kết bạn của " + req.body.friend_key);
                                    var deleteSQL = "DELETE FROM `requests` WHERE `friend_key`='" + req.body.friend_key + "' AND `users_key`='" + req.body.users_key + "'";
                                    client.query(deleteSQL);
                                    return res.send(echoResponse(200, 'Accepted successfully', 'success', false));
                                }
                            });
                            var currentUser = "SELECT `nickname`,`avatar` FROM `users` WHERE `key`='"+req.body.users_key+"'";
                            client.query(currentUser, function(eCurrent, dCurrent, fCurren){
                                if (eCurrent) {
                                    console.log(eCurrent);
                                } else {
                                    // Insert Notification
                                    var currentTime = new Date().getTime();
                                    insertNotificationNoImage(res, req.body.users_key, dCurrent[0].nickname, dCurrent[0].avatar, "accept", currentTime, req.body.friend_key, 0);
                                    sendNotification(req.body.users_key, req.body.friend_key, "accepted your friend request", "accept", null);
                                    //-----
                                }
                            });
                            
                        } else {
                            return res.send(echoResponse(404, 'This request not exists.', 'success', true));
                        }
                    }
                });

            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});


/// SET BADGE
// router.post('/badge', urlParser, function (req, res) {
//     var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
//     if (token) {
//         jwt.verify(token, config.secret, function (err, decoded) {
//             if (err) {
//                 return res.json({success: false, message: 'Failed to authenticate token.'});
//             } else {
//                 var selectsql = "SELECT * FROM `notification_count` WHERE `users_key`='"+req.body.key+"'";
//                 client.query(selectsql, function(error, data, fields){
//                     if (error) {
//                         console.log(error);
//                         return res.sendStatus(300);
//                     } else {
//                         if (data.length > 0) {
//                             var updatesql;
//                             var type = req.body.type;
//                             if (type == 'chat') {
//                                 updatesql = "UPDATE `notification_count` SET `chat`='"+req.body.number+"'";
//                             } else {
//                                 updatesql = "UPDATE `notification_count` SET `activity`='"+req.body.number+"'";
//                             }
//                             client.query(updatesql);
//                             return res.send(echoResponse(200, 'Updated successfully', 'success', false));
//                         } else {
//                             return res.send(echoResponse(404, 'This user count not exists.', 'success', true));
//                         }
//                     }
//                 });
//             }
//         });
//     }
// });
/// INSERT SEEN NOTIFICATIONS
router.post('/seen_profile', urlParser, function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var users_key = req.body.users_key;
                var friend_key = req.body.friend_key;
                sendNotification(users_key, friend_key, "has seen your profile", "profile", null);
                seenProfile(res, users_key, friend_key);
                return res.send(echoResponse(200, 'Send seen notification successfully', 'success', false));
            }
        });
    }
});
/*********--------------------------*********
 **********------ ECHO RESPONSE -----*********
 **********--------------------------*********/
/*********--------Facebook Database----------*********/
router.post('/facebook_point', urlParser, function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secretAdmin, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
            	var selectsql = "SELECT `key` FROM `users` WHERE `facebook_id`='"+req.body.facebook_id+"'";
            	client.query(selectsql, function(e, d, f){
            		if (e) {
            			console.log(e);
            			return res.sendStatus(300);
            		} else {
            			if (d.length > 0) {
            				var sqlInsert = "INSERT INTO `facebook_point`(`facebook_id`,`point`,`users_key`)";
            				var value = " VALUES('"+req.body.facebook_id+"','"+req.body.point+"','"+d[0].key+"')";
            				client.query(sqlInsert+value, function(eI, dI, fI){
            					if (eI) {
            						console.log(eI);
            						return res.sendStatus(300);
            					} else {
            						return res.send(echoResponse(200, 'SUCCESS', 'success', false));
            					}
            				});
            			} else {
            				return res.send(echoResponse(404, 'User not exists', 'success', true));
            			}
            		}
            	});
            }
        });
    }
});
/*********--------Facebook Database----------*********/
router.post('/facebook', urlParser, function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secretAdmin, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var json;
                var bodydata = unescape(req.body.data);
                if (isJsonString(bodydata)) {
                    var arrayJson = bodydata;
                    json = JSON.parse(arrayJson);
                    // Work
                    if (json.data_work) {
                        var data = json.data_work;
                        async.forEachOf(data, function (currentData, n, callback) {
                            insertFacebookData(res, json.facebook, data[n], 'work');
                            if (n === data.length - 1) {
                                return res.send(echoResponse(200, 'SUCCESS', 'success', false));
                            }
                        });
                    }
                    // Education
                    if (json.data_education) {
                        var data = json.data_education;
                        async.forEachOf(data, function (currentData, n, callback) {
                            insertFacebookData(res, json.facebook, data[n], 'education');
                            if (n === data.length - 1) {
                                return res.send(echoResponse(200, 'SUCCESS', 'success', false));
                            }
                        });
                    }
                    // Contact
                    if (json.data_contact) {
                        var data = json.data_contact;
                        async.forEachOf(data, function (currentData, n, callback) {
                            insertFacebookData(res, json.facebook, data[n], 'contact');
                            if (n === data.length - 1) {
                                return res.send(echoResponse(200, 'SUCCESS', 'success', false));
                            }
                        });
                    }
                    // Info
                    if (json.data_info) {
                        var data = json.data_info;
                        async.forEachOf(data, function (currentData, n, callback) {
                            insertFacebookData(res, json.facebook, data[n], 'info');
                            if (n === data.length - 1) {
                                return res.send(echoResponse(200, 'SUCCESS', 'success', false));
                            }
                        });
                    }
                    // Living
                    if (json.data_living) {
                        var data = json.data_living;
                        async.forEachOf(data, function (currentData, n, callback) {
                            insertFacebookData(res, json.facebook, data[n], 'living');
                            if (n === data.length - 1) {
                                return res.send(echoResponse(200, 'SUCCESS', 'success', false));
                            }
                        });
                    }
                    // Relationship
                    if (json.data_relationship) {
                        var data = json.data_relationship;
                        async.forEachOf(data, function (currentData, n, callback) {
                            insertFacebookData(res, json.facebook, data[n], 'relationship');
                            if (n === data.length - 1) {
                                return res.send(echoResponse(200, 'SUCCESS', 'success', false));
                            }
                        });
                    }
                    // data_family
                    if (json.data_family) {
                        var data = json.data_family;
                        async.forEachOf(data, function (currentData, n, callback) {
                            insertFacebookData(res, json.facebook, data[n], 'family');
                            if (n === data.length - 1) {
                                return res.send(echoResponse(200, 'SUCCESS', 'success', false));
                            }
                        });
                    }
                    // data_year
                    if (json.data_year) {
                        var data = json.data_year;
                        async.forEachOf(data, function (currentData, n, callback) {
                            insertFacebookData(res, json.facebook, data[n], 'year');
                            if (n === data.length - 1) {
                                return res.send(echoResponse(200, 'SUCCESS', 'success', false));
                            }
                        });
                    }
                    // data_about
                    if (json.data_about) {
                        var data = json.data_about;
                        async.forEachOf(data, function (currentData, n, callback) {
                            insertFacebookData(res, json.facebook, data[n], 'about');
                            if (n === data.length - 1) {
                                return res.send(echoResponse(200, 'SUCCESS', 'success', false));
                            }
                        });
                    }
                    // data_checkin
                    if (json.data_checkin) {
                        var data = json.data_checkin;
                        async.forEachOf(data, function (currentData, n, callback) {
                            insertFacebookData(res, json.facebook, data[n], 'checkin');
                            if (n === data.length - 1) {
                                return res.send(echoResponse(200, 'SUCCESS', 'success', false));
                            }
                        });
                    }
                    // data_sports
                    if (json.data_sports) {
                        var data = json.data_sports;
                        async.forEachOf(data, function (currentData, n, callback) {
                            insertFacebookData(res, json.facebook, data[n], 'sports');
                            if (n === data.length - 1) {
                                return res.send(echoResponse(200, 'SUCCESS', 'success', false));
                            }
                        });
                    }
                    // data_music
                    if (json.data_music) {
                        var data = json.data_music;
                        async.forEachOf(data, function (currentData, n, callback) {
                            insertFacebookData(res, json.facebook, data[n], 'music');
                            if (n === data.length - 1) {
                                return res.send(echoResponse(200, 'SUCCESS', 'success', false));
                            }
                        });
                    }
                    // data_movie
                    if (json.data_movie) {
                        var data = json.data_movie;
                        async.forEachOf(data, function (currentData, n, callback) {
                            insertFacebookData(res, json.facebook, data[n], 'movie');
                            if (n === data.length - 1) {
                                return res.send(echoResponse(200, 'SUCCESS', 'success', false));
                            }
                        });
                    }
                    // data_tv
                    if (json.data_tv) {
                        var data = json.data_tv;
                        async.forEachOf(data, function (currentData, n, callback) {
                            insertFacebookData(res, json.facebook, data[n], 'tv');
                            if (n === data.length - 1) {
                                return res.send(echoResponse(200, 'SUCCESS', 'success', false));
                            }
                        });
                    }
                    // data_book
                    if (json.data_book) {
                        var data = json.data_book;
                        async.forEachOf(data, function (currentData, n, callback) {
                            insertFacebookData(res, json.facebook, data[n], 'book');
                            if (n === data.length - 1) {
                                return res.send(echoResponse(200, 'SUCCESS', 'success', false));
                            }
                        });
                    }
                    // data_game
                    if (json.data_game) {
                        var data = json.data_game;
                        async.forEachOf(data, function (currentData, n, callback) {
                            insertFacebookData(res, json.facebook, data[n], 'game');
                            if (n === data.length - 1) {
                                return res.send(echoResponse(200, 'SUCCESS', 'success', false));
                            }
                        });
                    }
                    // data_like
                    if (json.data_like) {
                        var data = json.data_like;
                        async.forEachOf(data, function (currentData, n, callback) {
                            insertFacebookData(res, json.facebook, data[n], 'like');
                            if (n === data.length - 1) {
                                return res.send(echoResponse(200, 'SUCCESS', 'success', false));
                            }
                        });
                    }
                    // data_event
                    if (json.data_event) {
                        var data = json.data_event;
                        async.forEachOf(data, function (currentData, n, callback) {
                            insertFacebookData(res, json.facebook, data[n], 'event');
                            if (n === data.length - 1) {
                                return res.send(echoResponse(200, 'SUCCESS', 'success', false));
                            }
                        });
                    }
                    // data_diem
                    if (json.data_diem) {
                        var data = json.data_diem;
                        console.log(data);
                        var sqlPoint = "SELECT * FROM `users` WHERE `facebook_id`='" + json.facebook + "'";
                        client.query(sqlPoint, function(ePoint, dataPoint, fieldsPoint){
                            if (ePoint) {
                                console.log(ePoint);
                                return res.sendStatus(300);
                            } else {
                                if (dataPoint.length > 0) {
                                    var point = data;
                                    var sqlUpdate = "UPDATE `users` SET `facebook_point`="+point+" WHERE `facebook_id`='"+json.facebook+"'";
                                    client.query(sqlUpdate);
                                    console.log("UPDATED POINT");
                                }
                            }
                        });
                    }
                    // data_group
                    if (json.data_group) {
                        var data = json.data_group;
                        async.forEachOf(data, function (currentData, n, callback) {
                            insertFacebookData(res, json.facebook, data[n], 'group');
                            if (n === data.length - 1) {
                                return res.send(echoResponse(200, 'SUCCESS', 'success', false));
                            }
                        });
                    }
                    // data_image
                    if (json.data_image) {
                        var data = json.data_image;
                        console.log(JSON.stringify(data));
                        if (data.length == 0) {
                            return res.send(echoResponse(200, 'SUCCESS', 'success', false));
                        }
                        if (data.length == 1) {
                            var usersql = "SELECT `key` FROM `users` WHERE `facebook_id`='"+json.facebook+"'";
                            client.query(usersql, function(e, d, f){
                                if (e) {
                                    console.log(e);
                                    return res.sendStatus(300);
                                } else {
                                    if (d.length >0) {
                                        var currentTime = new Date().getTime();
                                        var sqlInsert = "INSERT INTO `posts`(`caption`,`posted_time`,`edited_time`,`permission`,`type`,`is_active`,`users_key`)";
                                        var sqlData = "VALUES ('Facebook Photo','"+currentTime+"','"+currentTime+"','0','photo','1','"+d[0].key+"')";
                                        client.query(sqlInsert+sqlData, function(eInsert, dataInsert, fields){
                                            if (eInsert) {
                                                console.log(eInsert);
                                                return res.sendStatus(300);
                                            } else {
                                                async.forEachOf(data, function (currentData, n, callback) {
                                                    var insertMember = "INSERT INTO `store_images`(`img_url`,`img_width`,`img_height`,`users_key`,`posts_id`)";
                                                    var dataMember = "VALUES ('" + data[n] + "','500','500','" + d[0].key + "','" + dataInsert.insertId + "')";
                                                    client.query(insertMember + dataMember, function (eMember, rMember, fMember) {
                                                        if (eMember) {
                                                            console.log(eMember);
                                                            return res.sendStatus(300);
                                                        } else {
                                                            console.log("INSERT ALBUMS SUCCESS");
                                                        }
                                                    });

                                                    if (n === data.length - 1) {
                                                        return res.send(echoResponse(200, 'SUCCESS', 'success', false));
                                                    }
                                                });
                                            }
                                        });
                                    }
                                }
                            });
                        }
                        if (data.length > 1 && data.length != 0){
                            var usersql = "SELECT `key` FROM `users` WHERE `facebook_id`='"+json.facebook+"'";
                            client.query(usersql, function(e, d, f){
                                if (e) {
                                    console.log(e);
                                } else {
                                    if (d.length >0) {
                                        var currentTime = new Date().getTime();
                                        var sqlInsert = "INSERT INTO `posts`(`caption`,`posted_time`,`edited_time`,`permission`,`type`,`is_active`,`users_key`)";
                                        var sqlData = "VALUES ('Facebook Albums','"+currentTime+"','"+currentTime+"','0','albums','1','"+d[0].key+"')";
                                        client.query(sqlInsert+sqlData, function(eInsert, dataInsert, fields){
                                            if (eInsert) {
                                                console.log(eInsert);
                                                return res.sendStatus(300);
                                            } else {
                                                async.forEachOf(data, function (currentData, n, callback) {
                                                    var insertMember = "INSERT INTO `store_images`(`img_url`,`img_width`,`img_height`,`users_key`,`posts_id`)";
                                                    var dataMember = "VALUES ('" + data[n] + "','500','500','" + d[0].key + "','" + dataInsert.insertId + "')";
                                                    client.query(insertMember + dataMember, function (eMember, rMember, fMember) {
                                                        if (eMember) {
                                                            console.log(eMember);
                                                            return res.sendStatus(300);
                                                        } else {
                                                            console.log("INSERT ALBUMS SUCCESS");
                                                        }
                                                    });
                                                    if (n === data.length - 1) {
                                                        return res.send(echoResponse(200, 'SUCCESS', 'success', false));
                                                    }
                                                });
                                            }
                                        });
                                    }
                                }
                            });
                        } else {

                        }
                        
                    }

                    // data_timeline
                    if (json.data_timeline) {
                            var data = json.data_timeline;
                            console.log(JSON.stringify(data));
                            var usersql = "SELECT `key` FROM `users` WHERE `facebook_id`='"+json.facebook+"'";
                            client.query(usersql, function(e, d, f){
                                if (e) {
                                    console.log(e);
                                    return res.sendStatus(300);
                                } else {
                                    if (d.length >0) {
                                        async.forEachOf(data, function(ele, i, call){
                                            var dataImage = ele.images;
                                            if (dataImage.length == 0) {
                                                var currentTime = parseInt(ele.time,10)*1000;
                                                var sqlInsert = "INSERT INTO `posts`(`caption`,`posted_time`,`edited_time`,`permission`,`type`,`is_active`,`users_key`)";
                                                var caption;
                                                if (ele.content == 0) {
                                                    caption = ele.title;
                                                } else {
                                                    caption = ele.title + ' ' + ele.content;
                                                }
                                                var sqlData = "VALUES ("+escapeSQL.escape(caption)+",'"+currentTime+"','"+currentTime+"','0','text','1','"+d[0].key+"')";
                                                client.query(sqlInsert+sqlData, function(eInsert, dataInsert, fields){
                                                    if (eInsert) {
                                                        console.log(eInsert);
                                                        if (i === data.length - 1) {
                                                            return res.sendStatus(300);
                                                        }
                                                    } else {
                                                        if (i === data.length - 1) {
                                                            return res.send(echoResponse(200, 'SUCCESS', 'success', false));
                                                        }
                                                    }
                                                });
                                            }
                                            if (dataImage.length == 1) {
                                                ///-------
                                                var currentTime = parseInt(ele.time,10)*1000;
                                                var sqlInsert = "INSERT INTO `posts`(`caption`,`posted_time`,`edited_time`,`permission`,`type`,`is_active`,`users_key`)";
                                                var caption;
                                                if (ele.content == 0) {
                                                    caption = ele.title;
                                                } else {
                                                    caption = ele.title + ' ' + ele.content;
                                                }
                                                var sqlData = "VALUES ("+escapeSQL.escape(caption)+",'"+currentTime+"','"+currentTime+"','0','photo','1','"+d[0].key+"')";
                                                client.query(sqlInsert+sqlData, function(eInsert, dataInsert, fields){
                                                    if (eInsert) {
                                                        console.log(eInsert);
                                                        if (i === data.length - 1) {
                                                            return res.sendStatus(300);
                                                        }
                                                    } else {
                                                        async.forEachOf(dataImage, function (currentData, n, callback) {
                                                            var insertMember = "INSERT INTO `store_images`(`img_url`,`img_width`,`img_height`,`users_key`,`posts_id`)";
                                                            var dataMember = "VALUES ('" + dataImage[n] + "','500','500','" + d[0].key + "','" + dataInsert.insertId + "')";
                                                            client.query(insertMember + dataMember, function (eMember, rMember, fMember) {
                                                                if (eMember) {
                                                                    console.log(eMember);
                                                                    if (i === data.length - 1) {
                                                                        return res.sendStatus(300);
                                                                    }
                                                                } else {
                                                                    console.log("INSERT ALBUMS SUCCESS");
                                                                    if (i === data.length - 1) {
                                                                        return res.send(echoResponse(200, 'SUCCESS', 'success', false));
                                                                    }
                                                                }
                                                            });
                                                        });
                                                    }
                                                });
                                                //--------
                                            } else {
                                                //--------
                                                if (ele.content == 0) {
                                                    caption = ele.title;
                                                } else {
                                                    caption = ele.title + ' ' + ele.content;
                                                }
                                                var currentTime = parseInt(ele.time,10)*1000;
                                                var sqlInsert = "INSERT INTO `posts`(`caption`,`posted_time`,`edited_time`,`permission`,`type`,`is_active`,`users_key`)";
                                                var sqlData = "VALUES ("+escapeSQL.escape(caption)+",'"+currentTime+"','"+currentTime+"','0','albums','1','"+d[0].key+"')";
                                                client.query(sqlInsert+sqlData, function(eInsert, dataInsert, fields){
                                                    if (eInsert) {
                                                        console.log(eInsert);
                                                        if (i === data.length - 1) {
                                                            return res.sendStatus(300);
                                                        }
                                                    } else {
                                                        async.forEachOf(dataImage, function (currentData, n, callback) {
                                                            var insertMember = "INSERT INTO `store_images`(`img_url`,`img_width`,`img_height`,`users_key`,`posts_id`)";
                                                            var dataMember = "VALUES ('" + dataImage[n] + "','500','500','" + d[0].key + "','" + dataInsert.insertId + "')";
                                                            client.query(insertMember + dataMember, function (eMember, rMember, fMember) {
                                                                if (eMember) {
                                                                    console.log(eMember);
                                                                    if (i === data.length - 1) {
                                                                        return res.sendStatus(300);
                                                                    }
                                                                } else {
                                                                    console.log("INSERT ALBUMS SUCCESS");
                                                                }
                                                            });
                                                            if (i === data.length - 1) {
                                                                return res.send(echoResponse(200, 'SUCCESS', 'success', false));
                                                            }
                                                        });
                                                    }
                                                });
                                                //---------
                                            }
                                        });
                                        
                                    }
                                }
                            });
                    }
                    if (json.data_listfriend) {
                        var data = json.data_listfriend;
                        var usersql = "SELECT `key` FROM `users` WHERE `facebook_id`='"+json.facebook+"'";
                        client.query(usersql, function(e, d, f){
                            if (e) {
                                console.log(e);
                            } else {
                                if (d.length >0) {
                                    async.forEachOf(data, function (ele, n, callback) {
                                        var sqlInsert = "INSERT INTO `facebook_friends`(`nickname`,`facebook_id`,`url_facebook`,`users_key`)";
                                        var sqlData = "VALUES ("+escapeSQL.escape(ele.name)+",'"+ele.id+"','"+ele.linkFB+"','"+d[0].key+"')";
                                        client.query(sqlInsert + sqlData, function (eMember, rMember, fMember) {
                                            if (eMember) {
                                                console.log(eMember);
                                                return res.sendStatus(300);
                                            } else {
                                                 console.log("INSERT SUCCESS");
                                            }
                                        });
                                        if (n === data.length - 1) {
                                            return res.send(echoResponse(200, 'SUCCESS', 'success', false));
                                        }
                                    });
                                }
                            }
                        });

                    }
                } else {
                    console.log("ERROR JSON");
                    return res.send(echoResponse(404, 'JSON ERROR', 'success', false));
                }

            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});

function insertFacebookData(res, facebook_id, name, type) {
    var insertSQL = "SELECT * FROM `facebook_informations` WHERE `users_key` IN (SELECT `key` FROM `users` WHERE `facebook_id`='" + facebook_id + "')";
    client.query(insertSQL, function (error, data, fields) {
        if (error) {
            console.log(error);
        } else {
            var selectUser = "SELECT `key` FROM `users` WHERE `facebook_id`='" + facebook_id + "'";
                client.query(selectUser, function (e, d, f) {
                    if (e) {
                        console.log(e);
                    } else {
                        if (d.length > 0) {
                            var sql = "INSERT INTO `facebook_informations`(`name`,`type`,`users_key`) VALUES(" + escapeSQL.escape(name) + ",'" + type + "','" + d[0].key + "')";
                            client.query(sql, function (errorUpdate, dataUpdate, fieldUpdate) {
                                if (errorUpdate) {
                                    console.log(errorUpdate);
                                } else {
                                    console.log("OK");
                                }
                            });
                        } else {
                            console.log("No correct users");
                        }
                    }
            });
        }
    });
}
function insertFacebookImage(res, facebook_id, url) {
    var insertSQL = "SELECT * FROM `facebook_albums` WHERE `users_key` IN (SELECT `key` FROM `users` WHERE `facebook_id`='" + facebook_id + "')";
    client.query(insertSQL, function (error, data, fields) {
        if (error) {
            console.log(error);
        } else {
            if (data.length > 0) {
                var sql = "UPDATE `facebook_albums` SET `url`='" + url + "' WHERE `users_key` IN (SELECT `key` FROM `users` WHERE `facebook_id`='" + facebook_id + "')";
                client.query(sql, function (errorUpdate, dataUpdate, fieldUpdate) {
                    if (errorUpdate) {
                        console.log(errorUpdate);
                    } else {
                        console.log("OK");
                    }
                });
            } else {
                var selectUser = "SELECT `key` FROM `users` WHERE `facebook_id`='" + facebook_id + "'";
                client.query(selectUser, function (e, d, f) {
                    if (e) {
                        console.log(e);
                    } else {
                        if (d.length > 0) {
                            var sql = "INSERT INTO `facebook_albums`(`url`,`users_key`) VALUES('" + url + "','" + d[0].key + "')";
                            client.query(sql, function (errorUpdate, dataUpdate, fieldUpdate) {
                                if (errorUpdate) {
                                    console.log(errorUpdate);
                                } else {
                                    console.log("OK");
                                }
                            });
                            
                        } else {
                            console.log("No correct user");
                        }
                    }
                });
            }
        }
    });
}

function seenProfile(res, users_key, friend_key){
    var time = moment(new Date().getTime()).tz('Asia/Ho_Chi_Minh').valueOf();
    var sql = "SELECT `nickname`,`avatar` FROM `users` WHERE `key`='"+users_key+"'";
    client.query(sql, function(error, data, fields){
        if (error) {
            console.log(error);
            return res.sendStatus(300);
        } else {
            var select = "SELECT * FROM `notification_feed` WHERE `friend_key`='" + users_key + "' AND `users_key`='" + friend_key + "' AND `posts_id`='0' AND `type`='profile'";
            client.query(select, function (eSelect, dSelect, fSelect) {
                if (eSelect) {
                    console.log(eSelect);
                    return res.sendStatus(300);
                } else {
                    if (dSelect.length > 0) {
                        //async.forEachOf(dSelect, function (data, i, callback) {
                            var update = "UPDATE `notification_feed` SET `nickname`='" + data[0].nickname + "',`avatar`='" + data[0].avatar + "', `time`='" + time + "', `is_seen`='0' WHERE `friend_key`='" + users_key + "' AND `users_key`='" + friend_key + "' AND `posts_id`='0' AND `type`='profile'";
                            client.query(update, function (e, d, r) {
                                if (e) {
                                    console.log(e);
                                    return res.sendStatus(300);
                                } else {
                                     console.log("UPDATE Notification With Profile");
                                }
                            });
                       // });
                    } else {
                        var insert = "INSERT INTO `notification_feed`(`friend_key`,`nickname`,`avatar`,`type`, `time`, `users_key`, `posts_id`)";
                        var value = "VALUES('" + users_key + "','" + data[0].nickname + "','" + data[0].avatar + "','profile','" + time + "','" + friend_key + "','0')";
                        client.query(insert + value, function (e, d, r) {
                            if (e) {
                                console.log(e);
                                return res.sendStatus(300);
                            } else {
                                console.log("INSERT Notification With Profile");
                            }
                        });
                    }
                }
            });
        }
    });
}

function insertNotificationNoImage(res, friend_key, nickname, avatar, type, time, users_key, posts_id) {
    var select = "SELECT * FROM `notification_feed` WHERE `friend_key`='" + friend_key + "' AND `users_key`='" + users_key + "' AND `posts_id`='" + posts_id + "' AND `type`='" + type + "'";
    client.query(select, function (eSelect, dSelect, fSelect) {
        if (eSelect) {
            console.log(eSelect);
            return res.sendStatus(300);
        } else {
            if (dSelect.length > 0) {
                async.forEachOf(dSelect, function (data, i, callback) {
                    var update = "UPDATE `notification_feed` SET `nickname`='" + nickname + "',`avatar`='" + avatar + "', `time`='" + time + "', `is_seen`='0' WHERE `friend_key`='" + friend_key + "' AND `users_key`='" + users_key + "' AND `posts_id`='" + posts_id + "' AND `type`='" + type + "'";
                    client.query(update, function (e, d, r) {
                        if (e) {
                            console.log(e);
                            return res.sendStatus(300);
                        } else {
                             console.log("UPDATE Notification With Type: "+ type);
                        }
                    });
                });
            } else {
                var insert = "INSERT INTO `notification_feed`(`friend_key`,`nickname`,`avatar`,`type`, `time`, `users_key`, `posts_id`)";
                var value = "VALUES('" + friend_key + "','" + nickname + "','" + avatar + "','" + type + "','" + time + "','" + users_key + "','" + posts_id + "')";
                client.query(insert + value, function (e, d, r) {
                    if (e) {
                        console.log(e);
                        return res.sendStatus(300);
                    } else {
                        console.log("INSERT Notification With Type: "+ type);
                    }
                });
            }
        }
    });
}
function removeNotification(res, users_key, friend_key, type){
    var sql = "SELECT * FROM `notification_feed` WHERE `users_key`='"+users_key+"' AND `friend_key`='"+friend_key+"' AND `type`='"+type+"'";
    client.query(sql, function(error, data, fields){
        if (error) {
            console.log(error);
            return res.sendStatus(300);
        } else {
            if (data.length > 0) {
                var sqlRemove = "DELETE FROM `notification_feed` WHERE `users_key`='"+users_key+"' AND `friend_key`='"+friend_key+"' AND `type`='"+type+"'";
                client.query(sqlRemove);
            }
        }
    });
}
// function sendNotification(sender_key, receiver_key, noidung, kieu){
//     var senderSQL = "SELECT `nickname` FROM `users` WHERE `key`='"+sender_key+"'";
//     client.query(senderSQL, function(loiNguoiGui, dataNguoiGui, FNG){
//         if (loiNguoiGui) {
//             console.log(loiNguoiGui);
//         } else {
//             var badgeSQL = "SELECT * FROM `notification_count` WHERE `users_key`='" +receiver_key+ "'";
//             client.query(badgeSQL, function (loiSoThongBao, dataThongBao, FTB) {
//                 if (loiSoThongBao) {
//                     console.log(loiSoThongBao);
//                 } else {
//                     var updateBadge = parseInt(dataThongBao[0].activity, 10) + 1;
//                     client.query("UPDATE `notification_count` SET `activity`='" + updateBadge + "' WHERE `users_key`='" +receiver_key+ "'");
//                     var receiverSQL = "SELECT `device_token`,`device_type` FROM `users` WHERE `key`='"+receiver_key+"'";
//                     client.query(receiverSQL, function(loiNguoiNhan, dataNguoiNhan, FNN){
//                         if (loiNguoiNhan) {
//                             console.log(loiNguoiNhan);
//                         } else {
//                             if (dataNguoiNhan[0].device_type == 'ios') {
//                                 //--------APNS
//                                 var note = new apn.Notification();
//                                 note.alert = dataNguoiGui[0].nickname + " "+noidung;
//                                 note.sound = 'default';
//                                 note.topic = "privaten.Com.LockHD";
//                                 note.badge = parseInt(dataThongBao[0].chat, 10) + updateBadge;
//                                 note.payload = {
//                                     "sender_id": sender_key,
//                                     "receiver_id": receiver_key,
//                                     "content": dataNguoiGui[0].nickname + " "+noidung,
//                                     "type": kieu
//                                 };
//                                 apnService.send(note, dataNguoiNhan[0].device_token).then(result => {
//                                     console.log("sent:", result.sent.length);
//                                     console.log("failed:", result.failed.length);
//                                     console.log(result.failed);
//                                 });
//                             } else {
//                                 var message = {
//                                     to: dataNguoiNhan[0].device_token,
//                                     collapse_key: collapse_key, 
//                                     data: {
//                                         sender_id: sender_key,
//                                         receiver_id: receiver_key,
//                                         content: dataNguoiGui[0].nickname + " "+noidung,
//                                         type: kieu,
//                                     }
//                                 };
//                                 //callback style
//                                 fcm.send(message, function(err, response){
//                                     if (err) {
//                                         console.log("Something has gone wrong!");
//                                     } else {
//                                         console.log("Successfully sent with response: ", response);
//                                     }
//                                 });
//                             }
//                             //----
//                         }
//                     });
//                 }
//             });  
//         }
//     });
// }

function moiquanhe(users_key, friend_key, ketqua) {
    var userSQL = "SELECT * FROM `blocks` WHERE `friend_key`='" + friend_key + "' AND `users_key`='" + users_key + "'";
    client.query(userSQL, function (eBlock, dBlock, fBlock) {
        if (eBlock) {
            console.log(eBlock);
            ketqua(5);
        } else {
            if (dBlock.length > 0) {
                ketqua(0);
            } else {
                var userSQL = "SELECT * FROM `blocks` WHERE `friend_key`='" + users_key + "' AND `users_key`='" + friend_key + "'";
                client.query(userSQL, function (eBlock, dBlock, fBlock) {
                    if (eBlock) {
                        console.log(eBlock);
                        ketqua(5);
                    } else {
                        if (dBlock.length > 0) {
                            ketqua(1);
                        } else {
                            var userSQL = "SELECT * FROM `requests` WHERE `friend_key`='" + users_key + "' AND `users_key`='" + friend_key + "'";
                            client.query(userSQL, function (error, data, fields) {
                                if (error) {
                                    console.log(error);
                                    ketqua(5);
                                } else {
                                    if (data.length > 0) {
                                        ketqua(2);
                                    } else {
                                        //---
                                        var userSQL2 = "SELECT * FROM `requests` WHERE `friend_key`='" + friend_key + "' AND `users_key`='" + users_key + "'";
                                        client.query(userSQL2, function (error1, data1, fields1) {
                                            if (error1) {
                                                console.log(error1);
                                                ketqua(5);
                                            } else {
                                                if (data1.length > 0) {
                                                    ketqua(3);
                                                } else {
                                                    //---
                                                    var userSQL2 = "SELECT * FROM `contacts` WHERE `friend_key`='" + friend_key + "' AND `users_key`='" + users_key + "'";
                                                    client.query(userSQL2, function (error2, data2, fields2) {
                                                        if (error2) {
                                                            console.log(error2);
                                                            ketqua(5);
                                                        } else {
                                                            if (data2.length > 0) {
                                                                ketqua(4);
                                                            } else {
                                                                ketqua(5);
                                                            }
                                                        }
                                                    });
                                                }
                                            }
                                        });
                                    }
                                }
                            });
                        }
                    }
                });
            }
            //-------------
        }
    });
}

function sendNotification(sender_key, receiver_key, noidung, kieu, posts_id){
    var senderSQL = "SELECT `nickname` FROM `users` WHERE `key`='"+sender_key+"'";
    client.query(senderSQL, function(loiNguoiGui, dataNguoiGui, FNG){
        if (loiNguoiGui) {
            console.log(loiNguoiGui);
        } else {
                numberBadge(receiver_key, function(count){
                    var receiverSQL = "SELECT `device_token`,`device_type` FROM `users` WHERE `key`='"+receiver_key+"'";
                    client.query(receiverSQL, function(loiNguoiNhan, dataNguoiNhan, FNN){
                        if (loiNguoiNhan) {
                            console.log(loiNguoiNhan);
                        } else {
                            if (dataNguoiNhan[0].device_type == 'ios') {
                                //--------APNS
                                var note = new apn.Notification();
                                note.alert = dataNguoiGui[0].nickname + " "+noidung;
                                note.sound = 'default';
                                note.topic = "privaten.Com.LockHD";
                                note.badge = count;
                                if (posts_id) {
                                    note.payload = {
                                        "posts_id": posts_id,
                                        "content": dataNguoiGui[0].nickname + " "+noidung,
                                        "type": kieu
                                    };
                                } else {
                                    note.payload = {
                                        "sender_id": sender_key,
                                        "content": dataNguoiGui[0].nickname + " "+noidung,
                                        "type": kieu
                                    };
                                }
                                
                                apnService.send(note, dataNguoiNhan[0].device_token).then(result => {
                                    console.log("sent:", result.sent.length);
                                    console.log("failed:", result.failed.length);
                                    console.log(result.failed);
                                });
                            } else {
                                var message;
                                if (posts_id) {
                                    message = {
                                        to: dataNguoiNhan[0].device_token,
                                        collapse_key: collapse_key, 
                                        data: {
                                            posts_id: posts_id,
                                            content: dataNguoiGui[0].nickname + " "+noidung,
                                            type: kieu,
                                            title: 'IUDI',
                                            body: dataNguoiGui[0].nickname + " "+noidung
                                        }
                                    };
                                } else {
                                    message = {
                                        to: dataNguoiNhan[0].device_token,
                                        collapse_key: collapse_key, 
                                        data: {
                                            sender_id: sender_key,
                                            content: dataNguoiGui[0].nickname + " "+noidung,
                                            type: kieu,
                                            title: 'IUDI',
                                            body: dataNguoiGui[0].nickname + " "+noidung
                                        }
                                    };
                                }

                                //callback style
                                fcm.send(message, function(err, response){
                                    if (err) {
                                        console.log("Something has gone wrong!");
                                    } else {
                                        console.log("Successfully sent with response: ", response);
                                    }
                                });
                            }
                        }
                    });
                });
        }
    });
}


/// COUNT BADGE
function numberBadge(key, count){
    var userSQL = "SELECT `key` FROM conversations INNER JOIN members ON members.conversations_key = conversations.key AND members.users_key = '" + key + "' AND members.is_deleted='0'";
    client.query(userSQL, function (qError, qData, qFiels) {
        if (qError) {
            console.log(qError);
            count(0);
        } else {
            if (qData.length > 0) {
                var conversationUnread = [];
                async.forEachOf(qData, function (data, i, call) {
                    var sqlSelect = "SELECT `key` FROM conversations INNER JOIN members ON members.conversations_key = conversations.key AND members.users_key = '" + key + "' AND members.is_deleted='0' AND `key` IN (SELECT `conversations_key` FROM `message_status` WHERE `conversations_key`='" + qData[i].key + "' AND `users_key`='" + key + "' AND `is_read`='0')";
                    client.query(sqlSelect, function (e, d, f) {
                        if (e) {
                            console.log(e);
                            return res.sendStatus(300);
                        } else {
                            if (d.length > 0) {
                                conversationUnread.push(qData[i]);
                            }
                            if (i === qData.length - 1) {
                                var userSQL = "SELECT * FROM `notification_feed` INNER JOIN `notification_refresh` ON `notification_feed`.`users_key` = '"+key+"' AND `notification_feed`.`users_key` = notification_refresh.users_key AND `notification_feed`.`time` > `notification_refresh`.`time`";
                                client.query(userSQL, function(error, data, fields){
                                    if (error) {
                                        console.log(error);
                                        return res.sendStatus(300);
                                    } else {
                                        if (data.length > 0) {
                                            count(conversationUnread.length + data.length);
                                        } else {
                                            count(conversationUnread.length);
                                        }
                                    }
                                });
                            }
                        }
                    });
                });
            } else {
                count(0);
            }
        }
    });
}
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
function getInformationUser(users_key, result){
    var sql = "SELECT * FROM `users` WHERE `key`='"+users_key+"'";
    client.query(sql, function(error, data, fields){
        if (error) {
            console.log(error);
        } else {
            if (data.length>0) {
                result(data[0]);  
            }
        }
    });
}
function isJsonString(str) {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
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
