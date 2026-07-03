import { useEffect, useState } from 'react';
import { Card, Col, Row, Statistic, Table, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { adminApi } from '../api';

const { Title, Text } = Typography;

function fenToYuan(fen) {
  return `¥${(Number(fen || 0) / 100).toFixed(2)}`;
}

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.dashboard.metrics().then(({ metrics }) => setData(metrics)).finally(() => setLoading(false));
  }, []);

  if (loading) return <Card loading />;
  if (!data) return <div>暂无数据</div>;

  const orderStatusMap = {
    pending: { label: '未支付', color: 'default' },
    paid: { label: '已支付', color: 'green' },
    refunded: { label: '已退款', color: 'red' },
    cancelled: { label: '已取消', color: 'default' },
  };

  const ticketTypeMap = {
    system: '系统通知',
    feedback: '客户反馈',
  };

  const ticketStatusMap = {
    open: { label: '开启', color: 'blue' },
    processing: { label: '处理中', color: 'orange' },
    waiting: { label: '等待客户回复', color: 'orange' },
    resolved: { label: '已解决', color: 'green' },
    closed: { label: '已关闭', color: 'default' },
  };

  const orderColumns = [
    { title: '订单', dataIndex: 'id', key: 'id', width: 380, ellipsis: true },
    { title: '金额', dataIndex: 'amount', key: 'amount', width: 180, ellipsis: true, render: (v) => fenToYuan(v) },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 150, ellipsis: true, render: (v) => {
        const s = orderStatusMap[v] || { label: v, color: 'default' };
        return <Tag color={s.color}>{s.label}</Tag>;
      }
    },
    { title: '设备', key: 'device', ellipsis: true, render: (_, r) => r.device ? <Link to={`/admin/devices/${r.deviceId}`}>{r.device.deviceCode}</Link> : '—' },
    { title: '渠道名称', key: 'channel', ellipsis: true, render: (_, r) => r.channel ? <Link to={`/admin/channels/${r.channelId}`}>{r.channel.name}</Link> : '—' },
  ];

  const ticketColumns = [
    { title: '工单', dataIndex: 'title', key: 'title', ellipsis: true },
    { title: '类型', dataIndex: 'type', key: 'type', render: (v) => ticketTypeMap[v] || v },
    {
      title: '状态', dataIndex: 'status', key: 'status', render: (v) => {
        const s = ticketStatusMap[v] || { label: v, color: 'default' };
        return <Tag color={s.color}>{s.label}</Tag>;
      }
    },
    { title: '设备', key: 'device', render: (_, r) => r.device ? <Link to={`/admin/devices/${r.deviceId}`}>{r.device.deviceCode}</Link> : '—' },
    { title: '渠道名称', key: 'channel', render: (_, r) => r.channel ? <Link to={`/admin/channels/${r.channelId}`}>{r.channel.name}</Link> : '—' },
  ];

  return (
    <div>
      <Text type="secondary">日活、留存、退货率等后续可继续加；当前先给你一个可运营的基础版。</Text>

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={6}><Card><Statistic title="设备数" value={data.deviceCount} /></Card></Col>
        <Col span={6}><Card><Statistic title="在线会话" value={data.onlineCount} /></Card></Col>
        <Col span={6}><Card><Statistic title="订单数" value={data.orders} /></Card></Col>
        <Col span={6}><Card><Statistic title="收入" value={fenToYuan(data.revenueFen)} /></Card></Col>
      </Row>

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={6}><Card><Statistic title="有效渠道" value={data.channels} /></Card></Col>
        <Col span={6}><Card><Statistic title="工单数" value={data.tickets} /></Card></Col>
        <Col span={6}><Card><Statistic title="开放工单" value={data.openTickets} /></Card></Col>
        <Col span={6}><Card><Statistic title="客单价" value={fenToYuan(data.avgOrderFen)} /></Card></Col>
      </Row>

      <Card title="最近订单" style={{ marginTop: 16 }}>
        <Table rowKey="id" columns={orderColumns} dataSource={data.recentOrders} pagination={false} size="small" />
      </Card>

      <Card title="最近工单" style={{ marginTop: 16 }}>
        <Table rowKey="id" columns={ticketColumns} dataSource={data.recentTickets} pagination={false} size="small" />
      </Card>
    </div>
  );
}
