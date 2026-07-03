import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import { uploadBuffer } from '../oss.js';

const execFileAsync = promisify(execFile);

function extOf(fileName) {
  return fileName.split('.').pop()?.toLowerCase() || '';
}

function abortError() {
  const err = new Error('任务已停止');
  err.code = 'ABORT_ERR';
  return err;
}

function ensureNotAborted(signal) {
  if (signal?.aborted) throw abortError();
}

async function runCommand(command, args, options = {}) {
  const { cwd, timeout = 0, maxBuffer = 20 * 1024 * 1024, signal, onSpawn } = options;
  ensureNotAborted(signal);
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    onSpawn?.(child);

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', handleAbort);
    };

    const finish = (err, result) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (err) reject(err);
      else resolve(result);
    };

    const handleAbort = () => {
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
      }, 1200).unref?.();
      finish(abortError());
    };

    if (timeout > 0) {
      timer = setTimeout(() => {
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL');
        }, 1200).unref?.();
        finish(new Error(`命令执行超时: ${command}`));
      }, timeout);
    }

    if (signal) signal.addEventListener('abort', handleAbort, { once: true });

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > maxBuffer) stdout = stdout.slice(-maxBuffer);
    });

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > maxBuffer) stderr = stderr.slice(-maxBuffer);
    });

    child.on('error', (err) => finish(err));
    child.on('close', (code, closeSignal) => {
      if (signal?.aborted) return finish(abortError());
      if (code === 0) return finish(null, { stdout, stderr });
      finish(new Error(`命令执行失败 (${command}) code=${code ?? 'null'} signal=${closeSignal ?? 'null'} stderr=${stderr.trim()}`));
    });
  });
}

async function docxToMarkdown(buffer, fileName, namespace, options = {}) {
  const tmpId = crypto.randomUUID();
  const tmpDir = path.join(os.tmpdir(), `academic_docx_${tmpId}`);
  const inputPath = path.join(tmpDir, 'input.docx');
  const outputPath = path.join(tmpDir, 'output.md');
  const mediaDir = path.join(tmpDir, 'media');
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    ensureNotAborted(options.signal);
    fs.writeFileSync(inputPath, buffer);
    await runCommand('pandoc', [inputPath, '-f', 'docx', '-t', 'gfm', '--extract-media', tmpDir, '-o', outputPath], {
      cwd: tmpDir,
      signal: options.signal,
      onSpawn: options.onSpawn,
    });
    ensureNotAborted(options.signal);
    let md = fs.readFileSync(outputPath, 'utf-8');
    if (fs.existsSync(mediaDir)) {
      for (const imgPath of walkFiles(mediaDir)) {
        ensureNotAborted(options.signal);
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

async function pdfToMarkdown(buffer, fileName, namespace, options = {}) {
  const jobId = `academic_mineru_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const tmpDir = path.join(os.tmpdir(), jobId);
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    ensureNotAborted(options.signal);
    const pdfPath = path.join(tmpDir, fileName || 'document.pdf');
    fs.writeFileSync(pdfPath, buffer);
    const mineruBin = process.env.MINERU_BIN;
    if (!mineruBin || !fs.existsSync(mineruBin)) throw new Error(`MINERU_BIN 未配置或不存在: ${mineruBin || '(empty)'}`);
    const outputDir = path.join(tmpDir, 'output');
    fs.mkdirSync(outputDir, { recursive: true });
    const { stderr } = await runCommand(mineruBin, ['-p', pdfPath, '-o', outputDir, '-m', 'auto'], {
      cwd: tmpDir,
      signal: options.signal,
      onSpawn: options.onSpawn,
      timeout: 1800000,
      maxBuffer: 20 * 1024 * 1024,
    });
    ensureNotAborted(options.signal);
    const mdFiles = findFiles(tmpDir, '.md');
    if (!mdFiles.length) throw new Error(`MinerU 未生成 Markdown: ${stderr}`);
    let md = fs.readFileSync(mdFiles[0], 'utf8');
    const mdDir = path.dirname(mdFiles[0]);
    const replacements = [];
    const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    while ((match = imgRegex.exec(md))) {
      ensureNotAborted(options.signal);
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

export async function fileToMarkdown(buffer, fileName, namespace, options = {}) {
  const ext = extOf(fileName);
  if (ext === 'pdf') return pdfToMarkdown(buffer, fileName, namespace, options);
  if (ext === 'docx' || ext === 'doc') return docxToMarkdown(buffer, fileName, namespace, options);
  if (['md', 'txt'].includes(ext)) return buffer.toString('utf-8');
  throw new Error(`暂不支持的文件格式: ${ext}`);
}

export const supportedExtensions = new Set(['pdf', 'docx', 'doc', 'md', 'txt']);
