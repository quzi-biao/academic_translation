import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import pkg from 'mint-filter';

const { Mint } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dictPath = path.resolve(__dirname, '../src/assets/sensitive_words.txt');
const fileContent = fs.readFileSync(dictPath, 'utf-8');
const words = fileContent.split('\n').map(word => word.trim()).filter(word => word.length > 0);
const mint = new Mint(words);
console.log(mint.filter('今天天气真好'));
