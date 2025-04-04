require('dotenv').config();

const requiredEnvVars = ['DREMIO_HOST', 'DREMIO_USER', 'DREMIO_PASSWORD'];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Erro: Variável de ambiente ${envVar} é obrigatória!`);
    process.exit(1);
  }
}

module.exports = {
  port: parseInt(process.env.API_PORT) || 3005,
  dremioHost: process.env.DREMIO_HOST.replace(/\/$/, ''),
  dremioUser: process.env.DREMIO_USER,
  dremioPass: process.env.DREMIO_PASSWORD,
};
