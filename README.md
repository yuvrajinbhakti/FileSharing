# SecureShare | Enterprise File Sharing Platform

## 🔐 Overview

SecureShare is a secure, enterprise-grade file sharing platform built with the MERN stack, featuring AES-256 encryption, JWT-based authentication, role-based access control, and comprehensive audit logging.

## ✨ Features

### 🛡️ Security Features
- **AES-256 Encryption**: All files encrypted at rest with unique keys
- **JWT Authentication**: Secure token-based authentication with refresh tokens
- **Role-Based Access Control**: User, Moderator, and Admin roles
- **Account Security**: Account lockout after failed login attempts
- **Rate Limiting**: Global and per-user rate limiting
- **Audit Logging**: Comprehensive security event logging to MongoDB
- **Input Validation**: Server-side validation for all endpoints
- **CORS Protection**: Configurable cross-origin resource sharing
- **Helmet Security**: HTTP security headers protection

### 📁 File Management
- **Encrypted File Storage**: AES-256-GCM encryption for all files
- **File Ownership**: Users can only access their own files (except admins)
- **Access Levels**: Private, Public, and Restricted file sharing
- **Download Tracking**: Track download counts and last access times
- **File Integrity**: SHA-256 hash verification
- **Automatic Cleanup**: Temporary decrypted files auto-deleted
- **File Metadata**: Support for tags, descriptions, and expiration dates

### 👥 User Management
- **User Registration**: Secure user registration with validation
- **Password Security**: bcrypt hashing with configurable rounds
- **Profile Management**: User profile and settings
- **Admin Panel**: Administrative user and file management
- **Session Management**: JWT with automatic refresh

### 📊 Monitoring & Logging
- **Audit Trails**: All security events logged with timestamps
- **Performance Monitoring**: Request duration and error tracking
- **Security Alerts**: Failed login attempts, unauthorized access
- **Database Logging**: Audit logs stored in MongoDB
- **File Logging**: Local log files with rotation

## 🚀 Technology Stack

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **MongoDB** - Database with Mongoose ODM
- **JWT** - Authentication tokens
- **bcrypt** - Password hashing
- **Winston** - Logging framework
- **Multer** - File upload handling
- **Helmet** - Security middleware
- **Rate Limiting** - DDoS protection

### Frontend
- **React.js** - UI framework
- **Axios** - HTTP client
- **Modern JavaScript** - ES6+ features

### Security
- **AES-256-GCM** - File encryption
- **PBKDF2** - Key derivation
- **SHA-256** - File integrity hashing
- **CORS** - Cross-origin protection
- **Input Validation** - Server-side validation

## 📦 Installation

### Prerequisites
- Node.js 16+ 
- MongoDB 4.4+
- npm or yarn

### Server Setup

1. **Clone and navigate to server directory**
```bash
cd FileSharing/server
```

2. **Install dependencies**
```bash
npm install
```

3. **Environment Configuration**
Create a `.env` file in the server directory:
```env
# Database
MONGO_URL=mongodb://localhost:27017/secureshare

# Server
PORT=8000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# JWT Security (CHANGE IN PRODUCTION!)
JWT_SECRET=your-super-secret-jwt-key-minimum-256-bits
JWT_REFRESH_SECRET=your-super-secret-refresh-key-minimum-256-bits

# Logging
LOG_LEVEL=info
```

4. **Create Admin User**
```bash
npm run setup
```

5. **Start Development Server**
```bash
npm run dev
```

### Client Setup

1. **Navigate to client directory**
```bash
cd FileSharing/client
```

2. **Install dependencies**
```bash
npm install
```

3. **Start React App**
```bash
npm start
```

## 🔧 API Endpoints

### Authentication
```
POST   /api/auth/register     - User registration
POST   /api/auth/login        - User login
POST   /api/auth/refresh      - Refresh access token
POST   /api/auth/logout       - User logout
GET    /api/auth/profile      - Get user profile
```

### File Management
```
POST   /api/upload            - Upload encrypted file
GET    /api/files             - Get user's files
GET    /api/file/:id          - Download file
DELETE /api/file/:id          - Delete file
```

