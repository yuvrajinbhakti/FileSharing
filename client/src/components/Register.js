import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Auth.css';

const Register = () => {
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        confirmPassword: ''
    });
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [passwordStrength, setPasswordStrength] = useState(0);
    const [validationErrors, setValidationErrors] = useState({});

    const { register, error, clearError } = useAuth();
    const navigate = useNavigate();

    const checkPasswordStrength = (password) => {
        let strength = 0;
        const checks = {
            length: password.length >= 8,
            lowercase: /[a-z]/.test(password),
            uppercase: /[A-Z]/.test(password),
            number: /\d/.test(password),
            special: /[@$!%*?&]/.test(password)
        };

        strength = Object.values(checks).filter(Boolean).length;
        return { strength, checks };
    };

    const validateForm = () => {
        const errors = {};

        // Username validation
        if (formData.username.length < 3) {
            errors.username = 'Username must be at least 3 characters';
        } else if (!/^[a-zA-Z0-9_]+$/.test(formData.username)) {
            errors.username = 'Username can only contain letters, numbers, and underscores';
        }

        // Email validation
        if (!/\S+@\S+\.\S+/.test(formData.email)) {
            errors.email = 'Please enter a valid email address';
        }

        // Password validation
        const { checks } = checkPasswordStrength(formData.password);
        if (!checks.length) errors.password = 'Password must be at least 8 characters';
        if (!checks.lowercase) errors.password = 'Password must contain lowercase letters';
        if (!checks.uppercase) errors.password = 'Password must contain uppercase letters';
        if (!checks.number) errors.password = 'Password must contain numbers';
        if (!checks.special) errors.password = 'Password must contain special characters (@$!%*?&)';

        // Confirm password validation
        if (formData.password !== formData.confirmPassword) {
            errors.confirmPassword = 'Passwords do not match';
        }

        setValidationErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData({
            ...formData,
            [name]: value
        });

        // Clear validation errors for the field being edited
        if (validationErrors[name]) {
            setValidationErrors({
                ...validationErrors,
                [name]: undefined
            });
        }

        // Update password strength for password field
        if (name === 'password') {
            const { strength } = checkPasswordStrength(value);
            setPasswordStrength(strength);
        }

        clearError();
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!validateForm()) {
            return;
        }

        setIsLoading(true);

        try {
            await register(formData);
            navigate('/dashboard');
        } catch (error) {
            console.error('Registration failed:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const getPasswordStrengthColor = () => {
        if (passwordStrength <= 2) return '#ff4757';
        if (passwordStrength <= 3) return '#ffa726';
        if (passwordStrength <= 4) return '#66bb6a';
        return '#4caf50';
    };

    const getPasswordStrengthText = () => {
        if (passwordStrength <= 2) return 'Weak';
        if (passwordStrength <= 3) return 'Fair';
        if (passwordStrength <= 4) return 'Good';
        return 'Strong';
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-header">
                    <h1>🔐 SecureShare</h1>
                    <h2>Create Account</h2>
                    <p>Join our secure file sharing platform</p>
                </div>

                <form onSubmit={handleSubmit} className="auth-form">
                    {error && (
                        <div className="error-message">
                            <span className="error-icon">⚠️</span>
                            {error}
                        </div>
                    )}

                    <div className="form-group">
                        <label htmlFor="username">Username</label>
                        <input
                            type="text"
                            id="username"
                            name="username"
                            value={formData.username}
                            onChange={handleChange}
                            required
                            placeholder="Choose a username"
                            disabled={isLoading}
                            className={validationErrors.username ? 'error' : ''}
                        />
                        {validationErrors.username && (
                            <span className="field-error">{validationErrors.username}</span>
                        )}
                    </div>

                    <div className="form-group">
                        <label htmlFor="email">Email</label>
                        <input
                            type="email"
                            id="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            required
                            placeholder="Enter your email"
                            disabled={isLoading}
                            className={validationErrors.email ? 'error' : ''}
                        />
                        {validationErrors.email && (
                            <span className="field-error">{validationErrors.email}</span>
                        )}
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">Password</label>
                        <div className="password-input-container">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                id="password"
                                name="password"
                                value={formData.password}
                                onChange={handleChange}
                                required
                                placeholder="Create a strong password"
                                disabled={isLoading}
                                className={validationErrors.password ? 'error' : ''}
                            />
                            <button
                                type="button"
                                className="password-toggle"
                                onClick={() => setShowPassword(!showPassword)}
                                disabled={isLoading}
                            >
                                {showPassword ? '👁️' : '👁️‍🗨️'}
                            </button>
                        </div>
                        {formData.password && (
                            <div className="password-strength">
                                <div className="password-strength-bar">
                                    <div 
                                        className="password-strength-fill"
                                        style={{
                                            width: `${(passwordStrength / 5) * 100}%`,
                                            backgroundColor: getPasswordStrengthColor()
                                        }}
                                    ></div>
                                </div>
                                <span 
                                    className="password-strength-text"
                                    style={{ color: getPasswordStrengthColor() }}
                                >
                                    {getPasswordStrengthText()}
                                </span>
                            </div>
                        )}
                        {validationErrors.password && (
                            <span className="field-error">{validationErrors.password}</span>
                        )}
                    </div>

                    <div className="form-group">
                        <label htmlFor="confirmPassword">Confirm Password</label>
                        <div className="password-input-container">
                            <input
                                type={showConfirmPassword ? 'text' : 'password'}
                                id="confirmPassword"
                                name="confirmPassword"
                                value={formData.confirmPassword}
                                onChange={handleChange}
                                required
                                placeholder="Confirm your password"
                                disabled={isLoading}
                                className={validationErrors.confirmPassword ? 'error' : ''}
                            />
                            <button
                                type="button"
                                className="password-toggle"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                disabled={isLoading}
                            >
                                {showConfirmPassword ? '👁️' : '👁️‍🗨️'}
                            </button>
                        </div>
                        {validationErrors.confirmPassword && (
                            <span className="field-error">{validationErrors.confirmPassword}</span>
                        )}
                    </div>

                    <button 
                        type="submit" 
                        className="auth-button"
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <>
                                <span className="loading-spinner"></span>
                                Creating Account...
                            </>
                        ) : (
                            'Create Account'
                        )}
                    </button>
                </form>

                <div className="auth-footer">
                    <p>
                        Already have an account?{' '}
                        <Link to="/login" className="auth-link">
                            Sign In
                        </Link>
                    </p>
                </div>

                <div className="security-notice">
                    <small>
                        🔒 By creating an account, you agree to our secure file handling practices
                    </small>
                </div>
            </div>
        </div>
    );
};

export default Register; 