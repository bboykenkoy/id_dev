var express = require('express');
	router = express.Router();

router.use('/admin', require('./admin'));
router.use('/users', require('./users'));
router.use('/conversations', require('./conversations'));
router.use('/messages', require('./messages'));
router.use('/search', require('./search'));
router.use('/feeds', require('./feeds'));
router.use('/posts', require('./posts'));
router.use('/couples', require('./couples'));

module.exports = router;
