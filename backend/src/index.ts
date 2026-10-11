import { createApp } from './app.js';
import { env } from './env.js';

createApp().listen(env.PORT, () => console.log(`[sse] api on :${env.PORT}`));
