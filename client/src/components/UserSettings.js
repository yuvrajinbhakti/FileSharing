import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { authAPI } from '../service/api';
import TwoFactorSetup from './TwoFactorSetup';
import './UserSettings.css';

const UserSettings = ({ onClose }) => {
    const { user, logout } = useAuth();
    const [activeTab, setActiveTab] = useState('security');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [show2FA, setShow2FA] = useState(false);
    const [userActivity, setUserActivity] = useState([]);

    const tabs = [
        { id: 'security', label: '🔐 Security', icon: '🔐' },
        { id: 'activity', label: '📊 Activity', icon: '📊' },
        { id: 'preferences', label: '⚙️ Preferences', icon: '⚙️' }
    ];

    useEffect(() => {
        if (activeTab === 'activity') {
            loadUserActivity();
        }
    }, [activeTab]);

    const loadUserActivity = async () => {
        setLoading(true);
        try {
            const response = await authAPI.getUserActivity(20);
            setUserActivity(response.data.activities);
        } catch (error) {
            setError('Failed to load activity logs');
        } finally {
            setLoading(false);
        }
    };

    const handleRefreshUser = async () => {
        // Refresh user data after 2FA changes
        try {
            const response = await authAPI.getProfile();
            // This would ideally update the auth context
        } catch (error) {
            console.error('Failed to refresh user data:', error);
        }
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleString();
    };

    const getActivityIcon = (activity) => {
        if (activity.includes('login')) return '🔑';
        if (activity.includes('upload')) return '📤';
        if (activity.includes('download')) return '📥';
        if (activity.includes('delete')) return '🗑️';
        if (activity.includes('share')) return '🔗';
        if (activity.includes('2FA') || activity.includes('Two-factor')) return '🔐';
        return '📝';
    };

    const renderSecurityTab = () => (
        <div className="settings-tab-content">
            <div className="security-section">
                <div className="section-header">
                    <h3>🔐 Two-Factor Authentication</h3>
                    <p>Add an extra layer of security to your account</p>
                </div>

                <div className="security-item">
                    <div className="security-info">
                        <div className="security-title">
                            Two-Factor Authentication
                            {user?.twoFactorAuth?.enabled && <span className="status-badge enabled">Enabled</span>}
                            {!user?.twoFactorAuth?.enabled && <span className="status-badge disabled">Disabled</span>}
                        </div>
                        <div className="security-description">
                            {user?.twoFactorAuth?.enabled 
                                ? 'Your account is protected with 2FA'
                                : 'Secure your account with authenticator app codes'
                            }
                        </div>
                    </div>
                    <button 
                        className={`btn ${user?.twoFactorAuth?.enabled ? 'btn-outline' : 'btn-primary'}`}
                        onClick={() => setShow2FA(true)}
                    >
                        {user?.twoFactorAuth?.enabled ? 'Manage 2FA' : 'Setup 2FA'}
                    </button>
                </div>
            </div>

            <div className="security-section">
                <div className="section-header">
                    <h3>🔑 Password & Access</h3>
                    <p>Manage your login credentials</p>
                </div>

                <div className="security-item">
                    <div className="security-info">
                        <div className="security-title">Password</div>
                        <div className="security-description">Change your account password</div>
                    </div>
                    <button className="btn btn-outline">
                        Change Password
                    </button>
                </div>

                <div className="security-item">
                    <div className="security-info">
                        <div className="security-title">Active Sessions</div>
                        <div className="security-description">Manage devices signed into your account</div>
                    </div>
                    <button className="btn btn-outline">
                        View Sessions
                    </button>
                </div>
            </div>

            <div className="danger-zone">
                <div className="section-header">
                    <h3>⚠️ Danger Zone</h3>
                    <p>Irreversible and destructive actions</p>
                </div>

                <div className="security-item">
                    <div className="security-info">
                        <div className="security-title">Sign Out All Devices</div>
                        <div className="security-description">Sign out of all devices and browsers</div>
                    </div>
                    <button 
                        className="btn btn-danger"
                        onClick={logout}
                    >
                        Sign Out Everywhere
                    </button>
                </div>
            </div>
        </div>
    );

    const renderActivityTab = () => (
        <div className="settings-tab-content">
            <div className="activity-section">
                <div className="section-header">
                    <h3>📊 Account Activity</h3>
                    <p>Review your recent account activity</p>
                    <button 
                        className="btn btn-sm btn-outline"
                        onClick={loadUserActivity}
                        disabled={loading}
                    >
                        {loading ? 'Refreshing...' : 'Refresh'}
                    </button>
                </div>

                <div className="activity-list">
                    {userActivity.length === 0 ? (
                        <div className="empty-state">
                            <p>No recent activity found</p>
                        </div>
                    ) : (
                        userActivity.map((activity, index) => (
                            <div key={index} className="activity-item">
                                <div className="activity-icon">
                                    {getActivityIcon(activity.activity)}
                                </div>
                                <div className="activity-details">
                                    <div className="activity-text">{activity.activity}</div>
                                    <div className="activity-time">{formatDate(activity.timestamp)}</div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );

    const renderPreferencesTab = () => (
        <div className="settings-tab-content">
            <div className="preferences-section">
                <div className="section-header">
                    <h3>⚙️ Account Preferences</h3>
                    <p>Customize your SecureShare experience</p>
                </div>

                <div className="preference-item">
                    <div className="preference-info">
                        <div className="preference-title">Email Notifications</div>
                        <div className="preference-description">Receive email alerts for account activity</div>
                    </div>
                    <label className="toggle-switch">
                        <input type="checkbox" defaultChecked />
                        <span className="toggle-slider"></span>
                    </label>
                </div>

                <div className="preference-item">
                    <div className="preference-info">
                        <div className="preference-title">File Share Notifications</div>
                        <div className="preference-description">Get notified when files are shared with you</div>
                    </div>
                    <label className="toggle-switch">
                        <input type="checkbox" defaultChecked />
                        <span className="toggle-slider"></span>
                    </label>
                </div>

                <div className="preference-item">
                    <div className="preference-info">
                        <div className="preference-title">Auto-delete Expired Files</div>
                        <div className="preference-description">Automatically remove files after expiration</div>
                    </div>
                    <label className="toggle-switch">
                        <input type="checkbox" />
                        <span className="toggle-slider"></span>
                    </label>
                </div>
            </div>

            <div className="account-info-section">
                <div className="section-header">
                    <h3>👤 Account Information</h3>
                </div>

                <div className="info-grid">
                    <div className="info-item">
                        <label>Username</label>
                        <div className="info-value">{user?.username}</div>
                    </div>
                    <div className="info-item">
                        <label>Email</label>
                        <div className="info-value">{user?.email}</div>
                    </div>
                    <div className="info-item">
                        <label>Role</label>
                        <div className="info-value">
                            {user?.role === 'admin' ? '👑 Administrator' : '👤 User'}
                        </div>
                    </div>
                    <div className="info-item">
                        <label>Member Since</label>
                        <div className="info-value">
                            {user?.createdAt ? formatDate(user.createdAt) : 'N/A'}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <div className="settings-overlay">
            <div className="settings-modal">
                <div className="settings-header">
                    <h2>⚙️ User Settings</h2>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                <div className="settings-body">
                    <div className="settings-sidebar">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                <span className="tab-icon">{tab.icon}</span>
                                <span className="tab-label">{tab.label}</span>
                            </button>
                        ))}
                    </div>

                    <div className="settings-content">
                        {error && <div className="error-message">{error}</div>}
                        {success && <div className="success-message">{success}</div>}

                        {activeTab === 'security' && renderSecurityTab()}
                        {activeTab === 'activity' && renderActivityTab()}
                        {activeTab === 'preferences' && renderPreferencesTab()}
                    </div>
                </div>
            </div>

            {show2FA && (
                <div className="modal-overlay">
                    <TwoFactorSetup 
                        user={user}
                        onClose={() => setShow2FA(false)}
                        onUpdate={handleRefreshUser}
                    />
                </div>
            )}
        </div>
    );
};

export default UserSettings; 