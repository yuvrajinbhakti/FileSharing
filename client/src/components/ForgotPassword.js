import React, { useState } from 'react';
import { authAPI } from '../service/api';
import './Auth.css';

const ForgotPassword = ({ onBack }) => {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setMessage('');

        try {
            const response = await authAPI.requestPasswordReset(email);
            setMessage(response.message || 'Password reset instructions sent to your email.');
        } catch (error) {
            setError(error.response?.data?.error || 'Failed to send reset email. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-header">
                    <h1>🔐 SecureShare</h1>
                    <h2>Reset Password</h2>
                    <p>Enter your email address and we'll send you instructions to reset your password.</p>
                </div>

                <form onSubmit={handleSubmit} className="auth-form">
                    {error && <div className="message message-error">{error}</div>}
                    {message && <div className="message message-success">{message}</div>}

                    <div className="form-group">
                        <label htmlFor="email">Email Address</label>
                        <input
                            type="email"
                            id="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="Enter your email address"
                            required
                            autoFocus
                        />
                    </div>

                    <button 
                        type="submit" 
                        className="btn btn-primary btn-full"
                        disabled={loading}
                    >
                        {loading ? (
                            <>
                                <span className="loading-spinner"></span>
                                Sending...
                            </>
                        ) : (
                            'Send Reset Instructions'
                        )}
                    </button>
                </form>

                <div className="auth-footer">
                    <button 
                        onClick={onBack}
                        className="link-button"
                    >
                        ← Back to Login
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ForgotPassword; 