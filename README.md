# SecureShare

Upload a file, and it is encrypted before it touches disk. Hand somebody a link
to it — bounded by an expiry, a download count, optionally a password or a named
recipient — without making them sign up for anything.

**[Live demo](https://file-sharing-eight-wheat.vercel.app)** ·
[API](https://filesharing-bpmy.onrender.com/api/health) · both on free tiers that
sleep, so the first request after a quiet spell can be slow.

---

## The part worth reading

The headline feature of this project was AES-256-GCM encryption at rest. The
implementation looked right: a fresh IV per file, `getAuthTag` on the way out,
`setAuthTag` on the way back in, the algorithm string correct at the top of the
file.

```js
cipher = crypto.createCipherGCM(algorithm, key, iv);
//              ↑ this function does not exist
```

Every call threw. That alone would have been loud — an upload failing visibly.
What made it silent was the next fifteen lines: the upload controller caught the
error and stored the file **unencrypted**, assembling what the code itself called
a *"fake encryption result"* so the rest of the pipeline would accept it.

So every file this application ever stored went to disk in the clear, while the
dashboard told users their files were encrypted with AES-256.

Nothing caught it because nothing could. Uploads succeeded. Downloads returned
the right bytes. The audit log filled up. **Plaintext round-trips perfectly** —
a round trip through your own encryption is not a test of encryption, and no
check in the product could distinguish working crypto from none at all.

The fix is one word at four call sites: `createCipheriv`.

## What is verified, and how

Every claim below has a way to check it. That is deliberate — this project's
history is a lesson in the difference between a feature existing and a feature
working.

### Encryption

Checked against five properties, including the two that matter:

- ciphertext on disk does not contain the plaintext
- flipping a single byte of the ciphertext makes decryption **fail** rather than
  return garbage — that is what GCM's auth tag is for
- the wrong key is rejected
- a fresh IV per file, so identical files do not produce identical ciphertext
- round trip returns the original bytes

If encryption cannot be performed, the upload is **refused**. There is no
fallback to plaintext any more, silent or otherwise.

### Share links

Part of 79 tests, run against a real Redis rather than a stub — a stub would agree with
whatever the code believes about `INCR` and TTL, which is the assumption under
test.

```bash
cd server && npm test          # 79 tests; needs redis-server on PATH
```

Four rules in this layer had never run, and four of them did not hold:

| Bug | Effect |
|---|---|
| No ownership check | Any signed-in account could mint a public download URL for **any** file, by id |
| `allowedEmails.length > 0 && userEmail` | Omitting the email skipped the restriction entirely |
| Read-modify-write download counter | A link capped at N served more than N under concurrent opens |
| `getUserShareLinks` returned `[]` | "My links" looked identical to having never shared |

Each fix was confirmed to fail its test when reverted. The HTTP suite drops from
22 passing to 3 if the routes are removed, so it tests reachability and not just
logic.

### JWT

The signing secret used to have a fallback — `process.env.JWT_SECRET || 'a
hard-coded string'`, written three times. Any deployment missing that variable
signed its tokens with a key published in a public repository, which makes
forging an administrator token copy and paste.

There is no default now. A missing, placeholder, or under-length secret stops the
process at startup.

## API

### Files

| | |
|---|---|
| `POST /api/upload` | Encrypt and store. Refuses rather than falling back |
| `GET /api/files` | Your files |
| `GET /api/file/:fileId` | Download (auth optional — public files work) |
| `DELETE /api/file/:fileId` | Owner or admin |

### Share links

Owner side:

| | |
|---|---|
| `POST /api/share/:fileId` | Mint a link. `expiresInHours`, `maxDownloads`, `password`, `allowedEmails`, `description` |
| `GET /api/share/my-links` | Live links you created — never returns tokens or password digests |
| `GET /api/share/:linkId/stats` | Download count against the cap |
| `DELETE /api/share/:linkId` | Revoke immediately |

Recipient side — **no account required**:

| | |
|---|---|
| `GET /api/share/:linkId/:accessToken` | What is behind the link. Does not spend a download |
| `POST /api/share/:linkId/:accessToken/download` | The file |

A wrong access token and a link that does not exist return the **same** response,
because distinguishing them tells someone probing ids when they have found a real
one. The two cases a recipient can act on — a password or an email is needed —
are the deliberate exceptions.

Link passwords are salted per link, token comparison is constant-time, and the
download cap is claimed atomically before any bytes are served and released if
serving then fails.

### Bulk operations

Select several files and download them as one archive, or delete them together.

| | |
|---|---|
| `POST /api/bulk/download` | Prepare an archive. Returns a `downloadUrl` |
| `GET /api/bulk/download/:downloadId` | Fetch it. Refuses ids belonging to someone else |
| `POST /api/bulk/delete` | Delete several at once. `force` requires admin |
| `PATCH /api/bulk/metadata` | Update several at once |
| `GET /api/bulk/statistics` | Counts and totals for your files |

Which files end up in the archive is decided by the same query that decides what
you are allowed to see — files you uploaded, files marked public, or files you
are named on.

This was the second thing on this page written but not reachable: 248 lines of
controller the router never imported, with a working button in the client posting
to a 404. Connecting it surfaced three bugs that nothing could have caught while
it was unreachable:

- the controller called `createBulkDownload(userId, fileIds)` against a util
  declared `(fileIds, userId)`, so the access query had both arguments backwards
- `utils/bulkOperations.js` called `require('crypto')` twice inside a file the
  package declares as `"type": "module"` — a `ReferenceError` thrown *after* the
  archive had been built
- the response returned `zipPath`, an absolute path on the server, and no URL a
  browser could fetch

Thirteen tests cover it, each fix confirmed to fail its test when reverted.

## Running it

```bash
# server
cd server && npm install && npm start

# client
cd client && npm install && npm start
```

```bash
# server/.env
MONGO_URL=mongodb+srv://...
REDIS_URL=redis://localhost:6379
JWT_SECRET=              # required, ≥32 chars, no default
JWT_REFRESH_SECRET=      # required, different from the above
FRONTEND_URL=http://localhost:3000   # share links are built from this
```

Generate the secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Deploying the client has two settings that are easy to miss and silent when
wrong — see **[client/DEPLOYMENT.md](client/DEPLOYMENT.md)**. Short version:
`REACT_APP_API_URL` is substituted at *build* time, so leaving it unset bakes
`localhost` into the bundle and every visitor's browser calls its own machine.
The build succeeds. The deploy succeeds. The site is broken for everyone who is
not you.

## Stack

Node · Express · MongoDB (Mongoose) · Redis · JWT · multer · Winston · React 18

## What is here but not wired

Written down rather than described in the future tense, because this project's
whole problem was the gap between the two:

- **Two-factor authentication.** The user model has the fields and methods,
  `utils/twoFactor.js` has the implementation, and no route reaches any of it.
- **Password reset.** `controller/enhanced-auth-controller.js` is 400 lines that
  `routes/routes.js` never imports.

Bulk operations used to be on this list and has since been wired up — see below.

Each is complete-looking code with nothing calling it — the same shape share
links had before they were wired up, which is worth saying plainly rather than
listing them as features.

## What this is not

A free-tier side project that a handful of people have used, not a system under
load. There is no load test, no timing instrumentation and nothing measuring
uptime, so this README claims none of those. Redis caching, indexes and
connection pooling are real and worth doing; what they achieve under traffic this
has never seen is not something I can tell you.
