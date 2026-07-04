import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, LogOut } from 'lucide-react';
import { api, clearSession, getToken } from '../api';
import { ConfirmModal } from './Modals';

export function RequireAuth({ children }) {
  return getToken() ? children : <Navigate to="/login" replace />;
}

export function Shell({ children, contentClassName = '' }) {
  return <div className="app-shell">
    <main className={`main-panel ${contentClassName}`.trim()}>{children}</main>
  </div>;
}

export function HeaderMeta({ mode = 'logout', showBalance = true }) {
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

export function Header({ title, titlePrefix, action, metaMode = 'logout', showMetaBalance = true, showMeta = true }) {
  return <div className="page-header">
    <div className="page-header-side page-header-left">{showMeta && <HeaderMeta mode={metaMode} showBalance={showMetaBalance} />}{titlePrefix}</div>
    <div className="page-title-wrap"><h1>{title}</h1></div>
    <div className="page-header-side page-header-right">{action}</div>
  </div>;
}
