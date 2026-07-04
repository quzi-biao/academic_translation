import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Ellipsis, FilePenLine, RefreshCcw, SquarePen, Trash2 } from 'lucide-react';
import { api } from '../api';
import FeedbackWidget from '../components/FeedbackWidget';
import { Header, Shell } from '../components/Layout';
import { ConfirmModal, NoticeModal, RenameModal } from '../components/Modals';
import { TypingDots } from '../components/StatusBits';
import {
  documentStatusHint,
  formatCharCount,
  isActiveTranslationStatus,
  statusNeedsDots,
  statusText,
  stripFileExtension,
} from '../documentHelpers';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [noticeState, setNoticeState] = useState(null);
  const [renameState, setRenameState] = useState({ open: false, id: '', currentName: '', value: '', busy: false });
  const menuRef = useRef(null);
  const loadMoreRef = useRef(null);
  const limit = 18;
  const totalPages = Math.max(1, Math.ceil((total || 0) / limit));
  const hasMore = page < totalPages;
  const activeDocIds = useMemo(
    () => docs.filter((doc) => isActiveTranslationStatus(doc.status)).map((doc) => doc.id),
    [docs],
  );
  const activeDocRefreshKey = activeDocIds.join('|');

  const getOtherActiveDoc = (excludeId) => docs.find((doc) => doc.id !== excludeId && isActiveTranslationStatus(doc.status));
  const mergeDocumentIntoList = (nextDocument) => {
    if (!nextDocument?.id) return;
    setDocs((current) => current.map((doc) => (doc.id === nextDocument.id ? { ...doc, ...nextDocument } : doc)));
  };
  const refreshDocumentInList = async (documentId) => {
    const data = await api(`/documents/${documentId}`);
    if (data?.document) mergeDocumentIntoList(data.document);
  };

  const showActiveDocNotice = (activeDoc) => {
    setNoticeState({
      title: '已有翻译任务进行中',
      message: `当前已有文献《${stripFileExtension(activeDoc?.originalName || '未命名文献')}》正在翻译，请先等待它完成，或先停止当前任务后再开始新的翻译。`,
      onConfirm: () => setNoticeState(null),
    });
  };

  const showStartBlockedNotice = (message) => {
    setNoticeState({
      title: '暂时无法开始翻译',
      message: message || '同一时间只能进行一个翻译任务，请先等待当前任务完成或停止当前任务。',
      onConfirm: () => setNoticeState(null),
    });
  };

  const load = async ({ silent = false, nextPage = page, append = false } = {}) => {
    if (!silent && !append) setLoading(true);
    if (append) setLoadingMore(true);
    const data = await api(`/documents?page=${nextPage}&limit=${limit}`);
    setDocs((current) => append ? [...current, ...(data.documents || [])] : (data.documents || []));
    setTotal(data.total || 0);
    setPage(data.page || nextPage);
    if (!silent && !append) setLoading(false);
    if (append) setLoadingMore(false);
  };

  useEffect(() => { load({ nextPage: 1 }); }, []);

  useEffect(() => {
    if (!activeDocIds.length) return undefined;
    let cancelled = false;
    const refreshActiveDocs = async () => {
      const results = await Promise.all(activeDocIds.map((id) => api(`/documents/${id}`)));
      if (cancelled) return;
      const refreshedMap = new Map(
        results
          .map((item) => item.document)
          .filter(Boolean)
          .map((document) => [document.id, document]),
      );
      setDocs((current) => current.map((doc) => {
        const refreshed = refreshedMap.get(doc.id);
        return refreshed ? { ...doc, ...refreshed } : doc;
      }));
    };
    refreshActiveDocs().catch(() => {});
    const t = setInterval(() => { refreshActiveDocs().catch(() => {}); }, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [activeDocRefreshKey]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasMore) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !loadingMore) {
        load({ nextPage: page + 1, append: true, silent: true }).catch(() => {});
      }
    }, { rootMargin: '320px 0px 320px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [page, hasMore, loadingMore]);

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
        setDocs((current) => current.filter((doc) => doc.id !== id));
        setTotal((current) => Math.max(0, current - 1));
      },
    });
  };

  const retryDoc = async (e, id) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    const activeDoc = getOtherActiveDoc(id);
    if (activeDoc) {
      showActiveDocNotice(activeDoc);
      return;
    }
    try {
      await api(`/documents/${id}/retry`, { method: 'POST' });
      await refreshDocumentInList(id);
    } catch (err) {
      if (String(err.message || '').includes('同一时间只能进行一个翻译任务')) {
        showStartBlockedNotice(err.message);
        return;
      }
      throw err;
    }
  };

  const startDoc = async (e, id) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    const activeDoc = getOtherActiveDoc(id);
    if (activeDoc) {
      showActiveDocNotice(activeDoc);
      return;
    }
    try {
      await api(`/documents/${id}/start`, { method: 'POST' });
      await refreshDocumentInList(id);
    } catch (err) {
      if (String(err.message || '').includes('同一时间只能进行一个翻译任务')) {
        showStartBlockedNotice(err.message);
        return;
      }
      throw err;
    }
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
          await startDoc(e, doc.id);
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
        await refreshDocumentInList(id);
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
      const data = await api(`/documents/${renameState.id}`, { method: 'PATCH', body: { originalName: nextName } });
      if (data?.document) mergeDocumentIntoList(data.document);
      setRenameState({ open: false, id: '', currentName: '', value: '', busy: false });
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

  const renderDocumentCardBody = (doc) => <>
    <div className="doc-card-main">
      <h3>{stripFileExtension(doc.originalName)}</h3>
      <p className="doc-summary">{documentStatusHint(doc)}{statusNeedsDots(doc.status) && <TypingDots />}</p>
    </div>
    <div className="doc-card-footer">
      <div className="progress"><span style={{ width: `${doc.progress || 0}%` }} /></div>
      <div className="doc-meta-line"><small>{formatCharCount(doc.charCount)}</small><small>{doc.pointCost} 点</small><small className={`status-inline ${doc.status}`}>{statusText(doc.status)}{statusNeedsDots(doc.status) && <TypingDots />}{doc.status !== 'completed' && typeof doc.progress === 'number' ? ` ${doc.progress}%` : ''}</small></div>
    </div>
    <div className="card-menu" ref={openMenuId === doc.id ? menuRef : null} onClick={(e) => e.stopPropagation()}>
      <button className="card-menu-trigger ghost icon-only" aria-label="操作菜单" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpenMenuId((current) => current === doc.id ? null : doc.id); }}><Ellipsis size={16} /></button>
      {openMenuId === doc.id && <div className="card-menu-popover">
        <button type="button" className="menu-item" onClick={(e) => { setOpenMenuId(null); openRename(e, doc); }}><SquarePen size={15} />重命名</button>
        <button type="button" className="menu-item" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpenMenuId(null); navigate(`/documents/${doc.id}/edit`); }}><FilePenLine size={15} />编辑</button>
        {!isActiveTranslationStatus(doc.status) && <button type="button" className="menu-item" onClick={async (e) => { setOpenMenuId(null); confirmStartDoc(e, doc); }}><RefreshCcw size={15} />翻译</button>}
        {isActiveTranslationStatus(doc.status) && <button type="button" className="menu-item" onClick={async (e) => { setOpenMenuId(null); await stopDoc(e, doc.id); }}><RefreshCcw size={15} />停止</button>}
        {doc.status === 'failed' && <button type="button" className="menu-item" onClick={async (e) => { setOpenMenuId(null); await retryDoc(e, doc.id); }}><RefreshCcw size={15} />重试</button>}
        <button type="button" className="menu-item danger" onClick={async (e) => { setOpenMenuId(null); await removeDoc(e, doc.id); }}><Trash2 size={15} />删除</button>
      </div>}
    </div>
  </>;

  return <Shell contentClassName="dashboard-page">
    <Header title="文献列表" action={<Link className="primary-link" to="/upload">开始翻译</Link>} metaMode="logout" showMetaBalance={true} />
    <div className="doc-grid">{loading && <p>加载中...</p>}{docs.map((doc) => doc.status === 'completed'
      ? <Link className="doc-card" to={`/documents/${doc.id}`} key={doc.id}>{renderDocumentCardBody(doc)}</Link>
      : <div className="doc-card doc-card-disabled" key={doc.id} aria-disabled="true">{renderDocumentCardBody(doc)}</div>)}</div>
    {!loading && hasMore && <div className="load-more-sentinel" ref={loadMoreRef}>{loadingMore ? '加载更多中...' : '向下滚动加载更多'}</div>}
    <FeedbackWidget />
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
    <NoticeModal
      open={Boolean(noticeState)}
      title={noticeState?.title}
      message={noticeState?.message}
      onConfirm={noticeState?.onConfirm}
    />
  </Shell>;
}
