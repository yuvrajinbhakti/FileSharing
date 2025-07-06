# 🚀 SecureShare - Free Cloud Deployment Guide

## Step-by-Step Deployment to Get Working URLs

### 1. 🗄️ Database Setup (MongoDB Atlas - FREE)

1. Go to [MongoDB Atlas](https://www.mongodb.com/atlas) and create free account
2. Create a free cluster (M0 Sandbox - 512MB)
3. Create database user: `secureshare-user` with password
4. Add IP: `0.0.0.0/0` (allow from anywhere) in Network Access
5. Get connection string: `mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/secureshare`

### 2. ⚡ Redis Setup (Upstash - FREE)

1. Go to [Upstash](https://upstash.com/) and create free account
2. Create Redis database (free tier: 10K commands/day)
3. Get Redis URL: `redis://:password@region.upstash.io:port`

### 3. 🚀 Backend Deployment (Railway - FREE)

1. Go to [Railway](https://railway.app/) and create account
2. Connect your GitHub repository
3. Deploy from `server` folder
4. Add environment variables:
   ```
   NODE_ENV=production
   PORT=8000
   MONGO_URL=<your-mongodb-atlas-url>
   REDIS_URL=<your-upstash-redis-url>
   JWT_SECRET=<generate-secure-key>
   JWT_REFRESH_SECRET=<generate-secure-key>
   FRONTEND_URL=<your-vercel-url>
   ```
5. Deploy and get URL: `https://your-app.railway.app`

### 4. 🌐 Frontend Deployment (Vercel - FREE)

1. Go to [Vercel](https://vercel.com/) and create account
2. Connect GitHub repository
3. Set build settings:
   - Framework: Create React App
   - Root Directory: `client`
   - Build Command: `npm run build`
   - Output Directory: `build`
4. Add environment variable:
   ```
   REACT_APP_API_URL=https://your-app.railway.app/api
   ```
5. Deploy and get URL: `https://your-app.vercel.app`

### 5. 🔧 Final Configuration

Update Railway backend environment:
```
FRONTEND_URL=https://your-app.vercel.app
ALLOWED_ORIGINS=https://your-app.vercel.app
```

## 🎉 Final URLs

- **Frontend**: https://your-app.vercel.app
- **Backend API**: https://your-app.railway.app
- **Database**: MongoDB Atlas
- **Cache**: Upstash Redis

## 📱 Quick Deploy Commands

```bash
# 1. Push to GitHub
git add .
git commit -m "Deploy to cloud"
git push origin main

# 2. Deploy frontend to Vercel
npm install -g vercel
cd client
vercel --prod

# 3. Deploy backend to Railway
# Use Railway dashboard or CLI
```

## 🔑 Default Admin Access

- Username: `admin`
- Password: `SecureAdmin123!`

## 💰 Cost: $0/month (Free tiers)
- MongoDB Atlas: 512MB (Free forever)
- Upstash Redis: 10K commands/day (Free)
- Railway: 500 hours/month (Free)
- Vercel: Unlimited sites (Free) 