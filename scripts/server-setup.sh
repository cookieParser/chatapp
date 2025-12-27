#!/bin/bash

# ===========================================
# ChatApp Server Setup Script
# Run this on a fresh Ubuntu 22.04 server
# ===========================================

set -e

echo "🚀 Starting ChatApp Server Setup..."

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install required packages
echo "📦 Installing required packages..."
sudo apt install -y curl wget git apt-transport-https ca-certificates software-properties-common

# ===========================================
# Install Docker
# ===========================================
echo "🐳 Installing Docker..."
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
sudo usermod -aG docker jenkins 2>/dev/null || true

# Install Docker Compose
echo "🐳 Installing Docker Compose..."
sudo apt install -y docker-compose

# Start Docker
sudo systemctl start docker
sudo systemctl enable docker

# ===========================================
# Install Java (required for Jenkins)
# ===========================================
echo "☕ Installing Java..."
sudo apt install -y openjdk-17-jdk

# ===========================================
# Install Jenkins
# ===========================================
echo "🔧 Installing Jenkins..."
curl -fsSL https://pkg.jenkins.io/debian-stable/jenkins.io-2023.key | sudo tee /usr/share/keyrings/jenkins-keyring.asc > /dev/null
echo deb [signed-by=/usr/share/keyrings/jenkins-keyring.asc] https://pkg.jenkins.io/debian-stable binary/ | sudo tee /etc/apt/sources.list.d/jenkins.list > /dev/null
sudo apt update
sudo apt install -y jenkins

# Add Jenkins to docker group
sudo usermod -aG docker jenkins

# Start Jenkins
sudo systemctl start jenkins
sudo systemctl enable jenkins

# ===========================================
# Install Node.js (for Jenkins builds)
# ===========================================
echo "📗 Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# ===========================================
# Create app directory
# ===========================================
echo "📁 Creating app directory..."
sudo mkdir -p /opt/chatapp
sudo chown jenkins:jenkins /opt/chatapp

# ===========================================
# Configure Firewall
# ===========================================
echo "🔥 Configuring firewall..."
sudo ufw allow 22      # SSH
sudo ufw allow 80      # HTTP
sudo ufw allow 443     # HTTPS
sudo ufw allow 3000    # Next.js App
sudo ufw allow 3001    # Socket Server
sudo ufw allow 8080    # Jenkins
sudo ufw --force enable

# ===========================================
# Get Jenkins initial password
# ===========================================
echo ""
echo "============================================="
echo "✅ Setup Complete!"
echo "============================================="
echo ""
echo "🔑 Jenkins Initial Admin Password:"
sudo cat /var/lib/jenkins/secrets/initialAdminPassword
echo ""
echo "============================================="
echo ""
echo "📝 Next Steps:"
echo "1. Open Jenkins: http://YOUR_SERVER_IP:8080"
echo "2. Enter the password above"
echo "3. Install suggested plugins"
echo "4. Create admin user"
echo "5. Install 'Docker Pipeline' plugin"
echo "6. Create pipeline job (see instructions below)"
echo ""
echo "⚠️  IMPORTANT: Reboot the server to apply docker group changes:"
echo "   sudo reboot"
echo ""
