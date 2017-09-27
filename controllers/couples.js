var express = require('express');
var router = express.Router();
var mysql = require('mysql');
var config = require('../config.js');
var bodyParser = require('body-parser');
var escapeSQL = require('sqlstring');
var jwt = require('jsonwebtoken');
var async = require('async');

var moment = require('moment-timezone');
// parse application/x-www-form-urlencoded
var urlParser = bodyParser.urlencoded({extended: false});
// parse application/json
router.use(bodyParser.json());
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
var serverKey = 'AAAAww8tdbc:APA91bGypdYO0D0YTXiGEltVnswbmcoJAmj_GbA00WrRgUORrk7fdk2q3CKNi_wRHtcAbwYzXme3FDgkbsL-QBSlhxiATw-ax49uXtA6QDZRlGvyfNyup9G-NIAjZ7FGUAQEQgyktMQD';
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
/*********--------------------------*********
 **********------- FUNCTION ------*********
 **********--------------------------*********/
router.get('/type=all', function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'] || req.params.access_token;
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                ///-----Check nếu tồn tại access_token thì chạy xuống dưới
                var country_code = req.body.country_code || req.query.country_code || req.params.country_code;
                var key = req.body.key || req.query.key || req.params.key;
                var page = req.body.page || req.query.page || req.params.page;
                var per_page = req.body.per_page || req.query.per_page || req.params.per_page;

                var sqlsselect = "SELECT * FROM `users` WHERE ";
                var dk1 = "`key` IN (SELECT `users_key` FROM `other_information` WHERE `height` IS NOT NULL) ";
                var dk2 = "AND `key` NOT IN (SELECT `friend_key` FROM `couple_unlike` WHERE `users_key`='" + key + "') ";
                var dk3 = "AND `key` NOT IN (SELECT `friend_key` FROM `couple_like` WHERE `users_key`='" + key + "')";
                var dk4 = "AND `key`!='" + key + "'";
                var dkbanbe = "AND `key` NOT IN (SELECT `friend_key` FROM `contacts` WHERE `users_key`='" + key + "')";
                var dkSetting = "AND `key` IN (SELECT `users_key` FROM `users_settings` WHERE `find_couples`='1')";
                var dk5 = "AND `key` NOT IN (SELECT `friend_key` FROM `blocks` WHERE `users_key`='" + key + "')";
                var orderby = "ORDER BY RAND() LIMIT " + parseInt(per_page, 10) + " OFFSET " + parseInt(page, 10) * parseInt(per_page, 10);
                var sqlu = sqlsselect + dk1 + dk2 + dk3 + dk4 + dkbanbe + dkSetting + dk5 + orderby;
                client.query(sqlu, function (errr, rsss, fiii) {
                    if (errr) {
                        console.log(errr);
                        return res.send(echoResponse(300, 'error', JSON.stringify(errr), true));
                    } else {
                        if (rsss.length > 0) {
                            var arrayMembers = [];
                            async.forEachOf(rsss, function (dataElement, i, callback) {
                                if (rsss[i].birthday) {
                                    var other = "SELECT * FROM `other_information` WHERE `users_key`='" + rsss[i].key + "'";
                                    client.query(other, function (eGet, dGet, fGet) {
                                        if (eGet) {
                                            return res.send(echoResponse(300, 'error', JSON.stringify(eGet), true));
                                        } else {
                                            if (dGet.length > 0) {
                                                async.forEachOf(dGet, function (dataElementt, ii, callbackk) {
                                                    var namhientai = moment().tz('Asia/Ho_Chi_Minh').format('YYYY');
                                                    var namsinh = moment(rsss[i].birthday).format('YYYY');
                                                    var tuoi = parseInt(namhientai, 10) - parseInt(namsinh, 10);
                                                    if (tuoi) {
                                                        rsss[i].year_old = tuoi;
                                                        rsss[i].height = dGet[ii].height;
                                                        rsss[i].industry = dGet[ii].industry;
                                                        arrayMembers.push(rsss[i]);
                                                    }
                                                });
                                                if (i === rsss.length - 1) {
                                                    return res.send(echoResponse(200, arrayMembers, 'success', false));
                                                }
                                            } else {
                                                return res.send(echoResponse(404, "No have user", 'success', false));
                                            }
                                        }
                                    });
                                }
                            }, function (err) {
                                if (err) {
                                    //handle the error if the query throws an error
                                } else {
                                    //whatever you wanna do after all the iterations are done
                                }
                            });
                        } else {
                            return res.send(echoResponse(404, 'No user', 'success', true));
                        }
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});

router.post('/type=params', urlParser, function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'] || req.params.access_token;
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                ///-----Check nếu tồn tại access_token thì chạy xuống dưới
                var key = req.body.key || req.query.key || req.params.key;
                var page = req.body.page || req.query.page || req.params.page;
                var per_page = req.body.per_page || req.query.per_page || req.params.per_page;
                //Param value
                var academic_level = req.body.academic_level || req.query.academic_level || req.params.academic_level;
                var annual_income = req.body.annual_income || req.query.kannual_incomeey || req.params.annual_income;
                var blood_group = req.body.blood_group || req.query.blood_group || req.params.blood_group;
                var body_type = req.body.body_type || req.query.body_type || req.params.body_type;
                var country = req.body.country || req.query.country || req.params.country;
                var have_children = req.body.have_children || req.query.have_children || req.params.have_children;

                var min_age = req.body.min_age || req.query.min_age || req.params.min_age;
                var max_age = req.body.max_age || req.query.max_age || req.params.max_age;

                var height;
                var weight;
                var heightInt;
                var weightInt;

                heightInt = parseInt(req.body.height);
                weightInt = parseInt(req.body.weight);
                
                var industry = req.body.industry || req.query.industry || req.params.industry;
                var married = req.body.married || req.query.married || req.params.married;
                var race = req.body.race || req.query.race || req.params.race;
                var religion = req.body.religion || req.query.religion || req.params.religion;
                var same_city = req.body.same_city || req.query.same_city || req.params.same_city;
                var smoking = req.body.smoking || req.query.smoking || req.params.smoking;
                var gender = req.body.gender || req.query.gender || req.params.gender;

                var sqlsselect = "SELECT * FROM `users` WHERE ";
                var dk2 = "`key` NOT IN (SELECT `friend_key` FROM `couple_unlike` WHERE `users_key`='" + key + "') ";
                var dk3 = "AND `key` NOT IN (SELECT `friend_key` FROM `couple_like` WHERE `users_key`='" + key + "') ";
                var dk4 = "AND `key`!='" + key + "'";
                var dkbanbe = "AND `key` NOT IN (SELECT `friend_key` FROM `contacts` WHERE `users_key`='" + key + "')";
                var dkSetting = "AND `key` IN (SELECT `users_key` FROM `users_settings` WHERE `find_couples`='1')";
                var dk5 = "AND `key` NOT IN (SELECT `friend_key` FROM `blocks` WHERE `users_key`='" + key + "') ";

                var param1;
                if (req.body.annual_income != '-1') {
                    param1 = " AND `key` IN (SELECT `users_key` FROM `other_information` WHERE `annual_income`='" + req.body.annual_income + "') ";
                } else {
                    param1 = "";
                }

                var param2;
                if (req.body.body_type != '-1') {
                    param2 = " AND `key` IN (SELECT `users_key` FROM `other_information` WHERE `body_type`='" + req.body.body_type + "') ";
                } else {
                    param2 = "";
                }

                var param3;
                if (req.body.blood_group != '-1') {
                    param3 = " AND `key` IN (SELECT `users_key` FROM `other_information` WHERE `blood_group`='" + req.body.blood_group + "') ";
                } else {
                    param3 = "";
                }

                var param4;
                if (req.body.race != '-1') {
                    param4 = " AND `key` IN (SELECT `users_key` FROM `other_information` WHERE `race`='" + req.body.race + "') ";
                } else {
                    param4 = "";
                }

                var param5;
                if (req.body.smoking != '-1') {
                    param5 = " AND `key` IN (SELECT `users_key` FROM `other_information` WHERE `smoking`='" + req.body.smoking + "') ";
                } else {
                    param5 = "";
                }

                var param6;
                if (req.body.have_children != '-1') {
                    param6 = " AND `key` IN (SELECT `users_key` FROM `other_information` WHERE `have_children`='" + req.body.have_children + "') ";
                } else {
                    param6 = "";
                }

                var param7;
                if (req.body.married != '-1') {
                    param7 = " AND `key` IN (SELECT `users_key` FROM `other_information` WHERE `married`='" + req.body.married + "') ";
                } else {
                    param7 = "";
                }

                var param8;
                if (req.body.religion != '-1') {
                    param8 = " AND `key` IN (SELECT `users_key` FROM `other_information` WHERE `religion`='" + req.body.religion + "') ";
                } else {
                    param8 = "";
                }

                var param9;
                if (req.body.industry != '-1') {
                    param9 = " AND `key` IN (SELECT `users_key` FROM `other_information` WHERE `industry`='" + req.body.industry + "') ";
                } else {
                    param9 = "";
                }

                var param10;
                if (req.body.academic_level != '-1') {
                    param10 = " AND `key` IN (SELECT `users_key` FROM `other_information` WHERE `academic_level`='" + req.body.academic_level + "') ";
                } else {
                    param10 = "";
                }

                var param11;
                if (req.body.country != '-1') {
                    param11 = " AND `country`='" + req.body.country + "'";
                } else {
                    param11 = "";
                }
                var param12;
                if (req.body.same_city == '1' && req.body.same_city != '-1') {
                    param12 = " AND `city`='" + req.body.city + "'";
                } else {
                    param12 = "";
                }

                var param13;
                if (req.body.gender != '2') {
                    param13 = " AND `sex`='" + req.body.gender + "'";
                } else {
                    param13 = "";
                }
                console.log(JSON.stringify(req.body));
                var orderby = "ORDER BY RAND() LIMIT " + parseInt(per_page, 10) + " OFFSET " + parseInt(page, 10) * parseInt(per_page, 10);
                var sqlu = sqlsselect + dk2 + dk3 + dk4 + dkbanbe + dkSetting + dk5 + param1 + param2 + param3 + param4 + param5 + param6 + param7 + param8 + param9 + param10 + param11 + param12 + param13 + orderby;
                console.log(sqlu);
                client.query(sqlu, function (errr, rsss, fiii) {
                    if (errr) {
                        console.log(errr);
                        return res.send(echoResponse(300, 'error', JSON.stringify(errr), true));
                    } else {
                        if (rsss.length > 0) {
                            var arrayMembers = [];
                            async.forEachOf(rsss, function (dataElement, i, callback) {
                                if (rsss[i].birthday) {
                                    var other = "SELECT * FROM `other_information` WHERE `users_key`='" + rsss[i].key + "'";
                                    client.query(other, function (eGet, dGet, fGet) {
                                        if (eGet) {
                                            return res.send(echoResponse(300, 'error', JSON.stringify(eGet), true));
                                        } else {
                                            if (dGet.length > 0) {
                                                //async.forEachOf(dGet, function (dataElementt, ii, callbackk) {
                                                    var heightUser = dGet[0].height;
                                                    var weightUser = dGet[0].weight;
                                                    if (req.body.height != '-1') {
                                                        if (parseInt(heightUser) >= heightInt) {
                                                            var date = new Date(rsss[i].birthday);
                                                            var today = new Date();
                                                            var age = today.getFullYear() - date.getFullYear();
                                                            if (age >= min_age && age <= max_age) {
                                                                rsss[i].year_old = age;
                                                                rsss[i].height = dGet[0].height;
                                                                rsss[i].industry = dGet[0].industry;
                                                                arrayMembers.push(rsss[i]);
                                                            }
                                                        }
                                                    } else {
                                                        var date = new Date(rsss[i].birthday);
                                                        var today = new Date();
                                                        var age = today.getFullYear() - date.getFullYear();
                                                        if (age >= min_age && age <= max_age) {
                                                            rsss[i].year_old = age;
                                                            rsss[i].height = dGet[0].height;
                                                            rsss[i].industry = dGet[0].industry;
                                                            arrayMembers.push(rsss[i]);
                                                        }
                                                    }
                                                    if (req.body.weight != '-1') {
                                                        if (parseInt(weightUser) >= weightInt) {
                                                            var date = new Date(rsss[i].birthday);
                                                            var today = new Date();
                                                            var age = today.getFullYear() - date.getFullYear();
                                                            if (age >= min_age && age <= max_age) {
                                                                rsss[i].year_old = age;
                                                                rsss[i].height = dGet[0].height;
                                                                rsss[i].industry = dGet[0].industry;
                                                                arrayMembers.push(rsss[i]);
                                                            }
                                                        }
                                                    } else {
                                                        var date = new Date(rsss[i].birthday);
                                                        var today = new Date();
                                                        var age = today.getFullYear() - date.getFullYear();
                                                        if (age >= min_age && age <= max_age) {
                                                            rsss[i].year_old = age;
                                                            rsss[i].height = dGet[0].height;
                                                            rsss[i].industry = dGet[0].industry;
                                                            arrayMembers.push(rsss[i]);
                                                        }
                                                    }
                                                    console.log(parseInt(heightUser) + '-'+heightInt +'--'+parseInt(weightUser)+'-'+weightInt);
                                                //});
                                                if (i === rsss.length - 1) {
                                                    if (arrayMembers.length > 0) {
                                                        return res.send(echoResponse(200, arrayMembers, 'success', false));
                                                    } else {
                                                        return res.send(echoResponse(404, 'No user', 'success', true));
                                                    }
                                                }
                                            }
                                        }
                                    });
                                } else {
                                    if (i === rsss.length - 1) {
                                        if (arrayMembers.length > 0) {
                                            return res.send(echoResponse(200, arrayMembers, 'success', false));
                                        } else {
                                            return res.send(echoResponse(404, 'No user', 'success', true));
                                        }
                                    }
                                }
                            }, function (err) {
                                if (err) {
                                    //handle the error if the query throws an error
                                } else {
                                    //whatever you wanna do after all the iterations are done
                                }
                            });
                        } else {
                            return res.send(echoResponse(404, 'No user', 'success', true));
                        }
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});

function parseIntFromText(text){
    if (text.indexOf(">") > -1) {
        var height = text.replace('>', '');
        var heightInt = parseInt(height, 10);
        return heightInt;
    } else {
        var heightInt = parseInt(text, 10);
        return heightInt;
    }
}

//-------------
router.get('/type=like', function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'] || req.params.access_token;
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                ///-----Check nếu tồn tại access_token thì chạy xuống dưới
                var key = req.body.key || req.query.key || req.params.key;
                var selectUser = "SELECT * FROM `couple_like` WHERE `users_key`='" + key + "' ORDER BY `time` DESC";
                client.query(selectUser, function (eSelect, dSelect, fSelect) {
                    if (eSelect) {
                        console.log(eSelect);
                        return res.send(echoResponse(300, 'error', JSON.stringify(eSelect), true));
                    } else {
                        if (dSelect.length > 0) {
                            var arrayMembers = [];
                            async.forEachOf(dSelect, function (dataElement, i, callback) {
                                var memberSelect = "SELECT * FROM `users` WHERE `key`='" + dSelect[i].friend_key + "'";
                                client.query(memberSelect, function (errorMember, dataMember, fieldMember) {
                                    if (errorMember) {
                                        console.log(errorMember);
                                    } else {
                                        if (dataMember.length > 0) {
                                            var caseData = dSelect[i];
                                            var currentTime = moment().tz('Asia/Ho_Chi_Minh').format('YYYY-MM-DD hh:mm:ss');
                                            dataMember[0].time_like = caseData.time;
                                            dataMember[0].time_request = currentTime;
                                            arrayMembers.push(dataMember[0]);
                                            if (i === dSelect.length - 1) {
                                                return res.send(echoResponse(200, arrayMembers, 'success', false));
                                            }
                                        }
                                    }
                                });
                            });
                        } else {
                            return res.send(echoResponse(404, 'No user', 'success', true));
                        }
                    }
                });
                //---
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
router.post('/type=deletelike', urlParser, function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'] || req.params.access_token;
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                ///-----Check nếu tồn tại access_token thì chạy xuống dưới
                var key = req.body.users_key || req.query.users_key || req.params.users_key;
                var friend_key = req.body.friend_key || req.query.friend_key || req.params.friend_key;
                var sqlDelte = "DELETE FROM `couple_like` WHERE `users_key`='" + key + "' AND `friend_key`='" + friend_key + "'";
                client.query(sqlDelte, function (e, d, f) {
                    if (e) {
                        console.log(e);
                        return res.send(echoResponse(300, 'error', JSON.stringify(e), true));
                    } else {
                        return res.send(echoResponse(200, 'Deleted successfully', 'success', false));
                    }
                });

            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});
router.post('/type=deleteunlike', urlParser, function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'] || req.params.access_token;
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                ///-----Check nếu tồn tại access_token thì chạy xuống dưới
                var key = req.body.users_key || req.query.users_key || req.params.users_key;
                var friend_key = req.body.friend_key || req.query.friend_key || req.params.friend_key;
                var sqlDelte = "DELETE FROM `couple_unlike` WHERE `users_key`='" + key + "' AND `friend_key`='" + friend_key + "'";
                client.query(sqlDelte, function (e, d, f) {
                    if (e) {
                        console.log(e);
                        return res.send(echoResponse(300, 'error', JSON.stringify(e), true));
                    } else {
                        return res.send(echoResponse(200, 'Deleted successfully', 'success', false));
                    }
                });
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});


router.get('/type=unlike', function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'] || req.params.access_token;
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                ///-----Check nếu tồn tại access_token thì chạy xuống dưới
                var key = req.body.key || req.query.key || req.params.key;
                var selectUser = "SELECT * FROM `users` WHERE `key` IN (SELECT `friend_key` FROM `couple_unlike` WHERE `users_key`='" + key + "')";
                client.query(selectUser, function (eSelect, dSelect, fSelect) {
                    if (eSelect) {
                        console.log(eSelect);
                        return res.send(echoResponse(300, 'error', JSON.stringify(eSelect), true));
                    } else {
                        if (dSelect.length > 0) {
                            return res.send(echoResponse(200, dSelect, 'success', true));
                        } else {
                            return res.send(echoResponse(404, 'No user', 'success', true));
                        }
                    }
                });
                //---
            }
        });
    } else {
        return res.send(echoResponse(403, 'Authenticate: No token provided.', 'success', true));
    }
});


