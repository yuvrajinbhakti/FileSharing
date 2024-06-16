import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { uploadFile } from './service/api';

function App() {
  const [file, setFile] = useState('');
  const [result, setResult] = useState('');
  const [copySuccess, setCopySuccess] = useState(false); // State to handle copy success message

  const fileInputRef = useRef();

  useEffect(() => {
    const getImage = async () => {
      if (file) {
        const data = new FormData();
        data.append("name", file.name);
        data.append("file", file);

        try {
          const response = await uploadFile(data);
          setResult(response.path);
        } catch (error) {
          console.error('Error uploading file:', error);
        }
      }
    }
    getImage();
  }, [file])

  const onUploadClick = () => {
    fileInputRef.current.click();
  }

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(result);
      setCopySuccess(true);
      setTimeout(() => {
        setCopySuccess(false);
      }, 3000); // Clear success message after 3 seconds
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }

  return (
    <div className='container'>
      <div className='wrapper'>
        <h1>Simple file sharing!</h1>
        <p>Upload and share the download link.</p>
        
        <button onClick={onUploadClick}>Upload</button>
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: "none" }}
          onChange={(e) => setFile(e.target.files[0])}
        />

        {result && (
          <div>
            <a href={result} target='_blank' rel='noopener noreferrer'>{result}</a>
            <button onClick={copyToClipboard}>Copy URL</button>
            {copySuccess && <span style={{ marginLeft: '10px', color: 'green' }}>✅Copied successfully!</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
