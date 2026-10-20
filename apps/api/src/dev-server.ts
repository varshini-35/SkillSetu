// Running this entry point is an explicit local choice to use the JSON demo store.
import 'dotenv/config';
process.env.SKILLSETU_STORAGE = 'json';
void import('./server.js');
