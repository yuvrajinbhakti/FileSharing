import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

const SERVER_URL = 'https://filesharing-bpmy.onrender.com/api';

// Test file upload
async function testUpload() {
    try {
        // Create a test file
        const testFileName = 'test-upload.txt';
        const testContent = 'This is a test file for upload testing. Created at: ' + new Date().toISOString();
        fs.writeFileSync(testFileName, testContent);
        
        console.log('Created test file:', testFileName);
        
        // You need to replace this with your actual JWT token
        const JWT_TOKEN = 'YOUR_JWT_TOKEN_HERE';
        
        if (JWT_TOKEN === 'YOUR_JWT_TOKEN_HERE') {
            console.log('ERROR: Please replace JWT_TOKEN with your actual token');
            console.log('Get your token from browser localStorage or login first');
            return;
        }
        
        // Create form data
        const formData = new FormData();
        formData.append('file', fs.createReadStream(testFileName));
        formData.append('accessLevel', 'private');
        formData.append('description', 'Test upload from Node.js script');
        
        console.log('Uploading file...');
        
        // Make upload request
        const response = await fetch(`${SERVER_URL}/upload`, {
            method: 'POST',
            body: formData,
            headers: {
                'Authorization': `Bearer ${JWT_TOKEN}`
            }
        });
        
        const result = await response.json();
        
        console.log('Response status:', response.status);
        console.log('Response:', JSON.stringify(result, null, 2));
        
        if (response.ok) {
            console.log('✅ Upload successful!');
        } else {
            console.log('❌ Upload failed:', result.error || 'Unknown error');
        }
        
        // Clean up test file
        fs.unlinkSync(testFileName);
        console.log('Cleaned up test file');
        
    } catch (error) {
        console.error('Test failed:', error.message);
        
        // Clean up test file if it exists
        if (fs.existsSync('test-upload.txt')) {
            fs.unlinkSync('test-upload.txt');
        }
    }
}

// Test server health
async function testHealth() {
    try {
        console.log('Testing server health...');
        
        const response = await fetch(`${SERVER_URL}/health`);
        const result = await response.json();
        
        console.log('Health check result:', JSON.stringify(result, null, 2));
        
        if (response.ok) {
            console.log('✅ Server is healthy');
        } else {
            console.log('❌ Server health check failed');
        }
        
    } catch (error) {
        console.error('Health check failed:', error.message);
    }
}

// Test debug endpoint
async function testDebug() {
    try {
        const JWT_TOKEN = 'YOUR_JWT_TOKEN_HERE';
        
        if (JWT_TOKEN === 'YOUR_JWT_TOKEN_HERE') {
            console.log('ERROR: Please replace JWT_TOKEN with your actual token');
            return;
        }
        
        console.log('Testing debug endpoint...');
        
        const response = await fetch(`${SERVER_URL}/debug/upload-test`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${JWT_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        console.log('Debug test result:', JSON.stringify(result, null, 2));
        
        if (response.ok) {
            console.log('✅ Debug test passed');
        } else {
            console.log('❌ Debug test failed');
        }
        
    } catch (error) {
        console.error('Debug test failed:', error.message);
    }
}

// Run tests
async function runTests() {
    console.log('🚀 Starting upload tests...\n');
    
    await testHealth();
    console.log('\n' + '='.repeat(50) + '\n');
    
    await testDebug();
    console.log('\n' + '='.repeat(50) + '\n');
    
    await testUpload();
    
    console.log('\n🏁 Tests completed');
}

runTests().catch(console.error); 