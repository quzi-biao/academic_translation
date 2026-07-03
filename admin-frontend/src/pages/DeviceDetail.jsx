import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Descriptions, Statistic, Table, Tabs, Button, Tag, Select,
  Modal, Form, Input, InputNumber, Space, Typography, Row, Col, App,
} from 'antd';
import { ArrowLeftOutlined, EditOutlined, AppstoreOutlined } from '@ant-design/icons';
import { adminApi } from '../api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

function fmtDur(s) {
  if (!s) return '0s';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export default function DeviceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const [device, setDevice] = useState(null);
  const [stats, setStats] = useState(null);
  const [points, setPoints] = useState({ total: 0, ledger: [], balance: 0 });
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [grantOpen, setGrantOpen] = useState(false);
  const [grantLoading, setGrantLoading] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [selVersion, setSelVersion] = useState(null);
  const [form] = Form.useForm();

  const loadAll = async () => {
    try {
      const [dRes, sRes, pRes, vRes] = await Promise.all([
        adminApi.devices.get(id),
        adminApi.devices.stats(id),
        adminApi.devices.points.list(id, { limit: 30 }),
        adminApi.versions.list(),
      ]);
      setDevice(dRes.device);
      setStats(sRes);
      setPoints(pRes);
      setVersions(vRes.versions || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, [id]);

  // ── 手动调整点数 ──
  const handleGrant = async (values) => {
    setGrantLoading(true);
    try {
      await adminApi.devices.points.grant(id, { delta: values.delta, reason: values.reason });
      message.success('点数调整成功');
      form.resetFields();
      setGrantOpen(false);
      const [dRes, pRes] = await Promise.all([adminApi.devices.get(id), adminApi.devices.points.list(id, { limit: 30 })]);
      setDevice(dRes.device);
      setPoints(pRes);
    } catch (err) {
      message.error(err.message);
    } finally {
      setGrantLoading(false);
    }
  };

  // ── 设置专属版本 ──
  const handleSetVersion = async () => {
    try {
      await adminApi.devices.patch(id, { targetVersionId: selVersion || null });
      message.success(selVersion ? '专属版本已设定' : '专属版本已清除');
      setVersionOpen(false);
      const dRes = await adminApi.devices.get(id);
      setDevice(dRes.device);
    } catch (err) {
      message.error(err.message);
    }
  };

  if (loading) return <Card loading style={{ margin: 24 }} />;
  if (!device) return <div>设备不存在</div>;

  // 当前目标版本信息
  const targetVersion = versions.find((v) => v.id === device.targetVersionId);

  const pointsColumns = [
    { title: '时间', dataIndex: 'createdAt', key: 'createdAt', width: 140, render: v => <Text style={{ fontSize: 12 }}>{dayjs(v).format('MM-DD HH:mm:ss')}</Text> },
    { title: '变动', dataIndex: 'delta', key: 'delta', width: 80, render: v => <span style={{ color: v > 0 ? '#52c41a' : '#f5222d', fontWeight: 600 }}>{v > 0 ? '+' : ''}{v}</span> },
    { title: '余额', dataIndex: 'balance', key: 'balance', width: 80 },
    { title: '类型', dataIndex: 'type', key: 'type', width: 90, render: v => <Tag color="purple" style={{ fontSize: 11 }}>{v}</Tag> },
    { title: '备注', dataIndex: 'reason', key: 'reason', width: 160, ellipsis: true, render: v => <Text type="secondary" style={{ fontSize: 12 }}>{v || '—'}</Text> },
  ];

  const sessionColumns = [
    { title: '开始时间', dataIndex: 'startAt', key: 'startAt', render: v => dayjs(v).format('MM-DD HH:mm:ss') },
    { title: '结束时间', dataIndex: 'endAt', key: 'endAt', render: v => v ? dayjs(v).format('MM-DD HH:mm:ss') : <Tag color="success">进行中</Tag> },
    { title: '时长', dataIndex: 'durationSeconds', key: 'dur', render: v => fmtDur(v) },
  ];

  const tabItems = [
    {
      key: 'info', label: '设备信息',
      children: (
        <Descriptions bordered size="small" column={1}>
          <Descriptions.Item label="设备码"><span className="device-code">{device.deviceCode}</span></Descriptions.Item>
          <Descriptions.Item label="设备指纹"><Text code style={{ fontSize: 11 }}>{device.fingerprint}</Text></Descriptions.Item>
          <Descriptions.Item label="型号">{device.deviceModel || '—'}</Descriptions.Item>
          <Descriptions.Item label="系统版本">{device.osVersion || '—'}</Descriptions.Item>
          <Descriptions.Item label="App 版本">{device.appVersion || '—'}</Descriptions.Item>
          <Descriptions.Item label="备注">{device.notes || '—'}</Descriptions.Item>
          <Descriptions.Item label="注册时间">{dayjs(device.createdAt).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
          <Descriptions.Item label="OTA 专属版本">
            <Space>
              {targetVersion
                ? <Tag color="blue">{targetVersion.versionName} (v{targetVersion.versionCode})</Tag>
                : <Text type="secondary">跟随全局版本</Text>}
              <Button
                size="small"
                icon={<AppstoreOutlined />}
                onClick={() => { setSelVersion(device.targetVersionId || null); setVersionOpen(true); }}
              >
                设定
              </Button>
            </Space>
          </Descriptions.Item>
        </Descriptions>
      ),
    },
    {
      key: 'points', label: `点数流水 (${points.balance})`,
      children: (
        <div>
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text>余额：<strong style={{ color: '#4f46e5' }}>{points.balance}</strong> 点</Text>
            <Button type="primary" size="small" icon={<EditOutlined />} onClick={() => setGrantOpen(true)}>手动调整</Button>
          </div>
          <Table rowKey="id" columns={pointsColumns} dataSource={points.ledger} size="small" pagination={false} />
        </div>
      ),
    },
    {
      key: 'sessions', label: '会话记录',
      children: (
        <Table rowKey={(_, i) => i} columns={sessionColumns} dataSource={stats?.recentSessions || []} size="small" pagination={false} />
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Button
          shape="circle"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(-1)}
          style={{ width: 36, height: 36, minWidth: 36, fontSize: 16 }}
        />
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="device-code" style={{ fontSize: 14, fontWeight: 600 }}>{device.deviceCode?.slice(0, 20)}…</span>
            {device.online ? <Tag color="success">在线</Tag> : <Tag color="default">离线</Tag>}
          </div>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 2 }}>
            {device.deviceModel || '未知型号'} · {device.appVersion || '—'} · 最后在线 {device.lastSeenAt ? dayjs(device.lastSeenAt).format('MM-DD HH:mm') : '从未'}
          </div>
        </div>
      </div>

      <Row gutter={12} style={{ marginBottom: 20 }}>
        {[
          { title: '学习点数', value: device.wallet?.balance ?? 0, color: '#4f46e5' },
          { title: '本次在线', value: fmtDur(device.sessionSeconds) },
          { title: '累计在线', value: fmtDur(device.totalOnlineSeconds) },
          { title: '主题数', value: stats?.bookCount ?? 0 },
          { title: '页面数', value: stats?.pageCount ?? 0 },
          { title: '区域解读', value: stats?.annotationCount ?? 0 },
          { title: 'TTS 时长', value: `${Math.round((stats?.ttsSeconds ?? 0) / 60)} 分钟` },
          { title: '生成字数', value: `${Math.round((stats?.totalChars ?? 0) / 1000)} 千字` },
        ].map((s, i) => (
          <Col key={i}>
            <Card size="small" style={{ minWidth: 90, textAlign: 'center' }}>
              <Statistic title={s.title} value={s.value} valueStyle={s.color ? { color: s.color, fontSize: 18 } : { fontSize: 18 }} />
            </Card>
          </Col>
        ))}
      </Row>

      <Card>
        <Tabs items={tabItems} />
      </Card>

      {/* 手动调整点数 */}
      <Modal title="手动调整点数" open={grantOpen} onCancel={() => { setGrantOpen(false); form.resetFields(); }} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleGrant} style={{ marginTop: 16 }}>
          <Form.Item name="delta" label="变动点数（正数增加，负数扣除）" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} placeholder="如 100 或 -50" />
          </Form.Item>
          <Form.Item name="reason" label="备注原因">
            <Input placeholder="操作原因（可选）" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={grantLoading} block>确认调整</Button>
        </Form>
      </Modal>

      {/* 设定专属 OTA 版本 */}
      <Modal
        title="设定专属 OTA 版本"
        open={versionOpen}
        onCancel={() => setVersionOpen(false)}
        onOk={handleSetVersion}
        okText="确认"
        cancelText="取消"
      >
        <div style={{ marginTop: 16 }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            为该设备指定独立推送版本，优先级高于全局当前版本。留空则跟随全局版本。
          </Text>
          <Select
            style={{ width: '100%' }}
            allowClear
            placeholder="选择版本（留空=跟随全局）"
            value={selVersion}
            onChange={setSelVersion}
            options={versions.map((v) => ({
              value: v.id,
              label: `${v.versionName}  (v${v.versionCode})${v.isCurrent ? ' ✦ 当前全局' : ''}`,
            }))}
          />
        </div>
      </Modal>
    </div>
  );
}
