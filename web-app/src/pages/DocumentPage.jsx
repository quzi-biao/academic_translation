import React, { useEffect, useState } from 'react';
import { ArrowLeft, Eye } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, getToken } from '../api';
import { BlockRenderer, mergeShortBlocks } from '../components/DocumentBlocks';
import { Header, Shell } from '../components/Layout';
import MarkdownContent from '../components/MarkdownContent';
import { renderStatus } from '../components/StatusBits';
import { isActiveTranslationStatus, stripFileExtension } from '../documentHelpers';

export default function DocumentPage() {
  const { id } = useParams();
  const [doc, setDoc] = useState(null);
  const [showSource, setShowSource] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);
  const navigate = useNavigate();

  const load = async () => setDoc((await api(`/documents/${id}`)).document);

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    if (!doc || !isActiveTranslationStatus(doc.status)) return undefined;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [id, doc?.status]);

  if (!doc) return <Shell><p>加载中...</p></Shell>;

  const retry = async () => { await api(`/documents/${id}/retry`, { method: 'POST' }); await load(); };
  const summaryContent = doc.summary || doc.errorMsg || '系统正在解析和总结文献。';
  const mergedBlocks = mergeShortBlocks(doc.blocks?.filter((block) => block.type !== 'document') || []);

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
        <button className="ghost" onClick={() => setShowSource((value) => !value)}>{showSource ? '隐藏原文' : '显示原文'}</button>
        <button className="ghost" onClick={exportPdf} disabled={exportingPdf}><Eye size={15} />{exportingPdf ? '导出中...' : '导出 PDF'}</button>
        {['failed', 'queued', 'parsing', 'summarizing', 'translating'].includes(doc.status) && <button className="ghost" onClick={retry}>重试</button>}
      </div>}
    />
    <div className={`reader${showSource ? '' : ' reader-translation-only'}`}>
      {mergedBlocks.map((block) => <div className="block-row" key={block.id}>
        {showSource ? <div className="block-panel">
          <BlockRenderer block={block} translated={false} />
        </div> : <div className="block-panel block-panel-hidden" />}
        <div className="block-panel">
          <BlockRenderer block={block} translated />
        </div>
      </div>)}
    </div>
  </Shell>;
}
