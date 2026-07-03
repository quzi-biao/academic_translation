import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import prisma from '../src/config/db.js';
import { uploadBuffer } from '../src/services/oss.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const apkPath = path.resolve(__dirname, '../../android/app/build/outputs/apk/debug/app-debug.apk');
  
  if (!fs.existsSync(apkPath)) {
    console.error('APK file not found at:', apkPath);
    process.exit(1);
  }

  const versionCode = 58;
  const versionName = '1.0.58';
  
  console.log(`Uploading APK version ${versionName} (${versionCode})...`);
  
  const buffer = fs.readFileSync(apkPath);
  
  try {
    const apkUrl = await uploadBuffer(buffer, 'apk', 'apk', 'admin');
    console.log('Uploaded to OSS:', apkUrl);

    // Unset current
    await prisma.appVersion.updateMany({ data: { isCurrent: false } });

    // Insert to DB
    const version = await prisma.appVersion.create({
      data: {
        versionCode,
        versionName,
        apkUrl,
        changelog: '分类列表独立页面与重启按钮功能（修复签名安装包问题）',
        forceUpgrade: false,
        isCurrent: true,
      },
    });
    
    console.log('AppVersion created & set as current:', version);
  } catch (err) {
    console.error('Failed to create version:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
