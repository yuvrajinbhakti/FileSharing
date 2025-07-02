import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fileAPI } from '../service/api';
import './Dashboard.css';

const Dashboard = () => {
    const { user, logout, isAdmin } = useAuth();
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [showUploadForm, setShowUploadForm] = useState(false);
    const [uploadFormData, setUploadFormData] = useState({
        file: null,
        accessLevel: 'private',
        description: '',
        tags: ''
    });

    const fileInputRef = useRef();
    const dropZoneRef = useRef();

    useEffect(() => {
        fetchFiles();
    }, [currentPage]);

    const fetchFiles = async () => {
        try {
            setLoading(true);
            const response = await fileAPI.getUserFiles(currentPage, 10);
            setFiles(response.files);
            setTotalPages(response.pagination.pages);
            setError(null);
        } catch (error) {
            setError('Failed to load files');
            console.error('Error fetching files:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleFileSelect = (event) => {
        const file = event.target.files[0];
        if (file) {
            setUploadFormData({
                ...uploadFormData,
                file
            });
            setShowUploadForm(true);
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        dropZoneRef.current?.classList.add('drag-over');
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        dropZoneRef.current?.classList.remove('drag-over');
    };

    const handleDrop = (e) => {
        e.preventDefault();
        dropZoneRef.current?.classList.remove('drag-over');
        
        const file = e.dataTransfer.files[0];
        if (file) {
            setUploadFormData({
                ...uploadFormData,
                file
            });
            setShowUploadForm(true);
        }
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        
        if (!uploadFormData.file) {
            setError('Please select a file');
            return;
        }

        setUploading(true);
        setUploadProgress(0);

        try {
            const formData = new FormData();
            formData.append('file', uploadFormData.file);
            formData.append('accessLevel', uploadFormData.accessLevel);
            formData.append('description', uploadFormData.description);
            formData.append('tags', uploadFormData.tags);

            await fileAPI.upload(formData, (progressEvent) => {
                const percentCompleted = Math.round(
                    (progressEvent.loaded * 100) / progressEvent.total
                );
                setUploadProgress(percentCompleted);
            });

            setSuccessMessage('File uploaded successfully!');
            setShowUploadForm(false);
            setUploadFormData({
                file: null,
                accessLevel: 'private',
                description: '',
                tags: ''
            });
            fetchFiles(); // Refresh file list
            
            // Clear success message after 3 seconds
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
            
            // Create blob URL and trigger download
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
            fetchFiles(); // Refresh file list
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (error) {
            setError('Failed to delete file');
            console.error('Delete error:', error);
        }
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

    const filteredFiles = files.filter(file =>
        file.originalName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="dashboard-container">
            {/* Header */}
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
                            onClick={() => setShowUploadForm(true)}
                        >
                            📤 Upload File
                        </button>
                        <button 
                            className="btn btn-outline"
                            onClick={logout}
                        >
                            🚪 Logout
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="dashboard-main">
                {/* Messages */}
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

                {/* Upload Drop Zone */}
                {!showUploadForm && (
                    <div 
                        ref={dropZoneRef}
                        className="drop-zone"
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <div className="drop-zone-content">
                            <div className="drop-zone-icon">📁</div>
                            <h3>Drop files here or click to upload</h3>
                            <p>Your files will be encrypted with AES-256 before storage</p>
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            onChange={handleFileSelect}
                            style={{ display: 'none' }}
                        />
                    </div>
                )}

                {/* Upload Form Modal */}
                {showUploadForm && (
                    <div className="modal-overlay">
                        <div className="modal">
                            <div className="modal-header">
                                <h2>Upload File</h2>
                                <button 
                                    className="modal-close"
                                    onClick={() => setShowUploadForm(false)}
                                >
                                    ✕
                                </button>
                            </div>
                            
                            <form onSubmit={handleUpload} className="upload-form">
                                <div className="form-group">
                                    <label>Selected File:</label>
                                    <div className="file-info">
                                        <span className="file-icon">📄</span>
                                        <span className="file-name">
                                            {uploadFormData.file?.name}
                                        </span>
                                        <span className="file-size">
                                            ({formatFileSize(uploadFormData.file?.size || 0)})
                                        </span>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label htmlFor="accessLevel">Access Level:</label>
                                    <select
                                        id="accessLevel"
                                        value={uploadFormData.accessLevel}
                                        onChange={(e) => setUploadFormData({
                                            ...uploadFormData,
                                            accessLevel: e.target.value
                                        })}
                                    >
                                        <option value="private">🔒 Private (Only you)</option>
                                        <option value="public">🌐 Public (Anyone with link)</option>
                                        <option value="restricted">👥 Restricted (Specific users)</option>
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label htmlFor="description">Description (Optional):</label>
                                    <textarea
                                        id="description"
                                        value={uploadFormData.description}
                                        onChange={(e) => setUploadFormData({
                                            ...uploadFormData,
                                            description: e.target.value
                                        })}
                                        placeholder="Add a description for this file..."
                                        rows={3}
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="tags">Tags (Optional):</label>
                                    <input
                                        type="text"
                                        id="tags"
                                        value={uploadFormData.tags}
                                        onChange={(e) => setUploadFormData({
                                            ...uploadFormData,
                                            tags: e.target.value
                                        })}
                                        placeholder="Enter tags separated by commas"
                                    />
                                </div>

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

                                <div className="form-actions">
                                    <button 
                                        type="button" 
                                        className="btn btn-secondary"
                                        onClick={() => setShowUploadForm(false)}
                                        disabled={uploading}
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        type="submit" 
                                        className="btn btn-primary"
                                        disabled={uploading}
                                    >
                                        {uploading ? 'Uploading...' : 'Upload File'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Search and Filters */}
                <div className="files-controls">
                    <div className="search-box">
                        <input
                            type="text"
                            placeholder="Search files..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <span className="search-icon">🔍</span>
                    </div>
                </div>

                {/* Files List */}
                <div className="files-section">
                    <h2>Your Files ({filteredFiles.length})</h2>
                    
                    {loading ? (
                        <div className="loading-state">
                            <div className="loading-spinner"></div>
                            <p>Loading your files...</p>
                        </div>
                    ) : filteredFiles.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-icon">📭</div>
                            <h3>No files found</h3>
                            <p>Upload your first file to get started</p>
                        </div>
                    ) : (
                        <div className="files-grid">
                            {filteredFiles.map((file) => (
                                <div key={file.id} className="file-card">
                                    <div className="file-header">
                                        <div className="file-icon">
                                            {file.mimeType.startsWith('image/') ? '🖼️' :
                                             file.mimeType.startsWith('video/') ? '🎥' :
                                             file.mimeType.startsWith('audio/') ? '🎵' :
                                             file.mimeType.includes('pdf') ? '📕' :
                                             file.mimeType.includes('word') ? '📄' :
                                             file.mimeType.includes('excel') ? '📊' : '📄'}
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

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="pagination">
                            <button
                                className="btn btn-sm"
                                onClick={() => setCurrentPage(currentPage - 1)}
                                disabled={currentPage === 1}
                            >
                                Previous
                            </button>
                            <span className="page-info">
                                Page {currentPage} of {totalPages}
                            </span>
                            <button
                                className="btn btn-sm"
                                onClick={() => setCurrentPage(currentPage + 1)}
                                disabled={currentPage === totalPages}
                            >
                                Next
                            </button>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default Dashboard; 