import {defineConfig} from '../POC-004/node_modules/vite/dist/node/index.js';
import {fileURLToPath} from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('../../',import.meta.url)),server:{host:'127.0.0.1',port:4178,strictPort:true},cacheDir:'poc/GD91-72/node_modules/.cache/vite'});
