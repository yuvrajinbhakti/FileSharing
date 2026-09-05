# Deploying the client

Vercel project settings that this app depends on, and the reasons for them.
`vercel.json` cannot carry comments — its schema rejects any property it does not
recognise, including a `"//"` key — so the explanations live here.

## Required settings

| Setting | Value | Why |
|---|---|---|
| Root Directory | `client` | The repo has no root `package.json`; the app is in this subdirectory. |
| `REACT_APP_API_URL` | `https://filesharing-bpmy.onrender.com/api` | See below. This one is not optional. |

## REACT_APP_API_URL is not optional

Create React App substitutes `process.env.REACT_APP_*` at **build** time. An unset
variable is not a runtime fallback — it is baked into the bundle permanently. The
default in `src/service/api.js` is `http://localhost:8000/api`, which for every
visitor means *their own machine*.

Nothing fails when this happens. The build succeeds, the deploy succeeds, the page
renders, and every API call goes nowhere. `api.js` logs a loud console error when it
detects this state, but the only real fix is setting the variable before the build.

## What is in vercel.json, and what deliberately is not

**The rewrite** sends anything that is not a real file to `index.html`, so the client
router can handle it. Without it, opening a share link directly —
`/share/<linkId>/<accessToken>` — returns Vercel's own 404, because that path exists
only in React Router and not on disk.

Rewrites are applied *after* the filesystem check, so real assets still win:
`favicon.ico`, `manifest.json` and everything under `/static` are served as
themselves rather than swallowed by the catch-all.

**There is no `headers` block.** An earlier version set immutable `cache-control` on
`/static/(.*)` and every asset under that prefix started returning 404 while the rest
of the site was fine — the rule matched the path and the request stopped there
instead of falling through to the file. The page loaded with no JavaScript at all.
CRA already emits content-hashed filenames and Vercel already caches hashed assets,
so the rule bought nothing and cost the entire bundle.

**There is no `builds` block.** The original file used the legacy
`version: 2` + `builds` + `routes` format, and carried

```json
"env": { "REACT_APP_API_URL": "@react_app_api_url" }
```

The `@name` syntax references a Vercel Secret, a feature Vercel has removed. Once the
secret stopped existing, every deployment failed at config validation — *before* a
build container starts. A deployment rejected at validation never becomes a
deployment, so Vercel's Deployments list showed nothing at all while GitHub recorded
a failure on every commit. The live site served a build from fourteen months and
twenty-one commits earlier, and every symptom pointed at the Git integration being
disconnected.

## Verifying a deploy actually worked

A `200` on the homepage proves very little — it was `200` throughout the fourteen
months above, and again while `/static` was 404ing. Check the thing the page depends
on:

```bash
V=https://file-sharing-eight-wheat.vercel.app
B=$(curl -s "$V/" | grep -o 'static/js/main\.[a-z0-9]*\.js' | head -1)
curl -s -o /dev/null -w "%{http_code} %{size_download}\n" "$V/$B"
```

That fetches the bundle `index.html` actually points at. Then confirm the API URL
baked into it is not localhost:

```bash
curl -s "$V/$B" | grep -o 'http://localhost:8000/api' | head -1
```

Anything returned there means the deploy is broken for every visitor.
