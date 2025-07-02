import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const algorithm = 'aes-256-gcm';
const keyLength = 32; // 256 bits
const ivLength = 16; // 128 bits
const tagLength = 16; // 128 bits

// Generate a random encryption key
export const generateKey = () => {
    return crypto.randomBytes(keyLength);
};

// Generate a random initialization vector
export const generateIV = () => {
    return crypto.randomBytes(ivLength);
};

// Encrypt file with AES-256-GCM
export const encryptFile = async (inputPath, outputPath, key) => {
    return new Promise((resolve, reject) => {
        const iv = generateIV();
        const cipher = crypto.createCipherGCM(algorithm, key, iv);
        
        const input = fs.createReadStream(inputPath);
        const output = fs.createWriteStream(outputPath);
        
        // Write IV at the beginning of the file
        output.write(iv);
        
        input.pipe(cipher).pipe(output);
        
        output.on('finish', () => {
            const tag = cipher.getAuthTag();
            
            // Append the authentication tag at the end
            fs.appendFile(outputPath, tag, (err) => {
                if (err) return reject(err);
                
                // Delete original unencrypted file
                fs.unlink(inputPath, (unlinkErr) => {
                    if (unlinkErr) console.warn('Warning: Could not delete original file:', unlinkErr);
                    resolve({
                        encryptedPath: outputPath,
                        iv: iv.toString('hex'),
                        tag: tag.toString('hex')
                    });
                });
            });
        });
        
        input.on('error', reject);
        output.on('error', reject);
        cipher.on('error', reject);
    });
};

// Decrypt file with AES-256-GCM
export const decryptFile = async (inputPath, outputPath, key) => {
    return new Promise((resolve, reject) => {
        fs.readFile(inputPath, (err, data) => {
            if (err) return reject(err);
            
            try {
                // Extract IV from the beginning of the file
                const iv = data.slice(0, ivLength);
                // Extract authentication tag from the end
                const tag = data.slice(-tagLength);
                // Extract encrypted content
                const encryptedData = data.slice(ivLength, -tagLength);
                
                const decipher = crypto.createDecipherGCM(algorithm, key, iv);
                decipher.setAuthTag(tag);
                
                const decrypted = Buffer.concat([
                    decipher.update(encryptedData),
                    decipher.final()
                ]);
                
                fs.writeFile(outputPath, decrypted, (writeErr) => {
                    if (writeErr) return reject(writeErr);
                    resolve(outputPath);
                });
                
            } catch (error) {
                reject(new Error('Decryption failed: ' + error.message));
            }
        });
    });
};

// Encrypt text data
export const encryptText = (text, key) => {
    const iv = generateIV();
    const cipher = crypto.createCipherGCM(algorithm, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    return {
        encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex')
    };
};

// Decrypt text data
export const decryptText = (encryptedData, key, iv, tag) => {
    const decipher = crypto.createDecipherGCM(algorithm, key, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
};

// Generate file hash for integrity checking
export const generateFileHash = (filePath) => {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        
        stream.on('data', (data) => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
};

// Generate unique file ID
export const generateFileId = () => {
    return crypto.randomBytes(16).toString('hex');
};

// Derive key from password using PBKDF2
export const deriveKeyFromPassword = (password, salt, iterations = 100000) => {
    return crypto.pbkdf2Sync(password, salt, iterations, keyLength, 'sha256');
};

// Generate salt for key derivation
export const generateSalt = () => {
    return crypto.randomBytes(32);
}; 