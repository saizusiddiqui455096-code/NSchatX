# NS ChatX Deployment Guide

## Local Development

### Quick Start
```bash
npm install
npm start
```
Visit: http://localhost:3000

---

## Production Deployment

### Option 1: Linux Server with PM2

**1. Connect to your server**
```bash
ssh user@your-server.com
```

**2. Clone the repository**
```bash
cd /opt
git clone https://github.com/saizusiddiqui455096-code/NSchatX.git
cd NSchatX
```

**3. Install Node.js (if not installed)**
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**4. Install dependencies**
```bash
npm install
```

**5. Install PM2**
```bash
sudo npm install -g pm2
```

**6. Create .env file for production**
```bash
nano .env
```
Update with your production settings:
```
PORT=3000
NODE_ENV=production
HOST=0.0.0.0
```

**7. Start with PM2**
```bash
pm2 start server.js --name "ns-chatx"
pm2 startup
pm2 save
```

**8. Check status**
```bash
pm2 status
pm2 logs ns-chatx
```

---

### Option 2: Docker Deployment

**1. Create Dockerfile**
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
```

**2. Build and run**
```bash
docker build -t ns-chatx .
docker run -d -p 3000:3000 --name ns-chatx ns-chatx
```

---

### Option 3: Heroku Deployment

**1. Install Heroku CLI**
```bash
npm install -g heroku
heroku login
```

**2. Create Heroku app**
```bash
heroku create your-app-name
```

**3. Deploy**
```bash
git push heroku main
```

**4. View logs**
```bash
heroku logs --tail
```

---

## Nginx Reverse Proxy Setup

### Install Nginx
```bash
sudo apt-get update
sudo apt-get install nginx
```

### Configure Nginx
**Create config file:**
```bash
sudo nano /etc/nginx/sites-available/ns-chatx
```

**Add configuration:**
```nginx
upstream ns_chatx {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    client_max_body_size 10M;

    location / {
        proxy_pass http://ns_chatx;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Enable the site
```bash
sudo ln -s /etc/nginx/sites-available/ns-chatx /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## SSL/TLS with Let's Encrypt

### Install Certbot
```bash
sudo apt-get install certbot python3-certbot-nginx
```

### Generate certificate
```bash
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

### Auto-renewal
```bash
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

---

## Monitoring & Maintenance

### View PM2 logs
```bash
pm2 logs ns-chatx
```

### Restart application
```bash
pm2 restart ns-chatx
```

### Stop application
```bash
pm2 stop ns-chatx
```

### Update code
```bash
git pull origin main
npm install
pm2 restart ns-chatx
```

---

## Environment Variables

Edit `.env` for your deployment:

```bash
# Server
PORT=3000
NODE_ENV=production
HOST=0.0.0.0

# Room Settings
ROOM_TTL_MS=3600000      # 1 hour
TOKEN_TTL_MS=120000       # 2 minutes
HISTORY_MAX=200           # Max messages per room

# WebSocket
WS_HEARTBEAT_INTERVAL=30000

# Security
ENABLE_CORS=true
CORS_ORIGIN=*
```

---

## Performance Tuning

### Increase file descriptors (Linux)
```bash
sudo ulimit -n 65535
```

### Enable gzip compression in Nginx
```nginx
gzip on;
gzip_types text/plain text/css application/json application/javascript;
gzip_vary on;
```

### Node.js cluster mode (optional)
For multi-core servers, use PM2 cluster mode:
```bash
pm2 start server.js -i max --name "ns-chatx"
```

---

## Troubleshooting

### Port already in use
```bash
sudo lsof -i :3000
kill -9 <PID>
```

### WebSocket connection issues
- Ensure firewall allows port 3000
- Check Nginx `Upgrade` header configuration
- Verify WebSocket is not blocked by proxy

### High memory usage
- Check `HISTORY_MAX` setting
- Monitor with: `pm2 monit`
- Restart periodically: `pm2 restart all`

### SSL certificate issues
```bash
sudo certbot renew --dry-run
```

---

## Security Checklist

- [ ] Use HTTPS (Let's Encrypt)
- [ ] Set `NODE_ENV=production`
- [ ] Configure firewall rules
- [ ] Use strong room passwords
- [ ] Update Node.js regularly
- [ ] Monitor server logs
- [ ] Set rate limiting on Nginx (optional)
- [ ] Enable SELinux (optional)

---

## Backup & Recovery

### Backup application
```bash
tar -czf ns-chatx-backup.tar.gz /opt/NSchatX
```

### Restore from backup
```bash
tar -xzf ns-chatx-backup.tar.gz -C /opt
```

---

## Support

For issues or questions:
1. Check application logs: `pm2 logs ns-chatx`
2. Check Nginx logs: `sudo tail -f /var/log/nginx/error.log`
3. Review README.md for feature documentation
4. Check GitHub issues

---

**Application is now ready for production! 🚀**
