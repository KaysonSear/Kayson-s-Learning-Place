import { fileURLToPath } from 'node:url';

export const courseSource = process.env.C_LAB_SOURCE ||
  fileURLToPath(new URL('../content/Coding · C.md', import.meta.url));
