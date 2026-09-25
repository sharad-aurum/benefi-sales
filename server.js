import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import authRoutes      from './routes/auth.js';
import userRoutes      from './routes/users.js';
import pipelineRoutes  from './routes/pipeline.js';
import dealRoutes      from './routes/deals.js';
import contactRoutes   from './routes/contacts.js';
import companyRoutes   from './routes/companies.js';
import activityRoutes  from './routes/activities.js';
import taskRoutes      from './routes/tasks.js';
import reportRoutes    from './routes/reports.js';
import partnerRoutes      from './routes/partners.js';
import performanceRoutes  from './routes/performance.js';
import pricingRoutes      from './routes/pricing.js';
import publicRoutes       from './routes/public.js';
import enquiryRoutes      from './routes/enquiries.js';
import { startScheduler } from './jobs/scheduler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = process.env.PORT || 4000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Public enquiry endpoint — open CORS for benefi.ph website form
const publicCors = cors({ origin: ['https://benefi.ph', 'https://www.benefi.ph', 'http://localhost:3000'], methods: ['POST'] });
app.options('/api/public/enquiry', publicCors);
app.use('/api/public', publicCors, publicRoutes);

app.use('/api/auth',       authRoutes);
app.use('/api/users',      userRoutes);
app.use('/api/pipeline',   pipelineRoutes);
app.use('/api/deals',      dealRoutes);
app.use('/api/contacts',   contactRoutes);
app.use('/api/companies',  companyRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/tasks',      taskRoutes);
app.use('/api/reports',    reportRoutes);
app.use('/api/partners',     partnerRoutes);
app.use('/api/performance',  performanceRoutes);
app.use('/api/pricing',      pricingRoutes);
app.use('/api/enquiries',    enquiryRoutes);

// SPA — all non-API routes serve the login or app page
app.get('/login', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`\n  BeneFi CRM  →  http://localhost:${PORT}`);
  console.log(`  Login         admin@benefi.ph  /  Admin@BeneFi2026!`);
  startScheduler();
  console.log();
});
