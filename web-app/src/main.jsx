import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpenText,
  Coins,
  Ellipsis,
  Eye,
  LogOut,
  Pencil,
  RotateCcw,
  RotateCw,
  Save,
  RefreshCcw,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { api, clearSession, getToken, setSession } from './api';
import { KATEX_MACROS, normalizeMathExpression } from './math';
import 'katex/dist/katex.min.css';
import './styles.css';

function escapeMarkdownMathText(text = '') {
  return String(text).replace(/([\\`*_[\]<>])/g, '\\$1');
}

function equationToMarkdown(expression = '') {
  const value = normalizeMathExpression(expression);
  if (!value) return '';
  if (/^\$\$[\s\S]*\$\$$/.test(value) || /^\$[^$][\s\S]*\$/.test(value)) return value;
  return `$$\n${value}\n$$`;
}

function richTextToMarkdown(richText = []) {
  return richText.map((item) => {
    if (!item) return '';
    if (item.type === 'text') return escapeMarkdownMathText(item.text || '');
    if (item.type === 'inline_equation') return `$${normalizeMathExpression(item.expression)}$`;
    if (item.type === 'inline_code') return `\`${String(item.code || '')}\``;
    if (item.type === 'link') return `[${escapeMarkdownMathText(item.text || item.href || '')}](${item.href || '#'})`;
    return '';
  }).join('');
}

function RequireAuth({ children }) {
  return getToken() ? children : <Navigate to="/login" replace />;
}

function Shell({ children, contentClassName = '' }) {
  return <div className="app-shell">
    <main className={`main-panel ${contentClassName}`.trim()}>{children}</main>
  </div>;
}

function LoginPage({ mode = 'login' }) {
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const data = await api(`/auth/${mode === 'register' ? 'register' : 'login'}`, { method: 'POST', body: { account, password, username } });
      setSession(data.token, data.customer);
      navigate('/dashboard');
    } catch (err) { setError(err.message); }
  };
  return <div className="auth-page">
    <div className="auth-card">
      <div className="auth-copy"><BookOpenText size={34} /><h1>闻一翻译</h1><p>把 PDF/DOCX 学术文献拆成可对应的知识块，先理解论文，再逐块翻译。</p></div>
      <form onSubmit={submit}>
        <h2>{mode === 'register' ? '创建账号' : '登录账号'}</h2>
        {mode === 'register' && <input placeholder="昵称，可选" value={username} onChange={(e) => setUsername(e.target.value)} />}
        <input placeholder="手机号或邮箱" value={account} onChange={(e) => setAccount(e.target.value)} />
        <input placeholder="密码" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="error">{error}</p>}
        <button className="primary" type="submit">{mode === 'register' ? '注册并进入' : '登录'}</button>
        <Link className="switch" to={mode === 'register' ? '/login' : '/register'}>{mode === 'register' ? '已有账号，去登录' : '没有账号，去注册'}</Link>
      </form>
    </div>
  </div>;
}

function stripFileExtension(name = '') {
  return String(name || '').replace(/\.[^.]+$/, '');
}

function cloneBlockSnapshot(block) {
  if (!block) return null;
  return JSON.parse(JSON.stringify(block));
}

function getEditableSourceText(block) {
  if (!block) return '';
  if (block.type === 'equation') return block.sourceContent?.expression || block.sourceText || '';
  if (block.type === 'image') return block.sourceContent?.caption || block.sourceText || '';
  return block.sourceText || blockFallback(block);
}

function getEditableTranslatedText(block) {
  if (!block) return '';
  if (block.type === 'image') return block.translatedText || '';
  if (block.type === 'equation') return block.translatedText || block.sourceContent?.expression || block.sourceText || '';
  return block.translatedText || '';
}

function replaceBlockInDocument(document, updatedBlock) {
  if (!document) return document;
  return {
    ...document,
    blocks: (document.blocks || []).map((block) => (block.id === updatedBlock.id ? updatedBlock : block)),
  };
}

function removeBlockFromDocument(document, blockId) {
  if (!document) return document;
  return {
    ...document,
    blocks: (document.blocks || []).filter((block) => block.id !== blockId),
  };
}

function restoreBlockIntoDocument(document, block) {
  if (!document) return document;
  const blocks = [...(document.blocks || []).filter((item) => item.id !== block.id), block]
    .sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
  return {
    ...document,
    blocks,
  };
}

function isActiveTranslationStatus(status) {
  return ['queued', 'parsing', 'summarizing', 'translating'].includes(status);
}

function statusNeedsDots(status) {
  return ['queued', 'parsing', 'summarizing', 'translating'].includes(status);
}

function TypingDots() {
  const frames = ['', '.', '..', '...'];
  const [frameIndex, setFrameIndex] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % frames.length);
    }, 400);
    return () => window.clearInterval(timer);
  }, []);
  return <span className="typing-dots" aria-hidden="true">{frames[frameIndex]}</span>;
}

