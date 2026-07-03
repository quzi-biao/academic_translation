import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import pkg from 'mint-filter';

const { Mint } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 初始化敏感词库实例
let mint = null;

/**
 * 延迟初始化或获取本地词库实例
 */
function getMintInstance() {
  if (!mint) {
    try {
      const dictPath = path.resolve(__dirname, '../assets/sensitive_words.txt');
      console.log(`[Local Security] Loading sensitive dictionary from ${dictPath}...`);
      
      const fileContent = fs.readFileSync(dictPath, 'utf-8');
      
      // 按行分割，过滤空行、多余空格以及单字符（极易导致误杀）
      const words = fileContent.split('\n')
        .map(word => word.trim())
        .filter(word => word.length > 1); // 必须大于 1 个字符，否则容易误杀“真”、“发”等字
        
      console.log(`[Local Security] Loaded ${words.length} sensitive words. Building AC Automaton...`);
      
      // 初始化 Mint (底层基于 Aho-Corasick)
      mint = new Mint(words);
      console.log(`[Local Security] Mint-filter initialization complete.`);
    } catch (err) {
      console.error(`[Local Security] Failed to load sensitive dictionary. Fallback to basic list. Error:`, err);
      // 兜底基础词库
      const words = [
        '特级毛片', '色情', '三级片', '迷药', '催情', '代开发票', '走私', 
        '枪支', '弹药', '炸药', '冰毒', '海洛因', '法轮功', '六四',
        '习近平', '共产党', '台独', '藏独', '疆独', '港独', '代考', '裸聊', '嫖娼'
      ];
      mint = new Mint(words);
    }
  }
  return mint;
}

/**
 * 本地极速校验敏感词
 * @param {string} text 待检测文本
 * @returns {Object} { isSafe: boolean, matchedWords?: string[] }
 */
export function checkLocalText(text) {
  if (!text || typeof text !== 'string') return { isSafe: true };
  
  const instance = getMintInstance();
  // verify() 方法：如果不包含敏感词返回 true，包含返回 false
  const passed = instance.verify(text);
  
  if (!passed) {
    const filterResult = instance.filter(text);
    console.warn(`[Local Security] Blocked risky text by local dict. Matched words:`, filterResult.words);
    return { isSafe: false, matchedWords: filterResult.words };
  }
  return { isSafe: true };
}
