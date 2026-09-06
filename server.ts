import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { setupDatabase } from './server/db.js';
import { setupRoutes } from './server/routes.js';
import { runManualImport, runNewsSubmit } from './server/cron.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(cors());
  app.use(express.json());

  // Initialize Database
  const db = setupDatabase();

  // CRITICAL: Define /run-news BEFORE any static/Vite middleware
  app.get("/run-news", async (req, res) => {
    try {
      console.log("Cron triggered");
      const result = await runManualImport(db);
      console.log("News import done");
      res.json({ success: true, message: "News import done", imported: result.imported });
    } catch (error) {
      console.error("Manual trigger failed:", error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Optional dedicated endpoint to trigger pending news submission to Google Sheets
  app.get("/run-submit", async (req, res) => {
    try {
      console.log("Submit cron triggered");
      const result = await runNewsSubmit(db);
      res.json({ success: true, message: "News submit done", ...result });
    } catch (error) {
      console.error("Submit trigger failed:", error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Setup other API Routes
  setupRoutes(app, db);

  // Background workers are now triggered via /run-news API
  // startCronJobs(db);

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
