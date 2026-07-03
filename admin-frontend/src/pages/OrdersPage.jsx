import { useEffect, useState } from 'react';
import { App, Button, Card, Space, Table, Tag } from 'antd';

async function request(path, options = {}) {
  const token = localStorage.getItem('admin_token');
  const res = await fetch(`/api/admin${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

export default function OrdersPage() {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const load = async () => { setLoading(true); try { const data = await request('/orders'); setOrders(data.orders || []); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const refund = async (id) => { try { await request(`/orders/${id}/refund`, { method: 'POST' }); message.success('已发起退款'); load(); } catch (e) { message.error(e.message); } };
  return <Card title="订单管理"><Table rowKey="id" loading={loading} dataSource={orders} columns={[{ title:'订单号', dataIndex:'id', ellipsis:true }, { title:'用户', render:(_,r)=>r.customer?.username || r.customer?.phone || r.customer?.email }, { title:'套餐', render:(_,r)=>r.plan?.name || '自定义充值' }, { title:'金额', dataIndex:'amount', render:v=>`${v/100} 元` }, { title:'点数', dataIndex:'points' }, { title:'状态', dataIndex:'status', render:s=><Tag>{s}</Tag> }, { title:'创建时间', dataIndex:'createdAt', render:v=>new Date(v).toLocaleString() }, { title:'操作', render:(_,r)=><Space>{r.status==='paid' && <Button danger onClick={()=>refund(r.id)}>退款</Button>}</Space> }]} /></Card>;
}
