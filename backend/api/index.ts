import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from '../src/app.js';

const app = createApp();

// ESM default export of a plain (req, res) handler — the shape the
// Vercel Express builder accepts (it rejects raw Express app objects
// and CommonJS module.exports here).
export default (req: IncomingMessage, res: ServerResponse) => app(req, res);
