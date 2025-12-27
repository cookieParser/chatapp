# Jenkins CI/CD Setup Guide

Complete guide to deploy ChatApp with Jenkins CI/CD on your own server.

## Prerequisites

- A VPS/Server with Ubuntu 22.04 (minimum 2GB RAM, 2 CPU)
- Domain name (optional, can use IP address)
- GitHub account

---

## Step 1: Get a Server

### Option A: DigitalOcean ($12/month recommended)
1. Go to [DigitalOcean](https://www.digitalocean.com/)
2. Create Droplet → Ubuntu 22.04 → Basic → $12/month (2GB RAM)
3. Choose datacenter region closest to you
4. Add SSH key or use password
5. Create Droplet
6. Copy the IP address

### Option B: AWS EC2 (Free tier)
1. Go to [AWS Console](https://console.aws.amazon.com/)
2. EC2 → Launch Instance
3. Ubuntu 22.04, t2.micro (free tier)
4. Create/select key pair
5. Security Group: Allow ports 22, 80, 443, 3000, 3001, 8080
6. Launch and copy Public IP

### Option C: Other Providers
- Linode, Vultr, Hetzner - all work similarly

---

## Step 2: Connect to Server

```bash
# Using SSH key
ssh root@YOUR_SERVER_IP

# Or using password
ssh root@YOUR_SERVER_IP
# Enter password when prompted
```

---

## Step 3: Run Setup Script

Copy and paste this entire block:

```bash
# Download and run setup script
curl -fsSL https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/chat-app/main/scripts/server-setup.sh -o setup.sh
chmod +x setup.sh
./setup.sh
```

Or manually run these commands:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt install -y docker-compose

# Install Java
sudo apt install -y openjdk-17-jdk

# Install Jenkins
curl -fsSL https://pkg.jenkins.io/debian-stable/jenkins.io-2023.key | sudo tee /usr/share/keyrings/jenkins-keyring.asc > /dev/null
echo deb [signed-by=/usr/share/keyrings/jenkins-keyring.asc] https://pkg.jenkins.io/debian-stable binary/ | sudo tee /etc/apt/sources.list.d/jenkins.list > /dev/null
sudo apt update
sudo apt install -y jenkins

# Add Jenkins to docker group
sudo usermod -aG docker jenkins

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Create app directory
sudo mkdir -p /opt/chatapp
sudo chown jenkins:jenkins /opt/chatapp

# Start services
sudo systemctl start docker
sudo systemctl enable docker
sudo systemctl start jenkins
sudo systemctl enable jenkins

# Open firewall ports
sudo ufw allow 22
sudo ufw allow 3000
sudo ufw allow 3001
sudo ufw allow 8080
sudo ufw --force enable

# IMPORTANT: Reboot to apply docker group
sudo reboot
```

---

## Step 4: Get Jenkins Password

After reboot, SSH back in and run:

```bash
sudo cat /var/lib/jenkins/secrets/initialAdminPassword
```

Copy this password!

---

## Step 5: Setup Jenkins (Browser)

1. Open browser: `http://YOUR_SERVER_IP:8080`

2. Paste the initial admin password

3. Click "Install suggested plugins" (wait 2-3 minutes)

4. Create admin user:
   - Username: `admin`
   - Password: (choose a strong password)
   - Full name: `Admin`
   - Email: your email

5. Jenkins URL: `http://YOUR_SERVER_IP:8080/`

6. Click "Start using Jenkins"

---

## Step 6: Install Docker Plugin

1. Go to: Manage Jenkins → Plugins → Available plugins

2. Search for "Docker Pipeline"

3. Check the box and click "Install"

4. Restart Jenkins when done

---

## Step 7: Create Environment File

SSH into server and run:

```bash
# Get your server's public IP
SERVER_IP=$(curl -s ifconfig.me)
echo "Your server IP: $SERVER_IP"

# Create .env file
sudo nano /opt/chatapp/.env
```

Paste this content (replace placeholders with your actual values from `.env.local`):

```env
# MongoDB Atlas
MONGODB_URI=your_mongodb_uri_here

# Auth.js
AUTH_SECRET=your_auth_secret_here

# App URLs
NEXTAUTH_URL=http://YOUR_SERVER_IP:3000
NEXT_PUBLIC_SOCKET_URL=http://YOUR_SERVER_IP:3001

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloudinary_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

# Push Notifications
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
```

**Get these values from your local `.env.local` file!**

Save: `Ctrl+X`, then `Y`, then `Enter`

---

## Step 8: Update Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. APIs & Services → Credentials
3. Click on your OAuth 2.0 Client ID
4. Add to "Authorized redirect URIs":
   ```
   http://YOUR_SERVER_IP:3000/api/auth/callback/google
   ```
5. Save

---

## Step 9: Create Jenkins Pipeline

1. In Jenkins, click "New Item"

2. Enter name: `chatapp`

3. Select "Pipeline"

4. Click OK

5. Scroll down to "Pipeline" section

6. Definition: "Pipeline script from SCM"

7. SCM: Git

8. Repository URL: `https://github.com/YOUR_USERNAME/chat-app.git`

9. Branch: `*/main`

10. Script Path: `Jenkinsfile`

11. Click Save

---

## Step 10: Push Code & Build

First, push your code to GitHub:

```bash
# On your local machine
git add .
git commit -m "Add Jenkins CI/CD"
git push origin main
```

Then in Jenkins:

1. Click on "chatapp" pipeline
2. Click "Build Now"
3. Watch the build progress (click on build number → Console Output)

---

## Step 11: Setup Webhook (Auto-deploy on push)

### In GitHub:
1. Go to your repo → Settings → Webhooks
2. Click "Add webhook"
3. Payload URL: `http://YOUR_SERVER_IP:8080/github-webhook/`
4. Content type: `application/json`
5. Select "Just the push event"
6. Click "Add webhook"

### In Jenkins:
1. Go to chatapp pipeline → Configure
2. Check "GitHub hook trigger for GITScm polling"
3. Save

Now every push to main branch will auto-deploy!

---

## Verify Deployment

After successful build:

- **App**: http://YOUR_SERVER_IP:3000
- **Socket**: http://YOUR_SERVER_IP:3001/health
- **Jenkins**: http://YOUR_SERVER_IP:8080

---

## Troubleshooting

### Check container logs:
```bash
cd /opt/chatapp
docker-compose logs -f
```

### Restart containers:
```bash
cd /opt/chatapp
docker-compose restart
```

### Rebuild from scratch:
```bash
cd /opt/chatapp
docker-compose down
docker-compose up --build -d
```

### Check Jenkins logs:
```bash
sudo journalctl -u jenkins -f
```

### Permission issues:
```bash
sudo chown -R jenkins:jenkins /opt/chatapp
sudo chmod -R 755 /opt/chatapp
```

---

## Summary

| Service | URL |
|---------|-----|
| ChatApp | http://YOUR_SERVER_IP:3000 |
| Socket Server | http://YOUR_SERVER_IP:3001 |
| Jenkins | http://YOUR_SERVER_IP:8080 |

Every time you push to `main` branch, Jenkins will automatically:
1. Pull latest code
2. Run tests
3. Build Docker images
4. Deploy to server
5. Health check

🎉 You now have a fully automated CI/CD pipeline!