function documentStatusHint(doc) {
  if (doc.summary || doc.errorMsg) return doc.summary || doc.errorMsg;
  if (doc.status === 'uploaded') return '文献已上传，等待开始翻译。';
  if (doc.status === 'stopped') return '翻译任务已停止，可稍后继续。';
  if (doc.status === 'parsing' && (doc.progress || 0) <= 5) return 'PDF 正在解析中，系统正在调用文档解析引擎处理原文，此步骤消耗时间较长（3-15分钟），请稍候。';
  if (doc.status === 'parsing') return '文档结构正在提取中，翻译任务仍在继续。';
  if (doc.status === 'summarizing') return '系统正在总结文献并生成翻译提示词。';
  if (doc.status === 'translating') return '系统正在逐段翻译文献内容。';
  if (doc.status === 'queued') return '任务已进入队列，等待开始处理。';
  return '等待系统解析、总结并翻译。';
}

function formatCharCount(value) {
  const count = Number(value || 0);
  if (!count) return '待解析';
  return `${count.toLocaleString('zh-CN')} 字`;
}

function ConfirmModal({ open, title, message, confirmText = '确认', cancelText = '取消', tone = 'default', onConfirm, onCancel }) {
  if (!open) return null;
  return <div className="payment-modal-overlay" onClick={onCancel}>
    <div className={`payment-modal confirm-modal confirm-modal-${tone}`} onClick={(e) => e.stopPropagation()}>
      <h3>{title}</h3>
      <p>{message}</p>
      <div className="confirm-modal-actions">
        <button className="ghost" onClick={onCancel}>{cancelText}</button>
        <button className={tone === 'danger' ? 'primary danger-primary' : 'primary'} onClick={onConfirm}>{confirmText}</button>
      </div>
    </div>
  </div>;
}

function NoticeModal({ open, title, message, tone = 'info', confirmText = '知道了', onConfirm }) {
  if (!open) return null;
  return <div className="payment-modal-overlay" onClick={onConfirm}>
    <div className={`payment-modal confirm-modal confirm-modal-${tone}`} onClick={(e) => e.stopPropagation()}>
      <h3>{title}</h3>
      <p>{message}</p>
      <div className="confirm-modal-actions">
        <button className="primary" onClick={onConfirm}>{confirmText}</button>
      </div>
    </div>
  </div>;
}

function RenameModal({ open, currentName = '', value, onChange, onConfirm, onCancel, busy = false }) {
  if (!open) return null;
  return <div className="payment-modal-overlay" onClick={onCancel}>
    <div className="payment-modal confirm-modal" onClick={(e) => e.stopPropagation()}>
      <h3>重命名文献</h3>
      <p className="rename-current-label">当前文件名</p>
      <p className="rename-current-name">{currentName || '未命名文献'}</p>
      <input
        className="rename-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="请输入新的文献名称"
        maxLength={120}
        autoFocus
      />
      <div className="confirm-modal-actions">
        <button className="ghost" onClick={onCancel} disabled={busy}>取消</button>
        <button className="primary" onClick={onConfirm} disabled={busy || !String(value || '').trim()}>{busy ? '保存中...' : '保存'}</button>
      </div>
    </div>
  </div>;
}

function BlockDeleteModal({ open, block, onConfirm, onCancel, busy = false }) {
  if (!open || !block) return null;
  return <div className="payment-modal-overlay" onClick={onCancel}>
    <div className="payment-modal confirm-modal confirm-modal-danger" onClick={(e) => e.stopPropagation()}>
      <h3>删除 Block</h3>
      <p>删除后会同时移除这一段的原文和译文，且会影响当前文献的展示顺序。此操作不可撤销到服务器自动历史，仅可在当前编辑会话内恢复。</p>
      <div className="confirm-modal-actions">
        <button className="ghost" onClick={onCancel} disabled={busy}>取消</button>
        <button className="primary danger-primary" onClick={onConfirm} disabled={busy}>{busy ? '删除中...' : '确认删除'}</button>
      </div>
    </div>
  </div>;
}

