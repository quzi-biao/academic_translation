import React from 'react';

export function ConfirmModal({ open, title, message, confirmText = '确认', cancelText = '取消', tone = 'default', onConfirm, onCancel }) {
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

export function NoticeModal({ open, title, message, tone = 'info', confirmText = '知道了', onConfirm }) {
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

export function RenameModal({ open, currentName = '', value, onChange, onConfirm, onCancel, busy = false }) {
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

export function BlockDeleteModal({ open, block, onConfirm, onCancel, busy = false }) {
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
