import React, { useState } from 'react';
import { fileAPI } from '../service/api';
import './ShareModal.css';

const ShareModal = ({ file, isOpen, onClose }) => {
    const [shareOptions, setShareOptions] = useState({
        expiresIn: '24', // hours
        maxDownloads: 10,
        password: '',
        allowedEmails: '',
        description: ''
    });
    const [shareUrl, setShareUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleShare = async () => {
        setLoading(true);
        setError('');
        
        try {
            const expiresAt = new Date(Date.now() + parseInt(shareOptions.expiresIn) * 60 * 60 * 1000);
            const allowedEmails = shareOptions.allowedEmails
                .split(',')
                .map(email => email.trim())
                .filter(email => email);

            const response = await fileAPI.createShareLink(file.id, {
                expiresAt,
                maxDownloads: parseInt(shareOptions.maxDownloads),
                password: shareOptions.password || null,
                allowedEmails,
                description: shareOptions.description
            });

            setShareUrl(response.shareUrl);
        } catch (error) {
            setError(error.response?.data?.error || 'Failed to create share link');
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(shareUrl);
        // You could add a toast notification here
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>🔗 Share "{file?.originalName}"</h3>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                <div className="modal-body">
                    {!shareUrl ? (
                        <div className="share-options">
                            <div className="form-group">
                                <label>Expires in:</label>
                                <select 
                                    value={shareOptions.expiresIn}
                                    onChange={e => setShareOptions({...shareOptions, expiresIn: e.target.value})}
                                >
                                    <option value="1">1 hour</option>
                                    <option value="24">1 day</option>
                                    <option value="168">1 week</option>
                                    <option value="720">1 month</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Max downloads:</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="100"
                                    value={shareOptions.maxDownloads}
                                    onChange={e => setShareOptions({...shareOptions, maxDownloads: e.target.value})}
                                />
                            </div>

                            <div className="form-group">
                                <label>Password (optional):</label>
                                <input
                                    type="password"
                                    placeholder="Leave empty for no password"
                                    value={shareOptions.password}
                                    onChange={e => setShareOptions({...shareOptions, password: e.target.value})}
                                />
                            </div>

                            <div className="form-group">
                                <label>Allowed emails (optional):</label>
                                <input
                                    type="text"
                                    placeholder="email1@example.com, email2@example.com"
                                    value={shareOptions.allowedEmails}
                                    onChange={e => setShareOptions({...shareOptions, allowedEmails: e.target.value})}
                                />
                            </div>

                            <div className="form-group">
                                <label>Description (optional):</label>
                                <textarea
                                    placeholder="Add a note about this file"
                                    value={shareOptions.description}
                                    onChange={e => setShareOptions({...shareOptions, description: e.target.value})}
                                />
                            </div>

                            {error && <div className="error-message">{error}</div>}

                            <button 
                                className="btn btn-primary"
                                onClick={handleShare}
                                disabled={loading}
                            >
                                {loading ? 'Creating...' : 'Create Share Link'}
                            </button>
                        </div>
                    ) : (
                        <div className="share-result">
                            <div className="success-message">
                                ✅ Share link created successfully!
                            </div>
                            
                            <div className="share-url">
                                <input
                                    type="text"
                                    value={shareUrl}
                                    readOnly
                                    className="share-url-input"
                                />
                                <button 
                                    className="btn btn-secondary"
                                    onClick={copyToClipboard}
                                >
                                    📋 Copy
                                </button>
                            </div>

                            <div className="share-details">
                                <p><strong>Expires:</strong> {shareOptions.expiresIn} hours</p>
                                <p><strong>Max downloads:</strong> {shareOptions.maxDownloads}</p>
                                {shareOptions.password && <p><strong>Password protected:</strong> Yes</p>}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ShareModal; 