#!/bin/bash

# ===========================================
# Create .env file for ChatApp
# Run this after server setup
# ===========================================

echo "Creating .env file..."

# Get server IP
SERVER_IP=$(curl -s ifconfig.me)

cat > /opt/chatapp/.env << 'EOF'
# MongoDB Atlas
MONGODB_URI=your_mongodb_uri_here

# Auth.js
AUTH_SECRET=your_auth_secret_here

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
EOF

# Add dynamic values
echo "" >> /opt/chatapp/.env
echo "# App URLs (auto-detected)" >> /opt/chatapp/.env
echo "NEXTAUTH_URL=http://${SERVER_IP}:3000" >> /opt/chatapp/.env
echo "NEXT_PUBLIC_SOCKET_URL=http://${SERVER_IP}:3001" >> /opt/chatapp/.env

echo ""
echo "✅ .env file created at /opt/chatapp/.env"
echo ""
echo "Server IP: ${SERVER_IP}"
echo "App URL: http://${SERVER_IP}:3000"
echo "Socket URL: http://${SERVER_IP}:3001"
echo ""
