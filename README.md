# YAPAT Frontend

React + TypeScript + Vite frontend for the YAPAT (Yet Another PAM Annotation Tool) project.

## Prerequisites

- Node.js 18+
- A running [YAPAT backend](../yapat-backend/README.md) (default: `http://localhost:8000`)

## Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env — at minimum set VITE_YAPAT_BACKEND_URL
   ```

3. **Start the dev server**
   ```bash
   npm run dev
   ```
   The app will be available at http://localhost:3000

## Environment Variables

Copy `.env.example` to `.env` and adjust as needed.

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_YAPAT_BACKEND_URL` | Yes | — | URL of the YAPAT backend API (e.g. `http://localhost:8000`) |
| `VITE_YAPAT_FRONTEND_URL` | No | — | Public URL of this frontend (used for CORS/links) |

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build for production (output to `dist/`) |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint |
