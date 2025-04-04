const express = require('express');
const router = express.Router();
const config = require('../config');
const { authToken } = require('../services/dremio');

router.get('/health', (req, res) => {
  res.json({
    status: authToken ? 'healthy' : 'starting',
    timestamp: new Date().toISOString(),
    dremio: {
      host: config.dremioHost,
      authenticated: !!authToken,
    },
    port: config.port,
  });
});

module.exports = router;
