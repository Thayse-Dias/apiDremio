const express = require('express');
const router = express.Router();
const { queryDremio } = require('../services/dremio');

router.post('/query', async (req, res) => {
  try {
    const offset = parseInt(req.body.offset || req.query.offset || 0);
    const limit = parseInt(req.body.limit || req.query.limit || 10);

    if (isNaN(offset)) return res.status(400).json({ error: 'Parâmetro "offset" deve ser um número', received: offset });
    if (isNaN(limit)) return res.status(400).json({ error: 'Parâmetro "limit" deve ser um número', received: limit });

    const query = `
      SELECT
          u.nome AS "nomeColaborador",
          COUNT(*) AS "qtdPausas",
          DATE_TRUNC('day', us.startAt) AS "dia",
          CONCAT(
              LPAD(CAST(FLOOR(SUM(EXTRACT(EPOCH FROM (us.endAt - us.startAt))) / 3600) AS VARCHAR), 2, '0'), ':',
              LPAD(CAST(FLOOR(MOD(SUM(EXTRACT(EPOCH FROM (us.endAt - us.startAt))) / 60, 60)) AS VARCHAR), 2, '0'), ':',
              LPAD(CAST(MOD(SUM(EXTRACT(EPOCH FROM (us.endAt - us.startAt))), 60) AS VARCHAR), 2, '0')
          ) AS "tempoTotalPausa"
      FROM
          ConexaoOpa.suite.usuarios u
      INNER JOIN
          ConexaoOpa.suite.user_status us
      ON
          u._id = us.userId
      WHERE
          us.startAt IS NOT NULL
          AND us.endAt IS NOT NULL
          AND us.endAt > us.startAt
          AND CAST(us.startAt AS DATE) = CURRENT_DATE
          AND us.status = 'pause'
      GROUP BY
          u.nome,
          DATE_TRUNC('day', us.startAt)
      ORDER BY
          DATE_TRUNC('day', us.startAt) DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const result = await queryDremio(query);
    res.json({
      success: true,
      data: result.data,
      pagination: { offset, limit, total: result.meta.rowCount },
    });
  } catch (error) {
    console.error('Erro completo:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno no servidor',
      message: error.message,
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
    });
  }
});

module.exports = router;
