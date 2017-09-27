var express = require('express');
var router = express.Router();
var mysql = require('mysql');
var config = require('../config.js');
var bodyParser = require('body-parser');
var escapeSQL = require('sqlstring');
var jwt = require('jsonwebtoken');
var _ = require('lodash');
// parse application/x-www-form-urlencoded
var urlParser = bodyParser.urlencoded({extended: false});
// parse application/json
router.use(bodyParser.json());
var async = require('async');
//-- APNS
var apn = require('apn');
var apnService = new apn.Provider({
    cert: "certificates/cert.pem",
    key: "certificates/key.pem",
});
//-- FCM
var FCM = require('fcm-push');
var serverKey = 'AAAAww8tdbc:APA91bGypdYO0D0YTXiGEltVnswbmcoJAmj_GbA00WrRgUORrk7fdk2q3CKNi_wRHtcAbwYzXme3FDgkbsL-QBSlhxiATw-ax49uXtA6QDZRlGvyfNyup9G-NIAjZ7FGUAQEQgyktMQD';
var collapse_key = 'com.android.abc';
var fcm = new FCM(serverKey);
// 

let MOILANLAY = 10;

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
/*********--------------------------*********
 **********------- FUNCTION ------*********
 **********--------------------------*********/
// fillData();
// function fillData(){
//     var selectUser = "SELECT `key` FROM `users` WHERE `key` NOT IN (SELECT `users_key` FROM `notification_count`)";
//     client.query(selectUser, function(e, d, f){
//         if (e) {
//             console.log(e);
//         } else {
//             if (d.length > 0) {
//                 async.forEachOf(d, function(data, limit, call){
//                     var insert = "INSERT INTO `notification_count`(`users_key`) VALUES('"+d[limit].key+"')";
//                     client.query(insert);
//                 });
//             }
//         }
//     });
// }

router.get('/type=wall', function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var friend_key = req.body.friend_key || req.query.friend_key || req.params.friend_key;
                var key = req.body.key || req.query.key || req.params.key;
                var selectSQL = "SELECT * FROM `posts` WHERE `users_key`='" + friend_key + "' AND `is_active`='1'";
                    var orderBy = "ORDER BY `posted_time` DESC";
                    var tagsSQL = " OR `id` IN (SELECT `posts_id` FROM `tags` WHERE `users_key`='"+friend_key+"')";

                    client.query(selectSQL + tagsSQL + orderBy, function (ePost, post, fPost) {
                        if (ePost) {
                            console.log(ePost);
                            return res.sendStatus(300);
                        } else {
                            if (post.length > 0) {
                                var postID = [];
                                checkReadWall(post, key, function(isRead){
                                    if (isRead) {
                                        postID = isRead;
                                        console.log("Wall: "+ key);
                                        var last_post = req.body.last_post || req.query.last_post || req.params.last_post;
                                        if (last_post) {
                                            // Sắp xếp lại mảng theo ID, và lấy vị trí bài cuối client gửi lên.
                                            postID = _.sortBy(postID);
                                            postID.reverse();
                                            var last = postID.indexOf(parseInt(last_post));
                                            // Vị trí bài đầu tiên
                                            var vitribaidautien = last+1;
                                            // Nếu vị trí bài cuối truyền lên mà bằng chính độ dài của mảng trừ đi 1
                                            // Tức là bài viết cuối cùng trong mảng, thì trả về không còn bài nào.
                                            if (last === postID.length - 1) {
                                                return res.send(echoResponse(404, 'No posts', 'success', true));
                                            }
                                            var vitribaicuoi;
                                            if (last+MOILANLAY < postID.length) {
                                                // Nếu mà vị trí bài cuối cần lấy mà nhỏ hơn độ dài của mảng đó
                                                // Thì bài cuối sẽ bằng vị trí bài cuối truyền lên + mỗi lần lấy
                                                vitribaicuoi = last+MOILANLAY;
                                            } else {
                                                // Vì vị trí của bài cuối nhỏ hơn độ dài của mảng
                                                // Nên vị trí của bài cuối bằng độ dài của mảng trừ đi 1
                                                vitribaicuoi = postID.length-1;
                                            }
                                            var listPost = [];
                                            async.forEachOf(postID, function(element, index, call){
                                                if (index >= vitribaidautien && index <= vitribaicuoi) {
                                                    getPost(postID[index], key, function(onepost){
                                                        listPost.push(onepost);
                                                        if (index === vitribaicuoi) {
                                                            return res.send(echoResponse(200, listPost, 'success', true));
                                                        }
                                                    });
                                                }
                                            });
                                        } else {
                                            postID = _.sortBy(postID);
                                            postID.reverse();
                                            var vitribaicuoi;
                                            if (MOILANLAY < postID.length) {
                                                // Nếu mà vị trí bài cuối cần lấy mà nhỏ hơn độ dài của mảng đó
                                                // Thì bài cuối sẽ bằng vị trí bài cuối truyền lên + mỗi lần lấy
                                                vitribaicuoi = MOILANLAY;
                                            } else {
                                                // Vì vị trí của bài cuối nhỏ hơn độ dài của mảng
                                                // Nên vị trí của bài cuối bằng độ dài của mảng trừ đi 1
                                                vitribaicuoi = postID.length-1;
                                            }
                                            var listPost = [];
                                            async.forEachOf(postID, function(element, index, call){
                                                if (index <= vitribaicuoi) {
                                                    getPost(postID[index], key, function(onepost){
                                                        listPost.push(onepost);
                                                        if (index === vitribaicuoi) {
                                                            return res.send(echoResponse(200, listPost, 'success', true));
                                                        }
                                                    });
                                                }
                                            });
                                        }
                                        //--- end async
                                    }
                                });
                                
                            } else {
                                return res.send(echoResponse(404, 'No post.', 'success', true));
                            }
                        }
                    });
                // });


            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});


