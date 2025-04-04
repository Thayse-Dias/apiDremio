# apiDremio
API de Integração Dremio com Grafana via Docker
Bem-vindo ao repositório da API de integração entre Dremio e Grafana, projetada para facilitar a visualização de dados analíticos em dashboards interativos. Esta API atua como uma ponte entre o Dremio (uma plataforma de data lake) e o Grafana (uma ferramenta de visualização), permitindo que você consulte dados do Dremio e os exiba em tempo real no Grafana. Tudo é configurado e executado usando Docker para garantir consistência e facilidade de deployment.

Objetivo
Esta API foi criada para:

- Conectar o Dremio ao Grafana de forma simplificada.
- Permitir consultas SQL no Dremio e exibir os resultados em dashboards do Grafana.
- Monitoramento e controle de pausas.

Estrutura do Projeto

apiDremio/
├── config/                # Configurações da aplicação
│   └── index.js           # Arquivo principal de configuração
├── routes/                # Definição das rotas da API
│   ├── health.js          # Rota para verificar a saúde da API 
│   ├── query.js           # Rota para executar consultas
│   ├── testConnection.js  # Rota para testar a conexão 
│   └── testQuery.js       # Rota para testar consultas 
├── services/              # Lógica de negócios e serviços
│   ├── dremio.js          # Serviço para interação com o Dremio 
│   └── port.js            # Serviço relacionado a portas ou conexões 
├── .env                   # Variáveis de ambiente 
├── README.md              # Documentação do projeto 
├── docker-compose.yml     # Configuração do Docker Compose 
├── Dockerfile             # Definição da imagem Docker da API
└── server.js              # Arquivo principal da aplicação

Pré-requisitos
Antes de começar, certifique-se de ter instalado:

- Docker (versão 20.10 ou superior)
- Docker Compose (versão 1.29 ou superior)
- Conhecimento básico de SQL e configuração de dashboards no Grafana.
