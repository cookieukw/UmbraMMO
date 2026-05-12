# UMBRA ONLINE - VPS Deployment Guide

## Prerequisites
- Hostinger VPS with Ubuntu 22.04
- Domain: labzts.fun
- SSH access to VPS

---

## Step 1: Initial VPS Setup

### 1.1 Connect to your VPS
```bash
ssh root@YOUR_VPS_IP
```

### 1.2 Update system
```bash
apt update && apt upgrade -y
```

### 1.3 Create a non-root user (recommended)
```bash
adduser umbra
usermod -aG sudo umbra
```

### 1.4 Switch to new user
```bash
su - umbra
```

---

## Step 2: Install Node.js

```bash
# Install Node.js 20.x (LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v20.x.x
npm --version
```

---

## Step 3: Install PM2 (Process Manager)

```bash
sudo npm install -g pm2
```

---

## Step 4: Install Nginx (Reverse Proxy)

```bash
sudo apt install -y nginx
```

---

## Step 5: Configure Firewall

```bash
# Allow SSH, HTTP, HTTPS
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable

# Verify
sudo ufw status
```

---

## Step 6: Upload Game Files

### Option A: Using Git (Recommended)
If your code is on GitHub/GitLab:
```bash
cd /var/www
sudo mkdir umbra-online
sudo chown umbra:umbra umbra-online
cd umbra-online
git clone YOUR_REPO_URL .
```

### Option B: Using SCP/SFTP
From your local machine:
```bash
scp -r /path/to/Rebuild/* umbra@YOUR_VPS_IP:/var/www/umbra-online/
```

### Option C: Using FileZilla
1. Connect via SFTP (port 22)
2. Upload all files to `/var/www/umbra-online/`

---

## Step 7: Install Dependencies

```bash
cd /var/www/umbra-online/server
npm install
```

---

## Step 8: Configure Environment

```bash
cd /var/www/umbra-online/server
cp .env.example .env
nano .env
```

Update the `.env` file:
```
NODE_ENV=production
PORT=3000
DOMAIN=labzts.fun
WS_PATH=/ws
```

---

## Step 9: Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/umbra-online
```

Paste this configuration:
```nginx
server {
    listen 80;
    server_name labzts.fun www.labzts.fun;

    # Redirect HTTP to HTTPS (after SSL is set up)
    # return 301 https://$server_name$request_uri;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket specific
    location /ws {
        proxy_pass http://127.0.0.1:3000/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/umbra-online /etc/nginx/sites-enabled/
sudo nginx -t  # Test configuration
sudo systemctl reload nginx
```

---

## Step 10: Point Domain to VPS

In Hostinger DNS settings for labzts.fun:
1. Add/Edit an **A Record**:
   - Name: `@` (or leave blank)
   - Points to: `YOUR_VPS_IP`
   - TTL: 3600

2. (Optional) Add www subdomain:
   - Name: `www`
   - Points to: `YOUR_VPS_IP`
   - TTL: 3600

Wait 5-30 minutes for DNS propagation.

---

## Step 11: Start the Game Server

```bash
cd /var/www/umbra-online
pm2 start ecosystem.config.js --env production

# Save PM2 process list (auto-start on reboot)
pm2 save
pm2 startup  # Follow the instructions it prints
```

---

## Step 12: Set Up SSL (HTTPS)

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d labzts.fun -d www.labzts.fun

# Auto-renewal is set up automatically
```

After SSL is set up, your game will be available at:
- **Website:** https://labzts.fun
- **WebSocket:** wss://labzts.fun/ws

---

## Useful Commands

### Server Management
```bash
pm2 status              # Check server status
pm2 logs umbra-online   # View logs
pm2 restart umbra-online # Restart server
pm2 stop umbra-online   # Stop server
```

### Update Code
```bash
cd /var/www/umbra-online
git pull                # If using git
pm2 restart umbra-online
```

### View Nginx Logs
```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

---

## Troubleshooting

### Server not starting
```bash
cd /var/www/umbra-online/server
node server.js  # Run directly to see errors
```

### WebSocket not connecting
- Check Nginx config for `/ws` location
- Verify firewall allows connections
- Check browser console for errors

### 502 Bad Gateway
- Server is not running: `pm2 start umbra-online`
- Wrong port in Nginx config

---

## File Structure on VPS

```
/var/www/umbra-online/
├── client/
│   ├── index.html
│   ├── css/
│   └── js/
├── server/
│   ├── server.js
│   ├── config.js
│   ├── package.json
│   └── .env
├── shared/
│   └── constants.js
├── data/
└── ecosystem.config.js
```

---

*Last Updated: January 12, 2026*
