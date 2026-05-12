# 🌑 UmbraMMO

> Um MMORPG baseado em navegador, feito com Node.js e WebSockets — jogável direto no browser, sem precisar baixar nada.

---

## 📖 Sobre o Projeto

**UmbraMMO** (também conhecido como *Umbra Online*) é um MMORPG open-source baseado em navegador, criado originalmente por **AndreplaysGamezitos**.  
O jogo foi compartilhado publicamente em uma [postagem na comunidade do YouTube](https://www.youtube.com/post/Ugkx4GDUbs7AqOVHlvOeNzWgkJtpG1-BCbr4) e o perfil do criador original no GitHub está em [github.com/AndreplaysGamezitos](https://github.com/AndreplaysGamezitos/).

O projeto apresenta um mundo multiplayer em tempo real onde os jogadores podem explorar, lutar contra monstros e chefões, subir de nível, usar habilidades, equipar itens e interagir com outros jogadores — tudo pelo navegador.

---

## ✨ Funcionalidades

- 🌐 **Totalmente no navegador** — sem necessidade de download
- ⚡ **Multiplayer em tempo real** via WebSockets
- ⚔️ **Sistema de combate** — PvE com mobs e encontros contra chefões
- 🧙 **Habilidades e poderes** — gerenciador de skills com múltiplas habilidades por classe
- 🎒 **Sistema de inventário e equipamentos** — itens, armas e acessórios
- 🗺️ **Editor de mapas** — ferramenta administrativa embutida para construção do mundo (pode ser habilitada/desabilitada via config)
- 👤 **Autenticação** — registro e login de jogadores com senhas criptografadas (bcrypt)
- 💾 **Dados persistentes** — banco de dados SQLite para personagens, inventário, progresso e estado do mundo
- 🛡️ **Segurança** — limitação de taxa, validação de origem e limite de conexões por IP
- 📦 **Pronto para PM2** — gerenciamento de processos em produção já configurado

---

## 🏗️ Arquitetura

```
UmbraMMO/
├── client/             # Frontend (HTML + CSS + JS puro)
│   ├── index.html      # Ponto de entrada do jogo
│   ├── css/            # Folhas de estilo
│   ├── js/
│   │   ├── main.js     # Lógica principal do jogo
│   │   ├── engine/     # Motor de renderização
│   │   ├── net/        # Camada de rede (WebSocket)
│   │   ├── ui/         # HUD e componentes de interface
│   │   └── editor/     # Editor de mapas (somente admin)
│   └── assets/         # Sprites, sons e outros assets
├── server/             # Backend (Node.js)
│   ├── server.js       # Ponto de entrada principal do servidor
│   ├── config.js       # Carregamento de configurações de ambiente
│   ├── auth.js         # Autenticação de jogadores
│   ├── database.js     # Camada de dados SQLite
│   ├── combatManager.js  # Lógica de combate
│   ├── bossManager.js    # IA e encontros com chefões
│   ├── mobManager.js     # Comportamento de NPCs/mobs
│   ├── skillManager.js   # Habilidades e poderes
│   ├── itemManager.js    # Gerenciamento de itens
│   ├── security.js       # Rate limiting e checagem de origem
│   └── package.json
├── shared/
│   └── constants.js    # Constantes compartilhadas (cliente & servidor)
├── sql/
│   └── schema.sql      # Schema do banco de dados
├── ecosystem.config.js # Configuração do PM2
└── DEPLOYMENT.md       # Guia completo de deploy em VPS
```

---

## 🚀 Como Começar (Desenvolvimento Local)

### Pré-requisitos

- [Node.js](https://nodejs.org/) **v20.x (LTS)** ou superior
- `npm` (já vem com o Node.js)

### 1. Clone o repositório

```bash
git clone https://github.com/AndreplaysGamezitos/UmbraMMO.git
cd UmbraMMO
```

### 2. Instale as dependências do servidor

```bash
cd server
npm install
```

### 3. Configure o ambiente

```bash
cp .env.example .env
```

Edite o arquivo `.env` conforme sua necessidade. Para desenvolvimento local, os valores padrão já funcionam:

```env
NODE_ENV=development
PORT=3000
WS_PATH=/ws
```

> ⚠️ Se quiser usar o editor de mapas, defina `ENABLE_MAP_EDITOR=true` e forneça uma `ADMIN_MAP_PASSWORD` forte no `.env`.

### 4. Inicie o servidor

```bash
# Desenvolvimento (com recarga automática ao salvar)
npm run dev

# Ou inicialização padrão
npm start
```

### 5. Abra o jogo

Abra seu navegador e acesse:

```
http://localhost:3000
```

O servidor já serve os arquivos do cliente automaticamente — nenhum servidor frontend separado é necessário.

---

## 🗄️ Banco de Dados

O UmbraMMO usa **SQLite** para persistência de dados. O arquivo do banco é criado automaticamente na primeira execução.  
O schema completo está em [`sql/schema.sql`](./sql/schema.sql) e inclui tabelas para jogadores, personagens, inventário, estado do mundo e muito mais.

Para promover um jogador a administrador, use o script auxiliar:

```bash
cd server
node make-admin.js <nome_do_usuario>
```

---

## 🛠️ Stack Tecnológica

| Camada       | Tecnologia                           |
|--------------|--------------------------------------|
| Frontend     | HTML5, CSS puro, JavaScript puro     |
| Backend      | Node.js, Express                     |
| Rede         | WebSockets (biblioteca `ws`)         |
| Banco de dados | SQLite (`sqlite3`)                 |
| Autenticação | bcrypt                               |
| Processo     | PM2 (produção)                       |
| Proxy        | Nginx (produção)                     |

---

## 🌐 Deploy em Produção (VPS)

Para um guia completo de deploy em VPS (Ubuntu 22.04) com Nginx, SSL e PM2, consulte **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

**Resumo rápido:**

```bash
# Instale o PM2 globalmente
npm install -g pm2

# Inicie o servidor com PM2
pm2 start ecosystem.config.js --env production

# Persistir entre reinicializações
pm2 save
pm2 startup
```

O `ecosystem.config.js` já vem pré-configurado com:
- **Nome do app:** `umbra-online`
- **Porta:** `3000`
- **Reinício por memória:** `500MB`
- **Reinício automático:** habilitado

---

## 🔒 Segurança

Consulte o [SECURITY.md](./SECURITY.md) para a política de segurança do projeto e como reportar vulnerabilidades.

Funcionalidades de segurança já embutidas no servidor:
- Limite de conexões por IP (padrão: 5)
- Limitação de taxa de mensagens (padrão: 10 mensagens/segundo)
- Lista de origens CORS permitidas (opcional)
- Hash de senhas com bcrypt
- Editor de mapas desabilitado por padrão em produção

---

## 🤝 Contribuindo

Este projeto foi compartilhado originalmente como um recurso para a comunidade. Sinta-se à vontade para fazer fork, modificar e construir em cima dele.  
Se você melhorar o jogo, considere abrir um pull request ou compartilhar suas mudanças com a comunidade!

---

## 📜 Créditos

**Criador Original:** [AndreplaysGamezitos](https://github.com/AndreplaysGamezitos/)  
Anunciado originalmente na [postagem da comunidade do YouTube](https://www.youtube.com/post/Ugkx4GDUbs7AqOVHlvOeNzWgkJtpG1-BCbr4).

---

## 📄 Licença

Este projeto está licenciado sob a **Licença ISC**. Consulte o [`server/package.json`](./server/package.json) para mais detalhes.
