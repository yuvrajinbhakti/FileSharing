# 🔐 SecureShare | Enterprise File Sharing Platform

<div align="center">

![SecureShare Logo](client/public/logo192.png)

**Enterprise-grade secure file sharing platform built with MERN stack**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=flat&logo=docker&logoColor=white)](https://www.docker.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-%234ea94b.svg?style=flat&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Redis](https://img.shields.io/badge/redis-%23DD0031.svg?style=flat&logo=redis&logoColor=white)](https://redis.io/)

[🚀 Quick Start](#-quick-start) • [📖 Documentation](#-api-documentation) • [🐳 Docker](#-docker-deployment) • [☁️ Deploy](#️-cloud-deployment) • [🤝 Contributing](#-contributing)

</div>

---

## 🌟 Overview

SecureShare is a file sharing platform built on the MERN stack. Files are encrypted at rest with AES-256-GCM, access is controlled by JWT authentication and per-user roles, and security events are written to an audit log.

"Production-ready" and "enterprise-grade" are not claimed, because neither is something a repository can assert about itself.

### 🎯 What it does

- **🔐 Encryption at rest**: AES-256-GCM, with a fresh IV per file and the
  authentication tag verified on the way back out. An upload that cannot be
  encrypted is refused rather than stored in the clear.
- **🔑 JWT authentication** with refresh tokens, account lockout, and
  role-based access control
- **📝 Audit logging** of security events to MongoDB
- **⚡ Redis caching** and connection pooling
- **🐳 Docker** containerisation with a health endpoint

Deliberately not listed: uptime, response-time and efficiency figures. Nothing
in this repository measures them, so any number here would be a guess wearing a
percentage sign.

---

## ✨ Features

### 🛡️ **Security & Authentication**
- **🔐 AES-256-GCM Encryption**: All files encrypted at rest with unique keys
- **🔑 JWT + TOTP 2FA**: Secure authentication with Google Authenticator support
- **👥 Role-Based Access Control**: User, Moderator, and Admin roles with granular permissions
- **🔒 Account Security**: Account lockout protection, password policies, backup codes
- **🛡️ Advanced Rate Limiting**: Global and per-user limits with Redis backend
- **📝 Comprehensive Audit Logging**: All security events tracked in MongoDB
- **🔍 Real-time Security Monitoring**: Automated threat detection and alerting

### 📁 **File Management**
- **📤 Secure File Upload**: Drag & drop with real-time progress tracking
- **📥 Encrypted File Storage**: SHA-256 hash verification and integrity checks
- **📊 Access Levels**: Private, Public, and Restricted file sharing options
- **🏷️ Rich Metadata**: Tags, descriptions, expiration dates, and custom attributes
- **📈 Download Tracking**: Monitor access patterns and usage analytics
- **🗑️ Automatic Cleanup**: Expired files and temporary data management
- **🔍 File Search**: Advanced search with filters and metadata queries

### 🔗 **Advanced Sharing**
- **🔐 Encrypted Share Links**: Unique tokens with access controls
- **⏰ Smart Expiration**: Time-based and download-count limits
- **🔒 Password Protection**: Optional passwords for sensitive files
- **📧 Email Restrictions**: Limit access to specific email addresses
- **📊 Share Analytics**: Detailed download statistics and access logs
- **🚫 Instant Revocation**: Disable shared links immediately

### 📦 **Bulk Operations**
- **📥 Bulk Download**: Create encrypted ZIP archives of multiple files
- **🗑️ Bulk Delete**: Multi-file deletion with admin override capabilities
- **🏷️ Bulk Metadata Updates**: Mass update tags, descriptions, and access levels
- **📊 Progress Tracking**: Real-time status for long-running operations
- **📈 Usage Statistics**: Comprehensive analytics and reporting

### 🎛️ **Administration & Monitoring**
- **👑 Admin Dashboard**: Comprehensive system overview and user management
- **📊 System Metrics**: Real-time performance monitoring with Redis caching
- **📧 Email Notifications**: Professional templates for all system events
- **⏰ Automated Scheduling**: Cleanup, maintenance, and report generation
- **🔍 Advanced Logging**: Winston-based logging with multiple transports
- **📱 Health Monitoring**: Automated system health checks and alerting

---

## 🚀 Technology Stack

<div align="center">

### **Backend**
![Node.js](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/express.js-%23404d59.svg?style=for-the-badge&logo=express&logoColor=%2361DAFB)
![MongoDB](https://img.shields.io/badge/MongoDB-%234ea94b.svg?style=for-the-badge&logo=mongodb&logoColor=white)
![Redis](https://img.shields.io/badge/redis-%23DD0031.svg?style=for-the-badge&logo=redis&logoColor=white)

### **Frontend**
![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)
![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E)
![CSS3](https://img.shields.io/badge/css3-%231572B6.svg?style=for-the-badge&logo=css3&logoColor=white)

### **Security & Infrastructure**
![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)
![Nginx](https://img.shields.io/badge/nginx-%23009639.svg?style=for-the-badge&logo=nginx&logoColor=white)
![JWT](https://img.shields.io/badge/JWT-black?style=for-the-badge&logo=JSON%20web%20tokens)

</div>

### **Core Technologies**
- **Backend**: Node.js 18+, Express.js, MongoDB with Mongoose ODM
- **Frontend**: React 18, Modern JavaScript (ES6+), Responsive CSS
- **Security**: AES-256-GCM encryption, JWT tokens, bcrypt hashing, TOTP 2FA
- **Caching**: Redis for sessions, rate limiting, and performance optimization
- **Infrastructure**: Docker containers, Nginx reverse proxy, health monitoring
- **Logging**: Winston with MongoDB and file transports
- **Email**: Nodemailer with professional templates
- **Scheduling**: Node-cron for automated maintenance

---

## 🚀 Quick Start

### **Prerequisites**
- Docker 20.10+ and Docker Compose 2.0+
- Node.js 16+ (for local development)
- Git

### **1. Clone Repository**
```bash
git clone https://github.com/your-username/secureshare.git
cd secureshare/FileSharing
```

### **2. Environment Setup**
```bash
# Copy environment template
cp docker.env.template .env

# Edit configuration (IMPORTANT: Change JWT secrets and passwords!)
nano .env
```

### **3. Start Application**
```bash
# Make scripts executable
chmod +x scripts/*.sh

# Start development environment
./scripts/docker-dev.sh start

# OR start production environment
./scripts/docker-prod.sh start
```

### **4. Access Application**
- 🌐 **Frontend**: http://localhost:3000
- 🚀 **Backend API**: http://localhost:8000
- 📊 **Health Check**: http://localhost:8000/api/health
- 🗄️ **MongoDB**: mongodb://localhost:27017
- 🔄 **Redis**: redis://localhost:6379

### **5. Create First Admin User**
```bash
# Access server container
docker-compose exec secureshare-server /bin/sh

# Run admin creation script
node scripts/createAdmin.js
```

---

## 🐳 Docker Deployment

### **Development Environment**
```bash
# Build and start development containers with hot reload
./scripts/docker-dev.sh build
./scripts/docker-dev.sh start

# View logs
./scripts/docker-dev.sh logs

# Stop environment
./scripts/docker-dev.sh stop
```

### **Production Environment**
```bash
# Build and start production containers
./scripts/docker-prod.sh build
./scripts/docker-prod.sh start

# Start with Nginx reverse proxy
./scripts/docker-prod.sh start-proxy

# Create database backup
./scripts/docker-prod.sh backup

# Update containers
./scripts/docker-prod.sh update
```

### **Docker Services**
| Service | Description | Port | Health Check |
|---------|-------------|------|--------------|
| `secureshare-server` | Node.js API server | 8000 | `/api/health` |
| `secureshare-client` | React frontend | 3000 | HTTP 200 |
| `secureshare-db` | MongoDB database | 27017 | `db.ping()` |
| `secureshare-redis` | Redis cache | 6379 | `PING` |
| `secureshare-proxy` | Nginx proxy | 80/443 | HTTP 200 |

---

## ☁️ Cloud Deployment

### **Free Tier Deployment (Recommended)**

#### **1. Database Setup (MongoDB Atlas - FREE)**
1. Create account at [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Create free M0 cluster (512MB)
3. Get connection string: `mongodb+srv://username:password@cluster.mongodb.net/secureshare`

#### **2. Cache Setup (Upstash Redis - FREE)**
1. Create account at [Upstash](https://upstash.com/)
2. Create Redis database (10K commands/day free)
3. Get Redis URL: `redis://:password@region.upstash.io:port`

#### **3. Backend Deployment (Railway - FREE)**
1. Create account at [Railway](https://railway.app/)
2. Connect GitHub repository
3. Deploy from `server` folder
4. Add environment variables:
```env
NODE_ENV=production
MONGO_URL=<mongodb-atlas-url>
REDIS_URL=<upstash-redis-url>
JWT_SECRET=<secure-256-bit-key>
JWT_REFRESH_SECRET=<secure-256-bit-key>
FRONTEND_URL=<vercel-url>
```

#### **4. Frontend Deployment (Vercel - FREE)**
1. Create account at [Vercel](https://vercel.com/)
2. Connect GitHub repository
3. Set root directory to `client`
4. Add environment variable:
```env
REACT_APP_API_URL=https://your-app.railway.app/api
```

### **Production Deployment**
For production deployments, see our comprehensive [Deployment Guide](DEPLOYMENT.md) covering:
- Kubernetes manifests
- AWS/Azure/GCP deployment
- SSL certificate setup
- Load balancing configuration
- Monitoring and alerting

---

## 📖 API Documentation

### **Authentication Endpoints**
```bash
# User Registration
POST /api/auth/register
{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "SecurePass123!",
  "confirmPassword": "SecurePass123!"
}

# User Login
POST /api/auth/login
{
  "username": "john_doe",
  "password": "SecurePass123!"
}

# Setup 2FA
POST /api/auth/2fa/setup
Headers: Authorization: Bearer <token>

# Enable 2FA
POST /api/auth/2fa/enable
{
  "token": "123456"
}
```

### **File Management**
```bash
# Upload File
POST /api/upload
Form Data:
- file: <file>
- accessLevel: "private|public|restricted"
- description: "File description"
- tags: "tag1,tag2,tag3"

# Download File
GET /api/file/:fileId
Headers: Authorization: Bearer <token>

# Delete File
DELETE /api/file/:fileId
Headers: Authorization: Bearer <token>

# Get User Files
GET /api/files?page=1&limit=10
Headers: Authorization: Bearer <token>
```

### **File Sharing**
```bash
# Create Share Link
POST /api/share/generate/:fileId
{
  "expiresAt": "2024-12-31T23:59:59Z",
  "maxDownloads": 5,
  "password": "sharepass123",
  "allowedEmails": ["user@example.com"]
}

# Access Shared File
POST /api/share/access/:linkId/:token
{
  "password": "sharepass123",
  "email": "user@example.com"
}
```

### **Bulk Operations**
```bash
# Bulk Download
POST /api/bulk/download
{
  "fileIds": ["id1", "id2", "id3"],
  "zipName": "my-files.zip",
  "compressionLevel": 6
}

# Bulk Delete
DELETE /api/bulk/files
{
  "fileIds": ["id1", "id2", "id3"]
}

# Bulk Metadata Update
PUT /api/bulk/metadata
{
  "fileIds": ["id1", "id2"],
  "updates": {
    "tags": ["important", "project-x"],
    "accessLevel": "public"
  }
}
```

### **Admin Endpoints**
```bash
# Get All Files (Admin)
GET /api/admin/files?page=1&limit=20
Headers: Authorization: Bearer <admin-token>

# Get All Users (Admin)
GET /api/admin/users?page=1&limit=20
Headers: Authorization: Bearer <admin-token>

# System Health
GET /api/health

# System Metrics
GET /api/system/metrics
Headers: Authorization: Bearer <token>
```

---

## ⚙️ Configuration

### **Environment Variables**
| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NODE_ENV` | Environment mode | `development` | No |
| `PORT` | Server port | `8000` | No |
| `MONGO_URL` | MongoDB connection string | - | **Yes** |
| `REDIS_URL` | Redis connection string | - | No |
| `JWT_SECRET` | JWT signing secret (256-bit) | - | **Yes** |
| `JWT_REFRESH_SECRET` | Refresh token secret (256-bit) | - | **Yes** |
| `FRONTEND_URL` | Frontend URL for CORS | `http://localhost:3000` | No |
| `SMTP_HOST` | Email server host | - | No |
| `SMTP_USER` | Email username | - | No |
| `SMTP_PASS` | Email password | - | No |
| `LOG_LEVEL` | Logging level | `info` | No |

### **Security Configuration**
```javascript
// JWT Tokens
ACCESS_TOKEN_EXPIRY = "15m"    // 15 minutes
REFRESH_TOKEN_EXPIRY = "7d"    // 7 days

// File Encryption
ALGORITHM = "aes-256-gcm"      // AES-256-GCM
KEY_SIZE = 256                 // 256 bits
IV_SIZE = 128                  // 128 bits

// Rate Limiting
GLOBAL_LIMIT = 1000           // requests per 15 minutes
AUTH_LIMIT = 5                // login attempts per 15 minutes
UPLOAD_LIMIT = 50             // uploads per hour
USER_LIMIT = 100              // requests per user per 15 minutes

// Account Security
PASSWORD_MIN_LENGTH = 8       // minimum password length
FAILED_LOGIN_ATTEMPTS = 5     // before account lock
ACCOUNT_LOCK_TIME = 2         // hours
BCRYPT_ROUNDS = 12           // password hashing rounds
```

---

## 🔍 Monitoring & Logging

### **Health Monitoring**
```bash
# Check system health
curl http://localhost:8000/api/health

# Get system metrics
curl -H "Authorization: Bearer <token>" \
     http://localhost:8000/api/system/metrics

# View application logs
docker-compose logs -f secureshare-server

# View audit logs in MongoDB
use secureshare;
db.audit_logs.find().sort({timestamp: -1}).limit(10);
```

### **Audit Events Tracked**
- **Authentication**: Login success/failure, 2FA events, password resets
- **File Operations**: Upload, download, delete, share events
- **Security Events**: Unauthorized access, rate limit violations
- **System Events**: Server startup/shutdown, health checks
- **Admin Actions**: User management, system configuration changes

### **Performance Metrics**
- **Response Times**: API endpoint performance tracking
- **Cache Hit Rates**: Redis caching effectiveness
- **File Operations**: Upload/download statistics
- **User Activity**: Active sessions and usage patterns
- **System Resources**: Memory, CPU, and storage utilization

---

## 🧪 Testing

### **Run Tests**
```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# Security tests
npm run test:security

# Performance tests
npm run test:performance
```

### **Load Testing**
```bash
# Install artillery for load testing
npm install -g artillery

# Run load test
artillery quick --count 100 --num 10 http://localhost:8000/api/health
```

---

## 🛠️ Development

### **Local Development Setup**
```bash
# Clone repository
git clone https://github.com/your-username/secureshare.git
cd secureshare/FileSharing

# Install server dependencies
cd server
npm install
cp .env.example .env  # Configure environment

# Install client dependencies
cd ../client
npm install

# Start development servers
# Terminal 1: Start MongoDB
mongod

# Terminal 2: Start Redis
redis-server

# Terminal 3: Start backend
cd server && npm run dev

# Terminal 4: Start frontend
cd client && npm start
```

### **Project Structure**
```
FileSharing/
├── client/                     # React frontend
│   ├── public/                # Static assets
│   ├── src/
│   │   ├── components/        # React components
│   │   ├── contexts/         # React contexts
│   │   ├── service/          # API service layer
│   │   └── App.js           # Main app component
│   ├── Dockerfile           # Production container
│   └── package.json         # Dependencies
├── server/                     # Node.js backend
│   ├── controller/           # Route controllers
│   ├── database/            # Database connections
│   ├── middleware/          # Express middleware
│   ├── models/              # Mongoose models
│   ├── routes/              # API routes
│   ├── utils/               # Utility functions
│   ├── uploads/             # File storage
│   ├── logs/                # Application logs
│   ├── server.js            # Main server file
│   └── package.json         # Dependencies
├── scripts/                    # Management scripts
├── docker-compose.yml         # Production containers
├── docker-compose.dev.yml     # Development containers
└── README.md                  # This file
```

### **Code Quality**
```bash
# Linting
npm run lint

# Code formatting
npm run format

# Security audit
npm audit

# Dependency check
npm outdated
```

---

## 🔒 Security

### **Security Features**
- ✅ **AES-256-GCM Encryption**: All files encrypted at rest
- ✅ **JWT + TOTP 2FA**: Multi-factor authentication
- ✅ **bcrypt Password Hashing**: 12 rounds with salt
- ✅ **Rate Limiting**: DDoS protection
- ✅ **Input Validation**: All endpoints protected
- ✅ **CORS Protection**: Configurable origins
- ✅ **Helmet Security Headers**: XSS, clickjacking protection
- ✅ **Account Lockout**: Failed login protection
- ✅ **Audit Logging**: Complete security event tracking

### **Security Best Practices**
- 🔐 Change default JWT secrets immediately
- 🔑 Use strong passwords for all accounts
- 🛡️ Enable 2FA for all admin accounts
- 📊 Monitor audit logs regularly
- 🔄 Rotate secrets periodically
- 🚫 Never commit secrets to version control
- 🔍 Regular security updates
- 📋 Follow least privilege principle

### **Vulnerability Reporting**
If you discover a security vulnerability, please send an email to security@yourcompany.com. All security vulnerabilities will be promptly addressed.

---

## 🚀 Performance

### **Optimization Features**
- **🔄 Redis Caching**: User sessions, file metadata, rate limits
- **📊 Database Indexing**: Optimized queries with proper indexes
- **🗜️ File Compression**: Bulk downloads with configurable compression
- **⚡ Connection Pooling**: Efficient database connections
- **📱 Lazy Loading**: Frontend components loaded on demand
- **🔧 Production Builds**: Minified and optimized assets

### **Performance**

No benchmark numbers are quoted here, because none have been measured. This
section used to claim sub-100ms endpoints, 1000+ concurrent users, sub-50ms
queries and a 90% cache hit rate; the repository contains no load test, no
timing instrumentation and nothing recording cache hits, so all five were
invented.

The optimisations listed above are real and are worth doing. What they achieve
under load is unknown until somebody measures it.

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

### **Development Workflow**
1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/AmazingFeature`)
3. **Commit** your changes (`git commit -m 'Add AmazingFeature'`)
4. **Push** to the branch (`git push origin feature/AmazingFeature`)
5. **Open** a Pull Request

### **Contribution Areas**
- 🐛 **Bug Fixes**: Help us squash bugs
- ✨ **New Features**: Add new functionality
- 📚 **Documentation**: Improve docs and guides
- 🔒 **Security**: Enhance security features
- 🚀 **Performance**: Optimize performance
- 🧪 **Testing**: Improve test coverage

### **Code Style**
- Follow ESLint configuration
- Use Prettier for code formatting
- Write comprehensive tests
- Document new features
- Follow commit message conventions

---

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **Security**: Thanks to the OWASP community for security best practices
- **Encryption**: Inspired by industry-standard encryption implementations
- **UI/UX**: Modern design principles and accessibility guidelines
- **Performance**: Optimization techniques from high-scale applications
- **Community**: Open source contributors and security researchers

---

## 📞 Support

### **Documentation**
- 📖 [API Documentation](docs/api.md)
- 🐳 [Docker Guide](docs/docker.md)
- ☁️ [Deployment Guide](DEPLOYMENT.md)
- 🔒 [Security Guide](docs/security.md)
- 🛠️ [Troubleshooting](docs/troubleshooting.md)

### **Community**
- 💬 [Discussions](https://github.com/your-username/secureshare/discussions)
- 🐛 [Issue Tracker](https://github.com/your-username/secureshare/issues)
- 📧 [Email Support](mailto:support@yourcompany.com)

### **Enterprise Support**
For enterprise support, custom development, or consulting services, please contact us at enterprise@yourcompany.com.

---

<div align="center">

**⭐ If you found this project helpful, please give it a star! ⭐**

Made with ❤️ by the SecureShare Team

[🔝 Back to Top](#-secureshare--enterprise-file-sharing-platform)

</div>
