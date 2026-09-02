import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { shareAPI } from '../service/api';
import './SharedFile.css';

/**
 * The page a share link actually lands on.
 *
 * Everything else in this app assumes a signed-in user. This is the one screen
 * built for somebody who has no account and never will — so it has no header, no
 * navigation into the app, and no prompt to sign up. It shows one file and offers
 * it, or explains why it cannot.
 *
 * Until now the server minted real URLs at `/share/:linkId/:accessToken` and the
 * router's catch-all sent every one of them to `/dashboard`, which bounced to
 * `/login`. The link worked; the page it pointed at did not exist.
 */

const formatSize = (bytes) => {
    if (!bytes && bytes !== 0) return '';
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const iconFor = (mimeType = '') => {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.startsWith('video/')) return '🎥';
    if (mimeType.startsWith('audio/')) return '🎵';
    if (mimeType.includes('pdf')) return '📕';
    if (mimeType.includes('zip') || mimeType.includes('compressed')) return '🗜️';
    return '📄';
};

/**
 * How long until the link dies, in words.
 *
 * Shown because a recipient's real question is "do I have to do this now", and
 * a raw timestamp in the server's timezone does not answer it.
 */
const expiresIn = (expiresAt) => {
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (!Number.isFinite(ms) || ms <= 0) return 'expired';
    const minutes = Math.round(ms / 60000);
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'}`;
    return `${Math.round(hours / 24)} days`;
};

const SharedFile = () => {
    const { linkId, accessToken } = useParams();

    const [state, setState] = useState('loading'); // loading | ready | locked | gone | downloading
    const [info, setInfo] = useState(null);
    const [failure, setFailure] = useState(null);
    const [password, setPassword] = useState('');
    const [email, setEmail] = useState('');
    const [needs, setNeeds] = useState({ password: false, email: false });
    const [notice, setNotice] = useState('');

    /**
     * Ask the server what is behind the link.
     *
     * `credentials` is passed explicitly rather than read from state, because
     * this runs from the unlock form immediately after typing and reading state
     * there would use the value from the previous render.
     */
    const load = useCallback(async (credentials = {}) => {
        const result = await shareAPI.getInfo(linkId, accessToken, credentials);

        if (result.ok) {
            setInfo(result);
            setFailure(null);
            setState('ready');
            return true;
        }

        if (result.passwordRequired || result.emailRequired) {
            setNeeds({
                password: result.passwordRequired,
                email: result.emailRequired
            });
            // Only call it a failure once the recipient has actually tried
            // something. On the first load "a password is needed" is a prompt,
            // not an error, and colouring it red is a lie about what happened.
            setFailure(credentials.password || credentials.email ? result.error : null);
            setState('locked');
            return false;
        }

        setFailure(result.error);
        setState('gone');
        return false;
    }, [linkId, accessToken]);

    useEffect(() => {
        load();
    }, [load]);

    const handleUnlock = async (event) => {
        event.preventDefault();
        setFailure(null);
        await load({ password, email });
    };

    const handleDownload = async () => {
        setState('downloading');
        setNotice('');
        const result = await shareAPI.download(linkId, accessToken, { password, email });

        if (!result.ok) {
            setFailure(result.error);
            // A refusal at download time means the link changed under us — spent,
            // revoked, or expired between loading the page and pressing the
            // button. Re-reading is what tells the recipient which.
            setState(result.passwordRequired || result.emailRequired ? 'locked' : 'gone');
            return;
        }

        // Hand the bytes to the browser as a download.
        const url = window.URL.createObjectURL(result.blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = info?.file?.name || 'download';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        window.URL.revokeObjectURL(url);

        setState('ready');
        setNotice('Download started.');
        // Refresh the remaining count, which the download just changed. Failure
        // is fine and expected — spending the last download makes the link
        // invalid, and `load` will move the page to the right state on its own.
        load({ password, email });
    };

    if (state === 'loading') {
        return (
            <div className="shared-page">
                <div className="shared-card">
                    <div className="shared-spinner" aria-label="Loading" />
                    <p className="shared-muted">Opening link…</p>
                </div>
            </div>
        );
    }

    if (state === 'gone') {
        return (
            <div className="shared-page">
                <div className="shared-card">
                    <div className="shared-icon">🔗</div>
                    <h1 className="shared-title">This link is not available</h1>
                    {/* The server's generic refusal is deliberately the same
                      * sentence as the heading, so repeating it reads as a
                      * stutter. Show it only when it adds something. */}
                    {failure && failure !== 'This link is not available' && (
                        <p className="shared-muted">{failure}</p>
                    )}
                    <p className="shared-fineprint">
                        Share links expire, can be limited to a number of downloads,
                        and can be revoked by whoever created them. Ask the sender
                        for a new one.
                    </p>
                </div>
            </div>
        );
    }

    if (state === 'locked') {
        return (
            <div className="shared-page">
                <div className="shared-card">
                    <div className="shared-icon">🔒</div>
                    <h1 className="shared-title">
                        {needs.password && needs.email
                            ? 'This file needs a password and your email'
                            : needs.password
                                ? 'This file is password protected'
                                : 'This file is restricted'}
                    </h1>
                    <p className="shared-muted">
                        {needs.password && !needs.email
                            ? 'Enter the password the sender gave you.'
                            : 'The sender limited this link to specific people.'}
                    </p>

                    <form className="shared-form" onSubmit={handleUnlock}>
                        {needs.email && (
                            <label className="shared-field">
                                <span>Your email</span>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@example.com"
                                    autoComplete="email"
                                    required
                                />
                            </label>
                        )}
                        {needs.password && (
                            <label className="shared-field">
                                <span>Password</span>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    autoComplete="off"
                                    autoFocus={!needs.email}
                                    required
                                />
                            </label>
                        )}

                        {failure && <p className="shared-error">{failure}</p>}

                        <button type="submit" className="shared-button">
                            Unlock
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    const file = info?.file || {};
    const remaining = info?.downloadsRemaining;

    return (
        <div className="shared-page">
            <div className="shared-card">
                <div className="shared-icon">{iconFor(file.mimeType)}</div>
                <h1 className="shared-title" title={file.name}>{file.name}</h1>

                <div className="shared-meta">
                    <span>{formatSize(file.size)}</span>
                    {info?.sharedBy && <span>shared by {info.sharedBy}</span>}
                </div>

                {info?.description && (
                    <p className="shared-description">{info.description}</p>
                )}

                <button
                    className="shared-button"
                    onClick={handleDownload}
                    disabled={state === 'downloading'}
                >
                    {state === 'downloading' ? 'Preparing…' : 'Download'}
                </button>

                {notice && <p className="shared-notice">{notice}</p>}
                {failure && <p className="shared-error">{failure}</p>}

                <div className="shared-fineprint">
                    {typeof remaining === 'number' && (
                        <span>
                            {remaining} download{remaining === 1 ? '' : 's'} left
                        </span>
                    )}
                    {info?.expiresAt && (
                        <span> · expires in {expiresIn(info.expiresAt)}</span>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SharedFile;
