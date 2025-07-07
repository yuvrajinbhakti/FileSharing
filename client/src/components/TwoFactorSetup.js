import React, { useState, useEffect } from 'react';
import { authAPI } from '../service/api';
import './TwoFactorSetup.css';

const TwoFactorSetup = ({ user, onClose, onUpdate }) => {
    const [step, setStep] = useState('setup'); // setup, verify, completed
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [setupData, setSetupData] = useState(null);
    const [verificationCode, setVerificationCode] = useState('');
    const [backupCodes, setBackupCodes] = useState([]);

    useEffect(() => {
        if (user?.twoFactorAuth?.enabled) {
            setStep('manage');
        } else {
            initiate2FASetup();
        }
    }, [user]);

    const initiate2FASetup = async () => {
        setLoading(true);
        setError('');
        
        try {
            const response = await authAPI.setup2FA();
            setSetupData(response.data);
            setStep('setup');
        } catch (error) {
            setError(error.response?.data?.error || 'Failed to setup 2FA');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyAndEnable = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const response = await authAPI.enable2FA(verificationCode);
            setBackupCodes(response.data.backupCodes);
            setStep('completed');
            onUpdate?.(); // Refresh user data
        } catch (error) {
            setError(error.response?.data?.error || 'Invalid verification code');
        } finally {
            setLoading(false);
        }
    };

    const handleDisable2FA = async () => {
        const password = prompt('Enter your password to disable 2FA:');
        if (!password) return;

        setLoading(true);
        setError('');

        try {
            await authAPI.disable2FA(password);
            onUpdate?.(); // Refresh user data
            onClose?.();
        } catch (error) {
            setError(error.response?.data?.error || 'Failed to disable 2FA');
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
    };

    const downloadBackupCodes = () => {
        const content = `SecureShare Two-Factor Authentication Backup Codes\n\nGenerated: ${new Date().toISOString()}\nUser: ${user?.username}\n\nBackup Codes (use these if you lose access to your authenticator):\n${backupCodes.map((code, i) => `${i + 1}. ${code}`).join('\n')}\n\nKeep these codes in a safe place!`;
        
        const blob = new Blob([content], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `secureshare-backup-codes-${user?.username}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    };

    if (step === 'manage' && user?.twoFactorAuth?.enabled) {
        return (
            <div className="twofa-container">
                <div className="twofa-header">
                    <h3>🔐 Two-Factor Authentication</h3>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>
                
                <div className="twofa-content">
                    <div className="status-card enabled">
                        <div className="status-icon">✅</div>
                        <div className="status-text">
                            <h4>Two-Factor Authentication is Enabled</h4>
                            <p>Your account is secured with 2FA</p>
                        </div>
                    </div>

                    <div className="twofa-actions">
                        <button 
                            className="btn btn-danger"
                            onClick={handleDisable2FA}
                            disabled={loading}
                        >
                            {loading ? 'Processing...' : 'Disable 2FA'}
                        </button>
                    </div>

                    {error && <div className="error-message">{error}</div>}
                </div>
            </div>
        );
    }

    return (
        <div className="twofa-container">
            <div className="twofa-header">
                <h3>🔐 Setup Two-Factor Authentication</h3>
                <button className="close-btn" onClick={onClose}>×</button>
            </div>

            <div className="twofa-content">
                {step === 'setup' && setupData && (
                    <div className="setup-step">
                        <div className="step-info">
                            <h4>Step 1: Scan QR Code</h4>
                            <p>Use your authenticator app (Google Authenticator, Authy, etc.) to scan this QR code:</p>
                        </div>

                        <div className="qr-section">
                            <div className="qr-code">
                                <img 
                                    src={setupData.qrCode} 
                                    alt="2FA QR Code"
                                    style={{ maxWidth: '200px', height: 'auto' }}
                                />
                            </div>
                            
                            <div className="manual-entry">
                                <p><strong>Can't scan?</strong> Enter this code manually:</p>
                                <div className="manual-code">
                                    <code>{setupData.secret}</code>
                                    <button 
                                        className="btn btn-sm btn-secondary"
                                        onClick={() => copyToClipboard(setupData.secret)}
                                    >
                                        📋 Copy
                                    </button>
                                </div>
                            </div>
                        </div>

                        <form onSubmit={handleVerifyAndEnable} className="verification-form">
                            <div className="form-group">
                                <label htmlFor="verification-code">
                                    Step 2: Enter Verification Code
                                </label>
                                <input
                                    type="text"
                                    id="verification-code"
                                    value={verificationCode}
                                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="000000"
                                    maxLength="6"
                                    pattern="[0-9]{6}"
                                    required
                                    autoComplete="off"
                                />
                                <small>Enter the 6-digit code from your authenticator app</small>
                            </div>

                            {error && <div className="error-message">{error}</div>}

                            <button 
                                type="submit" 
                                className="btn btn-primary"
                                disabled={loading || verificationCode.length !== 6}
                            >
                                {loading ? 'Verifying...' : 'Enable 2FA'}
                            </button>
                        </form>
                    </div>
                )}

                {step === 'completed' && (
                    <div className="completion-step">
                        <div className="success-message">
                            ✅ Two-Factor Authentication enabled successfully!
                        </div>

                        <div className="backup-codes-section">
                            <h4>⚠️ Important: Save Your Backup Codes</h4>
                            <p>Store these backup codes in a safe place. You can use them to access your account if you lose your authenticator device.</p>
                            
                            <div className="backup-codes">
                                {backupCodes.map((code, index) => (
                                    <div key={index} className="backup-code">
                                        <span className="code-number">{index + 1}.</span>
                                        <code>{code}</code>
                                    </div>
                                ))}
                            </div>

                            <div className="backup-actions">
                                <button 
                                    className="btn btn-secondary"
                                    onClick={downloadBackupCodes}
                                >
                                    📥 Download Backup Codes
                                </button>
                                <button 
                                    className="btn btn-primary"
                                    onClick={onClose}
                                >
                                    Complete Setup
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {loading && step === 'setup' && !setupData && (
                    <div className="loading-state">
                        <div className="loading-spinner"></div>
                        <p>Setting up two-factor authentication...</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TwoFactorSetup; 