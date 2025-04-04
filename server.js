const express = require('express');
const axios = require('axios');
require('dotenv').config();
const app = express();

// Verificação de variáveis de ambiente
const requiredEnvVars = ['DREMIO_HOST', 'DREMIO_USER', 'DREMIO_PASSWORD'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Erro: Variável de ambiente ${envVar} é obrigatória!`);
    process.exit(1);
  }
}

// Configurações do Dremio
let port = parseInt(process.env.API_PORT) || 3005; // Porta inicial
const dremioHost = process.env.DREMIO_HOST.replace(/\/$/, '');
const dremioUser = process.env.DREMIO_USER;
const dremioPass = process.env.DREMIO_PASSWORD;

let authToken = '';
let lastAuthTime = 0;
let isServiceReady = false;

app.use(express.json());

// Configuração global do Axios
const axiosInstance = axios.create({
  baseURL: dremioHost,
  timeout: 30000,
  maxContentLength: 50 * 1024 * 1024,
  maxBodyLength: 50 * 1024 * 1024,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

// Interceptor para autenticação
axiosInstance.interceptors.request.use(async (config) => {
  if (!authToken) {
    await authenticate();
  }
  config.headers.Authorization = `_dremio${authToken}`;
  return config;
}, error => Promise.reject(error));

// Função de autenticação completa
async function authenticate(maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.post(`${dremioHost}/apiv2/login`, {
        userName: dremioUser,
        password: dremioPass
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

// Função de espera do job
async function waitForJob(jobId, timeout = 120000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    try {
      const { data } = await axiosInstance.get(`/api/v3/job/${jobId}`);
      switch (data.jobState) {
        case 'COMPLETED':
          return data;
        case 'FAILED':
        case 'CANCELED':
          throw new Error(`Job falhou: ${data.jobState} - ${data.errorMessage || 'Sem mensagem'}`);
        default:
          await new Promise(resolve => setTimeout(resolve, 2500));
      }
    } catch (error) {
      console.error('Erro ao verificar status:', error.message);
      throw error;
    }
  }
  throw new Error(`Timeout excedido (${timeout}ms) para o job ${jobId}`);
}

// Consulta ao Dremio
async function queryDremio(sql, offset = 0, limit = 15) {
    try {
      if (!authToken) await authenticate();
  
      const submitResponse = await axiosInstance.post('/api/v3/sql', {
        sql: sql,
        context: []
      });
  
      const jobId = submitResponse.data.id;
      await waitForJob(jobId);
      
      const resultResponse = await axiosInstance.get(
        `/api/v3/job/${jobId}/results?offset=${offset}&limit=${limit}`
      );
  
      console.log('Resposta bruta do Dremio:', {
        schema: resultResponse.data?.schema,
        columns: resultResponse.data?.columns,
        firstRow: resultResponse.data?.rows?.[0],
        rowCount: resultResponse.data?.rowCount
      });
  
      let columns = [];
      let rows = [];
  
      // Processa os dados recebidos do Dremio
      if (resultResponse.data?.rows && Array.isArray(resultResponse.data.rows)) {
        // Obtém os nomes das colunas
        if (resultResponse.data.schema) {
          columns = resultResponse.data.schema.map(field => field.name);
        } else if (resultResponse.data.columns) {
          columns = resultResponse.data.columns.map(col => col.name);
        }
  
        // Processa as linhas de dados para o formato Grafana
        rows = resultResponse.data.rows.map(row => {
          const rowObj = {};
          
          if (Array.isArray(row)) {
            // Formato array: [value1, value2, ...]
            columns.forEach((col, idx) => {
              rowObj[col] = row[idx] !== undefined ? row[idx] : null;
            });
          } else if (typeof row === 'object' && row !== null) {
            // Formato objeto: {col1: value1, col2: value2}
            columns.forEach(col => {
              rowObj[col] = row[col] !== undefined ? row[col] : null;
            });
          }
          
          // Transformações específicas para o Grafana
          if (rowObj.timeSpent) {
            rowObj.duration_minutes = Math.round(rowObj.timeSpent / 60000 * 100) / 100; // ms para minutos
            rowObj.duration_hours = Math.round(rowObj.timeSpent / 3600000 * 100) / 100; // ms para horas
          }
          
          // Padroniza nomes de campos
          if (rowObj.userId) rowObj.user = rowObj.userId;
          if (rowObj._id) rowObj.id = rowObj._id;
          
          return rowObj;
        });
      }
  
      return {
        // Formato otimizado para Grafana
        data: rows,
        // Metadados adicionais
        meta: {
          columns: columns,
          rowCount: resultResponse.data.rowCount || rows.length,
          query: sql,
          offset: offset,
          limit: limit
        }
      };
    } catch (error) {
      console.error('Erro na consulta:', {
        sql,
        error: error.message,
        response: error.response?.data,
        stack: error.stack
      });
      throw error;
    }
}
// Endpoint principal
// Conulta ao Dremio com SQL dinâmico

app.post('/query', async (req, res) => {
    try {
      console.log('Headers recebidos:', req.headers);
      console.log('Corpo recebido:', req.body);
  
      // Parâmetros de paginação
      const offset = parseInt(req.body.offset || req.query.offset || 0);
      const limit = parseInt(req.body.limit || req.query.limit || 10);
  
      // Validação dos parâmetros
      if (isNaN(offset)) {
        return res.status(400).json({ 
          error: 'Parâmetro "offset" deve ser um número',
          received: offset
        });
      }
  
      if (isNaN(limit)) {
        return res.status(400).json({ 
          error: 'Parâmetro "limit" deve ser um número',
          received: limit
        });
      }
  
      // Query SQL 
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
        pagination: {
          offset,
          limit,
          total: result.meta.rowCount
        }
      });
  
    } catch (error) {
      console.error('Erro completo:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno no servidor',
        message: error.message,
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
      });
    }
});

// Endpoint de teste
app.get('/test-query', async (req, res) => {
    try {
      const sql = req.query.sql || "SELECT * FROM ConexaoOpa.suite.\"user_status\" LIMIT 15";
      const result = await queryDremio(sql);
      res.json({
        success: true,
        query: sql,
        columns: result.columns,
        rows: result.rows,
        count: result.rows.length
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });


app.get('/health', (req, res) => {
    res.json({
      status: isServiceReady ? 'healthy' : 'starting',
      timestamp: new Date().toISOString(),
      dremio: {
        host: dremioHost,
        authenticated: !!authToken
      },
      port: port // Mostra a porta atual em uso
    });
  });
  
  // Função para encontrar uma porta disponível
  const findAvailablePort = (startPort) => {
    return new Promise((resolve) => {
      const server = require('net').createServer();
      server.listen(startPort, () => {
        const { port } = server.address();
        server.close(() => resolve(port));
      });
      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          server.close(() => findAvailablePort(startPort + 1).then(resolve));
        } else {
          console.error('Erro ao buscar porta:', err.message);
          process.exit(1);
        }
      });
    });
  };


// Adicione este endpoint para testar a conectividade
app.get('/test-connection', (req, res) => {
    res.json({
      internalUrl: 'http://dremio-adapter:3005',
      externalUrl: `http://localhost:3002`,
      status: 'active'
    });
  });
 
// Inicialização do servidor com busca de porta disponível
async function startServer() {
    try {
      port = await findAvailablePort(port); // Busca uma porta disponível a partir da inicial
      const server = app.listen(port, async () => {
        console.log(`Servidor iniciado na porta ${port}`);
        try {
          await authenticate();
          isServiceReady = true;
          console.log('Autenticação com Dremio realizada com sucesso');
          console.log('Serviço pronto para receber requisições');
        } catch (error) {
          console.error('Falha na inicialização:', error);
          process.exit(1);
        }
      });
  
      server.on('error', (err) => {
        console.error('Erro ao iniciar servidor:', err.message);
        process.exit(1);
      });
    } catch (error) {
      console.error('Erro ao encontrar porta disponível:', error);
      process.exit(1);
    }
  }
  
  startServer();