### Admin Routes
```
GET    /api/admin/files       - List all files (admin)
GET    /api/admin/users       - List all users (admin)
```

### System
```
GET    /api/health            - Health check
```

## 🔐 Security Configuration

### JWT Tokens
- **Access Token**: 15 minutes expiry
- **Refresh Token**: 7 days expiry
- **Algorithm**: HS256
- **Claims**: userId, username, email, role

### File Encryption
- **Algorithm**: AES-256-GCM
- **Key Size**: 256 bits
- **IV Size**: 128 bits
- **Authentication Tag**: 128 bits

### Rate Limiting
- **Global**: 1000 requests per 15 minutes
- **Authentication**: 5 attempts per 15 minutes
- **File Upload**: 50 uploads per hour
- **Per User**: 100 requests per 15 minutes

### Account Security
- **Password Requirements**: 8+ chars, uppercase, lowercase, number, special char
- **Login Attempts**: 5 failed attempts lock account for 2 hours
- **Password Hashing**: bcrypt with 12 rounds

## 📊 Monitoring

### Audit Events
- User authentication (success/failure)
- File operations (upload/download/delete)
- Security violations (unauthorized access)
- System events (startup/shutdown)
- Rate limit violations

### Log Locations
- **Console**: Real-time logs
- **Files**: `logs/combined.log`, `logs/error.log`
- **MongoDB**: `audit_logs` collection

## 🚦 Usage Examples

### User Registration
```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "email": "john@example.com",
    "password": "SecurePass123!",
    "confirmPassword": "SecurePass123!"
  }'
```

### File Upload
```bash
curl -X POST http://localhost:8000/api/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@document.pdf" \
  -F "accessLevel=private" \
  -F "description=Important document"
```

### File Download
```bash
curl -X GET http://localhost:8000/api/file/FILE_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -o downloaded_file.pdf
```

## 🔧 Configuration

### Environment Variables
| Variable | Description | Default |
|----------|-------------|---------|
| `MONGO_URL` | MongoDB connection string | `mongodb://localhost:27017/secureshare` |
| `PORT` | Server port | `8000` |
| `JWT_SECRET` | JWT signing secret | Required |
| `JWT_REFRESH_SECRET` | Refresh token secret | Required |
| `FRONTEND_URL` | Frontend URL for CORS | `http://localhost:3000` |
| `LOG_LEVEL` | Logging level | `info` |

### File Storage
- **Upload Directory**: `uploads/`
- **Encrypted Files**: `uploads/encrypted/`
- **Temporary Files**: `uploads/temp/`
- **Logs**: `logs/`

## 🐛 Troubleshooting

### Common Issues

1. **MongoDB Connection Error**
   - Ensure MongoDB is running
   - Check connection string in `.env`

2. **JWT Token Errors**
   - Verify JWT secrets are set
   - Check token expiration

3. **File Upload Failures**
   - Check file size limits
   - Ensure upload directories exist

4. **CORS Issues**
   - Verify `FRONTEND_URL` in environment
   - Check allowed origins in server config

## 📈 Performance Considerations

- **Database Indexing**: Optimized queries with proper indexes
- **File Streaming**: Large file handling with streams
- **Connection Pooling**: MongoDB connection pool management
- **Rate Limiting**: Prevent resource exhaustion
- **Log Rotation**: Automatic log file management

## 🔮 Future Enhancements

- [ ] Virus scanning integration
- [ ] Email notifications
- [ ] Two-factor authentication
- [ ] File sharing links with expiration
- [ ] File versioning
- [ ] Bulk operations
- [ ] Advanced admin dashboard
- [ ] API key authentication
- [ ] File thumbnails/previews

## 📄 License

This project is for educational and demonstration purposes.

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Create Pull Request

## 📞 Support

For support and questions:
- Create an issue in the repository
- Check the troubleshooting section
- Review the audit logs for security issues

---

**⚠️ Security Notice**: This application includes production-ready security features, but always review and test security configurations before deploying to production environments. Change all default passwords and secrets immediately.
