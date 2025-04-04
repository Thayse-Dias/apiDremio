const express = require('express');
const router = express.Router();

router.get('/test-connection', (req, res) => {
  res.json({
    internalUrl: 'http://dremio-adapter:3005',
    externalUrl: `http://localhost:3002`,
    status: 'active',
  });
});

module.exports = router;
