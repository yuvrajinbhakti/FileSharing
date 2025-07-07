import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './components/Login';
import Register from './components/Register';
import ProtectedRoute from './components/ProtectedRoute';
import ShareModal from './components/ShareModal';
import BulkOperations from './components/BulkOperations';
import UserSettings from './components/UserSettings';
import AdminPanel from './components/AdminPanel';
import { fileAPI } from './service/api';
import './App.css';
import './components/Dashboard.css';

// Dashboard Component (inline since file creation had issues)
const Dashboard = () => {
    const { user, logout, isAdmin } = useAuth();
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);
    const [shareModal, setShareModal] = useState({ isOpen: false, file: null });
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [showBulkOperations, setShowBulkOperations] = useState(false);
    const [showUserSettings, setShowUserSettings] = useState(false);
    const [showAdminPanel, setShowAdminPanel] = useState(false);
    const [selectionMode, setSelectionMode] = useState(false);

    const fileInputRef = useRef();

    useEffect(() => {
        fetchFiles();
    }, []);

    const fetchFiles = async () => {
        try {
            setLoading(true);
            const response = await fileAPI.getUserFiles(1, 10);
            setFiles(response.files);
            setError(null);
        } catch (error) {
            setError('Failed to load files');
            console.error('Error fetching files:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setUploading(true);
        setUploadProgress(0);

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('accessLevel', 'private');

            await fileAPI.upload(formData, (progressEvent) => {
                const percentCompleted = Math.round(
                    (progressEvent.loaded * 100) / progressEvent.total
                );
                setUploadProgress(percentCompleted);
            });

            setSuccessMessage('File uploaded successfully!');
            fetchFiles();
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (error) {
            setError('Failed to upload file');
            console.error('Upload error:', error);
        } finally {
            setUploading(false);
            setUploadProgress(0);
        }
    };

    const handleDownload = async (fileId, fileName) => {
        try {
            const response = await fileAPI.downloadFile(fileId);
            
            const blob = new Blob([response.data]);
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            
            setSuccessMessage('File downloaded successfully!');
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (error) {
            setError('Failed to download file');
            console.error('Download error:', error);
        }
    };

    const handleDelete = async (fileId, fileName) => {
        if (!window.confirm(`Are you sure you want to delete "${fileName}"?`)) {
            return;
        }

        try {
            await fileAPI.deleteFile(fileId);
            setSuccessMessage('File deleted successfully!');
            fetchFiles();
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (error) {
            setError('Failed to delete file');
            console.error('Delete error:', error);
        }
    };

    const handleShare = (file) => {
        setShareModal({ isOpen: true, file });
    };

    const closeShareModal = () => {
        setShareModal({ isOpen: false, file: null });
    };

    const toggleSelectionMode = () => {
        setSelectionMode(!selectionMode);
        setSelectedFiles([]);
    };

    const handleFileSelect = (file) => {
        if (selectedFiles.find(f => f.id === file.id)) {
            setSelectedFiles(selectedFiles.filter(f => f.id !== file.id));
        } else {
            setSelectedFiles([...selectedFiles, file]);
        }
    };

    const handleSelectAll = () => {
        if (selectedFiles.length === files.length) {
            setSelectedFiles([]);
        } else {
            setSelectedFiles([...files]);
        }
    };

    const handleBulkOperation = () => {
        if (selectedFiles.length === 0) {
            setError('Please select at least one file');
            return;
        }
        setShowBulkOperations(true);
    };

    const handleBulkComplete = () => {
        setShowBulkOperations(false);
        setSelectedFiles([]);
        setSelectionMode(false);
        fetchFiles();
    };

    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="dashboard-container">
            <header className="dashboard-header">
                <div className="header-content">
                    <div className="header-left">
                        <h1>🔐 SecureShare</h1>
                        <span className="user-welcome">
                            Welcome, {user?.username}
                            {isAdmin && <span className="admin-badge">Admin</span>}
                        </span>
                    </div>
                    <div className="header-right">
                        <button 
                            className="btn btn-secondary"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            📤 Upload File
                        </button>
                        <button 
                            className="btn btn-outline"
                            onClick={toggleSelectionMode}
                        >
                            {selectionMode ? '✅ Cancel Select' : '📦 Select Multiple'}
                        </button>
                        <button 
                            className="btn btn-outline"
                            onClick={() => setShowUserSettings(true)}
                        >
                            ⚙️ Settings
                        </button>
                        {isAdmin && (
                            <button 
                                className="btn btn-outline"
                                onClick={() => setShowAdminPanel(true)}
                                style={{ color: '#ff6b6b', borderColor: '#ff6b6b' }}
                            >
                                👑 Admin Panel
                            </button>
                        )}
                        <button 
                            className="btn btn-outline"
                            onClick={logout}
                        >
                            🚪 Logout
                        </button>
                    </div>
                </div>
            </header>

            <main className="dashboard-main">
                {error && (
                    <div className="message message-error">
                        <span>⚠️ {error}</span>
                        <button onClick={() => setError(null)}>✕</button>
                    </div>
                )}
                
                {successMessage && (
                    <div className="message message-success">
                        <span>✅ {successMessage}</span>
                        <button onClick={() => setSuccessMessage(null)}>✕</button>
                    </div>
                )}

                <div className="upload-section">
                    <input
                        ref={fileInputRef}
                        type="file"
                        onChange={handleUpload}
                        style={{ display: 'none' }}
                    />
                    
                    {uploading && (
                        <div className="upload-progress">
                            <div className="progress-bar">
                                <div 
                                    className="progress-fill"
                                    style={{ width: `${uploadProgress}%` }}
                                />
                            </div>
                            <span className="progress-text">
                                Uploading... {uploadProgress}%
                            </span>
                        </div>
                    )}
                </div>

                <div className="files-section">
                    <div className="files-header">
                        <h2>Your Files ({files.length})</h2>
                        {selectionMode && (
                            <div className="selection-controls">
                                <button 
                                    className="btn btn-sm btn-outline"
                                    onClick={handleSelectAll}
                                >
                                    {selectedFiles.length === files.length ? 'Deselect All' : 'Select All'}
                                </button>
                                <span className="selection-count">
                                    {selectedFiles.length} selected
                                </span>
                                {selectedFiles.length > 0 && (
                                    <button 
                                        className="btn btn-sm btn-primary"
                                        onClick={handleBulkOperation}
                                    >
                                        📦 Bulk Actions
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                    
                    {loading ? (
                        <div className="loading-state">
                            <div className="loading-spinner"></div>
                            <p>Loading your files...</p>
                        </div>
                    ) : files.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-icon">📭</div>
                            <h3>No files found</h3>
                            <p>Upload your first file to get started</p>
                        </div>
                    ) : (
                        <div className="files-grid">
                            {files.map((file) => (
                                <div key={file.id} className={`file-card ${selectionMode ? 'selectable' : ''} ${selectedFiles.find(f => f.id === file.id) ? 'selected' : ''}`}>
                                    <div className="file-header">
                                        {selectionMode && (
                                            <div className="file-checkbox">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedFiles.find(f => f.id === file.id) !== undefined}
                                                    onChange={() => handleFileSelect(file)}
                                                />
                                            </div>
                                        )}
                                        <div className="file-icon">
                                            {file.mimeType?.startsWith('image/') ? '🖼️' :
                                             file.mimeType?.startsWith('video/') ? '🎥' :
                                             file.mimeType?.startsWith('audio/') ? '🎵' :
                                             file.mimeType?.includes('pdf') ? '📕' : '📄'}
                                        </div>
                                        <div className="file-access-level">
                                            {file.accessLevel === 'private' ? '🔒' :
                                             file.accessLevel === 'public' ? '🌐' : '👥'}
                                        </div>
                                    </div>
                                    
                                    <div className="file-content">
                                        <h3 className="file-name" title={file.originalName}>
                                            {file.originalName}
                                        </h3>
                                        <div className="file-meta">
                                            <span className="file-size">
                                                {formatFileSize(file.size)}
                                            </span>
                                            <span className="file-date">
                                                {formatDate(file.uploadDate)}
                                            </span>
                                        </div>
                                        <div className="file-stats">
                                            <span className="download-count">
                                                📥 {file.downloadCount} downloads
                                            </span>
                                        </div>
                                    </div>

                                    <div className="file-actions">
                                        <button
                                            className="btn btn-sm btn-primary"
                                            onClick={() => handleDownload(file.id, file.originalName)}
                                            title="Download file"
                                        >
                                            📥
                                        </button>
                                        <button
                                            className="btn btn-sm btn-secondary"
                                            onClick={() => handleShare(file)}
                                            title="Share file"
                                        >
                                            🔗
                                        </button>
                                        <button
                                            className="btn btn-sm btn-danger"
                                            onClick={() => handleDelete(file.id, file.originalName)}
                                            title="Delete file"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>

            <ShareModal 
                file={shareModal.file}
                isOpen={shareModal.isOpen}
                onClose={closeShareModal}
            />

            {showBulkOperations && (
                <BulkOperations 
                    selectedFiles={selectedFiles}
                    onComplete={handleBulkComplete}
                    onCancel={() => setShowBulkOperations(false)}
                />
            )}

            {showUserSettings && (
                <UserSettings 
                    onClose={() => setShowUserSettings(false)}
                />
            )}

            {showAdminPanel && (
                <AdminPanel 
                    onClose={() => setShowAdminPanel(false)}
                />
            )}
        </div>
    );
};

function App() {
    return (
        <AuthProvider>
            <Router>
                <div className="App">
                    <Routes>
                        {/* Public routes */}
                        <Route path="/login" element={<Login />} />
                        <Route path="/register" element={<Register />} />
                        
                        {/* Protected routes */}
                        <Route path="/dashboard" element={
                            <ProtectedRoute>
                                <Dashboard />
                            </ProtectedRoute>
                        } />
                        
                        {/* Default redirect */}
                        <Route path="/" element={<Navigate to="/dashboard" replace />} />
                        <Route path="*" element={<Navigate to="/dashboard" replace />} />
                    </Routes>
                </div>
            </Router>
        </AuthProvider>
    );
}

export default App;
