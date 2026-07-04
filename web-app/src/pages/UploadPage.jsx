import React, { useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Header, Shell } from '../components/Layout';
import { ConfirmModal, NoticeModal } from '../components/Modals';
import { stripFileExtension } from '../documentHelpers';

export default function UploadPage() {
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionMode, setActionMode] = useState('translate');
  const [confirmState, setConfirmState] = useState(null);
  const [noticeState, setNoticeState] = useState(null);
  const navigate = useNavigate();

  const submit = async (force = false, mode = 'translate') => {
    if (!file) return setError('请先选择文档');
    setBusy(true);
    setActionMode(mode);
    setError('');
    const form = new FormData();
    form.append('file', file);
    if (force) form.append('force', '1');
    if (mode === 'upload') form.append('autoStart', 'false');
    try {
      const data = await api('/documents/upload', { method: 'POST', body: form });
      if (mode === 'upload' || data.document?.autoStarted === false) {
        setNoticeState({
          title: mode === 'upload' ? '上传完成' : '文献已保存',
          message: data.document.message || '文献已上传，可稍后在列表中手动开始翻译。',
          onConfirm: () => {
            setNoticeState(null);
            navigate('/dashboard');
          },
        });
        return;
      }
      navigate(`/documents/${data.document.id}`);
    } catch (err) {
      if (err.duplicateDocument) {
        setConfirmState({
          title: '文献已存在',
          message: `文献《${stripFileExtension(err.duplicateDocument.originalName)}》已存在，是否再次上传？`,
          confirmText: '继续上传',
          onConfirm: async () => {
            setConfirmState(null);
            await submit(true, mode);
          },
        });
        return;
      }
      setError(err.message);
    } finally {
      setBusy(false);
      setActionMode('translate');
    }
  };

  return <Shell>
    <Header title="上传学术文献" metaMode="back" showMetaBalance={true} />
    <section className="upload-zone"><UploadCloud size={54} /><h2>PDF / DOCX / MD</h2><p>系统会先转 Markdown，再拆成 Block，生成文献总结和翻译提示词后逐块翻译。</p>
      <label className="upload-picker" htmlFor="academic-upload-input">
        <input id="academic-upload-input" className="upload-input" type="file" accept=".pdf,.doc,.docx,.md,.txt" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <span className="upload-picker-label">选择文件</span>
        <span className="upload-picker-hint">支持 PDF、DOC、DOCX、MD、TXT</span>
        <span className="upload-picker-name">{file ? file.name : '尚未选择文档'}</span>
      </label>
      {error && <p className="error">{error}</p>}
      {file && <div className="upload-actions">
        <button className="ghost" onClick={() => submit(false, 'upload')} disabled={busy}>{busy && actionMode === 'upload' ? '上传中...' : '上传文件'}</button>
        <button className="primary" onClick={() => submit(false, 'translate')} disabled={busy}>{busy && actionMode === 'translate' ? '处理中...' : '开始翻译'}</button>
      </div>}</section>
    <ConfirmModal
      open={Boolean(confirmState)}
      title={confirmState?.title}
      message={confirmState?.message}
      confirmText={confirmState?.confirmText}
      onConfirm={confirmState?.onConfirm}
      onCancel={() => setConfirmState(null)}
    />
    <NoticeModal
      open={Boolean(noticeState)}
      title={noticeState?.title}
      message={noticeState?.message}
      onConfirm={noticeState?.onConfirm}
    />
  </Shell>;
}
