import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpenText,
  Coins,
  Ellipsis,
  Eye,
  FileText,
  LogOut,
  RefreshCcw,
  Trash2,
  UploadCloud,
  WalletCards,
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { api, clearSession, getToken, setSession } from './api';
import 'katex/dist/katex.min.css';
import './styles.css';

function escapeMarkdownMathText(text = '') {
  return String(text).replace(/([\\`*_[\]<>])/g, '\\$1');
}

function normalizeMathExpression(expression = '') {
  return String(expression || '').trim();
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

function Shell({ children, collapsed = false, onToggleSidebar, contentClassName = '', hideSidebar = false }) {
  const navigate = useNavigate();
  const customer = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('wenyi_customer') || 'null'); } catch { return null; }
  }, []);
  const logout = () => { clearSession(); navigate('/login'); };
  return <div className={`app-shell${collapsed ? ' shell-collapsed' : ''}${hideSidebar ? ' shell-no-sidebar' : ''}`}>
    {!hideSidebar && <aside className="sidebar">
      <Link className="brand" to="/dashboard">{!collapsed && <><span>闻一</span><small>Academic Translation</small></>}</Link>
      <nav>
        <Link to="/dashboard"><FileText size={18}/> {!collapsed && '文献'}</Link>
        <Link to="/upload"><UploadCloud size={18}/> {!collapsed && '上传翻译'}</Link>
        <Link to="/wallet"><WalletCards size={18}/> {!collapsed && '点数钱包'}</Link>
      </nav>
      <div className="profile">
        {!collapsed && <div className="profile-inline"><span>{customer?.username || customer?.phone || customer?.email}</span><button className="profile-logout" onClick={logout}><LogOut size={14}/><span>退出</span></button></div>}
      </div>
    </aside>}
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
      <div className="auth-copy"><BookOpenText size={34}/><h1>闻一翻译</h1><p>把 PDF/DOCX 学术文献拆成可对应的知识块，先理解论文，再逐块翻译。</p></div>
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

function Dashboard() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [openMenuId, setOpenMenuId] = useState(null);
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
    if (!window.confirm('删除后不可找回，确定删除这个翻译任务吗？')) return;
    await api(`/documents/${id}`, { method: 'DELETE' });
    await load();
  };
  const retryDoc = async (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    await api(`/documents/${id}/retry`, { method: 'POST' });
    await load();
  };
  return <Shell collapsed={collapsed} onToggleSidebar={() => setCollapsed((v) => !v)}>
    <Header title="我的文献列表" action={<Link className="primary-link" to="/upload">上传新文献</Link>} />
    <div className="doc-grid">{loading && <p>加载中...</p>}{docs.map((d) => <Link className="doc-card" to={`/documents/${d.id}`} key={d.id}>
      <div className="doc-card-main">
        <h3>{d.originalName}</h3>
        <p className="doc-summary">{d.summary || d.errorMsg || '等待系统解析、总结并翻译。'}</p>
      </div>
      <div className="doc-card-footer">
        <div className="progress"><span style={{ width: `${d.progress || 0}%` }} /></div>
        <div className="doc-meta-line"><small>{d.translatedBlocks}/{d.effectiveTotalBlocks || d.totalBlocks} blocks</small><small>{d.pointCost} 点</small><small className={`status-inline ${d.status}`}>{statusText(d.status)}{d.status !== 'completed' && typeof d.progress === 'number' ? ` ${d.progress}%` : ''}</small></div>
      </div>
      <div className="card-menu" ref={openMenuId === d.id ? menuRef : null} onClick={(e) => e.stopPropagation()}>
        <button className="card-menu-trigger ghost icon-only" aria-label="操作菜单" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpenMenuId((current) => current === d.id ? null : d.id); }}><Ellipsis size={16} /></button>
        {openMenuId === d.id && <div className="card-menu-popover">
          <button type="button" className="menu-item" onClick={async (e) => { setOpenMenuId(null); await retryDoc(e, d.id); }}><RefreshCcw size={15}/>重试</button>
          <button type="button" className="menu-item danger" onClick={async (e) => { setOpenMenuId(null); await removeDoc(e, d.id); }}><Trash2 size={15}/>删除</button>
        </div>}
      </div>
    </Link>)}</div>
  </Shell>;
}

function UploadPage() {
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const submit = async () => {
    if (!file) return setError('请先选择文档');
    setBusy(true); setError('');
    const form = new FormData(); form.append('file', file);
    try { const data = await api('/documents/upload', { method: 'POST', body: form }); navigate(`/documents/${data.document.id}`); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <Shell collapsed={collapsed} onToggleSidebar={() => setCollapsed((v) => !v)}>
    <Header title="上传学术文献" />
    <section className="upload-zone"><UploadCloud size={54}/><h2>PDF / DOCX / MD</h2><p>系统会先转 Markdown，再拆成 Block，生成文献总结和翻译提示词后逐块翻译。</p>
      <input type="file" accept=".pdf,.doc,.docx,.md,.txt" onChange={(e) => setFile(e.target.files?.[0])}/>{file && <b>{file.name}</b>}{error && <p className="error">{error}</p>}<button className="primary" onClick={submit} disabled={busy}>{busy ? '上传中...' : '开始翻译任务'}</button></section>
  </Shell>;
}

function DocumentPage() {
  const { id } = useParams();
  const [doc, setDoc] = useState(null);
  const [collapsed, setCollapsed] = useState(true);
  const [showSource, setShowSource] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);
  const navigate = useNavigate();
  const load = async () => setDoc((await api(`/documents/${id}`)).document);
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, [id]);
  if (!doc) return <Shell collapsed={collapsed} onToggleSidebar={() => setCollapsed((v) => !v)}><p>加载中...</p></Shell>;
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
        } catch {}
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

  return <Shell collapsed={collapsed} onToggleSidebar={() => setCollapsed((v) => !v)} contentClassName="result-page" hideSidebar>
    <Header
      title={doc.originalName}
      titlePrefix={<><button className="ghost back-button icon-only" onClick={() => navigate('/dashboard')} aria-label="返回"><ArrowLeft size={15}/></button>{doc.status !== 'completed' && <div className={`ghost status-badge ${doc.status}`}>{renderStatus(doc.status, doc.progress)}</div>}</>}
      action={<div className="header-actions">
        <details className="header-summary-toggle">
          <summary className="ghost summary-toggle-button">内容总结</summary>
          <div className="header-summary-popover">
            <MarkdownContent content={summaryContent} />
          </div>
        </details>
        <button className="ghost" onClick={() => setShowSource((v) => !v)}>{showSource ? '隐藏原文' : '显示原文'}</button>
        <button className="ghost" onClick={exportPdf} disabled={exportingPdf}><Eye size={15}/>{exportingPdf ? '导出中...' : '导出 PDF'}</button>
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

function WalletPage() {
  const [wallet, setWallet] = useState(null);
  const [plans, setPlans] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [orders, setOrders] = useState([]);
  const [pay, setPay] = useState(null);
  const [activeTab, setActiveTab] = useState('ledger');
  const [err, setErr] = useState('');
  const [paymentModal, setPaymentModal] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
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
  return <Shell collapsed={collapsed} onToggleSidebar={() => setCollapsed((v) => !v)}>
    <Header title="点数钱包" />
    <div className="wallet-hero"><Coins size={32}/><span>当前余额</span><strong>{wallet?.balance ?? '--'} 点</strong></div>{err && <p className="error">{err}</p>}
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
      rehypePlugins={[rehypeKatex]}
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
    return <figure className="block-media"><img src={block.sourceContent.url} alt={block.sourceContent.alt || ''} /><figcaption>{block.sourceContent.caption || block.sourceContent.alt || '图片'}</figcaption></figure>;
  }
  if (block.type === 'table') {
    return <div className="table-placeholder">表格结构已记录，请查看下方 `table_row / table_cell` 内容。</div>;
  }
  let text = translated ? (block.translatedText || (block.status === 'failed' ? block.errorMsg : '等待翻译...')) : (block.sourceText || blockFallback(block));

  if (block.type === 'equation') {
    const expression = translated
      ? (block.translatedText || block.sourceContent?.expression || block.sourceText || '')
      : (block.sourceContent?.expression || block.sourceText || '');
    text = equationToMarkdown(expression);
  } else if (!translated && Array.isArray(block.sourceContent?.rich_text)) {
    text = richTextToMarkdown(block.sourceContent.rich_text) || text;
  }

  const blockClassName = `block-content ${resolveBlockTone(block)}`;
  return <div className={blockClassName}><MarkdownContent content={text} /></div>;
}

function Header({ title, titlePrefix, action }) {
  return <div className="page-header">
    <div className="page-title-wrap">{titlePrefix}<h1>{title}</h1></div>
    {action}
  </div>;
}

function statusText(s) { return ({ queued:'排队中', parsing:'解析中', summarizing:'总结中', translating:'翻译中', completed:'已完成', failed:'失败' }[s] || s); }
function renderStatus(status, progress) {
  if (status === 'completed') return statusText(status);
  if (typeof progress === 'number' && progress > 0) return `${statusText(status)} ${progress}%`;
  return statusText(status);
}
function blockFallback(b) {
  if (b.type === 'image' && b.sourceContent?.url) return `![${b.sourceContent.alt || ''}](${b.sourceContent.url})`;
  if (b.sourceContent?.url) return `[资源](${b.sourceContent.url})`;
  return '';
}

function resolveBlockTone(block) {
  const headingLevel = Number(block.headingLevel || block.level || 0);
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

    if (block.type === 'image' || block.type === 'table' || block.type === 'equation' || block.type === 'code') {
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
  return <BrowserRouter><Routes><Route path="/login" element={<LoginPage/>}/><Route path="/register" element={<LoginPage mode="register"/>}/><Route path="/dashboard" element={<RequireAuth><Dashboard/></RequireAuth>}/><Route path="/upload" element={<RequireAuth><UploadPage/></RequireAuth>}/><Route path="/documents/:id" element={<RequireAuth><DocumentPage/></RequireAuth>}/><Route path="/wallet" element={<RequireAuth><WalletPage/></RequireAuth>}/><Route path="*" element={<Navigate to="/dashboard" replace/>}/></Routes></BrowserRouter>;
}

createRoot(document.getElementById('root')).render(<App/>);
