import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile, exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import { uploadBuffer } from '../oss.js';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

function extOf(fileName) {
  return fileName.split('.').pop()?.toLowerCase() || '';
}

async function docxToMarkdown(buffer, fileName, namespace) {
  const tmpId = crypto.randomUUID();
  const tmpDir = path.join(os.tmpdir(), `academic_docx_${tmpId}`);
  const inputPath = path.join(tmpDir, 'input.docx');
  const outputPath = path.join(tmpDir, 'output.md');
  const mediaDir = path.join(tmpDir, 'media');
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    fs.writeFileSync(inputPath, buffer);
    await execFileAsync('pandoc', [inputPath, '-f', 'docx', '-t', 'gfm', '--extract-media', tmpDir, '-o', outputPath]);
    let md = fs.readFileSync(outputPath, 'utf-8');
    if (fs.existsSync(mediaDir)) {
      for (const imgPath of walkFiles(mediaDir)) {
        const imgBuffer = fs.readFileSync(imgPath);
        const imgHash = crypto.createHash('md5').update(imgBuffer).digest('hex');
        const imgExt = path.extname(imgPath).toLowerCase() || '.png';
        const ossUrl = await uploadBuffer(imgBuffer, 'document-images', imgExt.slice(1), namespace, `document-images/${namespace}/${imgHash}${imgExt}`);
        const absPath = imgPath.replace(/\\/g, '/');
        const relPath = path.relative(tmpDir, imgPath).replace(/\\/g, '/');
        md = md.replaceAll(absPath, ossUrl).replaceAll(relPath, ossUrl).replaceAll(encodeURIComponent(absPath), ossUrl).replaceAll(encodeURIComponent(relPath), ossUrl);
      }
    }
    md = md.replace(/<img\s[\s\S]*?\/>/gi, (match) => {
      const src = /src=["']([^"']+)["']/i.exec(match)?.[1] || '';
      const alt = /alt=["']([^"']*)["']/i.exec(match)?.[1] || '';
      return src ? `![${alt}](${src})` : '';
    });
    return md.replace(/^[ \t]+(!\[[^\]]*\]\([^)]+\))/gm, '$1');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function pdfToMarkdown(buffer, fileName, namespace) {
  const jobId = `academic_mineru_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const tmpDir = path.join(os.tmpdir(), jobId);
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    const pdfPath = path.join(tmpDir, fileName || 'document.pdf');
    fs.writeFileSync(pdfPath, buffer);
    const mineruBin = process.env.MINERU_BIN;
    if (!mineruBin || !fs.existsSync(mineruBin)) throw new Error(`MINERU_BIN 未配置或不存在: ${mineruBin || '(empty)'}`);
    const outputDir = path.join(tmpDir, 'output');
    fs.mkdirSync(outputDir, { recursive: true });
    const cmd = `"${mineruBin}" -p "${pdfPath}" -o "${outputDir}" -m auto`;
    const { stderr } = await execAsync(cmd, {
      cwd: tmpDir,
      timeout: 1800000,
      maxBuffer: 20 * 1024 * 1024,
    });
    const mdFiles = findFiles(tmpDir, '.md');
    if (!mdFiles.length) throw new Error(`MinerU 未生成 Markdown: ${stderr}`);
    let md = fs.readFileSync(mdFiles[0], 'utf8');
    const mdDir = path.dirname(mdFiles[0]);
    const replacements = [];
    const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    while ((match = imgRegex.exec(md))) {
      const imgPath = match[2];
      if (/^https?:\/\//i.test(imgPath)) continue;
      const absoluteImgPath = path.join(mdDir, imgPath);
      if (!fs.existsSync(absoluteImgPath)) continue;
      const imgBuffer = fs.readFileSync(absoluteImgPath);
      const imgExt = path.extname(absoluteImgPath) || '.png';
      const ossUrl = await uploadBuffer(imgBuffer, 'document-images', imgExt.slice(1), namespace, `document-images/${namespace}/${jobId}_${path.basename(absoluteImgPath)}`);
      replacements.push({ old: imgPath, newUrl: ossUrl });
    }
    for (const r of replacements) md = md.split(r.old).join(r.newUrl);
    return md;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function walkFiles(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walkFiles(full)); else result.push(full);
  }
  return result;
}

function findFiles(dir, ext) {
  let result = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) result = result.concat(findFiles(full, ext));
    else if (full.endsWith(ext)) result.push(full);
  }
  return result;
}

export async function fileToMarkdown(buffer, fileName, namespace) {
  const ext = extOf(fileName);
  if (ext === 'pdf') return pdfToMarkdown(buffer, fileName, namespace);
  if (ext === 'docx' || ext === 'doc') return docxToMarkdown(buffer, fileName, namespace);
  if (['md', 'txt'].includes(ext)) return buffer.toString('utf-8');
  throw new Error(`暂不支持的文件格式: ${ext}`);
}

export const supportedExtensions = new Set(['pdf', 'docx', 'doc', 'md', 'txt']);
