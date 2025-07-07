import React, { useState, useEffect } from 'react';
import { authAPI, adminAPI } from '../service/api';
import './AdminPanel.css';

const AdminPanel = ({ onClose }) => {
    const [activeTab, setActiveTab] = useState('users');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [users, setUsers] = useState([]);
    const [systemStats, setSystemStats] = useState({});
    const [activities, setActivities] = useState([]);

    const tabs = [
        { id: 'users', label: '👥 Users', icon: '👥' },
        { id: 'files', label: '📁 Files', icon: '📁' },
        { id: 'activity', label: '📊 Activity', icon: '📊' },
        { id: 'system', label: '⚙️ System', icon: '⚙️' }
    ];

    useEffect(() => {
        if (activeTab === 'users') {
            loadUsers();
        } else if (activeTab === 'activity') {
            loadSystemActivity();
        } else if (activeTab === 'system') {
            loadSystemStats();
        }
    }, [activeTab]);

    const loadUsers = async () => {
        setLoading(true);
        try {
            const response = await adminAPI.getAllUsers();
            setUsers(response.users || response);
        } catch (error) {
            setError('Failed to load users');
        } finally {
            setLoading(false);
        }
    };

    const loadSystemStats = async () => {
        setLoading(true);
        try {
            const response = await adminAPI.getSystemStats();
            setSystemStats(response);
        } catch (error) {
            setError('Failed to load system statistics');
        } finally {
            setLoading(false);
        }
    };

    const loadSystemActivity = async () => {
        setLoading(true);
        try {
            const response = await adminAPI.getSystemActivity(50);
            setActivities(response.activities || response);
        } catch (error) {
            setError('Failed to load system activity');
        } finally {
            setLoading(false);
        }
    };

    const handleToggleUserRole = async (userId, currentRole) => {
        const newRole = currentRole === 'admin' ? 'user' : 'admin';
        const confirmed = window.confirm(`Are you sure you want to change this user's role to ${newRole}?`);
        
        if (!confirmed) return;

        try {
            await adminAPI.updateUserRole(userId, newRole);
            setSuccess(`User role updated to ${newRole}`);
            loadUsers();
        } catch (error) {
            setError('Failed to update user role');
        }
    };

    const handleToggleUserStatus = async (userId, currentStatus) => {
        const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
        const confirmed = window.confirm(`Are you sure you want to ${newStatus === 'suspended' ? 'suspend' : 'activate'} this user?`);
        
        if (!confirmed) return;

        try {
            await adminAPI.updateUserStatus(userId, newStatus);
            setSuccess(`User ${newStatus === 'suspended' ? 'suspended' : 'activated'} successfully`);
            loadUsers();
        } catch (error) {
            setError('Failed to update user status');
        }
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleString();
    };

    const formatBytes = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const getActivityIcon = (activity) => {
        if (activity.includes('login')) return '🔑';
        if (activity.includes('upload')) return '📤';
        if (activity.includes('download')) return '📥';
        if (activity.includes('delete')) return '🗑️';
        if (activity.includes('share')) return '🔗';
        if (activity.includes('admin')) return '👑';
        return '📝';
    };

    const renderUsersTab = () => (
        <div className="admin-tab-content">
            <div className="admin-section">
                <div className="section-header">
                    <h3>👥 User Management</h3>
                    <p>Manage user accounts and permissions</p>
                </div>

                <div className="users-table">
                    <table>
                        <thead>
                            <tr>
                                <th>User</th>
                                <th>Email</th>
                                <th>Role</th>
                                <th>Status</th>
                                <th>Files</th>
                                <th>Joined</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((user) => (
                                <tr key={user.id}>
                                    <td>
                                        <div className="user-info">
                                            <div className="user-avatar">
                                                {user.username.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="user-details">
                                                <div className="user-name">{user.username}</div>
                                                <div className="user-id">ID: {user.id}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td>{user.email}</td>
                                    <td>
                                        <span className={`role-badge ${user.role}`}>
                                            {user.role === 'admin' ? '👑 Admin' : '👤 User'}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={`status-badge ${user.status || 'active'}`}>
                                            {user.status === 'suspended' ? '🚫 Suspended' : '✅ Active'}
                                        </span>
                                    </td>
                                    <td>{user.fileCount || 0}</td>
                                    <td>{formatDate(user.createdAt)}</td>
                                    <td>
                                        <div className="user-actions">
                                            <button
                                                className="btn btn-sm btn-outline"
                                                onClick={() => handleToggleUserRole(user.id, user.role)}
                                            >
                                                {user.role === 'admin' ? 'Remove Admin' : 'Make Admin'}
                                            </button>
                                            <button
                                                className={`btn btn-sm ${user.status === 'suspended' ? 'btn-success' : 'btn-warning'}`}
                                                onClick={() => handleToggleUserStatus(user.id, user.status || 'active')}
                                            >
                                                {user.status === 'suspended' ? 'Activate' : 'Suspend'}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );

    const renderFilesTab = () => (
        <div className="admin-tab-content">
            <div className="admin-section">
                <div className="section-header">
                    <h3>📁 File Management</h3>
                    <p>Overview of all files in the system</p>
                </div>

                <div className="stats-grid">
                    <div className="stat-card">
                        <div className="stat-icon">📄</div>
                        <div className="stat-content">
                            <div className="stat-value">{systemStats.totalFiles || 0}</div>
                            <div className="stat-label">Total Files</div>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon">💾</div>
                        <div className="stat-content">
                            <div className="stat-value">{formatBytes(systemStats.totalStorage || 0)}</div>
                            <div className="stat-label">Total Storage</div>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon">📥</div>
                        <div className="stat-content">
                            <div className="stat-value">{systemStats.totalDownloads || 0}</div>
                            <div className="stat-label">Total Downloads</div>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon">🔗</div>
                        <div className="stat-content">
                            <div className="stat-value">{systemStats.totalShares || 0}</div>
                            <div className="stat-label">Total Shares</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderActivityTab = () => (
        <div className="admin-tab-content">
            <div className="admin-section">
                <div className="section-header">
                    <h3>📊 System Activity</h3>
                    <p>Monitor system-wide activity and logs</p>
                </div>

                <div className="activity-list">
                    {activities.length === 0 ? (
                        <div className="empty-state">
                            <p>No recent activity found</p>
                        </div>
                    ) : (
                        activities.map((activity, index) => (
                            <div key={index} className="activity-item">
                                <div className="activity-icon">
                                    {getActivityIcon(activity.activity)}
                                </div>
                                <div className="activity-details">
                                    <div className="activity-text">{activity.activity}</div>
                                    <div className="activity-meta">
                                        <span className="activity-user">by {activity.username}</span>
                                        <span className="activity-time">{formatDate(activity.timestamp)}</span>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );

    const renderSystemTab = () => (
        <div className="admin-tab-content">
            <div className="admin-section">
                <div className="section-header">
                    <h3>⚙️ System Settings</h3>
                    <p>Configure system-wide settings and preferences</p>
                </div>

                <div className="settings-grid">
                    <div className="setting-card">
                        <div className="setting-header">
                            <h4>📧 Email Settings</h4>
                        </div>
                        <div className="setting-content">
                            <div className="setting-item">
                                <label>SMTP Server</label>
                                <input type="text" placeholder="smtp.example.com" />
                            </div>
                            <div className="setting-item">
                                <label>Port</label>
                                <input type="number" placeholder="587" />
                            </div>
                            <button className="btn btn-primary">Update</button>
                        </div>
                    </div>

                    <div className="setting-card">
                        <div className="setting-header">
                            <h4>🔒 Security Settings</h4>
                        </div>
                        <div className="setting-content">
                            <div className="setting-item">
                                <label>Max File Size (MB)</label>
                                <input type="number" placeholder="100" />
                            </div>
                            <div className="setting-item">
                                <label>Session Timeout (minutes)</label>
                                <input type="number" placeholder="60" />
                            </div>
                            <button className="btn btn-primary">Update</button>
                        </div>
                    </div>

                    <div className="setting-card">
                        <div className="setting-header">
                            <h4>📊 System Status</h4>
                        </div>
                        <div className="setting-content">
                            <div className="status-item">
                                <span>Database</span>
                                <span className="status-indicator online">🟢 Online</span>
                            </div>
                            <div className="status-item">
                                <span>Redis Cache</span>
                                <span className="status-indicator online">🟢 Online</span>
                            </div>
                            <div className="status-item">
                                <span>File Storage</span>
                                <span className="status-indicator online">🟢 Online</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <div className="admin-overlay">
            <div className="admin-modal">
                <div className="admin-header">
                    <h2>👑 Admin Panel</h2>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                <div className="admin-body">
                    <div className="admin-sidebar">
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

                    <div className="admin-content">
                        {error && <div className="error-message">{error}</div>}
                        {success && <div className="success-message">{success}</div>}

                        {loading ? (
                            <div className="loading-state">
                                <div className="loading-spinner"></div>
                                <p>Loading...</p>
                            </div>
                        ) : (
                            <>
                                {activeTab === 'users' && renderUsersTab()}
                                {activeTab === 'files' && renderFilesTab()}
                                {activeTab === 'activity' && renderActivityTab()}
                                {activeTab === 'system' && renderSystemTab()}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminPanel; 