function Dashboard() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [renameState, setRenameState] = useState({ open: false, id: '', currentName: '', value: '', busy: false });
  const menuRef = useRef(null);
  const load = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    const data = await api('/documents');
    setDocs(data.documents || []);
    if (!silent) setLoading(false);
  };
  useEffect(() => { load(); const t = setInterval(() => load({ silent: true }), 5000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setOpenMenuId(null);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpenMenuId(null);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
  const removeDoc = async (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmState({
      title: '删除翻译任务',
      message: '删除后不可找回，确定删除这个翻译任务吗？',
      tone: 'danger',
      onConfirm: async () => {
        setConfirmState(null);
        await api(`/documents/${id}`, { method: 'DELETE' });
        await load();
      },
    });
  };
  const retryDoc = async (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    await api(`/documents/${id}/retry`, { method: 'POST' });
    await load();
  };
  const startDoc = async (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    await api(`/documents/${id}/start`, { method: 'POST' });
    await load();
  };
  const confirmStartDoc = (e, doc) => {
    e.preventDefault();
    e.stopPropagation();
    if (doc.status === 'completed') {
      setConfirmState({
        title: '再次翻译文献',
        message: '再次翻译会覆盖当前译文结果，并再次消耗翻译点数，确定继续吗？',
        confirmText: '确认翻译',
        onConfirm: async () => {
          setConfirmState(null);
          await api(`/documents/${doc.id}/start`, { method: 'POST' });
          await load();
        },
      });
      return;
    }
    startDoc(e, doc.id);
  };
  const stopDoc = async (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmState({
      title: '停止翻译任务',
      message: '系统会立即中断当前解析、总结或翻译过程，未完成部分不会继续执行。确定继续吗？',
      tone: 'danger',
      confirmText: '立即停止',
      onConfirm: async () => {
        setConfirmState(null);
        await api(`/documents/${id}/stop`, { method: 'POST' });
        await load();
      },
    });
  };
  const openRename = (e, doc) => {
    e.preventDefault();
    e.stopPropagation();
    setRenameState({
      open: true,
      id: doc.id,
      currentName: stripFileExtension(doc.originalName),
      value: stripFileExtension(doc.originalName),
      busy: false,
    });
  };
  const submitRename = async () => {
    const nextName = String(renameState.value || '').trim();
    if (!nextName || !renameState.id) return;
    setRenameState((current) => ({ ...current, busy: true }));
    try {
      await api(`/documents/${renameState.id}`, { method: 'PATCH', body: { originalName: nextName } });
      setRenameState({ open: false, id: '', currentName: '', value: '', busy: false });
      await load();
    } catch (err) {
      setRenameState((current) => ({ ...current, busy: false }));
      setConfirmState({
        title: '重命名失败',
        message: err.message || '文献名称更新失败，请稍后重试。',
        confirmText: '知道了',
        onConfirm: () => setConfirmState(null),
      });
    }
  };
  const renderDocumentCardBody = (d) => <>
    <div className="doc-card-main">
      <h3>{stripFileExtension(d.originalName)}</h3>
      <p className="doc-summary">{documentStatusHint(d)}{statusNeedsDots(d.status) && <TypingDots />}</p>
    </div>
    <div className="doc-card-footer">
      <div className="progress"><span style={{ width: `${d.progress || 0}%` }} /></div>
      <div className="doc-meta-line"><small>{formatCharCount(d.charCount)}</small><small>{d.pointCost} 点</small><small className={`status-inline ${d.status}`}>{statusText(d.status)}{statusNeedsDots(d.status) && <TypingDots />}{d.status !== 'completed' && typeof d.progress === 'number' ? ` ${d.progress}%` : ''}</small></div>
    </div>
    <div className="card-menu" ref={openMenuId === d.id ? menuRef : null} onClick={(e) => e.stopPropagation()}>
      <button className="card-menu-trigger ghost icon-only" aria-label="操作菜单" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpenMenuId((current) => current === d.id ? null : d.id); }}><Ellipsis size={16} /></button>
      {openMenuId === d.id && <div className="card-menu-popover">
        <button type="button" className="menu-item" onClick={(e) => { setOpenMenuId(null); openRename(e, d); }}><Pencil size={15} />重命名</button>
        <button type="button" className="menu-item" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpenMenuId(null); navigate(`/documents/${d.id}/edit`); }}><Pencil size={15} />编辑</button>
        {!isActiveTranslationStatus(d.status) && <button type="button" className="menu-item" onClick={async (e) => { setOpenMenuId(null); confirmStartDoc(e, d); }}><RefreshCcw size={15} />翻译</button>}
        {isActiveTranslationStatus(d.status) && <button type="button" className="menu-item" onClick={async (e) => { setOpenMenuId(null); await stopDoc(e, d.id); }}><RefreshCcw size={15} />停止</button>}
        {d.status === 'failed' && <button type="button" className="menu-item" onClick={async (e) => { setOpenMenuId(null); await retryDoc(e, d.id); }}><RefreshCcw size={15} />重试</button>}
        <button type="button" className="menu-item danger" onClick={async (e) => { setOpenMenuId(null); await removeDoc(e, d.id); }}><Trash2 size={15} />删除</button>
      </div>}
    </div>
  </>;
  return <Shell contentClassName="dashboard-page">
    <Header title="文献列表" action={<Link className="primary-link" to="/upload">开始翻译</Link>} metaMode="logout" showMetaBalance={true} />
    <div className="doc-grid">{loading && <p>加载中...</p>}{docs.map((d) => d.status === 'completed'
      ? <Link className="doc-card" to={`/documents/${d.id}`} key={d.id}>{renderDocumentCardBody(d)}</Link>
      : <div className="doc-card doc-card-disabled" key={d.id} aria-disabled="true">{renderDocumentCardBody(d)}</div>)}</div>
    <ConfirmModal
      open={Boolean(confirmState)}
      title={confirmState?.title}
      message={confirmState?.message}
      tone={confirmState?.tone}
      confirmText={confirmState?.confirmText}
      onConfirm={confirmState?.onConfirm}
      onCancel={() => setConfirmState(null)}
    />
    <RenameModal
      open={renameState.open}
      currentName={renameState.currentName}
      value={renameState.value}
      onChange={(value) => setRenameState((current) => ({ ...current, value }))}
      onConfirm={submitRename}
      onCancel={() => !renameState.busy && setRenameState({ open: false, id: '', currentName: '', value: '', busy: false })}
      busy={renameState.busy}
    />
  </Shell>;
}

