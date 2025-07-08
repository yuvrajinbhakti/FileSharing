import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Ensure upload directories exist
const uploadDirs = ['uploads', 'uploads/encrypted', 'uploads/temp'];
uploadDirs.forEach(dir => {
    try {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`Created directory: ${dir}`);
        }
    } catch (error) {
        console.warn(`Warning: Could not create directory ${dir}:`, error.message);
        // Continue execution - directories will be created on demand
    }
});

// Configure multer storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'uploads/';
        
        // Ensure upload directory exists
        try {
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
                console.log(`Created upload directory: ${uploadDir}`);
            }
            cb(null, uploadDir);
        } catch (error) {
            console.error('Error creating upload directory:', error);
            cb(error);
        }
    },
    filename: function (req, file, cb) {
        try {
            // Generate unique filename
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const filename = file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname);
            cb(null, filename);
        } catch (error) {
            console.error('Error generating filename:', error);
            cb(error);
        }
    }
});

// File filter function
const fileFilter = (req, file, cb) => {
    // Allow all file types for now, but you can add restrictions here
    // Example: if (file.mimetype.startsWith('image/')) cb(null, true);
    cb(null, true);
};

// Configure multer with storage, limits and file filter
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB limit
        files: 1 // Only allow 1 file per upload
    },
    onError: function (error, next) {
        console.error('Multer error:', error);
        next(error);
    }
});

export default upload;