router.get('/type=albums', function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var friend_key = req.body.friend_key || req.query.friend_key || req.params.friend_key;
                var key = req.body.key || req.query.key || req.params.key;
                var selectSQL;

                isFriendCheck(key, friend_key, function (isFriend) {
                    if (isFriend === true) {
                        selectSQL = "SELECT * FROM `posts` WHERE `users_key`='" + friend_key + "' AND `is_active`='1'";
                    } else {
                        selectSQL = "SELECT * FROM `posts` WHERE `users_key`='" + friend_key + "' AND `permission`='0' AND `is_active`='1'";
                    }
                    var haveImage = " AND `id` IN (SELECT `posts_id` FROM `store_images` WHERE `users_key`='" + friend_key + "')";
                    var tagsSQL = " OR `id` IN (SELECT `posts_id` FROM `tags` WHERE `users_key`='"+friend_key+"')";
                    var orderBy = "ORDER BY `posted_time` DESC";
                    client.query(selectSQL + haveImage + tagsSQL + orderBy, function (ePost, post, fPost) {
                        if (ePost) {
                            console.log(ePost);
                            return res.sendStatus(300);
                        } else {
                            if (post.length > 0) {
                                var postID = [];
                                var postArray = [];
                                checkReadWall(post, key, function(isRead){
                                    if (isRead) {
                                        checkPostImage(isRead, function(data_image){
                                            postID = data_image;
                                            // 
                                            var moi_lan_lay = 10;
                                            var last_post = req.body.last_post || req.query.last_post || req.params.last_post;
                                            if (last_post) {
                                                var vi_tri_bai_cuoi = postID.indexOf(parseInt(last_post));
                                                var post_list = postID.slice(vi_tri_bai_cuoi+1,vi_tri_bai_cuoi+moi_lan_lay);
                                                console.log(post_list);
                                                if (post_list.length == 0) {
                                                    return res.send(echoResponse(404, 'No have image.', 'success', true));
                                                }
                                                getImage(post_list, function(list_images){
                                                    if (list_images && list_images.length > 0) {
                                                        return res.send(echoResponse(200, list_images, 'success', false));
                                                    } else {
                                                        return res.send(echoResponse(404, 'No have image.', 'success', true));
                                                    }
                                                });
                                            } else {
                                                var post_list = postID.slice(0,moi_lan_lay);
                                                console.log(post_list);
                                                if (post_list.length == 0) {
                                                    return res.send(echoResponse(404, 'No have image.', 'success', true));
                                                }
                                                getImage(post_list, function(list_images){
                                                    if (list_images && list_images.length > 0) {
                                                        return res.send(echoResponse(200, list_images, 'success', false));
                                                    } else {
                                                        return res.send(echoResponse(404, 'No have image.', 'success', true));
                                                    }
                                                });
                                            }
                                        });
                                    }
                                });
                            } else {
                                return res.send(echoResponse(404, 'This post does not exists', 'success', true));
                            }
                        }
                    });
                });


            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
router.get('/type=albumscount', function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var friend_key = req.body.friend_key || req.query.friend_key || req.params.friend_key;
                var key = req.body.key || req.query.key || req.params.key;
                var selectSQL;
                var currentUser = "SELECT `nickname`,`avatar` FROM `users` WHERE `key`='"+key+"'";
                client.query(currentUser, function(eCurrent, dCurrent, fCurren){
                    if (eCurrent) {
                        console.log(eCurrent);
                    } else {
                        // Insert Notification
                        var currentTime = new Date().getTime();
                        insertNotificationNoImage(key, dCurrent[0].nickname, dCurrent[0].avatar, "seen", currentTime, friend_key, 0);
                        sendNotification(key, friend_key, "has seen your profile", "seen", null);
                        //-----
                    }
                });

                isFriendCheck(key, friend_key, function (isFriend) {
                    if (isFriend === true) {
                        selectSQL = "SELECT * FROM `posts` WHERE `users_key`='" + friend_key + "' AND `is_active`='1'";
                    } else {
                        selectSQL = "SELECT * FROM `posts` WHERE `users_key`='" + friend_key + "' AND `permission`='0' AND `is_active`='1'";
                    }
                    var haveImage = " AND `id` IN (SELECT `posts_id` FROM `store_images` WHERE `users_key`='" + friend_key + "')";
                    var tagsSQL = " OR `id` IN (SELECT `posts_id` FROM `tags` WHERE `users_key`='"+friend_key+"')";
                    var orderBy = "AND `type`!='text' ORDER BY `posted_time` DESC";
                    client.query(selectSQL + haveImage + tagsSQL + orderBy, function (ePost, post, fPost) {
                        if (ePost) {
                            console.log(ePost);
                            return res.sendStatus(300);
                        } else {
                            if (post.length > 0) {
                                var postID = [];
                                var postArray = [];
                                checkReadWall(post, key, function(isRead){
                                    if (isRead) {
                                        postID = isRead;
                                        var limit;
                                        if (postID.length > 0) {
                                            getImageCount(postID, function(number){
                                                return res.send(echoResponse(200, number, 'success', false));
                                            });
                                        } else {
                                            return res.send(echoResponse(404, 'No image', 'success', true));
                                        }
                                        //--- end async
                                    }
                                });
                            } else {
                                return res.send(echoResponse(404, 'This post does not exists', 'success', true));
                            }
                        }
                    });
                });


            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
function isHavePermission(key, post, limit, isPermission) {
    if (post[limit].permission === 2) {
        var sql = "SELECT * FROM `permissions` WHERE `users_key`='" + key + "' AND `posts_id`='" + post[limit].id + "'";
        client.query(sql, function (error, data, fields) {
            if (error) {
                isPermission(false);
            } else {
                if (data.length > 0) {
                    isPermission(true);
                } else {
                    isPermission(false);
                }
            }
        });
    } else {
        isPermission(true);
    }
}
function isFriendCheck(key, friend_key, isFriend) {
    var sql = "SELECT * FROM `contacts` WHERE `users_key`='" + key + "' AND `friend_key`='" + friend_key + "' OR `users_key`='" + friend_key + "' AND `friend_key`='" + key + "'";
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
////****** FUNC GET BASE DATA -------


router.get('/type=mywall', function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var key = req.body.key || req.query.key || req.params.key;
                var selectSQL = "SELECT * FROM `posts` WHERE `users_key`='" + key + "' AND `is_active`='1'";
                var tagsSQL = " OR `id` IN (SELECT `posts_id` FROM `tags` WHERE `users_key`='"+key+"')";
                var orderBy = "ORDER BY `posted_time` DESC";
                client.query(selectSQL + tagsSQL + orderBy, function (ePost, post, fPost) {
                    if (ePost) {
                        console.log(ePost);
                        return res.sendStatus(300);
                    } else {
                        if (post.length > 0) {
                            var postID = [];
                            console.log("Mywall: "+ key);
                            var last_post = req.body.last_post || req.query.last_post || req.params.last_post;
                            if (last_post) {
                                async.forEachOf(post, function (dataLimit, i, callLimit) {
                                    postID.push(post[i].id);
                                    if (i === post.length-1) {
                                        // Sắp xếp lại mảng theo ID, và lấy vị trí bài cuối client gửi lên.
                                        postID = _.sortBy(postID);
                                        postID.reverse();
                                        var last = postID.indexOf(parseInt(last_post));
                                        // Vị trí bài đầu tiên
                                        var vitribaidautien = last+1;
                                        // Nếu vị trí bài cuối truyền lên mà bằng chính độ dài của mảng trừ đi 1
                                        // Tức là bài viết cuối cùng trong mảng, thì trả về không còn bài nào.
                                        if (last === postID.length - 1) {
                                            return res.send(echoResponse(404, 'No posts', 'success', true));
                                        }
                                        var vitribaicuoi;
                                        if (last+MOILANLAY < postID.length) {
                                            // Nếu mà vị trí bài cuối cần lấy mà nhỏ hơn độ dài của mảng đó
                                            // Thì bài cuối sẽ bằng vị trí bài cuối truyền lên + mỗi lần lấy
                                            vitribaicuoi = last+MOILANLAY;
                                        } else {
                                            // Vì vị trí của bài cuối nhỏ hơn độ dài của mảng
                                            // Nên vị trí của bài cuối bằng độ dài của mảng trừ đi 1
                                            vitribaicuoi = postID.length-1;
                                        }
                                        var listPost = [];
                                        async.forEachOf(postID, function(element, index, call){
                                            if (index >= vitribaidautien && index <= vitribaicuoi) {
                                                getPost(postID[index], key, function(onepost){
                                                    listPost.push(onepost);
                                                    if (index === vitribaicuoi) {
                                                        return res.send(echoResponse(200, listPost, 'success', true));
                                                    }
                                                });
                                            }
                                        });
                                    }
                                });
                            } else {
                                async.forEachOf(post, function (dataLimit, i, callLimit) {
                                    postID.push(post[i].id);
                                    if (i === post.length-1) {
                                        postID = _.sortBy(postID);
                                        postID.reverse();
                                        var vitribaicuoi;
                                        if (MOILANLAY < postID.length) {
                                            // Nếu mà vị trí bài cuối cần lấy mà nhỏ hơn độ dài của mảng đó
                                            // Thì bài cuối sẽ bằng vị trí bài cuối truyền lên + mỗi lần lấy
                                            vitribaicuoi = MOILANLAY;
                                        } else {
                                            // Vì vị trí của bài cuối nhỏ hơn độ dài của mảng
                                            // Nên vị trí của bài cuối bằng độ dài của mảng trừ đi 1
                                            vitribaicuoi = postID.length-1;
                                        }
                                        var listPost = [];
                                        async.forEachOf(postID, function(element, index, call){
                                            if (index <= vitribaicuoi) {
                                                getPost(postID[index], key, function(onepost){
                                                    listPost.push(onepost);
                                                    if (index === vitribaicuoi) {
                                                        return res.send(echoResponse(200, listPost, 'success', true));
                                                    }
                                                });
                                            }
                                        });
                                    }
                                });
                            }
                        } else {
                            return res.send(echoResponse(404, 'No post.', 'success', true));
                        }
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
router.get('/type=myalbums', function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var key = req.body.key || req.query.key || req.params.key;
                var selectSQL = "SELECT * FROM `posts` WHERE `users_key`='" + key + "' AND `is_active`='1'";
                var haveImage = " AND `id` IN (SELECT `posts_id` FROM `store_images` WHERE `users_key`='" + key + "')";
                var tagsSQL = " OR `id` IN (SELECT `posts_id` FROM `tags` WHERE `users_key`='"+key+"')";
                var orderBy = "AND `type`!='text' ORDER BY `posted_time` DESC";
                client.query(selectSQL + haveImage + tagsSQL +orderBy, function (ePost, post, fPost) {
                    if (ePost) {
                        console.log(ePost);
                        return res.sendStatus(300);
                    } else {
                        if (post.length > 0) {
                            var postID = [];
                            var arrayPost = [];
                            async.forEachOf(post, function (dataLimit, iLimit, callLimit) {
                                arrayPost.push(post[iLimit].id);
                                if (iLimit === post.length - 1) {
                                    checkPostImage(arrayPost, function(data_image){
                                        postID = data_image;
                                        // 
                                        var moi_lan_lay = 10;
                                        var last_post = req.body.last_post || req.query.last_post || req.params.last_post;
                                        if (last_post) {
                                            var vi_tri_bai_cuoi = postID.indexOf(parseInt(last_post));
                                            var post_list = postID.slice(vi_tri_bai_cuoi+1,vi_tri_bai_cuoi+moi_lan_lay);
                                            console.log(post_list);
                                            if (post_list.length == 0) {
                                                return res.send(echoResponse(404, 'No have image.', 'success', true));
                                            }
                                            getImage(post_list, function(list_images){
                                                if (list_images && list_images.length > 0) {
                                                    return res.send(echoResponse(200, list_images, 'success', false));
                                                } else {
                                                    return res.send(echoResponse(404, 'No have image.', 'success', true));
                                                }
                                            });
                                        } else {
                                            var post_list = postID.slice(0,moi_lan_lay);
                                            console.log(post_list);
                                            if (post_list.length == 0) {
                                                return res.send(echoResponse(404, 'No have image.', 'success', true));
                                            }
                                            getImage(post_list, function(list_images){
                                                if (list_images && list_images.length > 0) {
                                                    return res.send(echoResponse(200, list_images, 'success', false));
                                                } else {
                                                    return res.send(echoResponse(404, 'No have image.', 'success', true));
                                                }
                                            });
                                        }
                                    });
                                }
                            });
                        } else {
                            return res.send(echoResponse(404, 'This post does not exists', 'success', true));
                        }
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
// AVATAR
router.get('/type=avatar', function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var key = req.body.key || req.query.key || req.params.key;
                var selectSQL = "SELECT * FROM `posts` WHERE `users_key`='" + key + "'";
                var orderBy = "ORDER BY `posted_time` DESC";
                client.query(selectSQL + orderBy, function (ePost, post, fPost) {
                    if (ePost) {
                        console.log(ePost);
                        return res.sendStatus(300);
                    } else {
                        if (post.length > 0) {
                                var postID = [];
                                var postArray = [];
                                console.log("Feeds: "+ key);
                                checkReadWall(post, key, function(isRead){
                                    if (isRead) {
                                        postID = isRead;
                                        var last_post = req.body.last_post || req.query.last_post || req.params.last_post;
                                        if (last_post) {
                                            // Sắp xếp lại mảng theo ID, và lấy vị trí bài cuối client gửi lên.
                                            postID = _.sortBy(postID);
                                            postID.reverse();
                                            var last = postID.indexOf(parseInt(last_post));
                                            // Vị trí bài đầu tiên
                                            var vitribaidautien = last+1;
                                            // Nếu vị trí bài cuối truyền lên mà bằng chính độ dài của mảng trừ đi 1
                                            // Tức là bài viết cuối cùng trong mảng, thì trả về không còn bài nào.
                                            if (last === postID.length - 1) {
                                                return res.send(echoResponse(404, 'No posts', 'success', true));
                                            }
                                            var vitribaicuoi;
                                            if (last+MOILANLAY < postID.length) {
                                                // Nếu mà vị trí bài cuối cần lấy mà nhỏ hơn độ dài của mảng đó
                                                // Thì bài cuối sẽ bằng vị trí bài cuối truyền lên + mỗi lần lấy
                                                vitribaicuoi = last+MOILANLAY;
                                            } else {
                                                // Vì vị trí của bài cuối nhỏ hơn độ dài của mảng
                                                // Nên vị trí của bài cuối bằng độ dài của mảng trừ đi 1
                                                vitribaicuoi = postID.length-1;
                                            }
                                            var listPost = [];
                                            async.forEachOf(postID, function(element, index, call){
                                                if (index >= vitribaidautien && index <= vitribaicuoi) {
                                                    getPost(postID[index], key, function(onepost){
                                                        listPost.push(onepost);
                                                        if (index === vitribaicuoi) {
                                                            return res.send(echoResponse(200, listPost, 'success', true));
                                                        }
                                                    });
                                                }
                                            });
                                        } else {
                                            postID = _.sortBy(postID);
                                            postID.reverse();
                                            var vitribaicuoi;
                                            if (MOILANLAY < postID.length) {
                                                // Nếu mà vị trí bài cuối cần lấy mà nhỏ hơn độ dài của mảng đó
                                                // Thì bài cuối sẽ bằng vị trí bài cuối truyền lên + mỗi lần lấy
                                                vitribaicuoi = MOILANLAY;
                                            } else {
                                                // Vì vị trí của bài cuối nhỏ hơn độ dài của mảng
                                                // Nên vị trí của bài cuối bằng độ dài của mảng trừ đi 1
                                                vitribaicuoi = postID.length-1;
                                            }
                                            var listPost = [];
                                            async.forEachOf(postID, function(element, index, call){
                                                if (index <= vitribaicuoi) {
                                                    getPost(postID[index], key, function(onepost){
                                                        listPost.push(onepost);
                                                        if (index === vitribaicuoi) {
                                                            return res.send(echoResponse(200, listPost, 'success', true));
                                                        }
                                                    });
                                                }
                                            });
                                        }
                                        //--- end async
                                    }
                                });
                        } else {
                            return res.send(echoResponse(404, 'No posts', 'success', true));
                        }
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
// END AVATAR
router.get('/type=myalbumscount', function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var key = req.body.key || req.query.key || req.params.key;
                var selectSQL = "SELECT * FROM `posts` WHERE `users_key`='" + key + "' AND `is_active`='1'";
                var haveImage = " AND `id` IN (SELECT `posts_id` FROM `store_images` WHERE `users_key`='" + key + "')";
                var tagsSQL = " OR `id` IN (SELECT `posts_id` FROM `tags` WHERE `users_key`='"+key+"')";
                var orderBy = "AND `type`!='text' ORDER BY `posted_time` DESC";
                client.query(selectSQL + haveImage + tagsSQL +orderBy, function (ePost, post, fPost) {
                    if (ePost) {
                        console.log(ePost);
                        return res.sendStatus(300);
                    } else {
                        if (post.length > 0) {
                            var postID = [];
                            async.forEachOf(post, function (dataLimit, iLimit, callLimit) {
                                postID.push(post[iLimit].id);
                                if (iLimit === post.length - 1) {
                                    if (postID.length > 0) {
                                        getImageCount(postID, function(number){
                                            return res.send(echoResponse(200, number, 'success', false));
                                        });
                                    } else {
                                        return res.send(echoResponse(404, 'No image', 'success', true));
                                    }
                                }
                            });

                        } else {
                            return res.send(echoResponse(404, 'This post does not exists', 'success', true));
                        }
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
router.get('/type=feeds', function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var key = req.body.key || req.query.key || req.params.key;
                var selectSQL = "SELECT * FROM `posts` WHERE `users_key`='" + key + "' OR `users_key` IN (SELECT `friend_key` FROM `contacts` WHERE `users_key`='" + key + "') AND `is_active`='1'";
                var tagsSQL = " OR `id` IN (SELECT `posts_id` FROM `tags` WHERE `users_key`='"+key+"')";
                var orderBy = "ORDER BY `posted_time` DESC";
                client.query(selectSQL + tagsSQL + orderBy, function (ePost, post, fPost) {
                    if (ePost) {
                        console.log(ePost);
                        return res.sendStatus(300);
                    } else {
                        if (post.length > 0) {
                                var postID = [];
                                var postArray = [];
                                console.log("Feeds: "+ key);
                                checkReadWall(post, key, function(isRead){
                                    if (isRead) {
                                        postID = isRead;
                                        var last_post = req.body.last_post || req.query.last_post || req.params.last_post;
                                        if (last_post) {
                                            // Sắp xếp lại mảng theo ID, và lấy vị trí bài cuối client gửi lên.
                                            postID = _.sortBy(postID);
                                            postID.reverse();
                                            var last = postID.indexOf(parseInt(last_post));
                                            // Vị trí bài đầu tiên
                                            var vitribaidautien = last+1;
                                            // Nếu vị trí bài cuối truyền lên mà bằng chính độ dài của mảng trừ đi 1
                                            // Tức là bài viết cuối cùng trong mảng, thì trả về không còn bài nào.
                                            if (last === postID.length - 1) {
                                                return res.send(echoResponse(404, 'No posts', 'success', true));
                                            }
                                            var vitribaicuoi;
                                            if (last+MOILANLAY < postID.length) {
                                                // Nếu mà vị trí bài cuối cần lấy mà nhỏ hơn độ dài của mảng đó
                                                // Thì bài cuối sẽ bằng vị trí bài cuối truyền lên + mỗi lần lấy
                                                vitribaicuoi = last+MOILANLAY;
                                            } else {
                                                // Vì vị trí của bài cuối nhỏ hơn độ dài của mảng
                                                // Nên vị trí của bài cuối bằng độ dài của mảng trừ đi 1
                                                vitribaicuoi = postID.length-1;
                                            }
                                            var listPost = [];
                                            async.forEachOf(postID, function(element, index, call){
                                                if (index >= vitribaidautien && index <= vitribaicuoi) {
                                                    getPost(postID[index], key, function(onepost){
                                                        listPost.push(onepost);
                                                        if (index === vitribaicuoi) {
                                                            return res.send(echoResponse(200, listPost, 'success', true));
                                                        }
                                                    });
                                                }
                                            });
                                        } else {
                                            postID = _.sortBy(postID);
                                            postID.reverse();
                                            var vitribaicuoi;
                                            if (MOILANLAY < postID.length) {
                                                // Nếu mà vị trí bài cuối cần lấy mà nhỏ hơn độ dài của mảng đó
                                                // Thì bài cuối sẽ bằng vị trí bài cuối truyền lên + mỗi lần lấy
                                                vitribaicuoi = MOILANLAY;
                                            } else {
                                                // Vì vị trí của bài cuối nhỏ hơn độ dài của mảng
                                                // Nên vị trí của bài cuối bằng độ dài của mảng trừ đi 1
                                                vitribaicuoi = postID.length-1;
                                            }
                                            var listPost = [];
                                            async.forEachOf(postID, function(element, index, call){
                                                if (index <= vitribaicuoi) {
                                                    getPost(postID[index], key, function(onepost){
                                                        listPost.push(onepost);
                                                        if (index === vitribaicuoi) {
                                                            return res.send(echoResponse(200, listPost, 'success', true));
                                                        }
                                                    });
                                                }
                                            });
                                        }
                                        //--- end async
                                    }
                                });
                        } else {
                            return res.send(echoResponse(404, 'No posts', 'success', true));
                        }
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});



router.get('/type=badge', function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'];
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                var key = req.body.key || req.query.key || req.params.key;
                var userSQL = "SELECT * FROM `notification_feed` INNER JOIN `notification_refresh` ON `notification_feed`.`users_key` = '"+key+"' AND `notification_feed`.`users_key` = notification_refresh.users_key AND `notification_feed`.`time` > `notification_refresh`.`time`";
                client.query(userSQL, function(error, data, fields){
                    if (error) {
                        console.log(error);
                        return res.sendStatus(300);
                    } else {
                        if (data.length > 0) {
                            return res.send(echoResponse(200,data.length,'success',false));
                        } else {
                            return res.send(echoResponse(404,'No have notification.','success',true));
                        }
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});

function checkReadWall(list_post, users_key, isRead){
    var baivietcoquyen = [];
    async.forEachOf(list_post, function(element, i, callback){
            var sql = "SELECT `posts_id` FROM `permissions` WHERE `users_key`='"+users_key+"' AND `posts_id`='"+list_post[i].id+"'";
            client.query(sql, function(error, data, fields){
                if (error) {
                    console.log(error);
                    isRead(null);
                } else {
                    var sqlPost = "SELECT `users_key` FROM `posts` WHERE `id`='"+list_post[i].id+"'";
                    client.query(sqlPost, function(eGet, dGet, FG){
                        if (eGet) {
                            console.log(eGet);
                            isRead(null);
                        } else {
                            isFriendCheck(users_key, dGet[0].users_key, function (isFriend){
                                if (data.length > 0) {
                                    baivietcoquyen.push(data[0].posts_id);
                                } else {
                                    if (list_post[i].permission != 2) {
                                        if (list_post[i].permission == 1) {
                                            if (isFriend == true) {
                                                baivietcoquyen.push(list_post[i].id);
                                            }
                                        } else {
                                            baivietcoquyen.push(list_post[i].id);
                                        }
                                    }
                                }
                                if (i === list_post.length-1) {
                                    isRead(baivietcoquyen); 
                                }
                            });
                        }
                    });
                }
            });
    });
}
function checkPostImage(list_post, isRead){
    var baivietanh = [];
    async.forEachOf(list_post, function(element, i, callback){
        var sql = "SELECT * FROM `posts` WHERE `id`='"+element+"'";
        client.query(sql, function(error, data, fields){
            if (error) {
                isRead(null);
            } else {
                if (data.length > 0) {
                    if (data[0].type == 'photo' || data[0].type == 'albums') {
                        baivietanh.push(data[0].id);
                    }
                } else {
                    isRead(null);
                }
                if (i == list_post.length-1) {
                    isRead(baivietanh);
                }
            }
        });
    });
}
// Dựa vào một list ID các bài viết để 
// kiểm tra xem người dùng đó có quyền đọc không
function checkRead(list_post, users_key, isRead){
    var baivietcoquyen = [];
    async.forEachOf(list_post, function(element, i, callback){
            var sql = "SELECT `posts_id` FROM `permissions` WHERE `users_key`='"+users_key+"' AND `posts_id`='"+list_post[i].id+"'";
            client.query(sql, function(error, data, fields){
                if (error) {
                    console.log(error);
                } else {                    
                    if (data.length > 0) {
                        baivietcoquyen.push(data[0].posts_id);
                    } else if (list_post[i].permission != 2) {
                        baivietcoquyen.push(list_post[i].id);
                    }

                    if (i === list_post.length-1) {
                        isRead(baivietcoquyen); 
                    }
                }
            });
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
                var value = "VALUES('" + friend_key + "','" + nickname + "','" + avatar + "'," + escapeSQL.escape(type) + "," + escapeSQL.escape(time) + ",'" + users_key + "','" + posts_id + "')";
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

function getImage(list_posts, callback){
    var postArray = [];
    async.forEachOf(list_posts, function(element, j , call){
        var slqImage = "SELECT * FROM `store_images` WHERE `posts_id`='"+list_posts[j]+"'";
        client.query(slqImage, function(eImage, dataImage, fielsImage){
            if (eImage) {
                console.log(eImage);
                callback(postArray);
            } else {
                console.log(slqImage);
                async.forEachOf(dataImage, function(data, i, callData){
                    if (dataImage[i]) {
                        dataImage[i].posts_id = list_posts[j];
                        postArray.push(dataImage[i]);
                    }
                });
                if (j === list_posts.length-1) {
                    callback(postArray);
                }
            }
        });
    });
}
function getImageURL(list_posts, data){
    var list_url = [];
    async.forEachOf(list_posts, function(element, i, callback){
        var sql = "SELECT * FROM `store_images` WHERE `posts_id`='"+list_posts[i]+"'";
        client.query(sql, function(error, dataImage, fields){
            if (error) {
                data(list_url);
            } else {
                async.forEachOf(dataImage, function(dataImage, j, call){
                    if (dataImage[i]) {
                        dataImage[i].posts_id = postID[iPost];
                        list_url.push(dataImage[i]);
                    }
                    if (i === list_posts.length-1) {
                        if (j === dataImage.length-1) {
                            data(list_url);
                        }
                    }
                });
            }
        });
    });
}
function sortNumber(a,b) {
    return a - b;
}
function getImageCount(list_posts, number){
    var total = 0;
    async.forEachOf(list_posts, function(element, i, callback){
        var sql = "SELECT * FROM `store_images` WHERE `posts_id`='"+list_posts[i]+"'";
        client.query(sql, function(error, data, fields){
            if (error) {
                number(0);
            } else {
                total = total + data.length;
                if (i === list_posts.length-1) {
                    number(total);
                }
            }
        });
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
function getBaseInformationPost(key, res, postID, iPost, limit, postArray) {
    var postSQL = "SELECT * FROM `posts` WHERE `id`='" + postID[iPost] + "'";
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
                                var selectAlbums = "SELECT `id`,`img_url`,`img_height`,`img_width` FROM `store_images` WHERE `posts_id`='" + postID[iPost] + "'";
                                client.query(selectAlbums, function (eAlbums, albums, fAlbums) {
                                    if (eAlbums) {
                                        console.log(eAlbums);
                                    } else {
                                        post[0].albums = albums;
                                        // VIDEO ALBUMS
                                        var selectVideo = "SELECT `video_url` FROM `store_videos` WHERE `posts_id`='" + postID[iPost] + "'";
                                        client.query(selectVideo, function (eVideo, video, fVideo) {
                                            if (eVideo) {
                                                console.log(eVideo);
                                            } else {
                                                post[0].video = video;
                                                // LIKE LIST
                                                var selectLike = "SELECT `users_key` FROM `likes` WHERE `posts_id`='" + postID[iPost] + "'";
                                                client.query(selectLike, function (eLike, like, fLike) {
                                                    if (eLike) {
                                                        console.log(eLike);
                                                    } else {
                                                        post[0].count_like = like.length;
                                                        checkLiked(key, postID[iPost], function(liked){
                                                            post[0].is_liked = liked;
                                                            // Comment LIST
                                                            var selectComment = "SELECT * FROM `comments` WHERE `posts_id`='" + postID[iPost] + "'";
                                                            client.query(selectComment, function (eComment, comment, fComment) {
                                                                if (eComment) {
                                                                    console.log(eComment);
                                                                    return res.sendStatus(300);
                                                                } else {
                                                                    post[0].count_comment = comment.length;
                                                                    postArray.push(post[0]);
                                                                    //console.log(iPost + "++" + limit);
                                                                    if (iPost === limit - 1) {
                                                                        return res.send(echoResponse(200, postArray, 'success', false));
                                                                    }
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
            if (iPost === limit - 1) {
                return res.send(echoResponse(200, postArray, 'success', false));
            }
        }
            

        }
    });

}
function getPost(id, key, callback) {
    var postSQL = "SELECT * FROM `posts` WHERE `id`='" + id + "'";
    client.query(postSQL, function (errorPost, post, fiPost) {
        if (errorPost) {
            callback(null);
        } else {
            if (post.length > 0) {
                var selectCurrent = "SELECT `nickname`,`avatar` FROM `users` WHERE `key`='" + post[0].users_key + "'";
                client.query(selectCurrent, function (eCurrent, dataCurrent, fieldCurrent) {
                if (eCurrent) {
                    callback(null);
                } else {
                    if (dataCurrent.length > 0) {
                        post[0].avatar = dataCurrent[0].avatar;
                        post[0].nickname = dataCurrent[0].nickname;
                        // TAGED USERS
                        var selectTags = "SELECT `key`,`nickname`,`avatar` FROM `users` WHERE `key` IN (SELECT `users_key` FROM `tags` WHERE `posts_id`='" + id + "')";
                        client.query(selectTags, function (eTag, tags, fTag) {
                            if (eTag) {
                                callback(null);
                            } else {
                                post[0].tags = tags;
                                // IMAGES ALBUMS
                                var selectAlbums = "SELECT `id`,`img_url`,`img_height`,`img_width` FROM `store_images` WHERE `posts_id`='" + id + "'";
                                client.query(selectAlbums, function (eAlbums, albums, fAlbums) {
                                    if (eAlbums) {
                                        callback(null);
                                    } else {
                                        post[0].albums = albums;
                                        // VIDEO ALBUMS
                                        var selectVideo = "SELECT `video_url` FROM `store_videos` WHERE `posts_id`='" + id + "'";
                                        client.query(selectVideo, function (eVideo, video, fVideo) {
                                            if (eVideo) {
                                                callback(null);
                                            } else {
                                                post[0].video = video;
                                                // LIKE LIST
                                                var selectLike = "SELECT `users_key` FROM `likes` WHERE `posts_id`='" + id + "'";
                                                client.query(selectLike, function (eLike, like, fLike) {
                                                    if (eLike) {
                                                        callback(null);
                                                    } else {
                                                        post[0].count_like = like.length;
                                                        checkLiked(key, id, function(liked){
                                                            post[0].is_liked = liked;
                                                            // Comment LIST
                                                            var selectComment = "SELECT * FROM `comments` WHERE `posts_id`='" + id + "'";
                                                            client.query(selectComment, function (eComment, comment, fComment) {
                                                                if (eComment) {
                                                                    console.log(eComment);
                                                                    return res.sendStatus(300);
                                                                } else {
                                                                    post[0].count_comment = comment.length;
                                                                    callback(post[0]);
                                                                }
                                                            });
                                                        });
                                                    }
                                                });
                                            }
                                        });
                                        // 
                                    }
                                });
                            }
                        });
                    }
                }
            });
        } else {
            callback(null);
        }
            

        }
    });

}
/*********--------------------------*********
 **********------- END ------*********
 **********--------------------------*********/
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