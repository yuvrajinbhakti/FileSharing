import mongoose from "mongoose";
import { logInfo, logError } from '../utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

const DBConnection = async () => {
    const MONGODB_URI = process.env.MONGO_URL;
    
    // Skip database connection if no MONGO_URL provided
    if (!MONGODB_URI) {
        logInfo('No MONGO_URL provided, skipping database connection');
        return;
    }
    
    try {
        // Set mongoose options for better security and performance
        const options = {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            maxPoolSize: 10, // Maintain up to 10 socket connections
            serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
            socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
            family: 4, // Use IPv4, skip trying IPv6
            retryWrites: true
        };
        
        await mongoose.connect(MONGODB_URI, options);
        logInfo('Database connected successfully', { 
            host: mongoose.connection.host,
            database: mongoose.connection.name 
        });
        
        // Handle connection events
        mongoose.connection.on('error', (error) => {
            logError('Database connection error', error);
        });
        
        mongoose.connection.on('disconnected', () => {
            logInfo('Database disconnected');
        });
        
        mongoose.connection.on('reconnected', () => {
            logInfo('Database reconnected');
        });
        
        // Graceful close on process termination
        process.on('SIGINT', async () => {
            await mongoose.connection.close();
            logInfo('Database connection closed due to application termination');
            process.exit(0);
        });
        
    } catch (error) {
        logError('Error while connecting with the database', error);
        throw error; // Re-throw to be handled by server.js
    }
}

export default DBConnection;