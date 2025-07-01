import mongoose from 'mongoose';
import User from '../models/user.js';
import { logInfo, logError } from '../utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

const createAdminUser = async () => {
    try {
        // Connect to database
        const MONGODB_URI = process.env.MONGO_URL || 'mongodb://localhost:27017/secureshare';
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        
        console.log('📡 Connected to database');
        
        // Check if admin already exists
        const existingAdmin = await User.findOne({ role: 'admin' });
        if (existingAdmin) {
            console.log('🔐 Admin user already exists:', existingAdmin.username);
            process.exit(0);
        }
        
        // Create admin user
        const adminData = {
            username: 'admin',
            email: 'admin@secureshare.local',
            password: 'SecureAdmin123!', // Change this password immediately
            role: 'admin',
            isActive: true
        };
        
        const adminUser = new User(adminData);
        await adminUser.save();
        
        console.log('✅ Admin user created successfully!');
        console.log('👤 Username: admin');
        console.log('📧 Email: admin@secureshare.local');
        console.log('🔑 Password: SecureAdmin123!');
        console.log('⚠️  IMPORTANT: Change the admin password immediately after first login!');
        
        logInfo('Admin user created', { 
            username: adminUser.username, 
            email: adminUser.email 
        });
        
    } catch (error) {
        console.error('❌ Error creating admin user:', error.message);
        logError('Admin user creation failed', error);
    } finally {
        await mongoose.connection.close();
        process.exit(0);
    }
};

createAdminUser(); 