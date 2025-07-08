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
        try {
            // Validate inputs
            if (!inputPath || !outputPath || !key) {
                throw new Error('Missing required parameters for encryption');
            }

            if (!fs.existsSync(inputPath)) {
                throw new Error(`Input file does not exist: ${inputPath}`);
            }

            // Check if input file is readable
            try {
                fs.accessSync(inputPath, fs.constants.R_OK);
            } catch (error) {
                throw new Error(`Input file is not readable: ${inputPath} - ${error.message}`);
            }

            // Check file size
            const stats = fs.statSync(inputPath);
            if (stats.size === 0) {
                throw new Error(`Input file is empty: ${inputPath}`);
            }

            // Ensure output directory exists
            const outputDir = path.dirname(outputPath);
            if (!fs.existsSync(outputDir)) {
                try {
                    fs.mkdirSync(outputDir, { recursive: true });
                    console.log(`Created output directory: ${outputDir}`);
                } catch (dirError) {
                    throw new Error(`Failed to create output directory: ${outputDir} - ${dirError.message}`);
                }
            }

            // Check if output directory is writable
            try {
                fs.accessSync(outputDir, fs.constants.W_OK);
            } catch (error) {
                throw new Error(`Output directory is not writable: ${outputDir} - ${error.message}`);
            }

            // Generate IV and create cipher
            const iv = generateIV();
            let cipher;
            try {
                cipher = crypto.createCipherGCM(algorithm, key, iv);
            } catch (error) {
                throw new Error(`Failed to create cipher: ${error.message}`);
            }

            // Create streams
            let input, output;
            try {
                input = fs.createReadStream(inputPath);
                output = fs.createWriteStream(outputPath);
            } catch (error) {
                throw new Error(`Failed to create streams: ${error.message}`);
            }

            // Track encryption progress
            let bytesProcessed = 0;
            const totalBytes = stats.size;
            
            // Set up error handlers
            const cleanup = () => {
                try {
                    if (input && !input.destroyed) input.destroy();
                    if (output && !output.destroyed) output.destroy();
                    if (cipher && !cipher.destroyed) cipher.destroy();
                    
                    // Clean up partial output file
                    if (fs.existsSync(outputPath)) {
                        fs.unlinkSync(outputPath);
                        console.log(`Cleaned up partial encrypted file: ${outputPath}`);
                    }
                } catch (cleanupError) {
                    console.error('Error during cleanup:', cleanupError.message);
                }
            };

            const handleError = (error, source) => {
                console.error(`Encryption error from ${source}:`, error.message);
                cleanup();
                reject(new Error(`Encryption failed at ${source}: ${error.message}`));
            };

            // Set up stream error handlers
            input.on('error', (error) => handleError(error, 'input_stream'));
            output.on('error', (error) => handleError(error, 'output_stream'));
            cipher.on('error', (error) => handleError(error, 'cipher'));

            // Track progress
            input.on('data', (chunk) => {
                bytesProcessed += chunk.length;
                const progress = Math.round((bytesProcessed / totalBytes) * 100);
                if (progress % 25 === 0) {
                    console.log(`Encryption progress: ${progress}%`);
                }
            });

            // Handle successful completion
            output.on('finish', () => {
                try {
                    console.log('Encryption stream finished, getting auth tag...');
                    
                    // Get authentication tag
                    let tag;
                    try {
                        tag = cipher.getAuthTag();
                    } catch (error) {
                        throw new Error(`Failed to get authentication tag: ${error.message}`);
                    }

                    // Append the authentication tag at the end
                    fs.appendFile(outputPath, tag, (err) => {
                        if (err) {
                            console.error('Error appending auth tag:', err.message);
                            cleanup();
                            return reject(new Error(`Failed to append authentication tag: ${err.message}`));
                        }

                        console.log('Authentication tag appended successfully');

                        // Verify encrypted file exists and has reasonable size
                        try {
                            const encryptedStats = fs.statSync(outputPath);
                            if (encryptedStats.size === 0) {
                                throw new Error('Encrypted file is empty');
                            }
                            
                            // Encrypted file should be roughly the same size as original (plus IV and tag)
                            const expectedMinSize = totalBytes + ivLength + tagLength;
                            if (encryptedStats.size < expectedMinSize) {
                                throw new Error(`Encrypted file is too small (${encryptedStats.size} bytes, expected at least ${expectedMinSize} bytes)`);
                            }
                            
                            console.log(`Encrypted file size: ${encryptedStats.size} bytes (original: ${totalBytes} bytes)`);
                        } catch (verifyError) {
                            cleanup();
                            return reject(new Error(`Encrypted file verification failed: ${verifyError.message}`));
                        }

                        // Delete original unencrypted file
                        fs.unlink(inputPath, (unlinkErr) => {
                            if (unlinkErr) {
                                console.warn('Warning: Could not delete original file:', unlinkErr.message);
                                // Don't fail the encryption for this
                            } else {
                                console.log('Original file deleted successfully');
                            }

                            // Success!
                            resolve({
                                encryptedPath: outputPath,
                                iv: iv.toString('hex'),
                                tag: tag.toString('hex')
                            });
                        });
                    });
                } catch (error) {
                    handleError(error, 'completion');
                }
            });

            // Start encryption by writing IV and piping data
            try {
                // Write IV at the beginning of the file
                output.write(iv);
                
                // Pipe input through cipher to output
                input.pipe(cipher).pipe(output);
                
                console.log(`Starting encryption: ${inputPath} -> ${outputPath}`);
            } catch (error) {
                handleError(error, 'pipe_setup');
            }

        } catch (error) {
            reject(new Error(`Encryption setup failed: ${error.message}`));
        }
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

