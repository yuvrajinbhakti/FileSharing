import React, { useState } from 'react';
import { fileAPI } from '../service/api';
import './BulkOperations.css';

const BulkOperations = ({ selectedFiles, onComplete, onCancel }) => {
    const [operation, setOperation] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [bulkDownloadOptions, setBulkDownloadOptions] = useState({
        zipName: '',
        compressionLevel: 6
    });

    const operations = [
        { id: 'download', label: '📦 Bulk Download', description: 'Create a ZIP archive of selected files' },
        { id: 'delete', label: '🗑️ Bulk Delete', description: 'Delete all selected files permanently' },
        { id: 'share', label: '🔗 Bulk Share', description: 'Create share links for all selected files' }
    ];

    const handleBulkDownload = async () => {
        setLoading(true);
        setError('');
        setSuccess('');

        try {
            const fileIds = selectedFiles.map(file => file.id);
            const options = {
                zipName: bulkDownloadOptions.zipName || `bulk-download-${Date.now()}`,
                compressionLevel: bulkDownloadOptions.compressionLevel
            };

            const response = await fileAPI.createBulkDownload(fileIds, options);
            
            // Trigger download
            const downloadLink = document.createElement('a');
            downloadLink.href = response.downloadUrl;
            downloadLink.download = response.fileName;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);

            setSuccess(`Bulk download created successfully: ${response.fileName}`);
            onComplete?.();
        } catch (error) {
            setError(error.response?.data?.error || 'Failed to create bulk download');
        } finally {
            setLoading(false);
        }
    };

    const handleBulkDelete = async () => {
        const confirmed = window.confirm(
            `Are you sure you want to delete ${selectedFiles.length} files? This action cannot be undone.`
        );
        
        if (!confirmed) return;

        setLoading(true);
        setError('');
        setSuccess('');

        try {
            const fileIds = selectedFiles.map(file => file.id);
            const response = await fileAPI.bulkDeleteFiles(fileIds);
            
            setSuccess(`Successfully deleted ${response.successCount} files`);
            if (response.failCount > 0) {
                setError(`Failed to delete ${response.failCount} files`);
            }
            onComplete?.();
        } catch (error) {
            setError(error.response?.data?.error || 'Failed to delete files');
        } finally {
            setLoading(false);
        }
    };

    const handleBulkShare = async () => {
        setLoading(true);
        setError('');
        setSuccess('');

        try {
            const shareLinks = [];
            for (const file of selectedFiles) {
                try {
                    const response = await fileAPI.createShareLink(file.id, {
                        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
                        maxDownloads: 10
                    });
                    shareLinks.push({ fileName: file.originalName, shareUrl: response.shareUrl });
                } catch (error) {
                    console.error(`Failed to create share link for ${file.originalName}:`, error);
                }
            }

            if (shareLinks.length > 0) {
                // Create a text file with all share links
                const content = `SecureShare - Bulk Share Links\n\nGenerated: ${new Date().toISOString()}\n\n${shareLinks.map(link => `${link.fileName}: ${link.shareUrl}`).join('\n')}`;
                
                const blob = new Blob([content], { type: 'text/plain' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `share-links-${Date.now()}.txt`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);

                setSuccess(`Created ${shareLinks.length} share links. Download the file to access them.`);
            } else {
                setError('Failed to create any share links');
            }
            onComplete?.();
        } catch (error) {
            setError('Failed to create bulk share links');
        } finally {
            setLoading(false);
        }
    };

    const executeOperation = () => {
        switch (operation) {
            case 'download':
                handleBulkDownload();
                break;
            case 'delete':
                handleBulkDelete();
                break;
            case 'share':
                handleBulkShare();
                break;
            default:
                setError('Please select an operation');
        }
    };

    return (
        <div className="bulk-operations-overlay">
            <div className="bulk-operations-modal">
                <div className="bulk-header">
                    <h3>📦 Bulk Operations</h3>
                    <span className="selected-count">{selectedFiles.length} files selected</span>
                    <button className="close-btn" onClick={onCancel}>×</button>
                </div>

                <div className="bulk-content">
                    <div className="selected-files-preview">
                        <h4>Selected Files:</h4>
                        <div className="files-list">
                            {selectedFiles.slice(0, 5).map((file, index) => (
                                <div key={index} className="file-item">
                                    <span className="file-icon">📄</span>
                                    <span className="file-name">{file.originalName}</span>
                                </div>
                            ))}
                            {selectedFiles.length > 5 && (
                                <div className="more-files">
                                    +{selectedFiles.length - 5} more files...
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="operations-section">
                        <h4>Choose Operation:</h4>
                        <div className="operations-grid">
                            {operations.map((op) => (
                                <label key={op.id} className="operation-option">
                                    <input
                                        type="radio"
                                        name="operation"
                                        value={op.id}
                                        checked={operation === op.id}
                                        onChange={(e) => setOperation(e.target.value)}
                                    />
                                    <div className="option-content">
                                        <div className="option-label">{op.label}</div>
                                        <div className="option-description">{op.description}</div>
                                    </div>
                                </label>
                            ))}
                        </div>

                        {operation === 'download' && (
                            <div className="operation-options">
                                <h5>Download Options:</h5>
                                <div className="form-group">
                                    <label>Archive Name:</label>
                                    <input
                                        type="text"
                                        placeholder="bulk-download"
                                        value={bulkDownloadOptions.zipName}
                                        onChange={(e) => setBulkDownloadOptions({
                                            ...bulkDownloadOptions,
                                            zipName: e.target.value
                                        })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Compression Level:</label>
                                    <select
                                        value={bulkDownloadOptions.compressionLevel}
                                        onChange={(e) => setBulkDownloadOptions({
                                            ...bulkDownloadOptions,
                                            compressionLevel: parseInt(e.target.value)
                                        })}
                                    >
                                        <option value={1}>Fastest (Least compression)</option>
                                        <option value={6}>Balanced (Default)</option>
                                        <option value={9}>Best (Most compression)</option>
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>

                    {error && <div className="error-message">{error}</div>}
                    {success && <div className="success-message">{success}</div>}

                    <div className="bulk-actions">
                        <button 
                            className="btn btn-secondary"
                            onClick={onCancel}
                            disabled={loading}
                        >
                            Cancel
                        </button>
                        <button 
                            className="btn btn-primary"
                            onClick={executeOperation}
                            disabled={!operation || loading}
                        >
                            {loading ? (
                                <>
                                    <span className="loading-spinner"></span>
                                    Processing...
                                </>
                            ) : (
                                'Execute Operation'
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BulkOperations; 