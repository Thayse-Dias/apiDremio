const axios = require('axios');
const config = require('../config');

let authToken = '';
let lastAuthTime = 0;

const axiosInstance = axios.create({
  baseURL: config.dremioHost,
  timeout: 30000,
  maxContentLength: 50 * 1024 * 1024,
  maxBodyLength: 50 * 1024 * 1024,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

axiosInstance.interceptors.request.use(async (config) => {
  if (!authToken) await authenticate();
  config.headers.Authorization = `_dremio${authToken}`;
  return config;
}, error => Promise.reject(error));

async function authenticate(maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.post(`${config.dremioHost}/apiv2/login`, {
        userName: config.dremioUser,
        password: config.dremioPass,
      });
      authToken = response.data.token;
      lastAuthTime = Date.now();
      return;
    } catch (error) {
      console.error(`Tentativa ${attempt} de autenticação falhou:`, error.message);
      if (attempt === maxRetries) {
        throw new Error('Falha na autenticação com o Dremio após tentativas');
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

async function waitForJob(jobId, timeout = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const { data } = await axiosInstance.get(`/api/v3/job/${jobId}`);
      switch (data.jobState) {
        case 'COMPLETED': return data;
        case 'FAILED':
        case 'CANCELED': throw new Error(`Job falhou: ${data.jobState} - ${data.errorMessage || 'Sem mensagem'}`);
        default: await new Promise(resolve => setTimeout(resolve, 2500));
      }
    } catch (error) {
      console.error('Erro ao verificar status:', error.message);
      throw error;
    }
  }
  throw new Error(`Timeout excedido (${timeout}ms) para o job ${jobId}`);
}

async function queryDremio(sql, offset = 0, limit = 15) {
  try {
    if (!authToken) await authenticate();
    const submitResponse = await axiosInstance.post('/api/v3/sql', { sql, context: [] });
    const jobId = submitResponse.data.id;
    await waitForJob(jobId);
    const resultResponse = await axiosInstance.get(`/api/v3/job/${jobId}/results?offset=${offset}&limit=${limit}`);

    console.log('Resposta bruta do Dremio:', {
      schema: resultResponse.data?.schema,
      columns: resultResponse.data?.columns,
      firstRow: resultResponse.data?.rows?.[0],
      rowCount: resultResponse.data?.rowCount,
    });

    let columns = [];
    let rows = [];

    if (resultResponse.data?.rows && Array.isArray(resultResponse.data.rows)) {
      columns = resultResponse.data.schema ? resultResponse.data.schema.map(field => field.name) :
                resultResponse.data.columns ? resultResponse.data.columns.map(col => col.name) : [];
      rows = resultResponse.data.rows.map(row => {
        const rowObj = {};
        columns.forEach((col, idx) => {
          rowObj[col] = row[idx] !== undefined ? row[idx] : null;
        });
        if (rowObj.timeSpent) {
          rowObj.duration_minutes = Math.round(rowObj.timeSpent / 60000 * 100) / 100;
          rowObj.duration_hours = Math.round(rowObj.timeSpent / 3600000 * 100) / 100;
        }
        if (rowObj.userId) rowObj.user = rowObj.userId;
        if (rowObj._id) rowObj.id = rowObj._id;
        return rowObj;
      });
    }

    return {
      data: rows,
      meta: { columns, rowCount: resultResponse.data.rowCount || rows.length, query: sql, offset, limit },
    };
  } catch (error) {
    console.error('Erro na consulta:', { sql, error: error.message, response: error.response?.data, stack: error.stack });
    throw error;
  }
}

module.exports = { queryDremio, authenticate };