// Test encryption functionality
export const testEncryption = async (testFilePath = null) => {
    try {
        const testResults = {
            timestamp: new Date().toISOString(),
            tests: {}
        };

        // Test 1: Key generation
        try {
            const key = generateKey();
            testResults.tests.keyGeneration = key ? 'success' : 'failed';
        } catch (error) {
            testResults.tests.keyGeneration = `failed: ${error.message}`;
        }

        // Test 2: Text encryption/decryption
        try {
            const key = generateKey();
            const testText = 'This is a test message for encryption';
            const encrypted = encryptText(testText, key);
            const decrypted = decryptText(encrypted.encrypted, key, encrypted.iv, encrypted.tag);
            testResults.tests.textEncryption = decrypted === testText ? 'success' : 'decryption_mismatch';
        } catch (error) {
            testResults.tests.textEncryption = `failed: ${error.message}`;
        }

        // Test 3: File encryption (if test file provided)
        if (testFilePath && fs.existsSync(testFilePath)) {
            try {
                const key = generateKey();
                const outputPath = testFilePath + '.encrypted';
                const decryptedPath = testFilePath + '.decrypted';
                
                // Encrypt
                const encryptResult = await encryptFile(testFilePath, outputPath, key);
                
                // Decrypt
                const decryptKey = Buffer.from(encryptResult.iv, 'hex');
                await decryptFile(outputPath, decryptedPath, key);
                
                // Verify files match
                const originalContent = fs.readFileSync(testFilePath);
                const decryptedContent = fs.readFileSync(decryptedPath);
                
                testResults.tests.fileEncryption = originalContent.equals(decryptedContent) ? 'success' : 'content_mismatch';
                
                // Clean up test files
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                if (fs.existsSync(decryptedPath)) fs.unlinkSync(decryptedPath);
                
            } catch (error) {
                testResults.tests.fileEncryption = `failed: ${error.message}`;
            }
        } else {
            testResults.tests.fileEncryption = 'skipped (no test file provided)';
        }

        // Test 4: File hash generation
        if (testFilePath && fs.existsSync(testFilePath)) {
            try {
                const hash = await generateFileHash(testFilePath);
                testResults.tests.fileHash = hash ? 'success' : 'failed';
            } catch (error) {
                testResults.tests.fileHash = `failed: ${error.message}`;
            }
        } else {
            testResults.tests.fileHash = 'skipped (no test file provided)';
        }

        // Test 5: Directory access
        try {
            const testDir = 'uploads/test-encryption';
            if (!fs.existsSync(testDir)) {
                fs.mkdirSync(testDir, { recursive: true });
            }
            
            // Test write permissions
            const testFile = path.join(testDir, 'test.txt');
            fs.writeFileSync(testFile, 'test content');
            fs.unlinkSync(testFile);
            
            // Clean up
            fs.rmSync(testDir, { recursive: true });
            
            testResults.tests.directoryAccess = 'success';
        } catch (error) {
            testResults.tests.directoryAccess = `failed: ${error.message}`;
        }

        const failedTests = Object.values(testResults.tests).filter(result => 
            result.toString().includes('failed')
        );
        
        testResults.overallStatus = failedTests.length === 0 ? 'all_tests_passed' : 'some_tests_failed';
        testResults.failedTestCount = failedTests.length;

        return testResults;
    } catch (error) {
        throw new Error(`Encryption test failed: ${error.message}`);
    }
}; 