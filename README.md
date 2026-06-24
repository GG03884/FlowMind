# Productivity Dashboard with Intelligent Agent & Real-Time Analytics

An elegant, high-productivity workspace combining a **task manager**, a **habit tracker**, an **intelligent assistant agent**, and **real-time urgency/momentum analytics**. This application uses a full-stack architecture powered by React, Express, Firebase (Firestore & Auth), and the Google Gemini API.

---

## 🚀 Key Features

*   **Intelligent AI Agent**: A server-side conversational agent built with `@google/genai` that helps you schedule tasks, mitigate bottlenecks, and answer productivity queries.
*   **Urgency Constellation Canvas**: A dynamic interactive HTML5 Canvas visualizer that charts task priority and urgency in a beautiful network-graph view.
*   **Habit Builder & Tracker**: Log and track daily habits to build streaks and maintain momentum.
*   **Real-time Momentum Analytics**: Comprehensive dashboard showing completion curves, analytics charts, and predictive productivity scoring.
*   **Durable Persistence**: Built-in support for Firestore database storage with both real-time synchronization and secure authorization.

---

## 🛠️ Tech Stack

*   **Frontend**: React (v18+), Vite, Tailwind CSS, HTML5 Canvas, Framer Motion.
*   **Backend**: Node.js & Express server (transpiled & bundled into a single `.cjs` file using `esbuild` for production optimization).
*   **AI Integration**: Google Gemini API via `@google/genai` with custom exponential backoff, rate-limit retry logic, and fallback models (`gemini-3.1-flash-lite`).
*   **Database & Auth**: Firebase Firestore (NoSQL) & Firebase Authentication.

---

## ⚙️ Prerequisites & Setup

### 1. Environment Variables

Create a `.env` file in the root directory (you can use `.env.example` as a template):

```env
# Google Gemini API Key (Secret)
GEMINI_API_KEY="your_gemini_api_key_here"

# Application Deployment URL
APP_URL="http://localhost:3000"
```

### 2. Firebase Project Setup

The application is pre-configured to use a Firebase project. To use your own Firebase database:
1. Create a Firebase project in the [Firebase Console](https://console.firebase.google.com/).
2. Enable **Cloud Firestore** and **Firebase Authentication** (Google sign-in provider).
3. Copy your Web Client config keys and replace the values in:
    *   `src/lib/firebase.ts`
    *   `server/routes/agent.js` (for server-side initialization)
4. Deploy the security rules defined in `firestore.rules` to secure your Firestore collections.

---

## 💻 Local Development

Follow these steps to run the application locally:

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Full-Stack Dev Server
This runs the Express server using `tsx`, which serves both backend API endpoints and hot-mounts the Vite middleware for client assets on port `3000`:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📦 Production Build & Deployment

The application features a production-ready containerized build pipeline:

### 1. Build the App
Compiles client-side static assets to `/dist` and bundles the Express server into a standalone, optimized CommonJS file (`dist/server.cjs`):
```bash
npm run build
```

### 2. Run the Production Build
Launches the compiled server directly via Node:
```bash
npm run start
```

---

## 🛡️ Git Configuration

A robust `.gitignore` is provided to ensure standard development folder structures are ignored:
*   `node_modules/`
*   `dist/`
*   Local logs (`*.log`)
*   Secret credential environment files (`.env`, `.env.local`)
