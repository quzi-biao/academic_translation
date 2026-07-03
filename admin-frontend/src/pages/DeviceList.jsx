import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Input, Button, Space, Typography, Card, Modal, Form, Select, App, Popconfirm } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import { adminApi } from '../api';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

const { Title, Text } = Typography;

function fmtDur(seconds) {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function DeviceList() {
  const { message } = App.useApp();
  const [data, setData] = useState({ total: 0, devices: [], onlineCount: 0 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterChannelId, setFilterChannelId] = useState(undefined);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // 编辑功能状态
  const [editOpen, setEditOpen] = useState(false);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [editingDevice, setEditingDevice] = useState(null);
  const [channels, setChannels] = useState([]);
  const [form] = Form.useForm();

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await adminApi.devices.list({ page, limit: 20, search, ...(filterChannelId ? { channelId: filterChannelId } : {}) });
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [page, search, filterChannelId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    adminApi.channels.list().then(res => setChannels(res.channels || [])).catch(() => {});
  }, []);

  // 每 15s 静默轮询，不显示 loading
  useEffect(() => {
    const t = setInterval(() => load(true), 15_000);
    return () => clearInterval(t);
  }, [load]);

  const handleDelete = async (id) => {
    try {
      await adminApi.devices.remove(id);
      message.success('设备已删除');
      load(true);
    } catch (err) {
      message.error(err.message || '删除失败');
    }
  };

  const saveEdit = async () => {
    try {
      const values = await form.validateFields();
      await adminApi.devices.patch(editingDevice.id, values);
      message.success('已更新');
      setEditOpen(false);
      load(true);
    } catch (err) {
      if (err.name !== 'ValidationError') {
        message.error(err.message || '更新失败');
      }
    }
  };

  const onlineCount = data.devices.filter(d => d.online).length;

  const columns = [
    {
      title: '设备码', dataIndex: 'deviceCode', key: 'deviceCode', ellipsis: true, width: 160,
      render: v => <span className="device-code">{v?.slice(0, 16)}…</span>,
    },
    {
      title: '版本', dataIndex: 'appVersion', key: 'appVersion', width: 80, ellipsis: true,
      render: v => v || <Text type="secondary">—</Text>,
    },
    {
      title: '点数', dataIndex: 'balance', key: 'balance', width: 70,
      render: v => <span style={{ fontWeight: 600, color: v > 0 ? '#4f46e5' : '#f5222d' }}>{v}</span>,
    },
    {
      title: '书', dataIndex: 'bookCount', key: 'bookCount', width: 55,
      render: v => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: '页', dataIndex: 'pageCount', key: 'pageCount', width: 55,
      render: v => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: '本次在线', key: 'session', width: 90,
      render: (_, d) => d.sessionSeconds
        ? <span style={{ color: '#52c41a', fontWeight: 500 }}>{fmtDur(d.sessionSeconds)}</span>
        : <Text type="secondary">离线</Text>,
    },
    {
      title: '渠道', dataIndex: 'channel', key: 'channel', width: 90, ellipsis: true,
      render: v => <Text type="secondary" style={{ fontSize: 12 }}>{v?.name || '—'}</Text>,
    },
    {
      title: '最后在线', dataIndex: 'lastSeenAt', key: 'lastSeenAt', width: 100,
      render: v => <Text type="secondary" style={{ fontSize: 12 }}>{v ? dayjs(v).fromNow() : '从未'}</Text>,
    },
    {
      title: '备注', dataIndex: 'notes', key: 'notes', ellipsis: true, width: 120,
      render: v => <Text type="secondary" style={{ fontSize: 12 }}>{v || '—'}</Text>,
    },
    {
      title: '操作', key: 'action', width: 160, fixed: 'right',
      render: (_, d) => (
        <Space>
          <Button type="link" size="small" onClick={() => {
            setEditingDevice(d);
            form.setFieldsValue({ notes: d.notes, channelId: d.channelId });
            setEditOpen(true);
          }}>
            编辑
          </Button>
          <Button type="link" size="small" onClick={() => navigate(`/admin/devices/${d.id}`)}>
            详情
          </Button>
          {isDeleteMode && (
            <Popconfirm
              title="确认删除此设备？"
              description="删除后相关数据将被清空且不可恢复。"
              onConfirm={() => handleDelete(d.id)}
              disabled={d.bookCount > 1 || d.pageCount > 1}
            >
              <Button 
                type="link" 
                danger 
                size="small" 
                disabled={d.bookCount > 1 || d.pageCount > 1}
                title={(d.bookCount > 1 || d.pageCount > 1) ? '设备包含超过1本书或页，无法删除' : ''}
              >
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, color: '#595959', fontSize: 13 }}>
        设备总数 <strong>{data.total}</strong> 台 &nbsp;·&nbsp;
        当前在线 <strong style={{ color: '#52c41a' }}>{onlineCount}</strong> 台
      </div>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <Space>
            <Select
              placeholder="按渠道筛选"
              allowClear
              style={{ width: 160 }}
              options={channels.map(c => ({ value: c.id, label: c.name }))}
              value={filterChannelId}
              onChange={v => { setFilterChannelId(v); setPage(1); }}
            />
            <Input.Search
              placeholder="搜索设备码、备注、型号…"
              allowClear enterButton={<SearchOutlined />}
              style={{ width: 300 }}
              onSearch={v => { setSearch(v); setPage(1); }}
            />
            <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
          </Space>
          <Button 
            danger={isDeleteMode} 
            onClick={() => setIsDeleteMode(!isDeleteMode)}
          >
            {isDeleteMode ? '退出删除模式' : '删除设备'}
          </Button>
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data.devices}
          loading={loading}
          size="small"
          scroll={{ x: 900 }}
          pagination={{
            current: page, pageSize: 20, total: data.total,
            showSizeChanger: false, showTotal: t => `共 ${t} 条`,
            onChange: p => setPage(p),
          }}
        />
      </Card>

      <Modal title="编辑设备" open={editOpen} onCancel={() => setEditOpen(false)} onOk={saveEdit} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="channelId" label="关联渠道">
            <Select allowClear placeholder="请选择渠道" options={channels.map(c => ({ value: c.id, label: c.name }))} />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} placeholder="输入备注信息" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
