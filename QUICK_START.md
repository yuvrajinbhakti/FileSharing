# 🚀 SecureShare - Quick Start Guide

## 🎯 New Features Overview

Your SecureShare application now includes **enterprise-grade features**:

### ✅ **Implemented Features**
- 🔐 **Redis Integration** - Caching, sessions, rate limiting
- 📧 **Email Notifications** - Welcome, sharing, password reset, security alerts
- 🔐 **Two-Factor Authentication** - TOTP with Google Authenticator support
- 🔗 **Secure File Sharing** - Encrypted links with expiration and access controls
- 📦 **Bulk Operations** - Download, delete, update multiple files
- ⏰ **Advanced Scheduling** - Automated cleanup and monitoring
- 👤 **Enhanced User Management** - Profiles, activity tracking, API keys
- 📊 **Comprehensive Audit Logging** - All actions tracked and auditable

## 🚀 **Quick Start**

### 1. **Start the Application**
```bash
# Start all services with Docker
cd FileSharing
docker-compose up --build

# Or for development with hot reload
./scripts/docker-dev.sh start
```

### 2. **Access the Application**
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **MongoDB**: mongodb://localhost:27017
- **Redis**: redis://localhost:6379

### 3. **Test New Features**

#### **Two-Factor Authentication Setup**
```bash
# 1. Register/Login to get JWT token
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "password": "TestPass123!"}'

# 2. Setup 2FA (use the JWT token from login)
curl -X POST http://localhost:8000/api/auth/2fa/setup \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 3. Enable 2FA with TOTP code
curl -X POST http://localhost:8000/api/auth/2fa/enable \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"token": "123456"}'
```

#### **Secure File Sharing**
```bash
# 1. Generate share link for a file
curl -X POST http://localhost:8000/api/share/generate/FILE_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "expiresAt": "2024-12-31T23:59:59Z",
    "maxDownloads": 5,
    "password": "sharepass123",
    "allowedEmails": ["user@example.com"],
    "description": "Shared document"
  }'

# 2. Access shared file (no auth required)
curl -X POST http://localhost:8000/api/share/access/LINK_ID/ACCESS_TOKEN \
  -H "Content-Type: application/json" \
  -d '{"password": "sharepass123", "email": "user@example.com"}'
```

#### **Bulk Operations**
```bash
# 1. Create bulk download
curl -X POST http://localhost:8000/api/bulk/download \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"fileIds": ["file1", "file2", "file3"], "zipName": "my-files.zip"}'

# 2. Bulk update metadata
curl -X PUT http://localhost:8000/api/bulk/metadata \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fileIds": ["file1", "file2"],
    "updates": {
      "tags": ["important", "project-x"],
      "description": "Updated files",
      "accessLevel": "public"
    }
  }'

# 3. Get file statistics
curl -X GET "http://localhost:8000/api/bulk/statistics?dateRange=30&groupBy=day" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### **Password Reset**
```bash
# 1. Request password reset
curl -X POST http://localhost:8000/api/auth/password/reset \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'

# 2. Reset password with token (from email)
curl -X POST http://localhost:8000/api/auth/password/confirm \
  -H "Content-Type: application/json" \
  -d '{
    "token": "RESET_TOKEN_FROM_EMAIL",
    "newPassword": "NewSecurePass123!",
    "confirmPassword": "NewSecurePass123!"
  }'
```

#### **User Activity Tracking**
```bash
# Get user activity history
curl -X GET "http://localhost:8000/api/auth/activity?limit=20" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 🔧 **Configuration**

### **Environment Variables**
Copy and configure the environment file:
```bash
cp docker.env.template .env
```

**Key configurations:**
```env
# Redis (for caching and sessions)
REDIS_HOST=secureshare-redis
REDIS_PASSWORD=redispassword123

# Email (for notifications)
SMTP_HOST=smtp.gmail.com
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# JWT Secrets (CHANGE THESE!)
JWT_SECRET=your-super-secret-jwt-key-256-bits-minimum
JWT_REFRESH_SECRET=your-super-secret-refresh-key-256-bits-minimum
```

### **Email Setup (Optional)**
To enable email notifications:
1. Create an app password in Gmail
2. Update `.env` with your SMTP credentials
3. Restart the application

### **Redis Dashboard (Optional)**
To monitor Redis:
```bash
# Install Redis CLI
brew install redis  # macOS
# or
sudo apt-get install redis-tools  # Ubuntu

# Connect to Redis
redis-cli -h localhost -p 6379 -a redispassword123
```

## 📊 **Monitoring & Health**

### **Health Check**
```bash
curl http://localhost:8000/api/health
```

### **System Metrics**
```bash
curl -X GET http://localhost:8000/api/system/metrics \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### **Logs**
```bash
# View application logs
docker-compose logs secureshare-server

# View all services
docker-compose logs

# Follow logs in real-time
docker-compose logs -f
```

## 🔐 **Security Features Demo**

### **Rate Limiting Test**
```bash
# Make multiple rapid requests to trigger rate limiting
for i in {1..10}; do
  curl -X POST http://localhost:8000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username": "test", "password": "wrong"}' &
done
```

### **Audit Logs**
All security events are logged to MongoDB in the `audit_logs` collection:
```javascript
// Connect to MongoDB
use secureshare;
db.audit_logs.find().sort({timestamp: -1}).limit(10);
```

## 🚦 **Troubleshooting**

### **Common Issues**

1. **Redis Connection Failed**
   ```bash
   # Check Redis container
   docker-compose ps secureshare-redis
   docker-compose logs secureshare-redis
   ```

2. **Email Not Sending**
   - Verify SMTP credentials in `.env`
   - Check Gmail app password settings
   - Review server logs for email errors

3. **2FA Setup Issues**
   - Ensure time sync on authenticator app
   - Use backup codes if token fails
   - Check QR code generation in logs

4. **File Upload/Download Issues**
   - Check file permissions on uploads directory
   - Verify encryption/decryption process
   - Review file size limits

### **Reset Everything**
```bash
# Stop and remove all containers
docker-compose down -v

# Remove all data (CAUTION: This deletes everything!)
docker system prune -a
docker volume prune

# Restart fresh
docker-compose up --build
```

## 🎯 **Next Steps**

1. **Configure Email** - Set up SMTP for notifications
2. **Setup 2FA** - Enable two-factor authentication for admin users
3. **Create Share Links** - Test secure file sharing functionality
4. **Monitor Usage** - Use the new analytics and reporting features
5. **Customize Settings** - Adjust rate limits, file sizes, and expiration times

## 📚 **Documentation**

- **API Documentation**: Check `IMPLEMENTATION_SUMMARY.md` for all endpoints
- **Security Guide**: Review audit logging and security features
- **Admin Guide**: User management and system administration
- **Deployment Guide**: Production deployment considerations

---

**🎉 Congratulations!** Your SecureShare platform now has enterprise-grade features including Redis caching, two-factor authentication, email notifications, secure file sharing, bulk operations, and comprehensive audit logging! 