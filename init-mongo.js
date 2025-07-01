// MongoDB initialization script for SecureShare
// This script runs when MongoDB container starts for the first time

// Switch to SecureShare database
db = db.getSiblingDB('secureshare');

// Create application user with read/write access
db.createUser({
  user: 'secureshare-user',
  pwd: 'userpassword123', // Change this in production
  roles: [
    {
      role: 'readWrite',
      db: 'secureshare'
    }
  ]
});

// Create indexes for better performance
db.users.createIndex({ "email": 1 }, { unique: true });
db.users.createIndex({ "username": 1 }, { unique: true });
db.users.createIndex({ "role": 1 });
db.users.createIndex({ "isActive": 1 });

db.files.createIndex({ "uploadedBy": 1, "createdAt": -1 });
db.files.createIndex({ "fileHash": 1 });
db.files.createIndex({ "isActive": 1, "expiresAt": 1 });
db.files.createIndex({ "accessLevel": 1 });

db.audit_logs.createIndex({ "timestamp": -1 });
db.audit_logs.createIndex({ "event": 1 });
db.audit_logs.createIndex({ "userId": 1 });

// Insert sample admin user (optional)
db.users.insertOne({
  username: 'admin',
  email: 'admin@secureshare.local',
  password: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj9zlOvGaLCm', // SecureAdmin123!
  role: 'admin',
  isActive: true,
  loginAttempts: 0,
  refreshTokens: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  lastLogin: new Date()
});

print('✅ SecureShare database initialized successfully');
print('👤 Admin user created: admin / SecureAdmin123!');
print('⚠️  IMPORTANT: Change the admin password immediately!'); 