function UploadPage() {
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionMode, setActionMode] = useState('translate');
  const [confirmState, setConfirmState] = useState(null);
  const [noticeState, setNoticeState] = useState(null);
  const navigate = useNavigate();
  const submit = async (force = false, mode = 'translate') => {
    if (!file) return setError('请先选择文档');
    setBusy(true); setActionMode(mode); setError('');
    const form = new FormData(); form.append('file', file); if (force) form.append('force', '1'); if (mode === 'upload') form.append('autoStart', 'false');
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
    }
    catch (err) {
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
    } finally { setBusy(false); setActionMode('translate'); }
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

function DocumentPage() {
  const { id } = useParams();
  const [doc, setDoc] = useState(null);
  const [showSource, setShowSource] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);
  const navigate = useNavigate();
  const load = async () => setDoc((await api(`/documents/${id}`)).document);
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, [id]);
  if (!doc) return <Shell><p>加载中...</p></Shell>;
  const retry = async () => { await api(`/documents/${id}/retry`, { method: 'POST' }); await load(); };
  const summaryContent = doc.summary || doc.errorMsg || '系统正在解析和总结文献。';

  const mergedBlocks = mergeShortBlocks(doc.blocks?.filter((b) => b.type !== 'document') || []);
  const exportPdf = async () => {
    if (exportingPdf) return;
    setExportingPdf(true);
    try {
      const token = getToken();
      const res = await fetch(`/api/documents/${doc.id}/export-pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        let message = 'PDF 导出失败';
        try {
          const data = await res.json();
          message = data.error || message;
        } catch { }
        throw new Error(message);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(doc.originalName || 'translation').replace(/\.[^.]+$/, '')}-translated.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } finally {
      setExportingPdf(false);
    }
  };

  return <Shell contentClassName="result-page">
    <Header
      title={stripFileExtension(doc.originalName)}
      showMeta={false}
      titlePrefix={<><button className="ghost back-button icon-only" onClick={() => navigate('/dashboard')} aria-label="返回"><ArrowLeft size={15} /></button>{doc.status !== 'completed' && <div className={`ghost status-badge ${doc.status}`}>{renderStatus(doc.status, doc.progress)}</div>}</>}
      action={<div className="header-actions">
        <details className="header-summary-toggle">
          <summary className="ghost summary-toggle-button">内容总结</summary>
          <div className="header-summary-popover">
            <MarkdownContent content={summaryContent} />
          </div>
        </details>
        <button className="ghost" onClick={() => setShowSource((v) => !v)}>{showSource ? '隐藏原文' : '显示原文'}</button>
        <button className="ghost" onClick={exportPdf} disabled={exportingPdf}><Eye size={15} />{exportingPdf ? '导出中...' : '导出 PDF'}</button>
        {['failed', 'queued', 'parsing', 'summarizing', 'translating'].includes(doc.status) && <button className="ghost" onClick={retry}>重试</button>}
      </div>}
    />
    <div className={`reader${showSource ? '' : ' reader-translation-only'}`}>
      {mergedBlocks.map((b) => <div className="block-row" key={b.id}>
        {showSource ? <div className="block-panel">
          <BlockRenderer block={b} translated={false} />
        </div> : <div className="block-panel block-panel-hidden" />}
        <div className="block-panel">
          <BlockRenderer block={b} translated />
        </div>
      </div>)}
    </div>
  </Shell>;
}

function DocumentEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const headerRef = useRef(null);
  const [doc, setDoc] = useState(null);
  const [editingBlockId, setEditingBlockId] = useState('');
  const [editorState, setEditorState] = useState({ sourceText: '', translatedText: '' });
  const [saving, setSaving] = useState(false);
  const [deleteState, setDeleteState] = useState({ open: false, block: null, busy: false });
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [showFloatingTools, setShowFloatingTools] = useState(false);

  const load = async () => setDoc((await api(`/documents/${id}`)).document);
  useEffect(() => { load(); }, [id]);
  useEffect(() => {
    const updateFloatingTools = () => {
      const headerBottom = headerRef.current?.getBoundingClientRect?.().bottom ?? 0;
      setShowFloatingTools(headerBottom <= 0);
    };
    updateFloatingTools();
    window.addEventListener('scroll', updateFloatingTools, { passive: true });
    window.addEventListener('resize', updateFloatingTools);
    return () => {
      window.removeEventListener('scroll', updateFloatingTools);
      window.removeEventListener('resize', updateFloatingTools);
    };
  }, []);

  const blocks = useMemo(() => (doc?.blocks || []).filter((b) => b.type !== 'document'), [doc]);
  const editingBlock = useMemo(() => (doc?.blocks || []).find((block) => block.id === editingBlockId) || null, [doc, editingBlockId]);

  const beginEdit = (block) => {
    if (!block?.id) return;
    setEditingBlockId(block.id);
    setEditorState({
      sourceText: getEditableSourceText(block),
      translatedText: getEditableTranslatedText(block),
    });
  };

  const cancelEdit = () => {
    setEditingBlockId('');
    setEditorState({ sourceText: '', translatedText: '' });
  };

  const saveBlock = async () => {
    if (!editingBlock || saving) return;
    const previous = cloneBlockSnapshot(editingBlock);
    setSaving(true);
    try {
      const data = await api(`/documents/${id}/blocks/${editingBlock.id}`, {
        method: 'PATCH',
        body: {
          sourceText: editorState.sourceText,
          translatedText: editorState.translatedText,
        },
      });
      setDoc((current) => replaceBlockInDocument(current, data.block));
      setHistory((current) => [...current, { type: 'update', before: previous, after: cloneBlockSnapshot(data.block) }]);
      setFuture([]);
      cancelEdit();
    } finally {
      setSaving(false);
    }
  };

  const askDeleteBlock = (block) => {
    setDeleteState({ open: true, block, busy: false });
  };

  const confirmDeleteBlock = async () => {
    const block = deleteState.block;
    if (!block) return;
    setDeleteState((current) => ({ ...current, busy: true }));
    try {
      await api(`/documents/${id}/blocks/${block.id}`, { method: 'DELETE' });
      setDoc((current) => removeBlockFromDocument(current, block.id));
      setHistory((current) => [...current, { type: 'delete', block: cloneBlockSnapshot(block) }]);
      setFuture([]);
      if (editingBlockId === block.id) cancelEdit();
      setDeleteState({ open: false, block: null, busy: false });
    } catch (error) {
      setDeleteState((current) => ({ ...current, busy: false }));
      throw error;
    }
  };

  const undo = async () => {
    const action = history[history.length - 1];
    if (!action) return;
    if (action.type === 'update') {
      const data = await api(`/documents/${id}/blocks/${action.before.id}`, {
        method: 'PATCH',
        body: {
          sourceText: getEditableSourceText(action.before),
          translatedText: getEditableTranslatedText(action.before),
        },
      });
      setDoc((current) => replaceBlockInDocument(current, data.block));
    } else if (action.type === 'delete') {
      const data = await api(`/documents/${id}/blocks/restore`, {
        method: 'POST',
        body: { block: action.block },
      });
      setDoc((current) => restoreBlockIntoDocument(current, data.block));
    }
    setHistory((current) => current.slice(0, -1));
    setFuture((current) => [action, ...current]);
  };

  const redo = async () => {
    const action = future[0];
    if (!action) return;
    if (action.type === 'update') {
      const data = await api(`/documents/${id}/blocks/${action.after.id}`, {
        method: 'PATCH',
        body: {
          sourceText: getEditableSourceText(action.after),
          translatedText: getEditableTranslatedText(action.after),
        },
      });
      setDoc((current) => replaceBlockInDocument(current, data.block));
    } else if (action.type === 'delete') {
      await api(`/documents/${id}/blocks/${action.block.id}`, { method: 'DELETE' });
      setDoc((current) => removeBlockFromDocument(current, action.block.id));
    }
    setFuture((current) => current.slice(1));
    setHistory((current) => [...current, action]);
  };

  if (!doc) return <Shell><p>加载中...</p></Shell>;

  const editorToolButtons = <>
    <button className="ghost icon-only floating-tool-button" onClick={undo} disabled={!history.length} aria-label="回撤"><RotateCcw size={15} /></button>
    <span className="editor-tool-divider" aria-hidden="true" />
    <button className="ghost icon-only floating-tool-button" onClick={redo} disabled={!future.length} aria-label="恢复"><RotateCw size={15} /></button>
  </>;

  return <Shell contentClassName="result-page edit-page">
    <div ref={headerRef}>
      <Header
        title={stripFileExtension(doc.originalName)}
        showMeta={false}
        titlePrefix={<button className="ghost back-button icon-only" onClick={() => navigate(`/documents/${id}`)} aria-label="返回"><ArrowLeft size={15} /></button>}
        action={!showFloatingTools ? <div className="header-actions editor-header-tools">{editorToolButtons}</div> : null}
      />
    </div>
    {showFloatingTools && <div className="editor-floating-tools">{editorToolButtons}</div>}
    <div className="reader edit-reader">
      {blocks.map((block) => {
        const isEditing = block.id === editingBlockId;
        return <div className="block-row" key={block.id}>
          <div className={`block-panel${isEditing ? ' block-panel-active' : ''}`}>
            {isEditing ? <BlockEditorCard
              title="原文"
              value={editorState.sourceText}
              onChange={(value) => setEditorState((current) => ({ ...current, sourceText: value }))}
              onDelete={() => askDeleteBlock(editingBlock)}
              onSave={saveBlock}
              onCancel={cancelEdit}
              saving={saving}
            /> : <button className="editable-block" onClick={() => beginEdit(block)}><BlockRenderer block={block} translated={false} /></button>}
          </div>
          <div className={`block-panel${isEditing ? ' block-panel-active' : ''}`}>
            {isEditing ? <BlockEditorCard
              title="译文"
              value={editorState.translatedText}
              onChange={(value) => setEditorState((current) => ({ ...current, translatedText: value }))}
              onDelete={() => askDeleteBlock(editingBlock)}
              onSave={saveBlock}
              onCancel={cancelEdit}
              saving={saving}
            /> : <button className="editable-block" onClick={() => beginEdit(block)}><BlockRenderer block={block} translated /></button>}
          </div>
        </div>;
      })}
    </div>
    <BlockDeleteModal
      open={deleteState.open}
      block={deleteState.block}
      onConfirm={confirmDeleteBlock}
      onCancel={() => !deleteState.busy && setDeleteState({ open: false, block: null, busy: false })}
      busy={deleteState.busy}
    />
  </Shell>;
}

function BlockEditorCard({ title, value, onChange, onDelete, onSave, onCancel, saving = false }) {
  return <div className="block-editor-card">
    <div className="block-editor-header">
      <span>{title}</span>
      <div className="block-editor-actions">
        <button className="ghost" onClick={onDelete}><Trash2 size={14} />删除</button>
        <button className="ghost" onClick={onCancel}>取消</button>
        <button className="primary" onClick={onSave} disabled={saving}><Save size={14} />{saving ? '保存中...' : '保存'}</button>
      </div>
    </div>
    <textarea className="block-editor-textarea" value={value} onChange={(e) => onChange(e.target.value)} />
  </div>;
}

function WalletPage() {
  const [wallet, setWallet] = useState(null);
  const [plans, setPlans] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [orders, setOrders] = useState([]);
  const [pay, setPay] = useState(null);
  const [activeTab, setActiveTab] = useState('ledger');
  const [err, setErr] = useState('');
  const [paymentModal, setPaymentModal] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const load = async () => {
    const [walletData, plansData, ledgerData, orderData] = await Promise.all([
      api('/wallet'),
      api('/payment/plans'),
      api('/wallet/ledger'),
      api('/wallet/orders'),
    ]);
    setWallet(walletData);
    setPlans(plansData.plans || []);
    setLedger(ledgerData.ledger || []);
    setOrders(orderData.orders || []);
  };
  useEffect(() => { load(); const t = setInterval(() => { setNowTick(Date.now()); load(); }, 5000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!pay?.orderId) return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const result = await api(`/payment/order/${pay.orderId}`);
        if (cancelled) return;
        if (result.status === 'paid') {
          setPay(null);
          setErr('');
          setPaymentModal({ type: 'success', title: '支付成功', message: '点数已到账，可继续使用。' });
          await load();
          return;
        }
        if (result.status === 'cancelled' || result.status === 'failed' || (typeof result.remainingSeconds === 'number' && result.remainingSeconds <= 0)) {
          setPay(null);
          setPaymentModal({
            type: result.status === 'failed' ? 'error' : 'info',
            title: result.status === 'failed' ? '支付失败' : '订单已关闭',
            message: result.status === 'failed' ? '本次支付未完成，请重新尝试。' : '订单已取消或超时，请重新发起支付。',
          });
          await load();
          return;
        }
        setPay((current) => current?.orderId === pay.orderId ? { ...current, remainingSeconds: result.remainingSeconds ?? current.remainingSeconds } : current);
      } catch (e) {
        if (!cancelled) setErr(e.message);
      }
    };
    poll();
    const timer = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pay?.orderId]);
  const buy = async (planId) => {
    try {
      setErr('');
      setPaymentModal(null);
      setPay(await api('/payment/create', { method: 'POST', body: { planId } }));
    } catch (e) {
      setErr(e.message);
      if (e.pendingOrder) setPay(e.pendingOrder);
    }
  };
  const reopenOrder = async (orderId) => {
    try {
      setErr('');
      setPaymentModal(null);
      setPay(await api(`/payment/reopen/${orderId}`, { method: 'POST' }));
    } catch (e) { setErr(e.message); }
  };
  const cancelOrder = async (orderId) => {
    try {
      setErr('');
      await api(`/payment/cancel/${orderId}`, { method: 'POST' });
      if (pay?.orderId === orderId) setPay(null);
      setPaymentModal({ type: 'info', title: '订单已取消', message: '当前支付流程已关闭。' });
      await load();
    } catch (e) { setErr(e.message); }
  };
  return <Shell>
    <Header title="点数钱包" metaMode="back" showMetaBalance={false} />
    <div className="wallet-hero"><Coins size={32} /><span>当前余额</span><strong>{wallet?.balance ?? '--'} 点</strong></div>{err && <p className="error">{err}</p>}
    <div className="plans">{plans.map((p) => <button key={p.id} onClick={() => buy(p.id)}><b>{p.name}</b><span>{p.price / 100} 元</span><small>{p.points} 点</small></button>)}</div>
    <div className="wallet-tabs">
      <button className={`wallet-tab${activeTab === 'ledger' ? ' active' : ''}`} onClick={() => setActiveTab('ledger')}>点数记录</button>
      <button className={`wallet-tab${activeTab === 'orders' ? ' active' : ''}`} onClick={() => setActiveTab('orders')}>订单记录</button>
    </div>
    {activeTab === 'ledger' && <div className="orders">{ledger.map((item) => <div key={item.id}><span>{item.reason || item.type}</span><b>{item.delta > 0 ? `+${item.delta}` : item.delta} 点</b><small>{new Date(item.createdAt).toLocaleString()}</small></div>)}</div>}
    {activeTab === 'orders' && <div className="orders">{orders.map((o) => {
      const remainingSeconds = o.status === 'pending'
        ? Math.max(0, o.remainingSeconds ?? Math.ceil((new Date(o.createdAt).getTime() + 300000 - nowTick) / 1000))
        : 0;
      return <div key={o.id}><span>{o.plan?.name || '自定义充值'}</span><b>{o.status === 'pending' ? `待支付 ${remainingSeconds}s` : o.status}</b><small>{o.amount / 100} 元 · {o.points} 点</small>{o.status === 'pending' && <div className="inline-actions"><button className="ghost" onClick={() => reopenOrder(o.id)}>继续支付</button><button className="ghost danger" onClick={() => cancelOrder(o.id)}>取消</button></div>}</div>;
    })}</div>}
    {(pay || paymentModal) && <div className="payment-modal-overlay" onClick={() => { if (!pay) setPaymentModal(null); }}>
      <div className={`payment-modal${paymentModal ? ` payment-modal-${paymentModal.type}` : ''}`} onClick={(e) => e.stopPropagation()}>
        {pay ? <>
          <h3>微信扫码支付</h3>
          <QRCodeCanvas value={pay.codeUrl} size={200} />
          <p>{pay.amount / 100} 元 · {pay.points} 点</p>
          <small>{Math.max(0, pay.remainingSeconds ?? 0)} 秒内完成支付</small>
          {pay.orderId && <div className="card-actions"><button className="ghost" onClick={() => reopenOrder(pay.orderId)}>继续支付</button><button className="ghost danger" onClick={() => cancelOrder(pay.orderId)}>取消订单</button></div>}
        </> : <>
          <h3>{paymentModal?.title}</h3>
          <p>{paymentModal?.message}</p>
          <div className="card-actions"><button className="primary" onClick={() => setPaymentModal(null)}>知道了</button></div>
        </>}
      </div>
    </div>}
  </Shell>;
}

function MarkdownContent({ content }) {
  return <div className="markdown-content">
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[[rehypeKatex, { macros: KATEX_MACROS, strict: 'ignore', trust: true, throwOnError: false }]]}
      components={{
        code({ inline, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          return !inline && match ? (
            <SyntaxHighlighter style={vscDarkPlus} language={match[1]} PreTag="div" className="code-block" {...props}>
              {String(children).replace(/\n$/, '')}
            </SyntaxHighlighter>
          ) : (
            <code className="inline-code" {...props}>{children}</code>
          );
        },
        img({ src, alt }) {
          return <figure className="md-figure"><img src={src} alt={alt || ''} /><figcaption>{alt || '图片'}</figcaption></figure>;
        },
        table({ children }) {
          return <div className="table-wrap"><table>{children}</table></div>;
        },
        a({ href, children }) {
          return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
        },
      }}
    >
      {content || ''}
    </ReactMarkdown>
  </div>;
}

function BlockRenderer({ block, translated = false }) {
  if (block.type === 'image' && block.sourceContent?.url) {
    const caption = translated
      ? (block.translatedText || block.sourceContent.caption || block.sourceContent.alt || '图片')
      : (block.sourceContent.caption || block.sourceContent.alt || block.translatedText || '图片');
    return <figure className="block-media">
      <img src={block.sourceContent.url} alt={block.sourceContent.alt || ''} />
      <figcaption><MarkdownContent content={caption} /></figcaption>
    </figure>;
  }
  if (block.type === 'table') {
    return <div className="table-placeholder">表格结构已记录，请查看下方 `table_row / table_cell` 内容。</div>;
  }
  let text = translated ? (block.translatedText || (block.status === 'failed' ? block.errorMsg : '等待翻译...')) : (block.sourceText || blockFallback(block));
  const headingLevel = getDisplayHeadingLevel(block);

  if (block.type === 'equation') {
    const expression = translated
      ? (block.translatedText || block.sourceContent?.expression || block.sourceText || '')
      : (block.sourceContent?.expression || block.sourceText || '');
    text = equationToMarkdown(expression);
  } else if (headingLevel > 0) {
    text = `${'#'.repeat(Math.min(headingLevel, 6))} ${text}`;
  } else if (!translated && Array.isArray(block.sourceContent?.rich_text)) {
    text = richTextToMarkdown(block.sourceContent.rich_text) || text;
  }

  const blockClassName = `block-content ${resolveBlockTone(block)}`;
  return <div className={blockClassName}><MarkdownContent content={text} /></div>;
}

function HeaderMeta({ mode = 'logout', showBalance = true }) {
  const navigate = useNavigate();
  const customer = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('wenyi_customer') || 'null'); } catch { return null; }
  }, []);
  const [balance, setBalance] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadWallet = async () => {
      try {
        const data = await api('/wallet');
        if (!cancelled) setBalance(data.balance ?? 0);
      } catch {
        if (!cancelled) setBalance(null);
      }
    };
    if (getToken()) loadWallet();
    return () => { cancelled = true; };
  }, []);

  const logout = () => {
    clearSession();
    navigate('/login');
  };

  return <>
    <div className="header-meta">
      {mode === 'back'
        ? <button className="header-meta-back" onClick={() => navigate('/dashboard')} aria-label="返回">
          <ArrowLeft size={16} />
        </button>
        : <button className="header-meta-logout" onClick={() => setConfirmOpen(true)} aria-label="退出">
          <LogOut size={16} />
        </button>}
      <button className="header-meta-account" onClick={() => navigate('/wallet')}>
        <span className="header-meta-user">{customer?.username || customer?.phone || customer?.email || '未登录'}</span>
        {showBalance && <>
          <span className="header-meta-divider" />
          <span className="header-meta-balance-text">{balance == null ? '--' : balance} 点</span>
        </>}
      </button>
    </div>
    <ConfirmModal
      open={confirmOpen}
      title="退出系统"
      message="确定要退出当前系统吗？"
      confirmText="退出"
      onConfirm={logout}
      onCancel={() => setConfirmOpen(false)}
    />
  </>;
}

function Header({ title, titlePrefix, action, metaMode = 'logout', showMetaBalance = true, showMeta = true }) {
  return <div className="page-header">
    <div className="page-header-side page-header-left">{showMeta && <HeaderMeta mode={metaMode} showBalance={showMetaBalance} />}{titlePrefix}</div>
    <div className="page-title-wrap"><h1>{title}</h1></div>
    <div className="page-header-side page-header-right">{action}</div>
  </div>;
}

function statusText(s) { return ({ uploaded: '待翻译', queued: '排队中', parsing: '解析中', summarizing: '总结中', translating: '翻译中', stopped: '已停止', completed: '已完成', failed: '失败' }[s] || s); }
function renderStatus(status, progress) {
  if (status === 'completed') return statusText(status);
  if (typeof progress === 'number' && progress > 0) return <>{statusText(status)}{statusNeedsDots(status) && <TypingDots />} {progress}%</>;
  if (statusNeedsDots(status)) return <>{statusText(status)}<TypingDots /></>;
  return statusText(status);
}
function blockFallback(b) {
  if (b.type === 'image' && b.sourceContent?.url) return `![${b.sourceContent.alt || ''}](${b.sourceContent.url})`;
  if (b.sourceContent?.url) return `[资源](${b.sourceContent.url})`;
  return '';
}

function inferNumberedHeadingLevel(text = '') {
  const value = String(text || '').trim();
  const match = value.match(/^(\d+(?:\.\d+)*)(?:\.|\s)/);
  if (!match) return 0;
  return Math.min(6, match[1].split('.').filter(Boolean).length);
}

function getDisplayHeadingLevel(block) {
  const explicit = Number(block?.headingLevel || block?.level || block?.sourceContent?.level || String(block?.type || '').match(/^heading_(\d+)$/)?.[1] || 0);
  const numbered = inferNumberedHeadingLevel(block?.sourceText || block?.translatedText || '');
  if (numbered > 0 && explicit <= 1) return numbered;
  return explicit;
}

function resolveBlockTone(block) {
  const headingLevel = getDisplayHeadingLevel(block);
  const semanticType = String(block.type || '').toLowerCase();
  const text = String(block.sourceText || '').trim();

  if (text.length > 300) return 'tone-body';

  if (headingLevel > 0) {
    if (headingLevel === 1) return 'tone-heading-1';
    if (headingLevel === 2) return 'tone-heading-2';
    return 'tone-heading-3';
  }

  if (semanticType.includes('title') || semanticType.includes('heading')) {
    if (text.length <= 40) return 'tone-heading-1';
    if (text.length <= 80) return 'tone-heading-2';
    return 'tone-heading-3';
  }

  if (semanticType.includes('quote')) return 'tone-quote';
  if (semanticType.includes('caption') || semanticType.includes('footnote')) return 'tone-meta';
  if (text.length <= 30) return 'tone-heading-3';
  return 'tone-body';
}

function mergeShortBlocks(blocks) {
  const result = [];
  let buffer = null;
  const isHeadingLike = (block) => {
    const headingLevel = Number(block?.headingLevel || block?.level || block?.sourceContent?.level || 0);
    const type = String(block?.type || '').toLowerCase();
    return headingLevel > 0 || type.includes('heading') || type.includes('title');
  };

  const flush = () => {
    if (!buffer) return;
    result.push(buffer);
    buffer = null;
  };

  for (const block of blocks) {
    const sourceText = (block.sourceText || blockFallback(block) || '').trim();
    const translatedText = (block.translatedText || (block.status === 'failed' ? block.errorMsg : '') || '').trim();
    const displayText = sourceText || translatedText;
    const shortEnough = [...displayText].length > 0 && [...displayText].length < 50;

    if (isHeadingLike(block) || block.type === 'image' || block.type === 'table' || block.type === 'equation' || block.type === 'code') {
      flush();
      result.push(block);
      continue;
    }

    if (!shortEnough) {
      flush();
      result.push({
        ...block,
        sourceText,
        translatedText,
      });
      continue;
    }

    if (!buffer) {
      buffer = { ...block };
      continue;
    }

    buffer = {
      ...buffer,
      id: `${buffer.id}__${block.id}`,
      sourceText: [buffer.sourceText || '', sourceText].filter(Boolean).join('\n'),
      translatedText: [buffer.translatedText || '', translatedText].filter(Boolean).join('\n'),
    };
  }

  flush();
  return result;
}

function App() {
  return <BrowserRouter><Routes><Route path="/login" element={<LoginPage />} /><Route path="/register" element={<LoginPage mode="register" />} /><Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} /><Route path="/upload" element={<RequireAuth><UploadPage /></RequireAuth>} /><Route path="/documents/:id" element={<RequireAuth><DocumentPage /></RequireAuth>} /><Route path="/documents/:id/edit" element={<RequireAuth><DocumentEditPage /></RequireAuth>} /><Route path="/wallet" element={<RequireAuth><WalletPage /></RequireAuth>} /><Route path="*" element={<Navigate to="/dashboard" replace />} /></Routes></BrowserRouter>;
}

createRoot(document.getElementById('root')).render(<App />);
