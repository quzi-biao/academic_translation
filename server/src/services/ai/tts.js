/**
 * Minimax TTS 语音合成服务（WebSocket 同步模式）
 * wss://api.minimaxi.com/ws/v1/t2a_v2
 *
 * 流程：
 *  1. 建立 WebSocket 连接 → 收到 connected_success
 *  2. 发送 task_start（模型、音色、格式）
 *  3. task_started → 逐段顺序发送 task_continue → 等 is_final → 发下一段 → task_finish
 *  4. 收到 task_finished → resolve 完整 Buffer
 *
 * 回调说明：
 *  onChunk(buf)                                          每收到一个原始音频包（立即推流）
 *  onSegmentDone(idx, textChunk, segBuf, durationSec)   每段完成时（is_final=true）
 */

import WebSocket from 'ws';

const MINIMAX_KEY = process.env.MINIMAX_API_KEY;
const WS_ENDPOINT = 'wss://api.minimaxi.com/ws/v1/t2a_v2';

/** 剥离 Markdown 标记，保留纯文本供 TTS 朗读 */
function stripMarkdown(text) {
  return text
    .replace(/#{1,6}\s+/g, '')          // 标题 #
    .replace(/\*\*(.+?)\*\*/g, '$1')   // 粗体 **text**
    .replace(/\*(.+?)\*/g, '$1')       // 斜体 *text*
    .replace(/^-{3,}\s*$/gm, '。')     // 分隔线 ---
    .replace(/^>\s+/gm, '')            // 引用 >
    .replace(/^[-*]\s+/gm, '')         // 列表 - / *
    .replace(/\n{3,}/g, '\n\n')        // 多余空行
    .trim();
}

/**
 * 将长文本按自然句子边界拆成约 chunkSize 字的片段
 * 优先在 。！？…\n 处切分，避免截断词语
 * @param {string} text      纯文本
 * @param {number} chunkSize 目标每段字数（默认 100）
 * @returns {string[]}
 */
function chunkText(text, chunkSize = 100) {
  const result = [];
  let buf = '';

  for (const char of text) {
    buf += char;
    const isBoundary = /[。！？…\n]/.test(char);
    if (isBoundary && buf.length >= chunkSize) {
      result.push(buf.trim());
      buf = '';
    } else if (buf.length >= chunkSize * 2) {
      // 超过 2× 上限时强制切分（防止句子过长一直不切）
      result.push(buf.trim());
      buf = '';
    }
  }
  if (buf.trim()) result.push(buf.trim());
  return result.filter(Boolean);
}

/**
 * 将文本合成为 MP3 音频
 *
 * @param {string}   text              解读文本（Markdown 格式，内部自动剥离）
 * @param {object}   [options]
 * @param {string}   [options.voiceId]        音色 ID（默认使用原硬编码音色）
 * @param {Function} [options.onChunk]        (buf: Buffer) => void  每个原始音频包
 * @param {Function} [options.onSegmentDone]  (idx, textChunk, segBuf, durationSec) => void  每段完成
 *
 * @returns {Promise<{ totalBuffer: Buffer, textChunks: string[] }>}
 */
export async function synthesizeSpeech(text, {
  voiceId = 'Chinese (Mandarin)_Lyrical_Voice',
  onChunk = null,
  onSegmentDone = null,
} = {}) {
  if (!MINIMAX_KEY) throw new Error('MINIMAX_API_KEY 未配置');

  const clean       = stripMarkdown(text);
  const textChunks  = chunkText(clean, 100);
  if (textChunks.length === 0) throw new Error('文本内容为空');

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_ENDPOINT, {
      headers: { Authorization: `Bearer ${MINIMAX_KEY}` },
    });

    const allBufs  = [];   // 全量音频 Buffer（task_finished 后 concat）
    let   segBufs  = [];   // 当前段的音频 Buffer
    let   settled  = false;
    let   chunkIdx = 0;    // 下一次要发送的段编号

    const done = (val) => { if (!settled) { settled = true; resolve(val); } };
    const fail = (err) => { if (!settled) { settled = true; reject(err);  } };

    // 超时保护（300s）
    const timer = setTimeout(() => {
      ws.terminate();
      fail(new Error('TTS 超时（300s）'));
    }, 300_000);

    ws.on('open', () => { /* 等待 connected_success */ });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      switch (msg.event) {
        case 'connected_success':
          ws.send(JSON.stringify({
            event: 'task_start',
            model: 'speech-2.8-turbo',
            language_boost: 'Chinese',
            voice_setting: {
              voice_id: voiceId,   // 使用传入的音色 ID
              speed: 1.0,
              vol:   1.0,
              pitch: 0,
            },
            audio_setting: {
              sample_rate: 32000,
              bitrate:     128000,
              format:      'mp3',
              channel:     1,
            },
          }));
          break;

        case 'task_started':
          console.log(`[TTS] 开始合成，共 ${textChunks.length} 段`);
          ws.send(JSON.stringify({ event: 'task_continue', text: textChunks[chunkIdx++] }));
          break;

        case 'task_continued': {
          if (msg.data?.audio) {
            const buf = Buffer.from(msg.data.audio, 'hex');
            allBufs.push(buf);
            segBufs.push(buf);
            if (onChunk) onChunk(buf);   // 立即推流给前端
          }

          if (msg.is_final) {
            // 本段完成：整理 segment buffer + 时长
            const completedIdx    = chunkIdx - 1;
            const completedText   = textChunks[completedIdx];
            const segBuf          = Buffer.concat(segBufs);
            const durationSeconds = (msg.extra_info?.audio_length || 0) / 1000;
            segBufs = [];

            console.log(`[TTS] 第 ${completedIdx + 1}/${textChunks.length} 段完成，` +
                        `${durationSeconds.toFixed(1)}s，累计 ${allBufs.reduce((s, b) => s + b.length, 0)} bytes`);

            if (onSegmentDone) {
              // 异步调用，不阻塞发送下一段
              onSegmentDone(completedIdx, completedText, segBuf, durationSeconds);
            }

            if (chunkIdx < textChunks.length) {
              ws.send(JSON.stringify({ event: 'task_continue', text: textChunks[chunkIdx++] }));
            } else {
              ws.send(JSON.stringify({ event: 'task_finish' }));
            }
          }
          break;
        }

        case 'task_finished':
          clearTimeout(timer);
          ws.close();
          done({ totalBuffer: Buffer.concat(allBufs), textChunks });
          break;

        case 'task_failed':
          clearTimeout(timer);
          ws.close();
          fail(new Error(msg.base_resp?.status_msg || 'Minimax TTS 失败'));
          break;

        default:
          break;
      }
    });

    ws.on('error', (err) => { clearTimeout(timer); fail(err); });

    ws.on('close', () => {
      clearTimeout(timer);
      if (!settled && allBufs.length > 0) {
        done({ totalBuffer: Buffer.concat(allBufs), textChunks });
      } else if (!settled) {
        fail(new Error('WebSocket 意外关闭'));
      }
    });
  });
}
