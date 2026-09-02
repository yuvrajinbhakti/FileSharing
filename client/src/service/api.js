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
        try {
            // Add debugging information
            console.log('Starting file upload...');
            console.log('FormData contents:');
            for (let [key, value] of formData.entries()) {
                if (value instanceof File) {
                    console.log(`${key}: File(${value.name}, ${value.size} bytes, ${value.type})`);
                } else {
                    console.log(`${key}: ${value}`);
                }
            }

            const response = await api.post('/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
                onUploadProgress,
                timeout: 60000 // Increase timeout to 60 seconds
            });
            
            console.log('Upload successful:', response.data);
            return response.data;
        } catch (error) {
            console.error('Upload error details:', {
                message: error.message,
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data,
                config: {
                    url: error.config?.url,
                    method: error.config?.method,
                    headers: error.config?.headers,
                    baseURL: error.config?.baseURL
                }
            });
            
            // Re-throw with enhanced error information
            const enhancedError = new Error(
                error.response?.data?.error || 
                error.message || 
                'Upload failed'
            );
            enhancedError.originalError = error;
            enhancedError.status = error.response?.status;
            enhancedError.code = error.response?.data?.code;
            throw enhancedError;
        }
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
    
    // File sharing.
    //
    // These used to point at `/sharing/create` and `/sharing/:linkId/:token`,
    // which the server has never had — the paths are `/share/...`. Nothing here
    // could ever have succeeded, and the share button failed the same way every
    // time it was pressed.
    createShareLink: async (fileId, options) => {
        const response = await api.post(`/share/${fileId}`, options);
        // The server wraps it: { message, share: {...}, notifications }.
        return response.data.share;
    },

    listMyShareLinks: async () => {
        const response = await api.get('/share/my-links');
        return response.data;
    },

    getShareStats: async (linkId) => {
        const response = await api.get(`/share/${linkId}/stats`);
        return response.data.stats;
    },

    revokeShareLink: async (linkId) => {
        const response = await api.delete(`/share/${linkId}`);
        return response.data;
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
    },
    
    updateUserRole: async (userId, role) => {
        const response = await api.put(`/admin/users/${userId}/role`, { role });
        return response.data;
    },
    
    updateUserStatus: async (userId, status) => {
        const response = await api.put(`/admin/users/${userId}/status`, { status });
        return response.data;
    },
    
    getSystemStats: async () => {
        const response = await api.get('/admin/stats');
        return response.data;
    },
    
    getSystemActivity: async (limit = 50) => {
        const response = await api.get(`/admin/activity?limit=${limit}`);
        return response.data;
    }
};

/**
 * The recipient side of a share link.
 *
 * Deliberately its own axios instance, with none of the interceptors above.
 * The shared `api` client attaches whatever token is in localStorage and, on any
 * 401, clears the tokens and sends the browser to `/login`. Both behaviours are
 * wrong here:
 *
 *   - A share link is opened by somebody with no account. There is nothing to
 *     attach, and attaching a stale token from a previous session would make a
 *     public request look like an authenticated one.
 *
 *   - The server answers 401 to say "this link wants a password" or "it wants an
 *     email". Through the shared client that becomes a redirect to the login
 *     page — so asking for a password would instead throw the recipient out to
 *     a form for an account they do not have, and the link would look broken to
 *     the one person it was created for.
 *
 * Errors are returned rather than thrown, because for this page a refusal is a
 * normal outcome to render, not an exception to catch.
 */
const publicApi = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' }
});

export const shareAPI = {
    /**
     * What is behind this link. Does not spend a download.
     * @returns {{ ok: true, file: object } | { ok: false, status: number, code: string, error: string, passwordRequired?: boolean, emailRequired?: boolean }}
     */
    getInfo: async (linkId, accessToken, { password, email } = {}) => {
        try {
            const params = {};
            if (password) params.password = password;
            if (email) params.email = email;
            const response = await publicApi.get(
                `/share/${encodeURIComponent(linkId)}/${encodeURIComponent(accessToken)}`,
                { params }
            );
            return { ok: true, ...response.data };
        } catch (error) {
            const data = error.response?.data || {};
            return {
                ok: false,
                status: error.response?.status ?? 0,
                code: data.code || 'NETWORK_ERROR',
                error: data.error || 'Could not reach the server',
                passwordRequired: Boolean(data.passwordRequired),
                emailRequired: Boolean(data.emailRequired)
            };
        }
    },

    /**
     * The file itself. Returns a Blob on success.
     *
     * `responseType: 'blob'` means an error body arrives as a Blob too, so it
     * has to be read back as text before it can be understood — otherwise every
     * refusal renders as "[object Blob]".
     */
    download: async (linkId, accessToken, { password, email } = {}) => {
        try {
            const response = await publicApi.post(
                `/share/${encodeURIComponent(linkId)}/${encodeURIComponent(accessToken)}/download`,
                { password: password || null, email: email || null },
                { responseType: 'blob' }
            );
            return { ok: true, blob: response.data };
        } catch (error) {
            let data = {};
            const body = error.response?.data;
            if (body instanceof Blob) {
                try { data = JSON.parse(await body.text()); } catch { /* not json */ }
            } else if (body) {
                data = body;
            }
            return {
                ok: false,
                status: error.response?.status ?? 0,
                code: data.code || 'NETWORK_ERROR',
                error: data.error || 'Could not reach the server',
                passwordRequired: Boolean(data.passwordRequired),
                emailRequired: Boolean(data.emailRequired)
            };
        }
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