const express = require('express');
const router = express.Router();
const { queryDremio } = require('../services/dremio');

router.get('/test-query', async (req, res) => {
  try {
    const sql = req.query.sql || "SELECT * FROM ConexaoOpa.suite.\"user_status\" LIMIT 15";
    const result = await queryDremio(sql);
    res.json({
      success: true,
      query: sql,
      columns: result.meta.columns,
      rows: result.data,
      count: result.data.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
