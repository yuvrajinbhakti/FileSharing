import mongoose from "mongoose";

const FileSchema = new mongoose.Schema({
    // File information
    path: {
        type: String,
        required: true
    },
    originalName: {
        type: String,
        required: true
    },
    fileName: {
        type: String,
        required: true
    },
    fileSize: {
        type: Number,
        required: true
    },
    mimeType: {
        type: String,
        required: true
    },
    
    // Security and encryption
    isEncrypted: {
        type: Boolean,
        default: true
    },
    encryptionKey: {
        type: String,
        required: function() { return this.isEncrypted; }
    },
    encryptionIV: {
        type: String,
        required: function() { return this.isEncrypted; }
    },
    encryptionTag: {
        type: String,
        required: function() { return this.isEncrypted; }
    },
    fileHash: {
        type: String,
        required: true
    },
    
    // User and access control
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    accessLevel: {
        type: String,
        enum: ['private', 'public', 'restricted'],
        default: 'private'
    },
    allowedUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    
    // File metadata
    downloadCount: {
        type: Number,
        default: 0
    },
    lastDownloaded: {
        type: Date
    },
    expiresAt: {
        type: Date,
        index: { expireAfterSeconds: 0 }
    },
    
    // Status
    isActive: {
        type: Boolean,
        default: true
    },
    virusScanStatus: {
        type: String,
        enum: ['pending', 'clean', 'infected', 'failed'],
        default: 'pending'
    },
    
    // Additional metadata
    tags: [String],
    description: String,
    
}, {
    timestamps: true
});

// Index for faster queries
FileSchema.index({ uploadedBy: 1, createdAt: -1 });
FileSchema.index({ fileHash: 1 });
FileSchema.index({ isActive: 1, expiresAt: 1 });

// Virtual for file URL
FileSchema.virtual('downloadUrl').get(function() {
    return `/api/file/${this._id}`;
});

// Method to check if user can access file
FileSchema.methods.canAccess = function(userId, userRole) {
    // The download route uses optionalAuth, so userId is undefined for anyone
    // not signed in. This used to call userId.toString() before reaching the
    // public check, which threw — meaning a public file could not be fetched by
    // the very people "public" is for. It failed closed, so nothing was exposed;
    // the feature simply did not work and nothing said so.
    const signedIn = userId !== undefined && userId !== null;
    const id = signedIn ? userId.toString() : null;

    // Admin can access any file
    if (userRole === 'admin') return true;

    // Owner can always access
    if (signedIn && this.uploadedBy.toString() === id) return true;

    // Public files can be accessed by anyone, signed in or not
    if (this.accessLevel === 'public') return true;

    // Restricted files — only the users named on the file, and you have to be
    // somebody for your name to be on it
    if (this.accessLevel === 'restricted') {
        return signedIn && this.allowedUsers.some(allowedId => allowedId.toString() === id);
    }

    // Private files - only owner
    return false;
};

// Static method to find accessible files for user
FileSchema.statics.findAccessibleFiles = function(userId, userRole) {
    if (userRole === 'admin') {
        return this.find({ isActive: true });
    }
    
    return this.find({
        isActive: true,
        $or: [
            { uploadedBy: userId },
            { accessLevel: 'public' },
            { accessLevel: 'restricted', allowedUsers: userId }
        ]
    });
};

const File = mongoose.model('File', FileSchema);

export default File;