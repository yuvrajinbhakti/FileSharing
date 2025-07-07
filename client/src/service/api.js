import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

// Create axios instance with default config
const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
    }
});

// Token management
const TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const getRefreshToken = () => localStorage.getItem(REFRESH_TOKEN_KEY);
export const setTokens = (accessToken, refreshToken) => {
    localStorage.setItem(TOKEN_KEY, accessToken);
    if (refreshToken) {
        localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    }
};
export const clearTokens = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
};

// Request interceptor to add auth token
api.interceptors.request.use(
    (config) => {
        const token = getToken();
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Response interceptor to handle token refresh
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;
            
            const refreshToken = getRefreshToken();
            if (refreshToken) {
                try {
                    const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
                        refreshToken
                    });
                    
                    const { accessToken } = response.data;
                    setTokens(accessToken, refreshToken);
                    
                    // Retry original request with new token
                    originalRequest.headers.Authorization = `Bearer ${accessToken}`;
                    return api(originalRequest);
                } catch (refreshError) {
                    clearTokens();
                    window.location.href = '/login';
                    return Promise.reject(refreshError);
                }
            } else {
                clearTokens();
                window.location.href = '/login';
            }
        }
        
        return Promise.reject(error);
    }
);

// Authentication API
export const authAPI = {
    register: async (userData) => {
        const response = await api.post('/auth/register', userData);
        if (response.data.tokens) {
            setTokens(response.data.tokens.accessToken, response.data.tokens.refreshToken);
        }
        return response.data;
    },
    
    login: async (credentials) => {
        const response = await api.post('/auth/login', credentials);
        if (response.data.tokens) {
            setTokens(response.data.tokens.accessToken, response.data.tokens.refreshToken);
        }
        return response.data;
    },
    
    logout: async () => {
        const refreshToken = getRefreshToken();
        try {
            await api.post('/auth/logout', { refreshToken });
        } catch (error) {
            console.warn('Logout request failed:', error);
        } finally {
            clearTokens();
        }
    },
    
    getProfile: async () => {
        const response = await api.get('/auth/profile');
        return response.data;
    },
    
    refreshToken: async () => {
        const refreshToken = getRefreshToken();
        const response = await api.post('/auth/refresh', { refreshToken });
        setTokens(response.data.accessToken, refreshToken);
        return response.data;
    },
    
    // Enhanced auth features
    requestPasswordReset: async (email) => {
        const response = await api.post('/auth/reset-password/request', { email });
        return response.data;
    },
    
    resetPassword: async (token, newPassword, confirmPassword) => {
        const response = await api.post('/auth/reset-password/confirm', { 
            token, newPassword, confirmPassword 
        });
        return response.data;
    },
    
    // Two-factor authentication
    setup2FA: async () => {
        const response = await api.post('/auth/2fa/setup');
        return response.data;
    },
    
    enable2FA: async (token) => {
        const response = await api.post('/auth/2fa/enable', { token });
        return response.data;
    },
    
    disable2FA: async (password) => {
        const response = await api.post('/auth/2fa/disable', { password });
        return response.data;
    },
    
    // User activity
    getUserActivity: async (limit = 20) => {
        const response = await api.get(`/auth/activity?limit=${limit}`);
        return response.data;
    }
};

// File API
export const fileAPI = {
    upload: async (formData, onUploadProgress) => {
        const response = await api.post('/upload', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
            onUploadProgress
        });
        return response.data;
    },
    
    getUserFiles: async (page = 1, limit = 10) => {
        const response = await api.get(`/files?page=${page}&limit=${limit}`);
        return response.data;
    },
    
    downloadFile: async (fileId) => {
        const response = await api.get(`/file/${fileId}`, {
            responseType: 'blob'
        });
        return response;
    },
    
    deleteFile: async (fileId) => {
        const response = await api.delete(`/file/${fileId}`);
        return response.data;
    },
    
    // File sharing
    createShareLink: async (fileId, options) => {
        const response = await api.post('/sharing/create', { fileId, ...options });
        return response.data;
    },
    
    getShareLink: async (linkId, accessToken) => {
        const response = await api.get(`/sharing/${linkId}/${accessToken}`);
        return response.data;
    },
    
    downloadSharedFile: async (linkId, accessToken, password = null) => {
        const response = await api.post(`/sharing/${linkId}/${accessToken}/download`, 
            { password }, 
            { responseType: 'blob' }
        );
        return response;
    },
    
    // Bulk operations
    createBulkDownload: async (fileIds, options = {}) => {
        const response = await api.post('/bulk/download', { fileIds, ...options });
        return response.data;
    },
    
    bulkDeleteFiles: async (fileIds) => {
        const response = await api.post('/bulk/delete', { fileIds });
        return response.data;
    }
};

// Admin API
export const adminAPI = {
    getAllFiles: async (page = 1, limit = 20) => {
        const response = await api.get(`/admin/files?page=${page}&limit=${limit}`);
        return response.data;
    },
    
    getAllUsers: async () => {
        const response = await api.get('/admin/users');
        return response.data;
    }
};

// Health check
export const healthCheck = async () => {
    const response = await api.get('/health');
    return response.data;
};

// Legacy support
export const uploadFile = fileAPI.upload;

export default api;