router.post('/like', urlParser, function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'] || req.params.access_token;
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                ///-----Check nếu tồn tại access_token thì chạy xuống dưới

                var sqlu = "SELECT * FROM `couple_like` WHERE `users_key`='" + req.body.users_key + "' AND `friend_key`='" + req.body.friend_key + "'";
                client.query(sqlu, function (errr, rsss, fiii) {
                    if (errr) {
                        return res.send(echoResponse(300, 'error', JSON.stringify(errr), true));
                    } else {
                        if (rsss.length > 0) {
                            return res.send(echoResponse(200, "You liked this user", "success", false));
                        } else {
                            var deleteSQL = "DELETE FROM `couple_unlike` WHERE `users_key`='" + req.body.users_key + "' AND `friend_key`='" + req.body.friend_key + "'";
                            client.query(deleteSQL, function (eDelete, dDelete, fDelete) {
                                if (eDelete) {
                                    console.log(eDelete);
                                    return res.sendStatus(300);
                                } else {
                                    var currentTime = moment().tz('Asia/Ho_Chi_Minh').format('YYYY-MM-DD hh:mm:ss');
                                    var sqlLike = "INSERT INTO `couple_like`(`users_key`,`time`, `friend_key`) VALUES ('" + req.body.users_key + "','" + currentTime + "','" + req.body.friend_key + "')";
                                    client.query(sqlLike, function (eIn, dIn, fIn) {
                                        if (eIn) {
                                            console.log(eIn);
                                            return res.sendStatus(300);
                                        } else {
                                            var currentUser = "SELECT `nickname`,`avatar` FROM `users` WHERE `key`='"+req.body.users_key+"'";
                                            client.query(currentUser, function(eCurrent, dCurrent, fCurren){
                                                if (eCurrent) {
                                                    console.log(eCurrent);
                                                } else {
                                                    // Insert Notification
                                                    var currentTime = new Date().getTime();
                                                    insertNotificationNoImage(req.body.users_key, dCurrent[0].nickname, dCurrent[0].avatar, "like_user", currentTime, req.body.friend_key, 0);
                                                    sendNotification(req.body.users_key, req.body.friend_key, "has liked you", "like_user", null);
                                                    //-----
                                                    return res.send(echoResponse(200, "Liked successfully", "success", false));
                                                }
                                            });
                                        }
                                    });
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
router.post('/unlike', urlParser, function (req, res) {
    var token = req.body.access_token || req.query.access_token || req.headers['x-access-token'] || req.params.access_token;
    if (token) {
        jwt.verify(token, config.secret, function (err, decoded) {
            if (err) {
                return res.json({success: false, message: 'Failed to authenticate token.'});
            } else {
                ///-----Check nếu tồn tại access_token thì chạy xuống dưới

                var sqlu = "SELECT * FROM `couple_unlike` WHERE `users_key`='" + req.body.users_key + "' AND `friend_key`='" + req.body.friend_key + "'";
                client.query(sqlu, function (errr, rsss, fiii) {
                    if (errr) {
                        return res.send(echoResponse(300, 'error', JSON.stringify(errr), true));
                    } else {
                        if (rsss.length > 0) {
                            return res.send(echoResponse(200, "You unliked this user", "success", false));
                        } else {
                            var deleteSQL = "DELETE FROM `couple_like` WHERE `users_key`='" + req.body.users_key + "' AND `friend_key`='" + req.body.friend_key + "'";
                            client.query(deleteSQL, function (eDelete, dDelete, fDelete) {
                                if (eDelete) {
                                    console.log(eDelete);
                                    return res.sendStatus(300);
                                } else {
                                    var sqlLike = "INSERT INTO `couple_unlike`(`users_key`, `friend_key`) VALUES ('" + req.body.users_key + "','" + req.body.friend_key + "')";
                                    client.query(sqlLike);
                                    return res.send(echoResponse(200, " Unliked successfully", "success", false));
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
/*********--------------------------*********
 **********------- END ------*********
 **********--------------------------*********/
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
                var value = "VALUES('" + friend_key + "','" + nickname + "','" + avatar + "','" + type + "'," + time + ",'" + users_key + "','" + posts_id + "')";
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