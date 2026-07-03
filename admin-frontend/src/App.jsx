import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation, Link } from 'react-router-dom';
import { ConfigProvider, Layout, Menu, Avatar, Dropdown, App as AntApp, Card, Table, Tag, Button, Statistic, Space } from 'antd';
import { FileTextOutlined, LogoutOutlined, DownOutlined, SettingOutlined, ShoppingOutlined, UserOutlined, DashboardOutlined } from '@ant-design/icons';
import zhCN from 'antd/locale/zh_CN';
import LoginPage from './pages/LoginPage';
import PlansPage from './pages/PlansPage';
import ConfigPage from './pages/ConfigPage';
import OrdersPage from './pages/OrdersPage';
import { adminApi } from './api';
import './index.css';

const { Sider, Content } = Layout;
const request = async (path) => {
  const token = localStorage.getItem('admin_token');
  const res = await fetch(`/api/admin${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
};

function RequireAuth({ children }) {
  return localStorage.getItem('admin_token') ? children : <Navigate to="/admin/login" replace />;
}

function DashboardPage() {
  const [metrics, setMetrics] = useState(null);
  useEffect(() => { request('/dashboard').then((d) => setMetrics(d.metrics)); }, []);
  return <Space direction="vertical" size={18} style={{ width: '100%' }}>
    <div className="page-title"><h2>经营看板</h2></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
      <Card><Statistic title="用户数" value={metrics?.customerCount || 0}/></Card>
      <Card><Statistic title="文档数" value={metrics?.documentCount || 0}/></Card>
      <Card><Statistic title="完成翻译" value={metrics?.completedDocuments || 0}/></Card>
      <Card><Statistic title="收入" value={(metrics?.revenueFen || 0) / 100} suffix="元"/></Card>
    </div>
    <Card title="最近文档"><Table rowKey="id" dataSource={metrics?.recentDocuments || []} pagination={false} columns={[{ title:'文件名', dataIndex:'originalName' }, { title:'状态', dataIndex:'status', render:s=><Tag>{s}</Tag> }, { title:'用户', render:(_,r)=>r.customer?.username || r.customer?.phone || r.customer?.email }, { title:'进度', dataIndex:'progress', render:v=>`${v}%` }]} /></Card>
  </Space>;
}

function CustomersPage() {
  const [data, setData] = useState({ customers: [], total: 0 });
  const load = () => request('/customers').then(setData);
  useEffect(load, []);
  const grant = async (id) => { const delta = Number(prompt('增加多少点？', '100')); if (delta > 0) { await fetch(`/api/admin/customers/${id}/points`, { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${localStorage.getItem('admin_token')}` }, body: JSON.stringify({ delta, reason:'后台手动增点' }) }); load(); } };
  return <Card title="用户管理"><Table rowKey="id" dataSource={data.customers} columns={[{ title:'账号', render:(_,r)=>r.username || r.phone || r.email }, { title:'状态', dataIndex:'status', render:s=><Tag color={s==='active'?'green':'red'}>{s}</Tag> }, { title:'余额', render:(_,r)=>r.wallet?.balance ?? 0 }, { title:'文档', render:(_,r)=>r._count?.documents ?? 0 }, { title:'订单', render:(_,r)=>r._count?.orders ?? 0 }, { title:'操作', render:(_,r)=><Button onClick={()=>grant(r.id)}>增点</Button> }]} /></Card>;
}

function DocumentsPage() {
  const [data, setData] = useState({ documents: [], total: 0 });
  useEffect(() => { request('/documents').then(setData); }, []);
  return <Card title="翻译文档"><Table rowKey="id" dataSource={data.documents} columns={[{ title:'文件名', dataIndex:'originalName' }, { title:'用户', render:(_,r)=>r.customer?.username || r.customer?.phone || r.customer?.email }, { title:'状态', dataIndex:'status', render:s=><Tag>{s}</Tag> }, { title:'进度', dataIndex:'progress', render:v=>`${v}%` }, { title:'块数', render:(_,r)=>`${r.translatedBlocks}/${r.totalBlocks}` }, { title:'点数', dataIndex:'pointCost' }]} /></Card>;
}

function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = (() => { try { return JSON.parse(localStorage.getItem('admin_user') || 'null'); } catch { return null; } })();
  const logout = () => { localStorage.removeItem('admin_token'); localStorage.removeItem('admin_user'); navigate('/admin/login'); };
  const selectedKey = location.pathname.split('/')[2] || 'dashboard';
  const menuItems = [
    { key:'dashboard', icon:<DashboardOutlined/>, label:'经营看板' },
    { key:'customers', icon:<UserOutlined/>, label:'用户管理' },
    { key:'documents', icon:<FileTextOutlined/>, label:'翻译文档' },
    { key:'orders', icon:<ShoppingOutlined/>, label:'订单管理' },
    { key:'plans', icon:<ShoppingOutlined/>, label:'套餐管理' },
    { key:'config', icon:<SettingOutlined/>, label:'全局配置' },
  ];
  return <Layout className="admin-layout"><Sider width={220} className="admin-sider" theme="light"><Link className="admin-logo" to="/admin/dashboard">闻一翻译</Link><Menu mode="inline" selectedKeys={[selectedKey]} items={menuItems} onClick={({key})=>navigate(`/admin/${key}`)}/></Sider><Layout><div className="admin-header"><span style={{ flex: 1, color: '#8c8c8c' }}>{menuItems.find(m=>m.key===selectedKey)?.label}</span><Dropdown menu={{ items:[{key:'logout', icon:<LogoutOutlined/>, label:'退出登录', danger:true}], onClick:logout }}><span style={{ cursor:'pointer', display:'flex', alignItems:'center', gap:8 }}><Avatar size={28}>{user?.username?.[0]?.toUpperCase() || 'A'}</Avatar>{user?.username || '管理员'}<DownOutlined style={{fontSize:10}}/></span></Dropdown></div><Content className="admin-content"><Routes><Route path="dashboard" element={<DashboardPage/>}/><Route path="customers" element={<CustomersPage/>}/><Route path="documents" element={<DocumentsPage/>}/><Route path="orders" element={<OrdersPage/>}/><Route path="plans" element={<PlansPage/>}/><Route path="config" element={<ConfigPage/>}/><Route index element={<Navigate to="dashboard" replace/>}/></Routes></Content></Layout></Layout>;
}

export default function App() {
  return <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: '#1f3327', borderRadius: 10 } }}><AntApp><BrowserRouter><Routes><Route path="/admin/login" element={<LoginPage/>}/><Route path="/admin/*" element={<RequireAuth><AdminLayout/></RequireAuth>}/><Route path="*" element={<Navigate to="/admin" replace/>}/></Routes></BrowserRouter></AntApp></ConfigProvider>;
}
