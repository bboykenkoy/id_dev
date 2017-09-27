var express = require('express');
var router = express.Router();
var mysql = require('mysql');
var config = require('../config.js');
var bodyParser = require('body-parser');
var escapeSQL = require('sqlstring');
var jwt = require('jsonwebtoken');
var moment = require('moment-timezone');
// parse application/x-www-form-urlencoded
var urlParser = bodyParser.urlencoded({extended: false});
// parse application/json
router.use(bodyParser.json());
var async = require('async');
//var nude = require('nude');
var request = require('request');
var fs = require('fs');
var _ = require('lodash');
//-- APNS
var apn = require('apn');
var apnService = new apn.Provider({
    cert: "certificates/cert.pem",
    key: "certificates/key.pem",
});
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
//-- FCM
var FCM = require('fcm-push');
var serverKey = config.android;
var collapse_key = 'com.android.abc';
var fcm = new FCM(serverKey);
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
            console.error('CONNECT FAILED MESSAGE', err.code);
            startConnection();
        } else {
            console.error('CONNECTED MESSAGE');
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

var fs = require('fs');
var request = require('request');
var path = require('path');



function downloadImage(urlList, completion){
    var data = [];
    var download = function(url, dest, callback){
        request.get(url)
        .on('error', function(err) {console.log(err)} )
        .pipe(fs.createWriteStream(dest))
        .on('close', callback);
    };
    async.forEachOf(urlList, function(element, i, call){
        var filename =  element.split('/').pop();
        console.log('Downloading ' + filename);
        download(element, filename, function(callback){
            console.log('Finished Downloading ' + filename);
            var tmpPath = path.dirname(__dirname) + '/' + filename;
            data.push(tmpPath);
            if (i === urlList.length-1) {
                completion(data);
            }
        });
    });
}

function checkPorn(posts_id, callback){
    var sql = "SELECT `img_url` FROM `store_images` WHERE `posts_id`='"+posts_id+"'";
    client.query(sql, function(error, data, fields){
        if (error) {
            console.log(error);
        } else {
            var arrayimages = [];
            async.forEachOf(data, function(dt, i , call){
                arrayimages.push(data[i].img_url);
                if (i === data.length-1) {
                    downloadImage(arrayimages, function(completion){
                        callback(completion);
                    });
                }
            });
        }
    });
}

/*********--------------------------*********
 **********------- FUNCTION ------*********
 **********--------------------------*********/

function checkNow(posts_id){
    var arrayBools = [];
    setTimeout(function(){
        checkPorn(posts_id, function(callback){
            setTimeout(function(){
                async.forEachOf(callback, function(element, i, ok){
                    nude.scan(element, function(result) {
                        console.log(result + ' --- ' + element);
                        arrayBools.push(result);
                        if (i === callback.length-1) {
                            checkBoolArrays(arrayBools, posts_id, function(bool){
                                if (bool == false) {
                                    sendNotificationToFriend(posts_id);
                                }
                            });
                        }
                        fs.unlinkSync(element);
                    });
                });
            }, 3000);
        });
    }, 2000);
}

function checkBoolArrays(arrayBools, posts_id, callback){
    for (var j = 0; j < arrayBools.length; j++) {
        if (arrayBools[j] == true) {
            var us = "SELECT `users_key` FROM `posts` WHERE `id`='"+posts_id+"'";
            client.query(us, function(e, d, f){
                if (e) {
                    console.log(e);
                } else {
                    console.log("CHECK: " + posts_id);
                    client.query("INSERT INTO `warning_posts`(`posts_id`) VALUES ('"+posts_id+"')");
                    client.query("UPDATE `posts` SET `is_active`='0' WHERE `id`='"+posts_id+"'");
                    sendWarning(d[0].users_key, posts_id);
                    notificationWarning(d[0].users_key, posts_id);
                    //client.query("DELETE FROM `posts` WHERE `id`='"+posts_id+"'");
                }
            });
            return callback(arrayBools[j]);
        } else {
            if (j === arrayBools.length-1) {
                callback(arrayBools[j]);
            }
        }
    }
}
// sendWarning('o0B9V80446R6mkXA21BL4ksI7MO2', '302');


router.post('/new', urlParser, function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var value = [];
                var insert = [];
                for (var k in req.body) {
                    if (k != 'access_token' && k != 'video' && k != 'albums' && k != 'photo' && k != 'users' && k != 'tags' && k != 'caption' && k != 'posted_time' && k != 'edited_time') {
                        insert.push("`" + k + "`");
                        value.push("'" + req.body[k] + "'");
                    }
                }
                var currentTime = new Date().getTime();
                var insertSQL = "INSERT INTO `posts`(" + insert.toString() + ",`caption`,`posted_time`,`edited_time`) VALUES(" + value.toString() + ","+escapeSQL.escape(req.body.caption)+",'"+currentTime+"','"+currentTime+"')";
                client.query(insertSQL, function (eInsert, dInsert, fInsert) {
                    if (eInsert) {
                        console.log(eInsert);
                        return res.sendStatus(300);
                    } else {
                        // async.series([
                        //     function(successCallback) {
                                console.log("Vừa thêm bài viết thành công với caption " + req.body.caption);
                                var permis = "INSERT INTO `permissions`(`posts_id`,`users_key`) VALUES('" + dInsert.insertId + "','" + req.body.users_key + "')";
                                client.query(permis);

                                insertRelate(req.body.users_key, dInsert.insertId, function(successCall){
                                    if (successCall) {
                                        // async.series([
                                        //     function(call) {
                                                if (req.body.permission && req.body.permission == 2 && req.body.users) {
                                                    var json;
                                                    if (isJsonString(req.body.users)) {
                                                        json = JSON.parse(req.body.users);
                                                        for (var n = 0; n < json.length; n++) {
                                                            var insertMember = "INSERT INTO `permissions`(`posts_id`,`users_key`)";
                                                            var dataMember = "VALUES ('" + dInsert.insertId + "','" + json[n].users_key + "')";
                                                            client.query(insertMember + dataMember, function (eMember, rMember, fMember) {
                                                                if (eMember) {
                                                                    console.log(eMember);
                                                                    return res.sendStatus(300);
                                                                } else {
                                                                    console.log("INSERT USERS SUCCESS");
                                                                }
                                                            });
                                                        }
                                                        // call(null, 'one');
                                                    }
                                                } else {
                                                    // call(null, 'one');
                                                }
                                                
                                            // },
                                            // function(call) {
                                                
                                                
                                            // },
                                            // function(call) {
                                                if (req.body.type == 'albums' || req.body.type == 'photo') {
                                                    //Check porn image
                                                    //checkNow(dInsert.insertId);
                                                    //sendNotificationToFriend(dInsert.insertId);
                                                    //-- end check
                                                    var json;
                                                    if (isJsonString(req.body.albums)) {
                                                        json = JSON.parse(req.body.albums);
                                                        for (var n = 0; n < json.length; n++) {
                                                            if (json[n].img_url) {
                                                                var insertMember = "INSERT INTO `store_images`(`img_url`,`img_width`,`img_height`,`users_key`,`posts_id`)";
                                                                var dataMember = "VALUES ('" + json[n].img_url + "','" + json[n].img_width + "','" + json[n].img_height + "','" + req.body.users_key + "','" + dInsert.insertId + "')";
                                                                client.query(insertMember + dataMember, function (eMember, rMember, fMember) {
                                                                    if (eMember) {
                                                                        console.log(eMember);
                                                                        return res.sendStatus(300);
                                                                    } else {
                                                                        console.log("INSERT ALBUMS SUCCESS");
                                                                    }
                                                                });
                                                            }
                                                        }
                                                        // call(null, 'three');
                                                    } else {
                                                        // call(null, 'three');
                                                        console.log("ERROR JSON");
                                                    }
                                                } else if (req.body.type == 'video') {
                                                    var json;
                                                    if (isJsonString(req.body.video)) {
                                                        json = JSON.parse(req.body.video);
                                                        for (var n = 0; n < json.length; n++) {
                                                            var insertMember = "INSERT INTO `store_videos`(`video_url`,`users_key`,`posts_id`)";
                                                            var dataMember = "VALUES ('" + json[n].video_url + "','" + req.body.users_key + "','" + dInsert.insertId + "')";
                                                            client.query(insertMember + dataMember, function (eMember, rMember, fMember) {
                                                                if (eMember) {
                                                                    console.log(eMember);
                                                                    return res.sendStatus(300);
                                                                } else {
                                                                    console.log("INSERT VIDEO SUCCESS");
                                                                }
                                                            });
                                                        }
                                                        // call(null, 'three');
                                                    }
                                                } else {
                                                    // call(null, 'three');
                                                    // sendNotificationToFriend(dInsert.insertId);
                                                }

                                                if (req.body.tags) {
                                                    var sqlCurrent = "SELECT `nickname`,`avatar` FROM `users` WHERE `key`='" + req.body.users_key + "'";
                                                    client.query(sqlCurrent, function (cError, cData, cField) {
                                                        if (cError) {
                                                            console.log(cError);
                                                            return res.sendStatus(300);
                                                        } else {
                                                            var json;
                                                            if (isJsonString(req.body.tags)) {
                                                                json = JSON.parse(req.body.tags);
                                                                async.forEachOf(json, function (dataJ, j, callBackJ) {
                                                                    var permissionSQL = "INSERT INTO `permissions`(`posts_id`,`users_key`) VALUES('" + dInsert.insertId + "','" + json[j].users_key + "')";
                                                                    console.log("INSERT PERMISSION SUCCESS");
                                                                    client.query(permissionSQL);
                                                                    var insertMember = "INSERT INTO `tags`(`posts_id`,`users_key`)";
                                                                    var dataMember = "VALUES ('" + dInsert.insertId + "','" + json[j].users_key + "')";
                                                                    // relate notification tag
                                                                    insertRelate(json[j].users_key, dInsert.insertId, function(successInsert){
                                                                        if (successInsert) {
                                                                            // end
                                                                            client.query(insertMember + dataMember, function (eMember, rMember, fMember) {
                                                                                if (eMember) {
                                                                                    console.log(eMember);
                                                                                    return res.sendStatus(300);
                                                                                } else {
                                                                                    console.log("INSERT TAGS USERS SUCCESS");
                                                                                }
                                                                            });
                                                                        }
                                                                    });
                                                                    if (j === json.length-1) {
                                                                        sendNotificationToFriend(dInsert.insertId);
                                                                    }
                                                                });
                                                            }
                                                        }
                                                    });
                                                } else {
                                                    sendNotificationToFriend(dInsert.insertId);
                                                    // call(null, 'two');
                                                }
                                            // }
                                        // ],
                                        // // optional callback
                                        // function(err, results) {
                                        //     successCallback(null, 'one');
                                        //     // results is now equal to ['one', 'two']
                                        // });
                                    }
                                });
                        //     },
                        //     function(successCallback) {
                        //         successCallback(null, 'two');
                        //     }
                        // ],
                        // // optional callback
                        // function(err, results) {
                        //     sendNotificationToFriend(dInsert.insertId);
                        // });
                        return res.send(echoResponse(200, {
                                            id: dInsert.insertId,
                                            caption: req.body.caption,
                                            location: req.body.location,
                                            posted_time: req.body.posted_time,
                                            edited_time: req.body.edited_time,
                                            permission: req.body.permission,
                                            type: req.body.type,
                                            users_key: req.body.users_key
                            }, 'success', false));
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});

function sendNotificationToFriend(posts_id){
    var sqlPost = "SELECT * FROM `posts` WHERE `id`='"+posts_id+"'";
    // Lấy dữ liệu bài viết
    client.query(sqlPost, function(errorPost, dataPost, FP){
        if (errorPost) {
            console.log(errorPost);
        } else {
            if (dataPost.length > 0) {
                // Lấy thông tin thằng viết bài
                var sqlUserPost = "SELECT `nickname`,`avatar`,`key` FROM `users` WHERE `key` IN (SELECT `users_key` FROM `posts` WHERE `id`='"+posts_id+"')";
                client.query(sqlUserPost, function(errorUser, postUser, FU){
                    if (errorUser) {
                        console.log(errorUser);
                    } else {
                        if (postUser.length > 0) {
                            var currentTime = new Date().getTime();
                            // Lấy danh sách bạn bè trừ người được tag
                            var sqlFriend = "SELECT `key` FROM `users` WHERE `key` IN (SELECT `friend_key` FROM `contacts` WHERE `users_key`='"+ dataPost[0].users_key +"')";
                            var sqlNotTag = "AND `key` NOT IN (SELECT `users_key` FROM `tags` WHERE `posts_id`='"+posts_id+"')";
                            var dk = "AND `key` != '"+dataPost[0].users_key+"'";
                            client.query(sqlFriend+sqlNotTag+dk, function(errorFriend, dataFriend, FF){
                                if (errorFriend) {
                                    console.log(errorFriend);
                                } else {
                                    if (dataFriend.length > 0) {
                                        if (dataPost[0].permission == 0 || dataPost[0].permission == 1) {
                                            async.forEachOf(dataFriend, function(element, i, callback){
                                                // Check xem bài viết dạng gì để gửi notification
                                                if (dataPost[0].type == 'albums') {
                                                    client.query("SELECT `img_url` FROM `store_images` WHERE `posts_id`='"+posts_id+"'", function(errorImg, dataImg, FIMG){
                                                        if (errorImg) {
                                                            console.log(errorImg);
                                                        } else {
                                                            insertNotificationNoImage(postUser[0].key, postUser[0].nickname, postUser[0].avatar, dataImg.length + ' photos', currentTime, dataFriend[i].key, posts_id);
                                                            sendNotification(postUser[0].key, dataFriend[i].key, "posted "+dataImg.length+" photos to their album", "albums", posts_id);
                                                        }
                                                    });
                                                } else if (dataPost[0].type == 'photo') {
                                                    client.query("SELECT `img_url` FROM `store_images` WHERE `posts_id`='"+posts_id+"'", function(errorImg, dataImg, FIMG){
                                                        if (errorImg) {
                                                            console.log(errorImg);
                                                        } else {
                                                            insertNotificationFeed(postUser[0].key, postUser[0].nickname, postUser[0].avatar, dataImg[0].img_url, 'photo', currentTime, dataFriend[i].key, posts_id);
                                                            sendNotification(postUser[0].key, dataFriend[i].key, "posted photo to their album", "photo", posts_id);
                                                        }
                                                    });
                                                } else if (dataPost[0].type == 'url') {
                                                    insertNotificationNoImage(postUser[0].key, postUser[0].nickname, postUser[0].avatar, 'status', currentTime, dataFriend[i].key, posts_id);
                                                    sendNotification(postUser[0].key, dataFriend[i].key, "has shared a link", "url", posts_id);
                                                } else {
                                                    insertNotificationNoImage(postUser[0].key, postUser[0].nickname, postUser[0].avatar, 'status', currentTime, dataFriend[i].key, posts_id);
                                                    sendNotification(postUser[0].key, dataFriend[i].key, "updated their status", "status", posts_id);
                                                }
                                            });
                                        }
                                    } else {
                                        console.log("Người dùng " + dataPost[0].users_key + " không có bạn bè khác để gửi thông báo");
                                    }
                                }
                            });
                            //--- kết thúc lấy bạn bè không được tag
                            //--- Gửi notification cho thằng được tag
                            client.query("SELECT `users_key` FROM `tags` WHERE `posts_id`='"+posts_id+"' AND `users_key`!='"+postUser[0].key+"'", function(errorTag, dataTag, FDT){
                                if (errorTag) {
                                    console.log(errorTag);
                                } else {
                                    async.forEachOf(dataTag, function(ele, j, call){
                                        insertNotificationNoImage(postUser[0].key, postUser[0].nickname, postUser[0].avatar, 'tag', currentTime, dataTag[j].users_key, posts_id);
                                        sendNotification(postUser[0].key, dataTag[j].users_key, "tagged you in a post", "tag", posts_id);
                                    });
                                }
                            })
                            //---- kết thúc tag
                        }
                    }
                });
                //--- Kết thúc lấy thằng viết bài
            }
        }
    });
    //-- kết thúc dữ liệu bài viết
}
function sendNotificationToTagged(posts_id){
    var sqlPost = "SELECT * FROM `posts` WHERE `id`='"+posts_id+"'";
    // Lấy dữ liệu bài viết
    client.query(sqlPost, function(errorPost, dataPost, FP){
        if (errorPost) {
            console.log(errorPost);
        } else {
            if (dataPost.length > 0) {
                // Lấy thông tin thằng viết bài
                var sqlUserPost = "SELECT `nickname`,`avatar`,`key` FROM `users` WHERE `key` IN (SELECT `users_key` FROM `posts` WHERE `id`='"+posts_id+"')";
                client.query(sqlUserPost, function(errorUser, postUser, FU){
                    if (errorUser) {
                        console.log(errorUser);
                    } else {
                        if (postUser.length > 0) {
                            var currentTime = new Date().getTime();
                            //--- Gửi notification cho thằng được tag
                            client.query("SELECT `users_key` FROM `tags` WHERE `posts_id`='"+posts_id+"'", function(errorTag, dataTag, FDT){
                                if (errorTag) {
                                    console.log(errorTag);
                                } else {
                                    async.forEachOf(dataTag, function(ele, j, call){
                                        insertNotificationNoImage(postUser[0].key, postUser[0].nickname, postUser[0].avatar, 'tag', currentTime, dataTag[j].users_key, posts_id);
                                        sendNotification(postUser[0].key, dataTag[j].users_key, "tagged you in a post", "tag", posts_id);
                                    });
                                }
                            })
                            //---- kết thúc tag
                        }
                    }
                });
                //--- Kết thúc lấy thằng viết bài
            }
        }
    });
    //-- kết thúc dữ liệu bài viết
}
router.post('/update', urlParser, function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var insert = [];
                for (var k in req.body) {
                    if (k != 'users_key' && k != 'id' && k != 'access_token' && k != 'video' && k != 'albums' && k != 'photo' && k != 'users' && k != 'tags' && k != 'caption' && k != 'posted_time' && k != 'edited_time') {
                        insert.push("`" + k + "`='"+req.body[k]+"'");
                    }
                }
                var currentTime = new Date().getTime();
                var insertSQL = "UPDATE `posts` SET "+insert.toString()+", `edited_time`='"+currentTime+"', `caption`="+escapeSQL.escape(req.body.caption)+" WHERE `id`='"+req.body.id+"'";
                    
                console.log(insertSQL);
                client.query(insertSQL, function (eInsert, dInsert, fInsert) {
                    if (eInsert) {
                        console.log(eInsert);
                        return res.sendStatus(300);
                    } else {
                        console.log("Vừa chỉnh sửa bài viết thành công với id " + req.body.id);

                        var deleteTags = "DELETE FROM `tags` WHERE `posts_id`='" + req.body.id + "'";
                        client.query(deleteTags);
                        var deletePermissions = "DELETE FROM `permissions` WHERE `posts_id`='" + req.body.id + "'";
                        client.query(deletePermissions);
                        var deleteImages = "DELETE FROM `store_images` WHERE `posts_id`='" + req.body.id + "'";
                        client.query(deleteImages);
                        var deleteVideos = "DELETE FROM `store_videos` WHERE `posts_id`='" + req.body.id + "'";
                        client.query(deleteVideos);

                        var permis = "INSERT INTO `permissions`(`posts_id`,`users_key`) VALUES('" + req.body.id + "','" + req.body.users_key + "')";
                        client.query(permis);

                        insertRelate(req.body.users_key, req.body.id, function(successCall){
                            if (successCall) {
                                if (req.body.permission && req.body.permission == 2 && req.body.users) {
                                    var json;
                                    if (isJsonString(req.body.users)) {
                                        json = JSON.parse(req.body.users);
                                        for (var n = 0; n < json.length; n++) {
                                            var insertMember = "INSERT INTO `permissions`(`posts_id`,`users_key`)";
                                            var dataMember = "VALUES ('" + dInsert.insertId + "','" + json[n].users_key + "')";
                                            client.query(insertMember + dataMember, function (eMember, rMember, fMember) {
                                                if (eMember) {
                                                    console.log(eMember);
                                                    return res.sendStatus(300);
                                                } else {
                                                    console.log("INSERT USERS SUCCESS");
                                                }
                                            });
                                        }
                                    }
                                }
                                if (req.body.tags) {
                                    var sqlCurrent = "SELECT `nickname`,`avatar` FROM `users` WHERE `key`='" + req.body.users_key + "'";
                                    client.query(sqlCurrent, function (cError, cData, cField) {
                                        if (cError) {
                                            console.log(cError);
                                            return res.sendStatus(300);
                                        } else {
                                            var json;
                                            if (isJsonString(req.body.tags)) {
                                                json = JSON.parse(req.body.tags);
                                                async.forEachOf(json, function (dataJ, j, callBackJ) {
                                                    var permissionSQL = "INSERT INTO `permissions`(`posts_id`,`users_key`) VALUES('" + req.body.id + "','" + json[j].users_key + "')";
                                                    console.log("INSERT PERMISSION SUCCESS");
                                                    client.query(permissionSQL);
                                                    var insertMember = "INSERT INTO `tags`(`posts_id`,`users_key`)";
                                                    var dataMember = "VALUES ('" + req.body.id + "','" + json[j].users_key + "')";
                                                    // relate notification tag
                                                    insertRelate(json[j].users_key, req.body.id, function(successInsert){
                                                        if (successInsert) {
                                                            // end
                                                            client.query(insertMember + dataMember, function (eMember, rMember, fMember) {
                                                                if (eMember) {
                                                                    console.log(eMember);
                                                                    return res.sendStatus(300);
                                                                } else {
                                                                    console.log("INSERT TAGS USERS SUCCESS");
                                                                }
                                                            });
                                                        }
                                                    });
                                                    if (j === json.length-1) {
                                                        sendNotificationToTagged(req.body.id);
                                                    }
                                                });
                                            }
                                        }
                                    });
                                }
                                if (req.body.type && req.body.type == 'albums' || req.body.type == 'photo') {
                                    var json;
                                    if (isJsonString(req.body.albums)) {
                                        json = JSON.parse(req.body.albums);
                                        for (var n = 0; n < json.length; n++) {
                                            if (json[n].img_url) {
                                                var insertMember = "INSERT INTO `store_images`(`img_url`,`img_width`,`img_height`,`users_key`,`posts_id`)";
                                                var dataMember = "VALUES ('" + json[n].img_url + "','" + json[n].img_width + "','" + json[n].img_height + "','" + req.body.users_key + "','" + req.body.id + "')";
                                                client.query(insertMember + dataMember, function (eMember, rMember, fMember) {
                                                    if (eMember) {
                                                        console.log(eMember);
                                                        return res.sendStatus(300);
                                                    } else {
                                                        console.log("INSERT ALBUMS SUCCESS");
                                                    }
                                                });
                                            }
                                        }
                                    } else {
                                        console.log("ERROR JSON");
                                    }
                                } else if (req.body.type == 'video') {
                                    var json;
                                    if (isJsonString(req.body.video)) {
                                        json = JSON.parse(req.body.video);
                                        for (var n = 0; n < json.length; n++) {
                                            var insertMember = "INSERT INTO `store_videos`(`video_url`,`users_key`,`posts_id`)";
                                            var dataMember = "VALUES ('" + json[n].video_url + "','" + req.body.users_key + "','" + req.body.id + "')";
                                            client.query(insertMember + dataMember, function (eMember, rMember, fMember) {
                                                if (eMember) {
                                                    console.log(eMember);
                                                    return res.sendStatus(300);
                                                } else {
                                                    console.log("INSERT VIDEO SUCCESS");
                                                }
                                            });
                                        }
                                    }
                                }
                                getBaseInformationPost(req.body.users_key, res, req.body.id);
                            }
                        });
                        
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});

function getBaseInformationPost(key, res, posts_id) {
    var postSQL = "SELECT * FROM `posts` WHERE `id`='" + posts_id + "'";
    client.query(postSQL, function (errorPost, post, fiPost) {
        if (errorPost) {
            console.log(errorPost);
        } else {
            if (post.length > 0) {
                var selectCurrent = "SELECT `nickname`,`avatar` FROM `users` WHERE `key`='" + post[0].users_key + "'";
                client.query(selectCurrent, function (eCurrent, dataCurrent, fieldCurrent) {
                    if (eCurrent) {
                        console.log(eCurrent);
                        return res.sendStatus(300);
                    } else {
                        if (dataCurrent.length > 0) {
                            post[0].avatar = dataCurrent[0].avatar;
                            post[0].nickname = dataCurrent[0].nickname;
                            // TAGED USERS
                            var selectTags = "SELECT `key`,`nickname`,`avatar` FROM `users` WHERE `key` IN (SELECT `users_key` FROM `tags` WHERE `posts_id`='" + post[0].id + "')";
                            client.query(selectTags, function (eTag, tags, fTag) {
                                if (eTag) {
                                    console.log(eTag);
                                    return res.sendStatus(300);
                                } else {
                                    post[0].tags = tags;
                                    // IMAGES ALBUMS
                                    var selectAlbums = "SELECT `id`,`img_url`,`img_height`,`img_width` FROM `store_images` WHERE `posts_id`='" + post[0].id + "'";
                                    client.query(selectAlbums, function (eAlbums, albums, fAlbums) {
                                        if (eAlbums) {
                                            console.log(eAlbums);
                                        } else {
                                            post[0].albums = albums;
                                            // VIDEO ALBUMS
                                            var selectVideo = "SELECT `video_url` FROM `store_videos` WHERE `posts_id`='" + post[0].id + "'";
                                            client.query(selectVideo, function (eVideo, video, fVideo) {
                                                if (eVideo) {
                                                    console.log(eVideo);
                                                } else {
                                                    post[0].video = video;
                                                    // LIKE LIST
                                                    var selectLike = "SELECT `users_key` FROM `likes` WHERE `posts_id`='" + post[0].id + "'";
                                                    client.query(selectLike, function (eLike, like, fLike) {
                                                        if (eLike) {
                                                            console.log(eLike);
                                                        } else {
                                                            post[0].count_like = like.length;
                                                            checkLiked(key, post[0].id, function(liked){
                                                                post[0].is_liked = liked;
                                                                // Comment LIST
                                                                var selectComment = "SELECT * FROM `comments` WHERE `posts_id`='" + post[0].id + "'";
                                                                client.query(selectComment, function (eComment, comment, fComment) {
                                                                    if (eComment) {
                                                                        console.log(eComment);
                                                                        return res.sendStatus(300);
                                                                    } else {
                                                                        post[0].count_comment = comment.length;
                                                                        return res.send(echoResponse(200, post[0], 'success', false));
                                                                    }
                                                                });
                                                            });
                                                        }
                                                    });
                                                }
                                            });
                                        }
                                    });
                                }
                            });
                        }
                    }
                });
            } else {
                return res.send(echoResponse(404, "This post not exists", 'success', false));
            }
        }
    });
}
function checkLiked(users_key, posts_id, liked){
    var sql = "SELECT * FROM `likes` WHERE `posts_id`='"+posts_id+"' AND `users_key`='"+users_key+"'";
    client.query(sql, function(error, data, fields){
        if (error) {
            console.log(error);
            liked(0);
        } else {
            if (data.length > 0) {
                liked(1);
            } else {
                liked(0);
            }
        }
    });
}
router.post('/delete_image', urlParser, function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var selectLike = "SELECT * FROM `posts` WHERE `users_key`='" + req.body.key + "' AND `id`='" + req.body.posts_id + "'";
                client.query(selectLike, function (eLike, dLike, fLike) {
                    if (eLike) {
                        console.log(eLike);
                        return res.sendStatus(300);
                    } else {
                        if (dLike.length > 0) {
                            var deleteSQL = "DELETE FROM `store_images` WHERE `id`='" + req.body.id + "' AND `posts_id`='" + req.body.posts_id + "'";
                            client.query(deleteSQL, function (eInsert, dInsert, fInsert) {
                                if (eInsert) {
                                    console.log(eInsert);
                                    return res.sendStatus(300);
                                } else {
                                    return res.send(echoResponse(200, 'Deleted image successfully.', 'success', false));
                                }
                            });
                        } else {
                            return res.send(echoResponse(404, 'This post has been deleted in the past.', 'success', false));
                        }
                    }
                })

            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
router.post('/delete', urlParser, function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var selectLike = "SELECT * FROM `posts` WHERE `users_key`='" + req.body.users_key + "' AND `id`='" + req.body.id + "'";
                client.query(selectLike, function (eLike, dLike, fLike) {
                    if (eLike) {
                        console.log(eLike);
                        return res.sendStatus(300);
                    } else {
                        if (dLike.length > 0) {
                            var deleteSQL = "DELETE FROM `posts` WHERE `users_key`='" + req.body.users_key + "' AND `id`='" + req.body.id + "'";
                            client.query(deleteSQL, function (eInsert, dInsert, fInsert) {
                                if (eInsert) {
                                    console.log(eInsert);
                                    return res.sendStatus(300);
                                } else {
                                    console.log(req.body.users_key + " đã xóa bài viết " + req.body.id + "");
                                    client.query("DELETE FROM `notification_feed` WHERE `posts_id`='" + req.body.id + "'");
                                    client.query("DELETE FROM `notification_relate` WHERE `posts_id`='" + req.body.id + "'");
                                    return res.send(echoResponse(200, 'Deleted successfully.', 'success', false));
                                }
                            });
                        } else {
                            return res.send(echoResponse(404, 'This post has been deleted in the past.', 'success', false));
                        }
                    }
                })

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
                var selectLike = "SELECT * FROM `reports_posts` WHERE `users_key`='" + req.body.users_key + "' AND `posts_id`='" + req.body.posts_id + "'";
                client.query(selectLike, function (eLike, dLike, fLike) {
                    if (eLike) {
                        console.log(eLike);
                        return res.sendStatus(300);
                    } else {
                        if (dLike.length > 0) {
                            return res.send(echoResponse(200, 'You reported this post.', 'success', false));
                        } else {
                            delete req.body.access_token;
                            var sql = escapeSQL.format("INSERT INTO `reports_posts` SET ?", req.body);
                            client.query(sql, function(e, d, f){
                                if (e) {
                                    console.log(e);
                                    return res.sendStatus(300);
                                } else {
                                    // Lấy thông tin bài viết
                                    getInformationPost(req.body.posts_id, function(resultPost){
                                        // Gửi mail tới thằng report
                                        getInformationUser(req.body.users_key, function(result){
                                            // var tinnhan;
                                            // if (resultPost.type == 'photo' || resultPost.type == 'albums') {
                                            //     tinnhan = {
                                            //         to: '<'+result.email+'>',
                                            //         subject: 'Thank you for reported',
                                            //         html: '<!DOCTYPE HTML PUBLIC "-//W3C//DTD XHTML 1.0 Transitional //EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"><html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><meta name="viewport" content="width=device-width"><!--[if !mso]><!--><meta http-equiv="X-UA-Compatible" content="IE=edge"><!--<![endif]--><title></title><!--[if !mso]><!-- --><link href="https://fonts.googleapis.com/css?family=Montserrat" rel="stylesheet" type="text/css"><!--<![endif]--><style type="text/css" id="media-query">body {margin: 0;padding: 0; }table, tr, td {vertical-align: top;border-collapse: collapse; }.ie-browser table, .mso-container table {table-layout: fixed; }* {line-height: inherit; }a[x-apple-data-detectors=true] {color: inherit !important;text-decoration: none !important; }[owa] .img-container div, [owa] .img-container button {display: block !important; }[owa] .fullwidth button {width: 100% !important; }[owa] .block-grid .col {display: table-cell;float: none !important;vertical-align: top; }.ie-browser .num12, .ie-browser .block-grid, [owa] .num12, [owa] .block-grid {width: 575px !important; }.ExternalClass, .ExternalClass p, .ExternalClass span, .ExternalClass font, .ExternalClass td, .ExternalClass div {line-height: 100%; }.ie-browser .mixed-two-up .num4, [owa] .mixed-two-up .num4 {width: 188px !important; }.ie-browser .mixed-two-up .num8, [owa] .mixed-two-up .num8 {width: 376px !important; }.ie-browser .block-grid.two-up .col, [owa] .block-grid.two-up .col {width: 287px !important; }.ie-browser .block-grid.three-up .col, [owa] .block-grid.three-up .col {width: 191px !important; }.ie-browser .block-grid.four-up .col, [owa] .block-grid.four-up .col {width: 143px !important; }.ie-browser .block-grid.five-up .col, [owa] .block-grid.five-up .col {width: 115px !important; }.ie-browser .block-grid.six-up .col, [owa] .block-grid.six-up .col {width: 95px !important; }.ie-browser .block-grid.seven-up .col, [owa] .block-grid.seven-up .col {width: 82px !important; }.ie-browser .block-grid.eight-up .col, [owa] .block-grid.eight-up .col {width: 71px !important; }.ie-browser .block-grid.nine-up .col, [owa] .block-grid.nine-up .col {width: 63px !important; }.ie-browser .block-grid.ten-up .col, [owa] .block-grid.ten-up .col {width: 57px !important; }.ie-browser .block-grid.eleven-up .col, [owa] .block-grid.eleven-up .col {width: 52px !important; }.ie-browser .block-grid.twelve-up .col, [owa] .block-grid.twelve-up .col {width: 47px !important; }@media only screen and (min-width: 595px) {.block-grid {width: 575px !important; }.block-grid .col {display: table-cell;Float: none !important;vertical-align: top; }.block-grid .col.num12 {width: 575px !important; }.block-grid.mixed-two-up .col.num4 {width: 188px !important; }.block-grid.mixed-two-up .col.num8 {width: 376px !important; }.block-grid.two-up .col {width: 287px !important; }.block-grid.three-up .col {width: 191px !important; }.block-grid.four-up .col {width: 143px !important; }.block-grid.five-up .col {width: 115px !important; }.block-grid.six-up .col {width: 95px !important; }.block-grid.seven-up .col {width: 82px !important; }.block-grid.eight-up .col {width: 71px !important; }.block-grid.nine-up .col {width: 63px !important; }.block-grid.ten-up .col {width: 57px !important; }.block-grid.eleven-up .col {width: 52px !important; }.block-grid.twelve-up .col {width: 47px !important; } }@media (max-width: 595px) {.block-grid, .col {min-width: 320px !important;max-width: 100% !important; }.block-grid {width: calc(100% - 40px) !important; }.col {width: 100% !important; }.col > div {margin: 0 auto; }img.fullwidth {max-width: 100% !important; } }</style>      </head><body class="clean-body" style="margin: 0;padding: 0;-webkit-text-size-adjust: 100%;background-color: transparent"><!--[if IE]><div class="ie-browser"><![endif]--><!--[if mso]><div class="mso-container"><![endif]--><div class="nl-container" style="min-width: 320px;Margin: 0 auto;background-color: transparent"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="background-color: transparent;"><![endif]--><div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: transparent;" class="block-grid "><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:transparent;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="575" style=" width:575px; padding-right: 0px; padding-left: 0px; padding-top:5px; padding-bottom:5px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num12" style="min-width: 320px;max-width: 575px;width: 575px;width: calc(25500% - 146050px);background-color: transparent;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:5px; padding-bottom:5px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"><![endif]--><div style="color:#555555;line-height:120%;font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif; padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;">    <div style="font-size:12px;line-height:14px;color:#555555;font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;text-align:left;"><br></div>  </div><!--[if mso]></td></tr></table><![endif]--><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>    <div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: #FFFFFF;" class="block-grid "><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:#FFFFFF;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="575" style=" width:575px; padding-right: 0px; padding-left: 0px; padding-top:5px; padding-bottom:0px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num12" style="min-width: 320px;max-width: 575px;width: 575px;width: calc(25500% - 146050px);background-color: #FFFFFF;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:5px; padding-bottom:0px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><div align="center" class="img-container center fullwidth" style="padding-right: 0px;  padding-left: 0px;"><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 0px; padding-left: 0px;" align="center"><![endif]--><img class="center fullwidth" align="center" border="0" src="http://smartconnectsoftware.com/mail_iudi/logo.png" alt="Image" title="Image" style="outline: none;text-decoration: none;-ms-interpolation-mode: bicubic;clear: both;display: block !important;border: 0;height: auto;float: none;width: 100%;max-width: 575px" width="575"><!--[if mso]></td></tr></table><![endif]--></div><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>    <div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: #FFFFFF;" class="block-grid "><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:#FFFFFF;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="575" style=" width:575px; padding-right: 0px; padding-left: 0px; padding-top:0px; padding-bottom:5px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num12" style="min-width: 320px;max-width: 575px;width: 575px;width: calc(25500% - 146050px);background-color: #FFFFFF;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:0px; padding-bottom:5px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"><![endif]--><div style="font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;line-height:120%;color:#0D0D0D; padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"> <div style="font-size:12px;line-height:14px;color:#0D0D0D;font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;text-align:left;"><p style="margin: 0;font-size: 14px;line-height: 17px;text-align: center"><span style="font-size: 28px; line-height: 33px;"><strong><span style="line-height: 33px; font-size: 28px;">Hello '
                                            //         +result.nickname+',</span></strong></span></p></div>  </div><!--[if mso]></td></tr></table><![endif]--><div align="center" class="img-container center" style="padding-right: 0px;  padding-left: 0px;"><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 0px; padding-left: 0px;" align="center"><![endif]--><div style="line-height:10px;font-size:1px">&#160;</div>  <img class="center" align="center" border="0" src="http://smartconnectsoftware.com/mail_iudi//divider.png" alt="Image" title="Image" style="outline: none;text-decoration: none;-ms-interpolation-mode: bicubic;clear: both;display: block !important;border: 0;height: auto;float: none;width: 100%;max-width: 316px" width="316"><div style="line-height:10px;font-size:1px">&#160;</div><!--[if mso]></td></tr></table><![endif]--></div><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"><![endif]--><div style="font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;line-height:150%;color:#555555; padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"> <div style="font-size:12px;line-height:18px;color:#555555;font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;text-align:left;"><p style="margin: 0;font-size: 14px;line-height: 21px;text-align: center">'
                                            //         +'We will look your report and processing it soon. Thank you for reported!'+'<br>Your message:</p><p style="margin: 0;font-size: 14px;line-height: 21px;text-align: center"><span style="color: rgb(168, 191, 111); font-size: 14px; line-height: 21px;"><strong><em>"'
                                            //         +req.body.message+'"</em></strong></span></p></div> </div><!--[if mso]></td></tr></table><![endif]--><div align="center" class="img-container center" style="padding-right: 0px;  padding-left: 0px;"><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 0px; padding-left: 0px;" align="center"><![endif]--><div style="line-height:10px;font-size:1px">&#160;</div>  <img class="center" align="center" border="0" src="http://smartconnectsoftware.com/mail_iudi//divider.png" alt="Image" title="Image" style="outline: none;text-decoration: none;-ms-interpolation-mode: bicubic;clear: both;display: block !important;border: 0;height: auto;float: none;width: 100%;max-width: 316px" width="316"><div style="line-height:10px;font-size:1px">&#160;</div><!--[if mso]></td></tr></table><![endif]--></div><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; padding-left: 10px; padding-top: 5px; padding-bottom: 5px;"><![endif]--><div style="font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;line-height:150%;color:#0D0D0D; padding-right: 10px; padding-left: 10px; padding-top: 5px; padding-bottom: 5px;"> <div style="font-size:12px;line-height:18px;color:#0D0D0D;font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;text-align:left;"><p style="margin: 0;font-size: 14px;line-height: 21px;text-align: center">Content:</p></div>    </div><!--[if mso]></td></tr></table><![endif]--><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>    <div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: #ACBE7E;" class="block-grid mixed-two-up"><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:#ACBE7E;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="192" style=" width:192px; padding-right: 10px; padding-left: 10px; padding-top:15px; padding-bottom:15px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num4" style="Float: left;max-width: 320px;min-width: 188px;width: 192px;width: calc(76088px - 13200%);background-color: #ACBE7E;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:15px; padding-bottom:15px; padding-right: 10px; padding-left: 10px;"><!--<![endif]--><div align="center" class="img-container center fullwidth" style="padding-right: 0px;  padding-left: 0px;"><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 0px; padding-left: 0px;" align="center"><![endif]--><img class="center fullwidth" align="center" border="0" src="'
                                            //         +resultPost.img_url+'" alt="Image" title="Image" style="outline: none;text-decoration: none;-ms-interpolation-mode: bicubic;clear: both;display: block !important;border: 0;height: auto;float: none;width: 100%;max-width: 171.666666666667px" width="171.666666666667"><!--[if mso]></td></tr></table><![endif]--></div><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td><td align="center" width="383" style=" width:383px; padding-right: 0px; padding-left: 0px; padding-top:15px; padding-bottom:15px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num8" style="Float: left;min-width: 320px;max-width: 376px;width: 383px;width: calc(6600% - 38894px);background-color: #ACBE7E;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:15px; padding-bottom:15px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"><![endif]--><div style="color:#555555;line-height:120%;font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif; padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;">   <div style="font-size:12px;line-height:14px;color:#555555;font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;text-align:left;"><p style="margin: 0;font-size: 12px;line-height: 14px"><span style="color: rgb(255, 255, 255); font-size: 12px; line-height: 14px;"><em style="padding: 0 10px 0 10px;">"'
                                            //         +resultPost.caption+'"</em></span></p></div> </div><!--[if mso]></td></tr></table><![endif]--><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>    <div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: #525252;" class="block-grid "><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:#525252;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="575" style=" width:575px; padding-right: 0px; padding-left: 0px; padding-top:15px; padding-bottom:5px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num12" style="min-width: 320px;max-width: 575px;width: 575px;width: calc(25500% - 146050px);background-color: #525252;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:15px; padding-bottom:5px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 5px; padding-left: 5px; padding-top: 25px; padding-bottom: 5px;"><![endif]--><div style="color:#FFFFFF;line-height:120%;font-family:"Helvetica Neue", Helvetica, Arial, sans-serif; padding-right: 5px; padding-left: 5px; padding-top: 25px; padding-bottom: 5px;">    <div style="font-size:12px;line-height:14px;font-family:inherit;color:#FFFFFF;text-align:left;"><p style="margin: 0;font-size: 12px;line-height: 14px;text-align: center"><span style="color: rgb(153, 204, 0); font-size: 14px; line-height: 16px;"><span style="color: rgb(168, 191, 111); font-size: 14px; line-height: 16px;">Tel :</span><span style="color: rgb(255, 255, 255); font-size: 14px; line-height: 16px;"> +84 9 86 86 86 72</span></span></p></div>   </div><!--[if mso]></td></tr></table><![endif]--><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 5px; padding-left: 5px; padding-top: 5px; padding-bottom: 5px;"><![endif]--><div style="color:#FFFFFF;line-height:120%;font-family:"Helvetica Neue", Helvetica, Arial, sans-serif; padding-right: 5px; padding-left: 5px; padding-top: 5px; padding-bottom: 5px;">   <div style="font-size:12px;line-height:14px;color:#FFFFFF;font-family:"Helvetica Neue", Helvetica, Arial, sans-serif;text-align:left;"><p style="margin: 0;font-size: 12px;line-height: 14px;text-align: center"><span style="font-size: 14px; line-height: 16px;"><span style="color: rgb(168, 191, 111); font-size: 14px; line-height: 16px;">Smart Connect Software</span> @&#160;2017</span></p></div>  </div><!--[if mso]></td></tr></table><![endif]--><div align="center" style="padding-right: 0px; padding-left: 0px; padding-bottom: 0px;"><div style="display: table; max-width:57;"><!--[if (mso)|(IE)]><table width="57" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-collapse:collapse; padding-right: 0px; padding-left: 0px; padding-bottom: 0px;"  align="center"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; mso-table-lspace: 0pt;mso-table-rspace: 0pt; width:57px;"><tr><td width="32" style="width:32px; padding-right: 5px;" valign="top"><![endif]--><table align="left" border="0" cellspacing="0" cellpadding="0" width="32" height="32" style="border-collapse: collapse;table-layout: fixed;border-spacing: 0;mso-table-lspace: 0pt;mso-table-rspace: 0pt;vertical-align: top;Margin-right: 0"><tbody><tr style="vertical-align: top"><td align="left" valign="middle" style="word-break: break-word;border-collapse: collapse !important;vertical-align: top"><a href="https://www.facebook.com/Smartsfw/" title="Facebook" target="_blank"><img src="http://smartconnectsoftware.com/mail_iudi//facebook@2x.png" alt="Facebook" title="Facebook" width="32" style="outline: none;text-decoration: none;-ms-interpolation-mode: bicubic;clear: both;display: block !important;border: none;height: auto;float: none;max-width: 32px !important"></a><div style="line-height:5px;font-size:1px">&#160;</div></td></tr></tbody></table><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>    <div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: transparent;" class="block-grid "><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:transparent;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="575" style=" width:575px; padding-right: 0px; padding-left: 0px; padding-top:0px; padding-bottom:5px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num12" style="min-width: 320px;max-width: 575px;width: 575px;width: calc(25500% - 146050px);background-color: transparent;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:0px; padding-bottom:5px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><div align="center" class="img-container center fullwidth" style="padding-right: 0px;  padding-left: 0px;"><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 0px; padding-left: 0px;" align="center"><![endif]--><img class="center fullwidth" align="center" border="0" src="http://smartconnectsoftware.com/mail_iudi//rounder-dwn.png" alt="Image" title="Image" style="outline: none;text-decoration: none;-ms-interpolation-mode: bicubic;clear: both;display: block !important;border: 0;height: auto;float: none;width: 100%;max-width: 575px" width="575"><!--[if mso]></td></tr></table><![endif]--></div><div style="padding-right: 15px; padding-left: 15px; padding-top: 15px; padding-bottom: 15px;"><!--[if (mso)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 15px;padding-left: 15px; padding-top: 15px; padding-bottom: 15px;"><table width="100%" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]--><div align="center"><div style="border-top: 0px solid transparent; width:100%; line-height:0px; height:0px; font-size:0px;">&#160;</div></div><!--[if (mso)]></td></tr></table></td></tr></table><![endif]--></div><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>   <!--[if (mso)|(IE)]></td></tr></table><![endif]--></div><!--[if (mso)|(IE)]></div><![endif]--></body></html>'
                                            //     };
                                            // } else {
                                            //     tinnhan = {
                                            //         to: '<'+result.email+'>',
                                            //         subject: 'Thank you for reported',
                                            //         html: '<!DOCTYPE HTML PUBLIC "-//W3C//DTD XHTML 1.0 Transitional //EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"><html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><meta name="viewport" content="width=device-width"><!--[if !mso]><!--><meta http-equiv="X-UA-Compatible" content="IE=edge"><!--<![endif]--><title></title><!--[if !mso]><!-- --><link href="https://fonts.googleapis.com/css?family=Montserrat" rel="stylesheet" type="text/css"><!--<![endif]--><style type="text/css" id="media-query">body {margin: 0;padding: 0; }table, tr, td {vertical-align: top;border-collapse: collapse; }.ie-browser table, .mso-container table {table-layout: fixed; }* {line-height: inherit; }a[x-apple-data-detectors=true] {color: inherit !important;text-decoration: none !important; }[owa] .img-container div, [owa] .img-container button {display: block !important; }[owa] .fullwidth button {width: 100% !important; }[owa] .block-grid .col {display: table-cell;float: none !important;vertical-align: top; }.ie-browser .num12, .ie-browser .block-grid, [owa] .num12, [owa] .block-grid {width: 575px !important; }.ExternalClass, .ExternalClass p, .ExternalClass span, .ExternalClass font, .ExternalClass td, .ExternalClass div {line-height: 100%; }.ie-browser .mixed-two-up .num4, [owa] .mixed-two-up .num4 {width: 188px !important; }.ie-browser .mixed-two-up .num8, [owa] .mixed-two-up .num8 {width: 376px !important; }.ie-browser .block-grid.two-up .col, [owa] .block-grid.two-up .col {width: 287px !important; }.ie-browser .block-grid.three-up .col, [owa] .block-grid.three-up .col {width: 191px !important; }.ie-browser .block-grid.four-up .col, [owa] .block-grid.four-up .col {width: 143px !important; }.ie-browser .block-grid.five-up .col, [owa] .block-grid.five-up .col {width: 115px !important; }.ie-browser .block-grid.six-up .col, [owa] .block-grid.six-up .col {width: 95px !important; }.ie-browser .block-grid.seven-up .col, [owa] .block-grid.seven-up .col {width: 82px !important; }.ie-browser .block-grid.eight-up .col, [owa] .block-grid.eight-up .col {width: 71px !important; }.ie-browser .block-grid.nine-up .col, [owa] .block-grid.nine-up .col {width: 63px !important; }.ie-browser .block-grid.ten-up .col, [owa] .block-grid.ten-up .col {width: 57px !important; }.ie-browser .block-grid.eleven-up .col, [owa] .block-grid.eleven-up .col {width: 52px !important; }.ie-browser .block-grid.twelve-up .col, [owa] .block-grid.twelve-up .col {width: 47px !important; }@media only screen and (min-width: 595px) {.block-grid {width: 575px !important; }.block-grid .col {display: table-cell;Float: none !important;vertical-align: top; }.block-grid .col.num12 {width: 575px !important; }.block-grid.mixed-two-up .col.num4 {width: 188px !important; }.block-grid.mixed-two-up .col.num8 {width: 376px !important; }.block-grid.two-up .col {width: 287px !important; }.block-grid.three-up .col {width: 191px !important; }.block-grid.four-up .col {width: 143px !important; }.block-grid.five-up .col {width: 115px !important; }.block-grid.six-up .col {width: 95px !important; }.block-grid.seven-up .col {width: 82px !important; }.block-grid.eight-up .col {width: 71px !important; }.block-grid.nine-up .col {width: 63px !important; }.block-grid.ten-up .col {width: 57px !important; }.block-grid.eleven-up .col {width: 52px !important; }.block-grid.twelve-up .col {width: 47px !important; } }@media (max-width: 595px) {.block-grid, .col {min-width: 320px !important;max-width: 100% !important; }.block-grid {width: calc(100% - 40px) !important; }.col {width: 100% !important; }.col > div {margin: 0 auto; }img.fullwidth {max-width: 100% !important; } }</style>      </head><body class="clean-body" style="margin: 0;padding: 0;-webkit-text-size-adjust: 100%;background-color: transparent"><!--[if IE]><div class="ie-browser"><![endif]--><!--[if mso]><div class="mso-container"><![endif]--><div class="nl-container" style="min-width: 320px;Margin: 0 auto;background-color: transparent"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="background-color: transparent;"><![endif]--><div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: transparent;" class="block-grid "><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:transparent;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="575" style=" width:575px; padding-right: 0px; padding-left: 0px; padding-top:5px; padding-bottom:5px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num12" style="min-width: 320px;max-width: 575px;width: 575px;width: calc(25500% - 146050px);background-color: transparent;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:5px; padding-bottom:5px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"><![endif]--><div style="color:#555555;line-height:120%;font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif; padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;">    <div style="font-size:12px;line-height:14px;color:#555555;font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;text-align:left;"><br></div>  </div><!--[if mso]></td></tr></table><![endif]--><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>    <div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: #FFFFFF;" class="block-grid "><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:#FFFFFF;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="575" style=" width:575px; padding-right: 0px; padding-left: 0px; padding-top:5px; padding-bottom:0px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num12" style="min-width: 320px;max-width: 575px;width: 575px;width: calc(25500% - 146050px);background-color: #FFFFFF;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:5px; padding-bottom:0px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><div align="center" class="img-container center fullwidth" style="padding-right: 0px;  padding-left: 0px;"><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 0px; padding-left: 0px;" align="center"><![endif]--><img class="center fullwidth" align="center" border="0" src="http://smartconnectsoftware.com/mail_iudi/logo.png" alt="Image" title="Image" style="outline: none;text-decoration: none;-ms-interpolation-mode: bicubic;clear: both;display: block !important;border: 0;height: auto;float: none;width: 100%;max-width: 575px" width="575"><!--[if mso]></td></tr></table><![endif]--></div><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>    <div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: #FFFFFF;" class="block-grid "><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:#FFFFFF;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="575" style=" width:575px; padding-right: 0px; padding-left: 0px; padding-top:0px; padding-bottom:5px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num12" style="min-width: 320px;max-width: 575px;width: 575px;width: calc(25500% - 146050px);background-color: #FFFFFF;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:0px; padding-bottom:5px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"><![endif]--><div style="font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;line-height:120%;color:#0D0D0D; padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"> <div style="font-size:12px;line-height:14px;color:#0D0D0D;font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;text-align:left;"><p style="margin: 0;font-size: 14px;line-height: 17px;text-align: center"><span style="font-size: 28px; line-height: 33px;"><strong><span style="line-height: 33px; font-size: 28px;">Hello '
                                            //         +result.nickname+',</span></strong></span></p></div>  </div><!--[if mso]></td></tr></table><![endif]--><div align="center" class="img-container center" style="padding-right: 0px;  padding-left: 0px;"><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 0px; padding-left: 0px;" align="center"><![endif]--><div style="line-height:10px;font-size:1px">&#160;</div>  <img class="center" align="center" border="0" src="http://smartconnectsoftware.com/mail_iudi//divider.png" alt="Image" title="Image" style="outline: none;text-decoration: none;-ms-interpolation-mode: bicubic;clear: both;display: block !important;border: 0;height: auto;float: none;width: 100%;max-width: 316px" width="316"><div style="line-height:10px;font-size:1px">&#160;</div><!--[if mso]></td></tr></table><![endif]--></div><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"><![endif]--><div style="font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;line-height:150%;color:#555555; padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"> <div style="font-size:12px;line-height:18px;color:#555555;font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;text-align:left;"><p style="margin: 0;font-size: 14px;line-height: 21px;text-align: center">'
                                            //         +'We will look your report and processing it soon. Thank you for reported!'+'<br>Your message:</p><p style="margin: 0;font-size: 14px;line-height: 21px;text-align: center"><span style="color: rgb(168, 191, 111); font-size: 14px; line-height: 21px;"><strong><em>"'
                                            //         +req.body.message+'"</em></strong></span></p></div> </div><!--[if mso]></td></tr></table><![endif]--><div align="center" class="img-container center" style="padding-right: 0px;  padding-left: 0px;"><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 0px; padding-left: 0px;" align="center"><![endif]--><div style="line-height:10px;font-size:1px">&#160;</div>  <img class="center" align="center" border="0" src="http://smartconnectsoftware.com/mail_iudi//divider.png" alt="Image" title="Image" style="outline: none;text-decoration: none;-ms-interpolation-mode: bicubic;clear: both;display: block !important;border: 0;height: auto;float: none;width: 100%;max-width: 316px" width="316"><div style="line-height:10px;font-size:1px">&#160;</div><!--[if mso]></td></tr></table><![endif]--></div><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; padding-left: 10px; padding-top: 5px; padding-bottom: 5px;"><![endif]--><div style="font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;line-height:150%;color:#0D0D0D; padding-right: 10px; padding-left: 10px; padding-top: 5px; padding-bottom: 5px;"> <div style="font-size:12px;line-height:18px;color:#0D0D0D;font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;text-align:left;"><p style="margin: 0;font-size: 14px;line-height: 21px;text-align: center">Content:</p></div>    </div><!--[if mso]></td></tr></table><![endif]--><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>    <div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: #ACBE7E;" class="block-grid mixed-two-up"><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:#ACBE7E;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="192" style=" width:192px; padding-right: 10px; padding-left: 10px; padding-top:15px; padding-bottom:15px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><!--[if (mso)|(IE)]></td><td align="center" width="383" style=" width:383px; padding-right: 0px; padding-left: 0px; padding-top:15px; padding-bottom:15px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num8" style="Float: left;min-width: 320px;max-width: 376px;width: 383px;width: calc(6600% - 38894px);background-color: #ACBE7E;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:15px; padding-bottom:15px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"><![endif]--><div style="color:#555555;line-height:120%;font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif; padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"> <div style="font-size:12px;line-height:14px;color:#555555;font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;text-align:left;"><p style="margin: 0;font-size: 12px;line-height: 14px; padding: 0 10px 0 10px;"><span style="color: rgb(255, 255, 255); font-size: 12px; line-height: 14px;"><em>"'
                                            //         +resultPost.caption+'"</em></span></p></div>    </div><!--[if mso]></td></tr></table><![endif]--><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>    <div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: #525252;" class="block-grid "><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:#525252;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="575" style=" width:575px; padding-right: 0px; padding-left: 0px; padding-top:15px; padding-bottom:5px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num12" style="min-width: 320px;max-width: 575px;width: 575px;width: calc(25500% - 146050px);background-color: #525252;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:15px; padding-bottom:5px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 5px; padding-left: 5px; padding-top: 25px; padding-bottom: 5px;"><![endif]--><div style="color:#FFFFFF;line-height:120%;font-family:"Helvetica Neue", Helvetica, Arial, sans-serif; padding-right: 5px; padding-left: 5px; padding-top: 25px; padding-bottom: 5px;">    <div style="font-size:12px;line-height:14px;font-family:inherit;color:#FFFFFF;text-align:left;"><p style="margin: 0;font-size: 12px;line-height: 14px;text-align: center"><span style="color: rgb(153, 204, 0); font-size: 14px; line-height: 16px;"><span style="color: rgb(168, 191, 111); font-size: 14px; line-height: 16px;">Tel :</span><span style="color: rgb(255, 255, 255); font-size: 14px; line-height: 16px;"> +84 9 86 86 86 72</span></span></p></div>   </div><!--[if mso]></td></tr></table><![endif]--><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 5px; padding-left: 5px; padding-top: 5px; padding-bottom: 5px;"><![endif]--><div style="color:#FFFFFF;line-height:120%;font-family:"Helvetica Neue", Helvetica, Arial, sans-serif; padding-right: 5px; padding-left: 5px; padding-top: 5px; padding-bottom: 5px;">   <div style="font-size:12px;line-height:14px;color:#FFFFFF;font-family:"Helvetica Neue", Helvetica, Arial, sans-serif;text-align:left;"><p style="margin: 0;font-size: 12px;line-height: 14px;text-align: center"><span style="font-size: 14px; line-height: 16px;"><span style="color: rgb(168, 191, 111); font-size: 14px; line-height: 16px;">Smart Connect Software</span> @&#160;2017</span></p></div>  </div><!--[if mso]></td></tr></table><![endif]--><div align="center" style="padding-right: 0px; padding-left: 0px; padding-bottom: 0px;"><div style="display: table; max-width:57;"><!--[if (mso)|(IE)]><table width="57" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-collapse:collapse; padding-right: 0px; padding-left: 0px; padding-bottom: 0px;"  align="center"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; mso-table-lspace: 0pt;mso-table-rspace: 0pt; width:57px;"><tr><td width="32" style="width:32px; padding-right: 5px;" valign="top"><![endif]--><table align="left" border="0" cellspacing="0" cellpadding="0" width="32" height="32" style="border-collapse: collapse;table-layout: fixed;border-spacing: 0;mso-table-lspace: 0pt;mso-table-rspace: 0pt;vertical-align: top;Margin-right: 0"><tbody><tr style="vertical-align: top"><td align="left" valign="middle" style="word-break: break-word;border-collapse: collapse !important;vertical-align: top"><a href="https://www.facebook.com/Smartsfw/" title="Facebook" target="_blank"><img src="http://smartconnectsoftware.com/mail_iudi//facebook@2x.png" alt="Facebook" title="Facebook" width="32" style="outline: none;text-decoration: none;-ms-interpolation-mode: bicubic;clear: both;display: block !important;border: none;height: auto;float: none;max-width: 32px !important"></a><div style="line-height:5px;font-size:1px">&#160;</div></td></tr></tbody></table><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>    <div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: transparent;" class="block-grid "><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:transparent;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="575" style=" width:575px; padding-right: 0px; padding-left: 0px; padding-top:0px; padding-bottom:5px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num12" style="min-width: 320px;max-width: 575px;width: 575px;width: calc(25500% - 146050px);background-color: transparent;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:0px; padding-bottom:5px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><div align="center" class="img-container center fullwidth" style="padding-right: 0px;  padding-left: 0px;"><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 0px; padding-left: 0px;" align="center"><![endif]--><img class="center fullwidth" align="center" border="0" src="http://smartconnectsoftware.com/mail_iudi//rounder-dwn.png" alt="Image" title="Image" style="outline: none;text-decoration: none;-ms-interpolation-mode: bicubic;clear: both;display: block !important;border: 0;height: auto;float: none;width: 100%;max-width: 575px" width="575"><!--[if mso]></td></tr></table><![endif]--></div><div style="padding-right: 15px; padding-left: 15px; padding-top: 15px; padding-bottom: 15px;"><!--[if (mso)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 15px;padding-left: 15px; padding-top: 15px; padding-bottom: 15px;"><table width="100%" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]--><div align="center"><div style="border-top: 0px solid transparent; width:100%; line-height:0px; height:0px; font-size:0px;">&#160;</div></div><!--[if (mso)]></td></tr></table></td></tr></table><![endif]--></div><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>   <!--[if (mso)|(IE)]></td></tr></table><![endif]--></div><!--[if (mso)|(IE)]></div><![endif]--></body></html>'
                                            //     };
                                            // }
                                            // transporter.sendMail(tinnhan, (error, info) => {
                                            //     if (error) {
                                            //         console.log(error.message);
                                            //     } else {
                                            //         console.log('Server responded with "%s"', info.response);
                                            //         transporter.close();
                                            //     }
                                            // });
                                                // Gửi mail tới thằng bị report
                                                getInformationUser(resultPost.users_key, function(resultReport){
                                                    sendWarning(resultPost.users_key, req.body.posts_id);
                                                    notificationReport(resultPost.users_key,req.body.posts_id);
                                                    var tinnhanReport;
                                                    if (resultPost.type == 'photo' || resultPost.type == 'albums') {
                                                        tinnhanReport = {
                                                            to: '<'+resultReport.email+'>,<'+result.email+'>,<chithanh.ptit@gmail.com>',
                                                            subject: '[IUDIP00'+d.insertId+'] complaint has been created!',
                                                            html: '<!DOCTYPE HTML PUBLIC "-//W3C//DTD XHTML 1.0 Transitional //EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"><html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><meta name="viewport" content="width=device-width"><!--[if !mso]><!--><meta http-equiv="X-UA-Compatible" content="IE=edge"><!--<![endif]--><title></title><!--[if !mso]><!-- --><link href="https://fonts.googleapis.com/css?family=Montserrat" rel="stylesheet" type="text/css"><!--<![endif]--><style type="text/css" id="media-query">body {margin: 0;padding: 0; }table, tr, td {vertical-align: top;border-collapse: collapse; }.ie-browser table, .mso-container table {table-layout: fixed; }* {line-height: inherit; }a[x-apple-data-detectors=true] {color: inherit !important;text-decoration: none !important; }[owa] .img-container div, [owa] .img-container button {display: block !important; }[owa] .fullwidth button {width: 100% !important; }[owa] .block-grid .col {display: table-cell;float: none !important;vertical-align: top; }.ie-browser .num12, .ie-browser .block-grid, [owa] .num12, [owa] .block-grid {width: 575px !important; }.ExternalClass, .ExternalClass p, .ExternalClass span, .ExternalClass font, .ExternalClass td, .ExternalClass div {line-height: 100%; }.ie-browser .mixed-two-up .num4, [owa] .mixed-two-up .num4 {width: 188px !important; }.ie-browser .mixed-two-up .num8, [owa] .mixed-two-up .num8 {width: 376px !important; }.ie-browser .block-grid.two-up .col, [owa] .block-grid.two-up .col {width: 287px !important; }.ie-browser .block-grid.three-up .col, [owa] .block-grid.three-up .col {width: 191px !important; }.ie-browser .block-grid.four-up .col, [owa] .block-grid.four-up .col {width: 143px !important; }.ie-browser .block-grid.five-up .col, [owa] .block-grid.five-up .col {width: 115px !important; }.ie-browser .block-grid.six-up .col, [owa] .block-grid.six-up .col {width: 95px !important; }.ie-browser .block-grid.seven-up .col, [owa] .block-grid.seven-up .col {width: 82px !important; }.ie-browser .block-grid.eight-up .col, [owa] .block-grid.eight-up .col {width: 71px !important; }.ie-browser .block-grid.nine-up .col, [owa] .block-grid.nine-up .col {width: 63px !important; }.ie-browser .block-grid.ten-up .col, [owa] .block-grid.ten-up .col {width: 57px !important; }.ie-browser .block-grid.eleven-up .col, [owa] .block-grid.eleven-up .col {width: 52px !important; }.ie-browser .block-grid.twelve-up .col, [owa] .block-grid.twelve-up .col {width: 47px !important; }@media only screen and (min-width: 595px) {.block-grid {width: 575px !important; }.block-grid .col {display: table-cell;Float: none !important;vertical-align: top; }.block-grid .col.num12 {width: 575px !important; }.block-grid.mixed-two-up .col.num4 {width: 188px !important; }.block-grid.mixed-two-up .col.num8 {width: 376px !important; }.block-grid.two-up .col {width: 287px !important; }.block-grid.three-up .col {width: 191px !important; }.block-grid.four-up .col {width: 143px !important; }.block-grid.five-up .col {width: 115px !important; }.block-grid.six-up .col {width: 95px !important; }.block-grid.seven-up .col {width: 82px !important; }.block-grid.eight-up .col {width: 71px !important; }.block-grid.nine-up .col {width: 63px !important; }.block-grid.ten-up .col {width: 57px !important; }.block-grid.eleven-up .col {width: 52px !important; }.block-grid.twelve-up .col {width: 47px !important; } }@media (max-width: 595px) {.block-grid, .col {min-width: 320px !important;max-width: 100% !important; }.block-grid {width: calc(100% - 40px) !important; }.col {width: 100% !important; }.col > div {margin: 0 auto; }img.fullwidth {max-width: 100% !important; } }</style>      </head><body class="clean-body" style="margin: 0;padding: 0;-webkit-text-size-adjust: 100%;background-color: transparent"><!--[if IE]><div class="ie-browser"><![endif]--><!--[if mso]><div class="mso-container"><![endif]--><div class="nl-container" style="min-width: 320px;Margin: 0 auto;background-color: transparent"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="background-color: transparent;"><![endif]--><div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: transparent;" class="block-grid "><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:transparent;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="575" style=" width:575px; padding-right: 0px; padding-left: 0px; padding-top:5px; padding-bottom:5px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num12" style="min-width: 320px;max-width: 575px;width: 575px;width: calc(25500% - 146050px);background-color: transparent;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:5px; padding-bottom:5px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"><![endif]--><div style="color:#555555;line-height:120%;font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif; padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;">    <div style="font-size:12px;line-height:14px;color:#555555;font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;text-align:left;"><br></div>  </div><!--[if mso]></td></tr></table><![endif]--><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>    <div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: #FFFFFF;" class="block-grid "><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:#FFFFFF;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="575" style=" width:575px; padding-right: 0px; padding-left: 0px; padding-top:5px; padding-bottom:0px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num12" style="min-width: 320px;max-width: 575px;width: 575px;width: calc(25500% - 146050px);background-color: #FFFFFF;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:5px; padding-bottom:0px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><div align="center" class="img-container center fullwidth" style="padding-right: 0px;  padding-left: 0px;"><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 0px; padding-left: 0px;" align="center"><![endif]--><img class="center fullwidth" align="center" border="0" src="http://smartconnectsoftware.com/mail_iudi/logo.png" alt="Image" title="Image" style="outline: none;text-decoration: none;-ms-interpolation-mode: bicubic;clear: both;display: block !important;border: 0;height: auto;float: none;width: 100%;max-width: 575px" width="575"><!--[if mso]></td></tr></table><![endif]--></div><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>    <div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: #FFFFFF;" class="block-grid "><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:#FFFFFF;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="575" style=" width:575px; padding-right: 0px; padding-left: 0px; padding-top:0px; padding-bottom:5px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num12" style="min-width: 320px;max-width: 575px;width: 575px;width: calc(25500% - 146050px);background-color: #FFFFFF;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:0px; padding-bottom:5px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"><![endif]--><div style="font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;line-height:120%;color:#0D0D0D; padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"> <div style="font-size:12px;line-height:14px;color:#0D0D0D;font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;text-align:left;"><p style="margin: 0;font-size: 14px;line-height: 17px;text-align: center"><span style="font-size: 28px; line-height: 33px;"><strong><span style="line-height: 33px; font-size: 28px;">Dear Sir or Madam ,</span></strong></span></p></div>  </div><!--[if mso]></td></tr></table><![endif]--><div align="center" class="img-container center" style="padding-right: 0px;  padding-left: 0px;"><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 0px; padding-left: 0px;" align="center"><![endif]--><div style="line-height:10px;font-size:1px">&#160;</div>  <img class="center" align="center" border="0" src="http://smartconnectsoftware.com/mail_iudi//divider.png" alt="Image" title="Image" style="outline: none;text-decoration: none;-ms-interpolation-mode: bicubic;clear: both;display: block !important;border: 0;height: auto;float: none;width: 100%;max-width: 316px" width="316"><div style="line-height:10px;font-size:1px">&#160;</div><!--[if mso]></td></tr></table><![endif]--></div><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"><![endif]--><div style="font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;line-height:150%;color:#555555; padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"> <div style="font-size:12px;line-height:18px;color:#555555;font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;text-align:left;"><p style="margin: 0;font-size: 14px;line-height: 21px;text-align: center">'
                                                            +'Please include <b>IUDIP00'+d.insertId+'</b> in the subject line of any future correspondence on this matter and <b>Reply to all</b> within 7 days, if after 7 days we do not receive any response from you, your post or account will be locked. Thank you!'
                                                            +'<br>Your post has been reported with content:</p><p style="margin: 0;font-size: 14px;line-height: 21px;text-align: center"><span style="color: rgb(168, 191, 111); font-size: 14px; line-height: 21px;"><strong><em>"'
                                                            +req.body.message+'"</em></strong></span></p></div> </div><!--[if mso]></td></tr></table><![endif]--><div align="center" class="img-container center" style="padding-right: 0px;  padding-left: 0px;"><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 0px; padding-left: 0px;" align="center"><![endif]--><div style="line-height:10px;font-size:1px">&#160;</div>  <img class="center" align="center" border="0" src="http://smartconnectsoftware.com/mail_iudi//divider.png" alt="Image" title="Image" style="outline: none;text-decoration: none;-ms-interpolation-mode: bicubic;clear: both;display: block !important;border: 0;height: auto;float: none;width: 100%;max-width: 316px" width="316"><div style="line-height:10px;font-size:1px">&#160;</div><!--[if mso]></td></tr></table><![endif]--></div><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; padding-left: 10px; padding-top: 5px; padding-bottom: 5px;"><![endif]--><div style="font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;line-height:150%;color:#0D0D0D; padding-right: 10px; padding-left: 10px; padding-top: 5px; padding-bottom: 5px;"> <div style="font-size:12px;line-height:18px;color:#0D0D0D;font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;text-align:left;"><p style="margin: 0;font-size: 14px;line-height: 21px;text-align: center">Post Content:</p></div>    </div><!--[if mso]></td></tr></table><![endif]--><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>    <div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: #ACBE7E;" class="block-grid mixed-two-up"><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:#ACBE7E;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="192" style=" width:192px; padding-right: 10px; padding-left: 10px; padding-top:15px; padding-bottom:15px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num4" style="Float: left;max-width: 320px;min-width: 188px;width: 192px;width: calc(76088px - 13200%);background-color: #ACBE7E;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:15px; padding-bottom:15px; padding-right: 10px; padding-left: 10px;"><!--<![endif]--><div align="center" class="img-container center fullwidth" style="padding-right: 0px;  padding-left: 0px;"><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 0px; padding-left: 0px;" align="center"><![endif]--><img class="center fullwidth" align="center" border="0" src="'
                                                            +resultPost.img_url+'" alt="Image" title="Image" style="outline: none;text-decoration: none;-ms-interpolation-mode: bicubic;clear: both;display: block !important;border: 0;height: auto;float: none;width: 100%;max-width: 171.666666666667px" width="171.666666666667"><!--[if mso]></td></tr></table><![endif]--></div><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td><td align="center" width="383" style=" width:383px; padding-right: 0px; padding-left: 0px; padding-top:15px; padding-bottom:15px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num8" style="Float: left;min-width: 320px;max-width: 376px;width: 383px;width: calc(6600% - 38894px);background-color: #ACBE7E;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:15px; padding-bottom:15px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"><![endif]--><div style="color:#555555;line-height:120%;font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif; padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;">   <div style="font-size:12px;line-height:14px;color:#555555;font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;text-align:left;"><p style="margin: 0;font-size: 12px;line-height: 14px"><span style="color: rgb(255, 255, 255); font-size: 12px; line-height: 14px;"><em style="padding: 0 10px 0 10px;">"'
                                                            +resultPost.caption+'"</em></span></p></div> </div><!--[if mso]></td></tr></table><![endif]--><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>    <div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: #525252;" class="block-grid "><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:#525252;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="575" style=" width:575px; padding-right: 0px; padding-left: 0px; padding-top:15px; padding-bottom:5px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num12" style="min-width: 320px;max-width: 575px;width: 575px;width: calc(25500% - 146050px);background-color: #525252;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:15px; padding-bottom:5px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 5px; padding-left: 5px; padding-top: 25px; padding-bottom: 5px;"><![endif]--><div style="color:#FFFFFF;line-height:120%;font-family:"Helvetica Neue", Helvetica, Arial, sans-serif; padding-right: 5px; padding-left: 5px; padding-top: 25px; padding-bottom: 5px;">    <div style="font-size:12px;line-height:14px;font-family:inherit;color:#FFFFFF;text-align:left;"><p style="margin: 0;font-size: 12px;line-height: 14px;text-align: center"><span style="color: rgb(153, 204, 0); font-size: 14px; line-height: 16px;"><span style="color: rgb(168, 191, 111); font-size: 14px; line-height: 16px;">Tel :</span><span style="color: rgb(255, 255, 255); font-size: 14px; line-height: 16px;"> +84 9 86 86 86 72</span></span></p></div>   </div><!--[if mso]></td></tr></table><![endif]--><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 5px; padding-left: 5px; padding-top: 5px; padding-bottom: 5px;"><![endif]--><div style="color:#FFFFFF;line-height:120%;font-family:"Helvetica Neue", Helvetica, Arial, sans-serif; padding-right: 5px; padding-left: 5px; padding-top: 5px; padding-bottom: 5px;">   <div style="font-size:12px;line-height:14px;color:#FFFFFF;font-family:"Helvetica Neue", Helvetica, Arial, sans-serif;text-align:left;"><p style="margin: 0;font-size: 12px;line-height: 14px;text-align: center"><span style="font-size: 14px; line-height: 16px;"><span style="color: rgb(168, 191, 111); font-size: 14px; line-height: 16px;">Smart Connect Software</span> @&#160;2017</span></p></div>  </div><!--[if mso]></td></tr></table><![endif]--><div align="center" style="padding-right: 0px; padding-left: 0px; padding-bottom: 0px;"><div style="display: table; max-width:57;"><!--[if (mso)|(IE)]><table width="57" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-collapse:collapse; padding-right: 0px; padding-left: 0px; padding-bottom: 0px;"  align="center"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; mso-table-lspace: 0pt;mso-table-rspace: 0pt; width:57px;"><tr><td width="32" style="width:32px; padding-right: 5px;" valign="top"><![endif]--><table align="left" border="0" cellspacing="0" cellpadding="0" width="32" height="32" style="border-collapse: collapse;table-layout: fixed;border-spacing: 0;mso-table-lspace: 0pt;mso-table-rspace: 0pt;vertical-align: top;Margin-right: 0"><tbody><tr style="vertical-align: top"><td align="left" valign="middle" style="word-break: break-word;border-collapse: collapse !important;vertical-align: top"><a href="https://www.facebook.com/Smartsfw/" title="Facebook" target="_blank"><img src="http://smartconnectsoftware.com/mail_iudi//facebook@2x.png" alt="Facebook" title="Facebook" width="32" style="outline: none;text-decoration: none;-ms-interpolation-mode: bicubic;clear: both;display: block !important;border: none;height: auto;float: none;max-width: 32px !important"></a><div style="line-height:5px;font-size:1px">&#160;</div></td></tr></tbody></table><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>    <div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: transparent;" class="block-grid "><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:transparent;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="575" style=" width:575px; padding-right: 0px; padding-left: 0px; padding-top:0px; padding-bottom:5px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num12" style="min-width: 320px;max-width: 575px;width: 575px;width: calc(25500% - 146050px);background-color: transparent;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:0px; padding-bottom:5px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><div align="center" class="img-container center fullwidth" style="padding-right: 0px;  padding-left: 0px;"><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 0px; padding-left: 0px;" align="center"><![endif]--><img class="center fullwidth" align="center" border="0" src="http://smartconnectsoftware.com/mail_iudi//rounder-dwn.png" alt="Image" title="Image" style="outline: none;text-decoration: none;-ms-interpolation-mode: bicubic;clear: both;display: block !important;border: 0;height: auto;float: none;width: 100%;max-width: 575px" width="575"><!--[if mso]></td></tr></table><![endif]--></div><div style="padding-right: 15px; padding-left: 15px; padding-top: 15px; padding-bottom: 15px;"><!--[if (mso)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 15px;padding-left: 15px; padding-top: 15px; padding-bottom: 15px;"><table width="100%" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]--><div align="center"><div style="border-top: 0px solid transparent; width:100%; line-height:0px; height:0px; font-size:0px;">&#160;</div></div><!--[if (mso)]></td></tr></table></td></tr></table><![endif]--></div><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>   <!--[if (mso)|(IE)]></td></tr></table><![endif]--></div><!--[if (mso)|(IE)]></div><![endif]--></body></html>'
                                                        };
                                                    } else {
                                                        tinnhanReport = {
                                                            to: '<'+resultReport.email+'>,<'+result.email+'>,<chithanh.ptit@gmail.com>',
                                                            subject: '[IUDIP00'+d.insertId+'] complaint has been created!',
                                                            html: '<!DOCTYPE HTML PUBLIC "-//W3C//DTD XHTML 1.0 Transitional //EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"><html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><meta name="viewport" content="width=device-width"><!--[if !mso]><!--><meta http-equiv="X-UA-Compatible" content="IE=edge"><!--<![endif]--><title></title><!--[if !mso]><!-- --><link href="https://fonts.googleapis.com/css?family=Montserrat" rel="stylesheet" type="text/css"><!--<![endif]--><style type="text/css" id="media-query">body {margin: 0;padding: 0; }table, tr, td {vertical-align: top;border-collapse: collapse; }.ie-browser table, .mso-container table {table-layout: fixed; }* {line-height: inherit; }a[x-apple-data-detectors=true] {color: inherit !important;text-decoration: none !important; }[owa] .img-container div, [owa] .img-container button {display: block !important; }[owa] .fullwidth button {width: 100% !important; }[owa] .block-grid .col {display: table-cell;float: none !important;vertical-align: top; }.ie-browser .num12, .ie-browser .block-grid, [owa] .num12, [owa] .block-grid {width: 575px !important; }.ExternalClass, .ExternalClass p, .ExternalClass span, .ExternalClass font, .ExternalClass td, .ExternalClass div {line-height: 100%; }.ie-browser .mixed-two-up .num4, [owa] .mixed-two-up .num4 {width: 188px !important; }.ie-browser .mixed-two-up .num8, [owa] .mixed-two-up .num8 {width: 376px !important; }.ie-browser .block-grid.two-up .col, [owa] .block-grid.two-up .col {width: 287px !important; }.ie-browser .block-grid.three-up .col, [owa] .block-grid.three-up .col {width: 191px !important; }.ie-browser .block-grid.four-up .col, [owa] .block-grid.four-up .col {width: 143px !important; }.ie-browser .block-grid.five-up .col, [owa] .block-grid.five-up .col {width: 115px !important; }.ie-browser .block-grid.six-up .col, [owa] .block-grid.six-up .col {width: 95px !important; }.ie-browser .block-grid.seven-up .col, [owa] .block-grid.seven-up .col {width: 82px !important; }.ie-browser .block-grid.eight-up .col, [owa] .block-grid.eight-up .col {width: 71px !important; }.ie-browser .block-grid.nine-up .col, [owa] .block-grid.nine-up .col {width: 63px !important; }.ie-browser .block-grid.ten-up .col, [owa] .block-grid.ten-up .col {width: 57px !important; }.ie-browser .block-grid.eleven-up .col, [owa] .block-grid.eleven-up .col {width: 52px !important; }.ie-browser .block-grid.twelve-up .col, [owa] .block-grid.twelve-up .col {width: 47px !important; }@media only screen and (min-width: 595px) {.block-grid {width: 575px !important; }.block-grid .col {display: table-cell;Float: none !important;vertical-align: top; }.block-grid .col.num12 {width: 575px !important; }.block-grid.mixed-two-up .col.num4 {width: 188px !important; }.block-grid.mixed-two-up .col.num8 {width: 376px !important; }.block-grid.two-up .col {width: 287px !important; }.block-grid.three-up .col {width: 191px !important; }.block-grid.four-up .col {width: 143px !important; }.block-grid.five-up .col {width: 115px !important; }.block-grid.six-up .col {width: 95px !important; }.block-grid.seven-up .col {width: 82px !important; }.block-grid.eight-up .col {width: 71px !important; }.block-grid.nine-up .col {width: 63px !important; }.block-grid.ten-up .col {width: 57px !important; }.block-grid.eleven-up .col {width: 52px !important; }.block-grid.twelve-up .col {width: 47px !important; } }@media (max-width: 595px) {.block-grid, .col {min-width: 320px !important;max-width: 100% !important; }.block-grid {width: calc(100% - 40px) !important; }.col {width: 100% !important; }.col > div {margin: 0 auto; }img.fullwidth {max-width: 100% !important; } }</style>      </head><body class="clean-body" style="margin: 0;padding: 0;-webkit-text-size-adjust: 100%;background-color: transparent"><!--[if IE]><div class="ie-browser"><![endif]--><!--[if mso]><div class="mso-container"><![endif]--><div class="nl-container" style="min-width: 320px;Margin: 0 auto;background-color: transparent"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="background-color: transparent;"><![endif]--><div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: transparent;" class="block-grid "><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:transparent;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="575" style=" width:575px; padding-right: 0px; padding-left: 0px; padding-top:5px; padding-bottom:5px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num12" style="min-width: 320px;max-width: 575px;width: 575px;width: calc(25500% - 146050px);background-color: transparent;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:5px; padding-bottom:5px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"><![endif]--><div style="color:#555555;line-height:120%;font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif; padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;">    <div style="font-size:12px;line-height:14px;color:#555555;font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;text-align:left;"><br></div>  </div><!--[if mso]></td></tr></table><![endif]--><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>    <div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: #FFFFFF;" class="block-grid "><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:#FFFFFF;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="575" style=" width:575px; padding-right: 0px; padding-left: 0px; padding-top:5px; padding-bottom:0px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num12" style="min-width: 320px;max-width: 575px;width: 575px;width: calc(25500% - 146050px);background-color: #FFFFFF;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:5px; padding-bottom:0px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><div align="center" class="img-container center fullwidth" style="padding-right: 0px;  padding-left: 0px;"><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 0px; padding-left: 0px;" align="center"><![endif]--><img class="center fullwidth" align="center" border="0" src="http://smartconnectsoftware.com/mail_iudi/logo.png" alt="Image" title="Image" style="outline: none;text-decoration: none;-ms-interpolation-mode: bicubic;clear: both;display: block !important;border: 0;height: auto;float: none;width: 100%;max-width: 575px" width="575"><!--[if mso]></td></tr></table><![endif]--></div><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>    <div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: #FFFFFF;" class="block-grid "><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:#FFFFFF;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="575" style=" width:575px; padding-right: 0px; padding-left: 0px; padding-top:0px; padding-bottom:5px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num12" style="min-width: 320px;max-width: 575px;width: 575px;width: calc(25500% - 146050px);background-color: #FFFFFF;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:0px; padding-bottom:5px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"><![endif]--><div style="font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;line-height:120%;color:#0D0D0D; padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"> <div style="font-size:12px;line-height:14px;color:#0D0D0D;font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;text-align:left;"><p style="margin: 0;font-size: 14px;line-height: 17px;text-align: center"><span style="font-size: 28px; line-height: 33px;"><strong><span style="line-height: 33px; font-size: 28px;">Dear Sir or Madam,</span></strong></span></p></div>  </div><!--[if mso]></td></tr></table><![endif]--><div align="center" class="img-container center" style="padding-right: 0px;  padding-left: 0px;"><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 0px; padding-left: 0px;" align="center"><![endif]--><div style="line-height:10px;font-size:1px">&#160;</div>  <img class="center" align="center" border="0" src="http://smartconnectsoftware.com/mail_iudi//divider.png" alt="Image" title="Image" style="outline: none;text-decoration: none;-ms-interpolation-mode: bicubic;clear: both;display: block !important;border: 0;height: auto;float: none;width: 100%;max-width: 316px" width="316"><div style="line-height:10px;font-size:1px">&#160;</div><!--[if mso]></td></tr></table><![endif]--></div><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"><![endif]--><div style="font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;line-height:150%;color:#555555; padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"> <div style="font-size:12px;line-height:18px;color:#555555;font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;text-align:left;"><p style="margin: 0;font-size: 14px;line-height: 21px;text-align: center">'
                                                            +'Please include <b>IUDIP00'+d.insertId+'</b> in the subject line of any future correspondence on this matter and <b>Reply to all</b> within 7 days, if after 7 days we do not receive any response from you, your post or account will be locked. Thank you!'
                                                            +'<br>Your post has been reported with content:</p><p style="margin: 0;font-size: 14px;line-height: 21px;text-align: center"><span style="color: rgb(168, 191, 111); font-size: 14px; line-height: 21px;"><strong><em>"'
                                                            +req.body.message+'"</em></strong></span></p></div> </div><!--[if mso]></td></tr></table><![endif]--><div align="center" class="img-container center" style="padding-right: 0px;  padding-left: 0px;"><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 0px; padding-left: 0px;" align="center"><![endif]--><div style="line-height:10px;font-size:1px">&#160;</div>  <img class="center" align="center" border="0" src="http://smartconnectsoftware.com/mail_iudi//divider.png" alt="Image" title="Image" style="outline: none;text-decoration: none;-ms-interpolation-mode: bicubic;clear: both;display: block !important;border: 0;height: auto;float: none;width: 100%;max-width: 316px" width="316"><div style="line-height:10px;font-size:1px">&#160;</div><!--[if mso]></td></tr></table><![endif]--></div><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; padding-left: 10px; padding-top: 5px; padding-bottom: 5px;"><![endif]--><div style="font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;line-height:150%;color:#0D0D0D; padding-right: 10px; padding-left: 10px; padding-top: 5px; padding-bottom: 5px;"> <div style="font-size:12px;line-height:18px;color:#0D0D0D;font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;text-align:left;"><p style="margin: 0;font-size: 14px;line-height: 21px;text-align: center">Post Content:</p></div>    </div><!--[if mso]></td></tr></table><![endif]--><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>    <div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: #ACBE7E;" class="block-grid mixed-two-up"><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:#ACBE7E;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="192" style=" width:192px; padding-right: 10px; padding-left: 10px; padding-top:15px; padding-bottom:15px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><!--[if (mso)|(IE)]></td><td align="center" width="383" style=" width:383px; padding-right: 0px; padding-left: 0px; padding-top:15px; padding-bottom:15px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num8" style="Float: left;min-width: 320px;max-width: 376px;width: 383px;width: calc(6600% - 38894px);background-color: #ACBE7E;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:15px; padding-bottom:15px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"><![endif]--><div style="color:#555555;line-height:120%;font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif; padding-right: 10px; padding-left: 10px; padding-top: 10px; padding-bottom: 10px;"> <div style="font-size:12px;line-height:14px;color:#555555;font-family:"Montserrat", "Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif;text-align:left;"><p style="margin: 0;font-size: 12px;line-height: 14px; padding: 0 10px 0 10px;"><span style="color: rgb(255, 255, 255); font-size: 12px; line-height: 14px;"><em>"'
                                                            +resultPost.caption+'"</em></span></p></div>    </div><!--[if mso]></td></tr></table><![endif]--><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>    <div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: #525252;" class="block-grid "><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:#525252;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="575" style=" width:575px; padding-right: 0px; padding-left: 0px; padding-top:15px; padding-bottom:5px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num12" style="min-width: 320px;max-width: 575px;width: 575px;width: calc(25500% - 146050px);background-color: #525252;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:15px; padding-bottom:5px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 5px; padding-left: 5px; padding-top: 25px; padding-bottom: 5px;"><![endif]--><div style="color:#FFFFFF;line-height:120%;font-family:"Helvetica Neue", Helvetica, Arial, sans-serif; padding-right: 5px; padding-left: 5px; padding-top: 25px; padding-bottom: 5px;">    <div style="font-size:12px;line-height:14px;font-family:inherit;color:#FFFFFF;text-align:left;"><p style="margin: 0;font-size: 12px;line-height: 14px;text-align: center"><span style="color: rgb(153, 204, 0); font-size: 14px; line-height: 16px;"><span style="color: rgb(168, 191, 111); font-size: 14px; line-height: 16px;">Tel :</span><span style="color: rgb(255, 255, 255); font-size: 14px; line-height: 16px;"> +84 9 86 86 86 72</span></span></p></div>   </div><!--[if mso]></td></tr></table><![endif]--><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 5px; padding-left: 5px; padding-top: 5px; padding-bottom: 5px;"><![endif]--><div style="color:#FFFFFF;line-height:120%;font-family:"Helvetica Neue", Helvetica, Arial, sans-serif; padding-right: 5px; padding-left: 5px; padding-top: 5px; padding-bottom: 5px;">   <div style="font-size:12px;line-height:14px;color:#FFFFFF;font-family:"Helvetica Neue", Helvetica, Arial, sans-serif;text-align:left;"><p style="margin: 0;font-size: 12px;line-height: 14px;text-align: center"><span style="font-size: 14px; line-height: 16px;"><span style="color: rgb(168, 191, 111); font-size: 14px; line-height: 16px;">Smart Connect Software</span> @&#160;2017</span></p></div>  </div><!--[if mso]></td></tr></table><![endif]--><div align="center" style="padding-right: 0px; padding-left: 0px; padding-bottom: 0px;"><div style="display: table; max-width:57;"><!--[if (mso)|(IE)]><table width="57" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-collapse:collapse; padding-right: 0px; padding-left: 0px; padding-bottom: 0px;"  align="center"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; mso-table-lspace: 0pt;mso-table-rspace: 0pt; width:57px;"><tr><td width="32" style="width:32px; padding-right: 5px;" valign="top"><![endif]--><table align="left" border="0" cellspacing="0" cellpadding="0" width="32" height="32" style="border-collapse: collapse;table-layout: fixed;border-spacing: 0;mso-table-lspace: 0pt;mso-table-rspace: 0pt;vertical-align: top;Margin-right: 0"><tbody><tr style="vertical-align: top"><td align="left" valign="middle" style="word-break: break-word;border-collapse: collapse !important;vertical-align: top"><a href="https://www.facebook.com/Smartsfw/" title="Facebook" target="_blank"><img src="http://smartconnectsoftware.com/mail_iudi//facebook@2x.png" alt="Facebook" title="Facebook" width="32" style="outline: none;text-decoration: none;-ms-interpolation-mode: bicubic;clear: both;display: block !important;border: none;height: auto;float: none;max-width: 32px !important"></a><div style="line-height:5px;font-size:1px">&#160;</div></td></tr></tbody></table><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>    <div style="background-color:transparent;"><div style="Margin: 0 auto;min-width: 320px;max-width: 575px;width: 575px;width: calc(26500% - 157100px);overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: transparent;" class="block-grid "><div style="border-collapse: collapse;display: table;width: 100%;"><!--[if (mso)|(IE)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:transparent;" align="center"><table cellpadding="0" cellspacing="0" border="0" style="width: 575px;"><tr class="layout-full-width" style="background-color:transparent;"><![endif]--><!--[if (mso)|(IE)]><td align="center" width="575" style=" width:575px; padding-right: 0px; padding-left: 0px; padding-top:0px; padding-bottom:5px; border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent;" valign="top"><![endif]--><div class="col num12" style="min-width: 320px;max-width: 575px;width: 575px;width: calc(25500% - 146050px);background-color: transparent;"><div style="background-color: transparent; width: 100% !important;"><!--[if (!mso)&(!IE)]><!--><div style="border-top: 0px solid transparent; border-left: 0px solid transparent; border-bottom: 0px solid transparent; border-right: 0px solid transparent; padding-top:0px; padding-bottom:5px; padding-right: 0px; padding-left: 0px;"><!--<![endif]--><div align="center" class="img-container center fullwidth" style="padding-right: 0px;  padding-left: 0px;"><!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 0px; padding-left: 0px;" align="center"><![endif]--><img class="center fullwidth" align="center" border="0" src="http://smartconnectsoftware.com/mail_iudi//rounder-dwn.png" alt="Image" title="Image" style="outline: none;text-decoration: none;-ms-interpolation-mode: bicubic;clear: both;display: block !important;border: 0;height: auto;float: none;width: 100%;max-width: 575px" width="575"><!--[if mso]></td></tr></table><![endif]--></div><div style="padding-right: 15px; padding-left: 15px; padding-top: 15px; padding-bottom: 15px;"><!--[if (mso)]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right: 15px;padding-left: 15px; padding-top: 15px; padding-bottom: 15px;"><table width="100%" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]--><div align="center"><div style="border-top: 0px solid transparent; width:100%; line-height:0px; height:0px; font-size:0px;">&#160;</div></div><!--[if (mso)]></td></tr></table></td></tr></table><![endif]--></div><!--[if (!mso)&(!IE)]><!--></div><!--<![endif]--></div></div><!--[if (mso)|(IE)]></td></tr></table></td></tr></table><![endif]--></div></div></div>   <!--[if (mso)|(IE)]></td></tr></table><![endif]--></div><!--[if (mso)|(IE)]></div><![endif]--></body></html>'
                                                        };
                                                    }
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
function getInformationPost(posts_id, result){
    var sql = "SELECT * FROM `posts` WHERE `id`='"+posts_id+"'";
    client.query(sql, function(error, data, fields){
        if (error) {
            console.log(error);
        } else {
            if (data.length > 0) {
                if (data[0].type == 'albums' || data[0].type == 'photo') {
                    var sqlImage = "SELECT `img_url` FROM `store_images` WHERE `posts_id`='"+posts_id+"'";
                    client.query(sqlImage, function(e, d, f){
                        if (e) {
                            console.log(e);
                        } else {
                            if (d[0].img_url) {
                                data[0].img_url = d[0].img_url;
                                result(data[0]);
                            } else{
                                result(data[0]);
                            }
                        }
                    });
                } else {
                    result(data[0]);
                }
            }
        }
    });
}

router.post('/seen', urlParser, function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var selectLike = "SELECT * FROM `notification_feed` WHERE `users_key`='" + req.body.users_key + "' AND `id`='"+req.body.id+"'";
                client.query(selectLike, function (eLike, dLike, fLike) {
                    if (eLike) {
                        console.log(eLike);
                        return res.sendStatus(300);
                    } else {
                        if (dLike.length > 0) {
                            var updateSQL = "UPDATE `notification_feed` SET `is_seen`='1' WHERE `users_key`='" + req.body.users_key + "' AND `id`='"+req.body.id+"'";
                            client.query(updateSQL, function (eInsert, dInsert, fInsert) {
                                if (eInsert) {
                                    console.log(eInsert);
                                    return res.sendStatus(300);
                                } else {
                                    return res.send(echoResponse(200, 'Updated successfully.', 'success', false));
                                }
                            });
                        } else {
                            return res.send(echoResponse(404, 'This post has been deleted in the past.', 'success', false));
                        }
                    }
                })

            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
/*********--------------------------------*********
 **********------- GET INFO 1 bài viết ------*********
 **********---------------------------------*********/
 router.get('/:id/type=info', function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    var key = req.body.key || req.query.key || req.params.key;
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                isHavePermission(key, req.params.id, function(isPermission){
                    if (isPermission == true) {
                        var postSQL = "SELECT * FROM `posts` WHERE `id`='" + req.params.id + "' AND `is_active`='1'";
                        client.query(postSQL, function (errorPost, post, fiPost) {
                            if (errorPost) {
                                console.log(errorPost);
                            } else {
                                if (post.length > 0) {
                                    var selectCurrent = "SELECT `nickname`,`avatar` FROM `users` WHERE `key`='" + post[0].users_key + "'";
                                    client.query(selectCurrent, function (eCurrent, dataCurrent, fieldCurrent) {
                                        if (eCurrent) {
                                            console.log(eCurrent);
                                            return res.sendStatus(300);
                                        } else {
                                            if (dataCurrent.length > 0) {
                                                post[0].avatar = dataCurrent[0].avatar;
                                                post[0].nickname = dataCurrent[0].nickname;
                                                // TAGED USERS
                                                var selectTags = "SELECT `key`,`nickname`,`avatar` FROM `users` WHERE `key` IN (SELECT `users_key` FROM `tags` WHERE `posts_id`='" + post[0].id + "')";
                                                client.query(selectTags, function (eTag, tags, fTag) {
                                                    if (eTag) {
                                                        console.log(eTag);
                                                        return res.sendStatus(300);
                                                    } else {
                                                        post[0].tags = tags;
                                                        // IMAGES ALBUMS
                                                        var selectAlbums = "SELECT `img_url`,`img_height`,`img_width` FROM `store_images` WHERE `posts_id`='" + req.params.id + "'";
                                                        client.query(selectAlbums, function (eAlbums, albums, fAlbums) {
                                                            if (eAlbums) {
                                                                console.log(eAlbums);
                                                            } else {
                                                                post[0].albums = albums;
                                                                // VIDEO ALBUMS
                                                                var selectVideo = "SELECT `video_url` FROM `store_videos` WHERE `posts_id`='" + req.params.id + "'";
                                                                client.query(selectVideo, function (eVideo, video, fVideo) {
                                                                    if (eVideo) {
                                                                        console.log(eVideo);
                                                                    } else {
                                                                        post[0].video = video;
                                                                        // LIKE LIST
                                                                        var selectLike = "SELECT `users_key` FROM `likes` WHERE `posts_id`='" + req.params.id + "'";
                                                                        client.query(selectLike, function (eLike, like, fLike) {
                                                                            if (eLike) {
                                                                                console.log(eLike);
                                                                            } else {
                                                                                post[0].count_like = like.length;

                                                                                if (like.length > 0) {
                                                                                    async.forEachOf(like, function (dataLike, iCurrent, callbackLike) {
                                                                                        if (like[iCurrent].users_key === key) {
                                                                                            post[0].is_liked = 1;
                                                                                        } else {
                                                                                            post[0].is_liked = 0;
                                                                                        }
                                                                                    });
                                                                                } else {
                                                                                    post[0].is_liked = 0;
                                                                                }
                                                                                // Comment LIST
                                                                                var selectComment = "SELECT * FROM `comments` WHERE `posts_id`='" + req.params.id + "'";
                                                                                client.query(selectComment, function (eComment, comment, fComment) {
                                                                                    if (eComment) {
                                                                                        console.log(eComment);
                                                                                    } else {
                                                                                        post[0].count_comment = comment.length;
                                                                                        return res.send(echoResponse(200, post[0], 'success', false));
                                                                                    }
                                                                                });
                                                                            }
                                                                        });
                                                                    }
                                                                });
                                                            }
                                                        });
                                                    }
                                                });
                                            } else {
                                                return res.send(echoResponse(404, 'This user is not exists', 'success', true));
                                            }
                                        }
                                    });
                                } else {
                                    client.query("DELETE FROM `notification_feed` WHERE `posts_id`='" + req.params.id + "'");
                                    client.query("DELETE FROM `notification_relate` WHERE `posts_id`='" + req.params.id + "'");
                                    return res.send(echoResponse(404, 'This post has been deleted', 'success', true));
                                }
                            }
                        });
                    } else {
                        client.query("DELETE FROM `notification_feed` WHERE `posts_id`='" + req.params.id + "' AND `users_key`='"+key+"'");
                        client.query("DELETE FROM `notification_relate` WHERE `posts_id`='" + req.params.id + "' AND `users_key`='"+key+"'");
                        return res.send(echoResponse(404, 'This post has been deleted', 'success', true));
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
router.get('/:id/type=like', function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var page = req.body.page || req.query.page || req.params.page;
                var per_page = req.body.per_page || req.query.per_page || req.params.per_page;
                var sqlSelect = "SELECT `users_key` FROM `likes` WHERE `posts_id`='" + req.params.id + "' ORDER BY `id` DESC LIMIT " + parseInt(per_page, 10) + " OFFSET " + parseInt(page, 10) * parseInt(per_page, 10) + "";
                client.query(sqlSelect, function(eS, dS, fS){
                    if (eS) {
                        console.log(eS);
                        return res.sendStatus(300);
                    } else {
                        if (dS.length > 0) {
                            var listUser = [];
                            async.forEachOf(dS, function(element, i, callback){
                                var selectSQL = "SELECT `key`,`avatar`,`nickname` FROM `users` WHERE `key`='"+dS[i].users_key+"'";
                                client.query(selectSQL, function (ePost, like, fPost) {
                                    if (ePost) {
                                        console.log(ePost);
                                        callback();
                                        return res.sendStatus(300);
                                    } else {
                                        if (like.length > 0) {
                                            listUser.push(like[0]);
                                        } else {
                                            callback();
                                        }
                                        if (i === dS.length-1) {
                                            return res.send(echoResponse(200, listUser, 'success', false));
                                        }
                                    }
                                });
                            });
                        } else {
                            return res.send(echoResponse(404, 'No user like this', 'success', true));
                        }
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
router.get('/:id/type=totallike', function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var selectSQL = "SELECT * FROM `likes` WHERE `posts_id`='" + req.params.id + "'";
                client.query(selectSQL, function (ePost, like, fPost) {
                    if (ePost) {
                        console.log(ePost);
                        return res.sendStatus(300);
                    } else {
                        if (like.length > 0) {
                            return res.send(echoResponse(200, like.length, 'success', false));
                        } else {
                            return res.send(echoResponse(404, 0, 'success', true));
                        }
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
router.get('/:id/type=totalcomment', function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var selectSQL = "SELECT * FROM `comments` WHERE `posts_id`='" + req.params.id + "'";
                client.query(selectSQL, function (ePost, comment, fPost) {
                    if (ePost) {
                        console.log(ePost);
                        return res.sendStatus(300);
                    } else {
                        if (comment.length > 0) {
                            return res.send(echoResponse(200, comment.length, 'success', false));
                        } else {
                            return res.send(echoResponse(404, 0, 'success', true));
                        }
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
router.get('/:id/type=comment', function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var first_id = req.body.last_id || req.query.last_id || req.params.last_id;
                if (first_id) {
                    var selectSQL = "SELECT `id` FROM `comments` WHERE `posts_id`='" + req.params.id + "' ORDER BY `id` DESC";
                    client.query(selectSQL, function (ePost, comment, fPost) {
                        if (ePost) {
                            console.log(ePost);
                            return res.sendStatus(300);
                        } else {
                            if (comment.length > 0) {
                                var arrayComment = [];
                                var commentID = [];
                                async.forEachOf(comment, function(elementID, ID, callID){
                                    commentID.push(comment[ID].id);
                                    if (ID === comment.length-1) {
                                        var last = commentID.indexOf(parseInt(first_id));
                                        if (last === commentID.length -1) {
                                            return res.send(echoResponse(404, 'No user comment this', 'success', true));
                                        }
                                        var batdau = last+1;;
                                        var limit;
                                        if ((last+11) > commentID.length) {
                                            limit = commentID.length;
                                        } else {
                                            limit = last+11;
                                        }
                                        async.forEachOf(commentID, function(ele, j, callback){
                                            if (j >= batdau && j < limit) {
                                                var selectSQL = "SELECT * FROM `comments` WHERE `id`='" + commentID[j] + "'";
                                                client.query(selectSQL, function (ePostData, commentData, fPostData) {
                                                    if (ePostData) {
                                                        console.log(ePostData);
                                                        return res.sendStatus(300);
                                                    } else {
                                                        if (commentID.length > 0) {
                                                            var getUserSQL = "SELECT `avatar`,`nickname` FROM `users` WHERE `key`='" + commentData[0].users_key + "'";
                                                            client.query(getUserSQL, function (e, d, f) {
                                                                if (e) {
                                                                    console.log(e);
                                                                    return res.sendStatus(300);
                                                                } else {
                                                                    commentData[0].avatar = d[0].avatar;
                                                                    commentData[0].nickname = d[0].nickname;
                                                                    arrayComment.push(commentData[0]);
                                                                    if (j === limit - 1) {
                                                                        arrayComment.reverse();
                                                                        return res.send(echoResponse(200, arrayComment, 'success', false));
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
                                return res.send(echoResponse(404, 'No user comment this', 'success', true));
                            }
                        }
                    });
                } else {
                    var selectSQL = "SELECT * FROM `comments` WHERE `posts_id`='" + req.params.id + "' ORDER BY `id` DESC LIMIT 10";
                    client.query(selectSQL, function (ePost, comment, fPost) {
                        if (ePost) {
                            console.log(ePost);
                            return res.sendStatus(300);
                        } else {
                            if (comment.length > 0) {
                                async.forEachOf(comment, function (dataPost, i, callPost) {
                                    var getUserSQL = "SELECT `avatar`,`nickname` FROM `users` WHERE `key`='" + comment[i].users_key + "'";
                                    client.query(getUserSQL, function (e, d, f) {
                                        if (e) {
                                            console.log(e);
                                            return res.sendStatus(300);
                                        } else {
                                            comment[i].avatar = d[0].avatar;
                                            comment[i].nickname = d[0].nickname;
                                            if (i === comment.length - 1) {
                                                var data2 = _.sortBy(comment, 'id');
                                                return res.send(echoResponse(200, data2, 'success', false));
                                            }
                                        }
                                    });
                                });
                            } else {
                                return res.send(echoResponse(404, 'No user comment this', 'success', true));
                            }
                        }
                    });
                }
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});


/*********--------------------------*********
 **********------- LIKES ------*********
 **********--------------------------*********/
router.post('/like', urlParser, function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                checkHavePost(res, req.body.posts_id, function(runOut){
                    if (runOut == true) {
                        isHavePermission(req.body.users_key, req.body.posts_id, function(isPermission){
                            if (isPermission == true) {
                                var selectLike = "SELECT * FROM `likes` WHERE `users_key`='" + req.body.users_key + "' AND `posts_id`='" + req.body.posts_id + "'";
                                client.query(selectLike, function (eLike, dLike, fLike) {
                                    if (eLike) {
                                        console.log(eLike);
                                        return res.sendStatus(300);
                                    } else {
                                        if (dLike.length > 0) {
                                            var deleteSQL = "DELETE FROM `likes` WHERE `users_key`='" + req.body.users_key + "' AND `posts_id`='" + req.body.posts_id + "'";
                                            client.query(deleteSQL, function (eInsert, dInsert, fInsert) {
                                                if (eInsert) {
                                                    console.log(eInsert);
                                                    return res.sendStatus(300);
                                                } else {
                                                    var keyUserPost = "DELETE FROM `notification_feed` WHERE `posts_id`='" + req.body.posts_id + "' AND `friend_key`='" + req.body.users_key + "' AND `type`='like'";
                                                    client.query(keyUserPost, function (eNL, dNL, fNL) {
                                                        if (eNL) {
                                                            console.log(eNL);
                                                            return res.sendStatus(300);
                                                        } else {
                                                            console.log(req.body.users_key + " bỏ thích " + req.body.posts_id + "");
                                                            client.query("SELECT `id` FROM `likes` WHERE `posts_id`='" + req.body.posts_id + "'", function(e, d, fL){
                                                                if (e) {
                                                                    console.log(e);
                                                                    return res.sendStatus(300);
                                                                } else {
                                                                    return res.send(echoResponse(200, {total_like: d.length, liked: 0}, 'success', false));
                                                                }
                                                            });
                                                        }
                                                    });
                                                }
                                            });
                                        } else {
                                            var value = [];
                                            var insert = [];
                                            for (var k in req.body) {
                                                if (k != 'access_token') {
                                                    insert.push("`" + k + "`");
                                                    value.push("'" + req.body[k] + "'");
                                                }
                                            }
                                            var insertSQL = "INSERT INTO `likes`(" + insert.toString() + ") VALUES(" + value.toString() + ")";
                                            client.query(insertSQL, function (eInsert, dInsert, fInsert) {
                                                if (eInsert) {
                                                    console.log(eInsert);
                                                    return res.sendStatus(300);
                                                } else {
                                                    var getUserLike = "SELECT `avatar`,`nickname` FROM `users` WHERE `key`='" + req.body.users_key + "'";
                                                    client.query(getUserLike, function (eL, dL, fL) {
                                                        if (eL) {
                                                            console.log(eL);
                                                            return res.sendStatus(300);
                                                        } else {
                                                            var getPost = "SELECT `users_key` FROM `posts` WHERE `id`='" + req.body.posts_id + "'";
                                                            client.query(getPost, function (ePostN, dPostN, fPostN) {
                                                                if (ePostN) {
                                                                    console.log(ePostN);
                                                                    return res.sendStatus(300);
                                                                } else {
                                                                    isMyPost(req.body.users_key, req.body.posts_id, function (result) {
                                                                        if (result == false) {
                                                                            var currentTime = new Date().getTime();
                                                                            console.log(currentTime);
                                                                            var sqlInsertNotify = "INSERT INTO `notification_feed`(`friend_key`,`avatar`,`nickname`,`type`,`time`,`users_key`,`posts_id`)";
                                                                            var dataNotifySQL = "VALUES('" + req.body.users_key + "','" + dL[0].avatar + "','" + dL[0].nickname + "','like','" + currentTime + "','" + dPostN[0].users_key + "','" + req.body.posts_id + "')";
                                                                            
                                                                            client.query(sqlInsertNotify + dataNotifySQL, function (eFEED, dFEED, fFEED) {
                                                                                if (eFEED) {
                                                                                    console.log(eFEED);
                                                                                    return res.sendStatus(300);
                                                                                } else {
                                                                                    console.log(req.body.users_key + " thích " + req.body.posts_id + "");
                                                                                    client.query("SELECT `id` FROM `likes` WHERE `posts_id`='" + req.body.posts_id + "'", function(e, d, fL){
                                                                                        if (e) {
                                                                                            console.log(e);
                                                                                            return res.sendStatus(300);
                                                                                        } else {
                                                                                            return res.send(echoResponse(200, {total_like: d.length, liked: 1}, 'success', false));
                                                                                        }
                                                                                    });
                                                                                }
                                                                            });
                                                                            sendNotification(req.body.users_key, dPostN[0].users_key, "like your activity", "like", req.body.posts_id);
                                                                            var selectCurrent = "SELECT `nickname`, `avatar` FROM `users` WHERE `key`='" + req.body.users_key + "'";
                                                                            client.query(selectCurrent, function (eCurrent, dCurrent, fCurrent) {
                                                                                if (eCurrent) {
                                                                                    console.log(eCurrent);
                                                                                    return res.sendStatus(300);
                                                                                } else {
                                                                                    var selectRelate = "SELECT * FROM `tags` WHERE `posts_id`='" + req.body.posts_id + "' AND `users_key`!='"+req.body.users_key+"'";
                                                                                    client.query(selectRelate, function (eRelate, dRelate, fRelate) {
                                                                                        if (eRelate) {
                                                                                            console.log(eRelate);
                                                                                            return res.sendStatus(300);
                                                                                        } else {
                                                                                            if (dRelate.length > 0) {
                                                                                                async.forEachOf(dRelate, function (asyData, asyI, asyCallback) {
                                                                                                    insertNotificationNoImage(req.body.users_key, dCurrent[0].nickname, dCurrent[0].avatar, 'like', currentTime, dRelate[asyI].users_key, req.body.posts_id);
                                                                                                    sendNotification(req.body.users_key, dRelate[asyI].users_key, "likes a post you are tagged in", "like",req.body.posts_id);
                                                                                                });
                                                                                            }
                                                                                        }
                                                                                    });
                                                                                }
                                                                            });
                                                                        } else {
                                                                            client.query("SELECT `id` FROM `likes` WHERE `posts_id`='" + req.body.posts_id + "'", function(e, d, fL){
                                                                                if (e) {
                                                                                    console.log(e);
                                                                                    return res.sendStatus(300);
                                                                                } else {
                                                                                    return res.send(echoResponse(200, {total_like: d.length, liked: 1}, 'success', false));
                                                                                }
                                                                            });
                                                                        }
                                                                    });
                                                                }
                                                            });
                                                        }
                                                    });


                                                }
                                            });
                                        }
                                    }
                                })//
                            }
                        });
                    }
                });
                
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
/*********--------------------------*********
 **********------- COMMENTS ------*********
 **********--------------------------*********/
router.post('/comment/new', urlParser, function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                checkHavePost(res, req.body.posts_id, function(runOut){
                    if (runOut == true) {
                        isHavePermission(req.body.users_key, req.body.posts_id, function(isPermission){
                            if (isPermission == true) {
                                var value = [];
                                var insert = [];
                                for (var k in req.body) {
                                    if (k != 'access_token' && k != 'content' && k != 'time') {
                                        insert.push("`" + k + "`");
                                        value.push("'" + req.body[k] + "'");
                                    }
                                }
                                var currentTime = new Date().getTime();
                                var insertSQL = "INSERT INTO `comments`(" + insert.toString() + ",`content`,`time`) VALUES(" + value.toString() + ","+escapeSQL.escape(req.body.content)+",'"+currentTime+"')";
                                client.query(insertSQL, function (eInsert, dInsert, fInsert) {
                                    if (eInsert) {
                                        console.log(eInsert);
                                        return res.sendStatus(300);
                                    } else {
                                        console.log(req.body.users_key + " đã bình luận về bài viết " + req.body.posts_id);
                                        var selectCurrent = "SELECT `nickname`, `avatar` FROM `users` WHERE `key`='" + req.body.users_key + "'";
                                        client.query(selectCurrent, function (eCurrent, dCurrent, fCurrent) {
                                            if (eCurrent) {
                                                console.log(eCurrent);
                                                return res.sendStatus(300);
                                            } else {
                                                insertRelate(req.body.users_key, req.body.posts_id, function(successCall){
                                                    if (successCall) {
                                                        var selectRelate = "SELECT * FROM `notification_relate` WHERE `posts_id`='" + req.body.posts_id + "' AND `users_key`!='"+req.body.users_key+"'";
                                                        client.query(selectRelate, function (eRelate, dRelate, fRelate) {
                                                            if (eRelate) {
                                                                console.log(eRelate);
                                                                return res.sendStatus(300);
                                                            } else {
                                                                if (dRelate.length > 0) {
                                                                    async.forEachOf(dRelate, function (asyData, asyI, asyCallback) {
                                                                        isMyPost(dRelate[asyI].users_key, req.body.posts_id, function(result){
                                                                            if (result == true) {
                                                                                insertNotificationNoImage(req.body.users_key, dCurrent[0].nickname, dCurrent[0].avatar, 'comment', req.body.time, dRelate[asyI].users_key, req.body.posts_id);
                                                                                sendNotification(req.body.users_key, dRelate[asyI].users_key, "commented on your post", "comment",req.body.posts_id);
                                                                            } else {
                                                                                insertNotificationNoImage(req.body.users_key, dCurrent[0].nickname, dCurrent[0].avatar, 'comment', req.body.time, dRelate[asyI].users_key, req.body.posts_id);
                                                                                sendNotification(req.body.users_key, dRelate[asyI].users_key, "commented on their post", "comment",req.body.posts_id);
                                                                            }
                                                                        });
                                                                    });
                                                                }
                                                            }
                                                        });
                                                    }
                                                });
                                            }
                                        });
                                        return res.send(echoResponse(200, {
                                            users_key: req.body.users_key,
                                            posts_id: parseInt(req.body.posts_id,10),
                                            id: parseInt(dInsert.insertId, 10),
                                            type: req.body.type,
                                            time: req.body.time,
                                            content: req.body.content
                                        }, 'success', false));
                                    }
                                });
                            }
                        });
                    }
                });
                
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
router.post('/comment/update', urlParser, function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var insert = [];
                for (var k in req.body) {
                    if (k != 'access_token' && k!= 'content' && k != 'edited_time') {
                        insert.push("`" + k + "`=" + "'" + req.body[k] + "'");
                    }
                }
                var currentTime = new Date().getTime();
                var dataSQL = "UPDATE `comments` SET " + insert.toString() + ", `content`="+escapeSQL.escape(req.body.content)+", `time`='"+currentTime+"' WHERE `id`='" + req.body.id + "'";
                client.query(dataSQL, function (eInsert, dInsert, fInsert) {
                    if (eInsert) {
                        console.log(eInsert);
                        return res.sendStatus(300);
                    } else {
                        console.log(req.body.user_key + " sửa comments " + req.body.id + "");
                        return res.send(echoResponse(200, 'Update comment successfully.', 'success', false));
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});

router.post('/comment/delete', urlParser, function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var selectLike = "SELECT * FROM `comments` WHERE `users_key`='" + req.body.users_key + "' AND `id`='" + req.body.id + "' AND `posts_id`='" + req.body.posts_id + "'";
                client.query(selectLike, function (eLike, dLike, fLike) {
                    if (eLike) {
                        console.log(eLike);
                        return res.sendStatus(300);
                    } else {
                        if (dLike.length > 0) {
                            
                            var slSQL = "SELECT * FROM `comments` WHERE `users_key`='" + req.body.users_key + "' AND `posts_id`='" + req.body.posts_id + "'";
                            client.query(slSQL, function(eC, dC, fC){
                                if (eC) {
                                    console.log(eC);
                                    return res.sendStatus(300);
                                } else {
                                    if (dC.length > 0) {

                                    } else {
                                        var keyUserPost = "DELETE FROM `notification_feed` WHERE `posts_id`='" + req.body.posts_id + "' AND `friend_key`='" + req.body.users_key + "' AND `type`='comment'";
                                        client.query(keyUserPost, function (eNL, dNL, fNL) {
                                            if (eNL) {
                                                console.log(eNL);
                                                return res.sendStatus(300);
                                            } else {
                                                console.log(req.body.users_key + " xóa feed comment " + req.body.posts_id + "");
                                            }
                                        });
                                        var deleteRelate = "DELETE FROM `notification_relate` WHERE `posts_id`='" + req.body.posts_id + "' AND `users_key`='" + req.body.users_key + "'";
                                        client.query(deleteRelate);
                                    }
                                }
                            });
                            //--- delete noti
                            var deleteSQL = "DELETE FROM `comments` WHERE `users_key`='" + req.body.users_key + "' AND `id`='" + req.body.id + "'  AND `posts_id`='" + req.body.posts_id + "'";
                            client.query(deleteSQL, function (eInsert, dInsert, fInsert) {
                                if (eInsert) {
                                    console.log(eInsert);
                                    return res.sendStatus(300);
                                } else {
                                    console.log(req.body.users_key + " đã xóa comment " + req.body.id + "");
                                    return res.send(echoResponse(200, 'Deleted successfully.', 'success', false));
                                }
                            });
                        } else {
                            return res.send(echoResponse(404, 'This comment has been deleted in the past.', 'success', false));
                        }
                    }
                })

            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
router.post('/public', urlParser, function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var posts_id = req.body.id;
                var dataSQL = "UPDATE `posts` SET `is_active`=1 WHERE `id`='" + posts_id + "' AND `users_key`='"+req.body.users_key+"'";
                client.query(dataSQL, function (eInsert, dInsert, fInsert) {
                    if (eInsert) {
                        console.log(eInsert);
                        return res.sendStatus(300);
                    } else {
                        client.query("DELETE FROM `notification_feed` WHERE `posts_id`='"+posts_id+"' AND `users_key`='"+req.body.users_key+"' AND `type`='warning'", function(e, d, f){
                            if (e) {
                                console.log(e);
                            } else {
                                console.log(d);
                            }
                        });
                        sendNotificationToFriend(posts_id);
                        return res.send(echoResponse(200, 'Public post successfully.', 'success', false));
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
/*********--------------------------*********
 **********------- END ------*********
 **********--------------------------*********/
function isMyPost(users_key, posts_id, result) {
    var select = "SELECT * FROM `posts` WHERE `id`='" + posts_id + "'";
    client.query(select, function (error, data, fields) {
        if (error) {
            result(false, null);
        } else {
            if (data.length > 0) {
                if (data[0].users_key === users_key) {
                    result(true, data[0].users_key);
                } else {
                    result(false, data[0].users_key);
                }
            } else {
                result(false, null);
            }
        }
    });
}


function insertNotificationFeed(friend_key, nickname, avatar, image, type, time, users_key, posts_id) {
    var select = "SELECT * FROM `notification_feed` WHERE `friend_key`='" + friend_key + "' AND `users_key`='" + users_key + "' AND `posts_id`='" + posts_id + "' AND `type`='" + type + "'";
    client.query(select, function (eSelect, dSelect, fSelect) {
        if (eSelect) {
            console.log(eSelect);
        } else {
            if (dSelect.length > 0) {
                async.forEachOf(dSelect, function (data, i, callback) {
                    // if (dSelect[i].type === type) {
                        var update = "UPDATE `notification_feed` SET `nickname`='" + nickname + "',`avatar`='" + avatar + "', `time`='" + time + "', `is_seen`='0' WHERE `friend_key`='" + friend_key + "' AND `users_key`='" + users_key + "' AND `posts_id`='" + posts_id + "' AND `type`='" + type + "'";
                        client.query(update, function (e, d, r) {
                            if (e) {
                                console.log(e);
                            } else {
                                console.log(d);
                            }
                        });
                    // } else {
                    //     var insert = "INSERT INTO `notification_feed`(`friend_key`,`nickname`,`avatar`,`image`,`type`, `time`, `users_key`, `posts_id`)";
                    //     var value = "VALUES('" + friend_key + "'," + nickname + "','" + avatar + "','" + image + "','" + type + "','" + time + "','" + users_key + "','" + posts_id + "')";
                    //     client.query(insert + value, function (e, d, r) {
                    //         if (e) {
                    //             console.log(e);
                    //             return res.sendStatus(300);
                    //         } else {
                    //             console.log(d);
                    //         }
                    //     });
                    // }
                });
            } else {
                var insert = "INSERT INTO `notification_feed`(`friend_key`,`nickname`,`avatar`,`image`,`type`, `time`, `users_key`, `posts_id`)";
                var value = "VALUES('" + friend_key + "','" + nickname + "','" + avatar + "','" + image + "','" + type + "','" + time + "','" + users_key + "','" + posts_id + "')";
                client.query(insert + value, function (e, d, r) {
                    if (e) {
                        console.log(e);
                    } else {
                        console.log(d);
                    }
                });
            }
        }
    });
}


function isHavePermission(key, posts_id, isPermission) {
    var sqlPost = "SELECT * FROM `posts` WHERE `id`='"+posts_id+"'";
    client.query(sqlPost, function(e, d, f){
        if (e) {
            console.log(e);
            isPermission(false);
        } else {
            if (d.length > 0) {
                if (key == d[0].users_key) {
                    isPermission(true);
                } else {
                    if (d[0].permission == 0) {
                        isPermission(true);
                    } else if (d[0].permission == 1) {
                        isFriend(key, d[0].users_key, function(result){
                            if (result == true) {
                                isPermission(true);
                            } else {
                                isPermission(false);
                            }
                        });
                    } else {
                        var sql = "SELECT * FROM `permissions` WHERE `users_key`='" + key + "' AND `posts_id`='" + posts_id + "'";
                        client.query(sql, function (error, data, fields) {
                            if (error) {
                                console.log(error);
                                isPermission(false);
                            } else {
                                if (data.length > 0) {
                                    isPermission(true);
                                } else {
                                    isPermission(false);
                                }
                            }
                        });
                    }
                }
                
            } else {
                isPermission(false);
            }
        }
    });
}

function isFriend(users_key, friend_key, isFriend){
    var sql = "SELECT * FROM `contacts` WHERE `users_key`='" + users_key + "' AND `friend_key`='" + friend_key + "' OR `users_key`='" + friend_key + "' AND `friend_key`='" + users_key + "'";
    client.query(sql, function (error, data, fields) {
        if (error) {
            isFriend(false);
        } else {
            if (data.length > 0) {
                isFriend(true);
            } else {
                isFriend(false);
            }
        }
    });
}

function insertNotificationNoImage(friend_key, nickname, avatar, type, time, users_key, posts_id) {
    var select = "SELECT * FROM `notification_feed` WHERE `friend_key`='" + friend_key + "' AND `users_key`='" + users_key + "' AND `posts_id`='" + posts_id + "' AND `type`='" + type + "'";
    client.query(select, function (eSelect, dSelect, fSelect) {
        if (eSelect) {
            console.log(eSelect);
        } else {
            if (dSelect.length > 0) {
                async.forEachOf(dSelect, function (data, i, callback) {
                    var update = "UPDATE `notification_feed` SET `nickname`='" + nickname + "',`avatar`='" + avatar + "', `time`='" + time + "', `is_seen`='0' WHERE `friend_key`='" + friend_key + "' AND `users_key`='" + users_key + "' AND `posts_id`='" + posts_id + "' AND `type`='" + type + "'";
                    client.query(update, function (e, d, r) {
                        if (e) {
                            console.log(e);
                        } else {
                             console.log("OK Notification");
                        }
                    });
                });
            } else {
                var insert = "INSERT INTO `notification_feed`(`friend_key`,`nickname`,`avatar`,`type`, `time`, `users_key`, `posts_id`)";
                var value = "VALUES('" + friend_key + "','" + nickname + "','" + avatar + "','" + type + "','" + time + "','" + users_key + "','" + posts_id + "')";
                client.query(insert + value, function (e, d, r) {
                    if (e) {
                        console.log(e);
                    } else {
                        console.log("OK Notification");
                    }
                });
            }
        }
    });
}
function notificationWarning(users_key,posts_id) {
    var currentTime = new Date().getTime();
    var select = "SELECT * FROM `notification_feed` WHERE `users_key`='" + users_key + "' AND `type`='warning' AND `posts_id`='"+posts_id+"'";
    client.query(select, function (eSelect, dSelect, fSelect) {
        if (eSelect) {
            console.log(eSelect);
        } else {
            if (dSelect.length > 0) {
                async.forEachOf(dSelect, function (data, i, callback) {
                    var update = "UPDATE `notification_feed` SET `time`='" + currentTime + "', `is_seen`='0' WHERE `users_key`='" + users_key + "' AND `type`='warning'";
                    client.query(update, function (e, d, r) {
                        if (e) {
                            console.log(e);
                        } else {
                             console.log("OK Warning");
                        }
                    });
                });
            } else {
                var insert = "INSERT INTO `notification_feed`(`friend_key`,`nickname`,`avatar`,`type`, `time`, `users_key`, `posts_id`)";
                var value = "VALUES('','IUDI','" + avatarApp + "','warning','" + currentTime + "','" + users_key + "','"+posts_id+"')";
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
function notificationReport(users_key,posts_id) {
    var currentTime = new Date().getTime();
    var select = "SELECT * FROM `notification_feed` WHERE `users_key`='" + users_key + "' AND `type`='report' AND `posts_id`='"+posts_id+"'";
    client.query(select, function (eSelect, dSelect, fSelect) {
        if (eSelect) {
            console.log(eSelect);
        } else {
            if (dSelect.length > 0) {
                async.forEachOf(dSelect, function (data, i, callback) {
                    var update = "UPDATE `notification_feed` SET `time`='" + currentTime + "', `is_seen`='0' WHERE `posts_id`='" + posts_id + "' AND `users_key`='" + users_key + "' AND `type`='report'";
                    client.query(update, function (e, d, r) {
                        if (e) {
                            console.log(e);
                        } else {
                             console.log("OK Warning");
                        }
                    });
                });
            } else {
                var insert = "INSERT INTO `notification_feed`(`friend_key`,`nickname`,`avatar`,`type`, `time`, `users_key`, `posts_id`)";
                var value = "VALUES('','IUDI','" + avatarApp + "','report','" + currentTime + "','" + users_key + "','"+posts_id+"')";
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
function insertRelate(users_key, posts_id, callback) {
    var select = "SELECT * FROM `notification_relate` WHERE `users_key`='" + users_key + "' AND `posts_id`='" + posts_id + "'";
    client.query(select, function (eSelect, dSelect, fSelect) {
        if (eSelect) {
            console.log(eSelect);
            callback(false);
        } else {
            if (dSelect.length > 0) {
                callback(true);
            } else {
                var insert = "INSERT INTO `notification_relate`(`users_key`, `posts_id`)";
                var value = "VALUES('" + users_key + "','" + posts_id + "')";
                client.query(insert + value, function (e, d, r) {
                    if (e) {
                        console.log(e);
                    } else {
                        callback(true);
                    }
                });
            }
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
function sendWarning(receiver_key, posts_id){
    var notify = ", your recent post maybe contains invalid content, please check your email to verify.";
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
                        "posts_id": posts_id,
                        "content": 'Hello '+name+notify,
                        "type": "warning"
                    };
                                
                    apnService.send(note, dataNguoiNhan[0].device_token).then(result => {
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
                                posts_id: posts_id,
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
function sendReport(receiver_key, posts_id){
    var notify = ", your post has been reported. Please check email to justify your post. Thank you!";
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
                        "posts_id": posts_id,
                        "content": 'Hello '+name+notify,
                        "type": "warning",
                        title: 'IUDI',
                        body: 'Hello '+name+notify
                    };
                                
                    apnService.send(note, dataNguoiNhan[0].device_token).then(result => {
                        console.log("Send report post successfully");
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
                                posts_id: posts_id,
                                content: 'Hello '+name+notify,
                                type: "warning",
                                title: 'IUDI',
                                body: 'Hello '+name+notify
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

function checkHavePost(res, posts_id, callback){
    var sql = "SELECT * FROM `posts` WHERE `id`='"+posts_id+"'";
    client.query(sql, function(error, data, fields){
        if (error) {
            console.log(error);
            callback(false);
            return res.sendStatus(300);
        } else {
            if (data.length > 0) {
                callback(true);
            } else {
                callback(false);
                return res.send(echoResponse(404, 'This post has been delete or not exists.', 'success', true));
            }
        }
    });
}

function removeDuplicate(myArray){
    uniqueArray = myArray.filter(function(elem, pos) {
        return myArray.indexOf(elem) == pos;
    })
}

function isJsonString(str) {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}
/*********--------------------------*********
 **********------ ECHO RESPONSE -----*********
 **********--------------------------*********/
function echoResponse(status, data, message, error) {
    return JSON.stringify({
        status: status,
        data: data,
        message: message,
        error: error
    });
}


module.exports = router;