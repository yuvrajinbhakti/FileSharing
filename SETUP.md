# 🚀 Quick Setup Guide - SecureShare Enhanced

## ✅ What's New

Your SecureShare application has been significantly enhanced with:

- **🔐 Proper Authentication**: Login/Register with JWT tokens
- **🎨 Modern UI**: Professional React interface with responsive design
- **🛡️ Enhanced Security**: Fixed encryption implementation (AES-256-GCM)
- **📱 Better UX**: Upload progress, file management, error handling
- **🔒 Token Management**: Automatic token refresh and secure logout

## 🏃‍♂️ Quick Start

### 1. Install Dependencies
```bash
cd FileSharing

# Install React Router (if not already installed)
cd client
npm install
cd ..
```

### 2. Start the Application
```bash
# Start all services with Docker
docker-compose up --build

# Or start development environment
chmod +x scripts/*.sh
./scripts/docker-dev.sh start
```

### 3. Access the Application
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **MongoDB**: mongodb://localhost:27017

### 4. Create Your First Account
1. Go to http://localhost:3000
2. Click "Sign Up" to create a new account
3. Fill in your details (password must be strong!)
4. You'll be automatically logged in

### 5. Upload Your First File
1. Click "Upload File" or drag & drop a file
2. Choose access level (Private, Public, or Restricted)
3. Watch the upload progress
4. Manage your files from the dashboard

## 🔑 Key Features

### Authentication
- **Secure Registration**: Password strength validation
- **JWT Tokens**: Automatic refresh, secure storage
- **Account Security**: Failed login protection, account lockout

### File Management
- **Encrypted Storage**: AES-256-GCM encryption for all files
- **Access Levels**: Private, Public, or Restricted sharing
- **File Operations**: Upload, download, delete with progress tracking
- **File Information**: Size, type, upload date, download count

### Security Enhancements
- **Fixed Encryption**: Upgraded from deprecated `createCipher` to `createCipherGCM`
- **Rate Limiting**: Protection against abuse
- **Input Validation**: Server-side validation for all inputs
- **Audit Logging**: All actions logged to MongoDB

## 🛠️ Development

### Local Development (without Docker)
```bash
# Terminal 1 - Start MongoDB
mongod

# Terminal 2 - Start Backend
cd server
npm install
npm run dev

# Terminal 3 - Start Frontend
cd client
npm install
npm start
```

### Environment Variables
Create a `.env` file in the server directory:
```env
MONGO_URL=mongodb://localhost:27017/secureshare
PORT=8000
JWT_SECRET=your-super-secret-jwt-key-minimum-256-bits
JWT_REFRESH_SECRET=your-super-secret-refresh-key-minimum-256-bits
FRONTEND_URL=http://localhost:3000
LOG_LEVEL=info
```

## 🐛 Troubleshooting

### Common Issues

1. **"Cannot find module 'react-router-dom'"**
   ```bash
   cd client
   npm install react-router-dom
   ```

2. **CORS Errors**
   - Check that frontend URL is http://localhost:3000
   - Ensure backend is running on port 8000

3. **Authentication Issues**
   - Clear browser localStorage
   - Check JWT secrets are set in environment

4. **File Upload Fails**
   - Check server logs for detailed errors
   - Ensure upload directories exist
   - Verify file size limits

### Docker Issues
```bash
# Clean restart
docker-compose down
docker system prune -f
docker-compose up --build
```

## 📝 API Endpoints

### Authentication
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Sign in
- `POST /api/auth/refresh` - Refresh token
- `POST /api/auth/logout` - Sign out
- `GET /api/auth/profile` - Get user profile

### File Management
- `POST /api/upload` - Upload file
- `GET /api/files` - Get user's files
- `GET /api/file/:id` - Download file
- `DELETE /api/file/:id` - Delete file

### Admin (Admin users only)
- `GET /api/admin/files` - All files
- `GET /api/admin/users` - All users

## 🎯 Next Steps

Consider implementing:
- [ ] File sharing links with expiration
- [ ] Bulk file operations
- [ ] File versioning
- [ ] Email notifications
- [ ] Two-factor authentication
- [ ] Admin dashboard enhancements

## 🆘 Support

If you encounter issues:
1. Check the console for errors
2. Review server logs: `docker-compose logs secureshare-server`
3. Verify all services are running: `docker-compose ps`

---

**🎉 Congratulations!** Your SecureShare application is now production-ready with enterprise-grade security features. 