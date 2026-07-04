import React, { useEffect, useState } from 'react';
import { MessageSquareWarning } from 'lucide-react';
import { api } from '../api';
import { NoticeModal } from './Modals';

export default function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [tickets, setTickets] = useState([]);
  const [total, setTotal] = useState(0);
  const [noticeState, setNoticeState] = useState(null);
  const limit = 5;

  const loadTickets = async (nextPage = page) => {
    const data = await api(`/tickets?page=${nextPage}&limit=${limit}`);
    setTickets(data.tickets || []);
    setTotal(data.total || 0);
    setPage(data.page || nextPage);
  };

  useEffect(() => {
    if (open) loadTickets(1);
  }, [open]);

  const submit = async () => {
    const message = String(content || '').trim();
    if (!message) return;
    setBusy(true);
    try {
      await api('/tickets', { method: 'POST', body: { content: message } });
      setContent('');
      await loadTickets(1);
      setNoticeState({
        title: '提交成功',
        message: '你的问题反馈已提交，我们会尽快查看并处理。',
        onConfirm: () => setNoticeState(null),
      });
    } finally {
      setBusy(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil((total || 0) / limit));

  return <>
    <button className="feedback-fab" onClick={() => setOpen((value) => !value)} aria-label="问题反馈">
      <MessageSquareWarning size={18} />
      <span>问题反馈</span>
    </button>
    {open && <div className="feedback-panel">
      <div className="feedback-panel-header">
        <h3>问题反馈</h3>
        <button className="ghost icon-only" onClick={() => setOpen(false)} aria-label="关闭">×</button>
      </div>
      <div className="feedback-history">
        {tickets.length ? tickets.map((ticket) => <div className="feedback-history-item" key={ticket.id}>
          <div className="feedback-history-meta">
            <span>{new Date(ticket.createdAt).toLocaleString()}</span>
            <span>{ticket.status}</span>
          </div>
          <p>{ticket.description}</p>
          {ticket.resolution && <div className="feedback-history-reply">{ticket.resolution}</div>}
        </div>) : <p className="feedback-empty">还没有提交记录</p>}
      </div>
      {totalPages > 1 && <div className="feedback-history-pagination">
        <button className="ghost" disabled={page <= 1} onClick={() => loadTickets(page - 1)}>上一页</button>
        <span>{page} / {totalPages}</span>
        <button className="ghost" disabled={page >= totalPages} onClick={() => loadTickets(page + 1)}>下一页</button>
      </div>}
      <div className="feedback-form">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="请输入你遇到的问题或建议"
        />
        <button className="primary" onClick={submit} disabled={busy || !String(content || '').trim()}>{busy ? '提交中...' : '提交'}</button>
      </div>
    </div>}
    <NoticeModal
      open={Boolean(noticeState)}
      title={noticeState?.title}
      message={noticeState?.message}
      onConfirm={noticeState?.onConfirm}
    />
  </>;
}
