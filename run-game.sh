#!/bin/bash

# Cores para o terminal
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # Sem cor

echo -e "${BLUE}🚀 Iniciando o UmbraMMO...${NC}"

# Verifica se o Node.js está instalado
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js não está instalado. Por favor, instale o Node.js v20.x ou superior.${NC}"
    exit 1
fi

# Navega para a pasta do servidor
cd server || { echo -e "${RED}❌ Pasta 'server' não encontrada!${NC}"; exit 1; }

# Instala as dependências se solicitado ou necessário
if [ ! -d "node_modules" ] || [ "$1" == "--force" ]; then
    echo -e "${YELLOW}📦 Instalando dependências do servidor...${NC}"
    if command -v pnpm &> /dev/null; then
        pnpm install
    else
        npm install
    fi
else
    echo -e "${GREEN}✅ Dependências já instaladas.${NC}"
fi

# Configura o arquivo .env se não existir
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚙️ Criando arquivo .env a partir do .env.example...${NC}"
    cp .env.example .env
else
    echo -e "${GREEN}✅ Arquivo .env já existe.${NC}"
fi

# Inicia o servidor
echo -e "${BLUE}🎮 Iniciando o servidor do jogo...${NC}"
echo -e "${YELLOW}Acesse http://localhost:3000 no seu navegador.${NC}"
if command -v pnpm &> /dev/null; then
    pnpm start
else
    npm start
fi
