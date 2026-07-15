const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { submitScore, getMyHistory } = require('../controllers/scoreController');

const router = express.Router();

router.post('/', requireAuth, submitScore);
router.get('/history', requireAuth, getMyHistory);

module.exports = router;
