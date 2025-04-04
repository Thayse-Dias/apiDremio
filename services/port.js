const net = require('net');

const findAvailablePort = (startPort) => {
  return new Promise((resolve) => {
    const server = net.createServer();
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

module.exports = { findAvailablePort };
