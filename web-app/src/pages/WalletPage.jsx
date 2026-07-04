import React, { useEffect, useState } from 'react';
import { Coins } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { api } from '../api';
import { Header, Shell } from '../components/Layout';

export default function WalletPage() {
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

  useEffect(() => {
    load();
    const t = setInterval(() => { setNowTick(Date.now()); load(); }, 5000);
    return () => clearInterval(t);
  }, []);

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
    } catch (e) {
      setErr(e.message);
    }
  };

  const cancelOrder = async (orderId) => {
    try {
      setErr('');
      await api(`/payment/cancel/${orderId}`, { method: 'POST' });
      if (pay?.orderId === orderId) setPay(null);
      setPaymentModal({ type: 'info', title: '订单已取消', message: '当前支付流程已关闭。' });
      await load();
    } catch (e) {
      setErr(e.message);
    }
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
    {activeTab === 'orders' && <div className="orders">{orders.map((order) => {
      const remainingSeconds = order.status === 'pending'
        ? Math.max(0, order.remainingSeconds ?? Math.ceil((new Date(order.createdAt).getTime() + 300000 - nowTick) / 1000))
        : 0;
      return <div key={order.id}><span>{order.plan?.name || '自定义充值'}</span><b>{order.status === 'pending' ? `待支付 ${remainingSeconds}s` : order.status}</b><small>{order.amount / 100} 元 · {order.points} 点</small>{order.status === 'pending' && <div className="inline-actions"><button className="ghost" onClick={() => reopenOrder(order.id)}>继续支付</button><button className="ghost danger" onClick={() => cancelOrder(order.id)}>取消</button></div>}</div>;
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
