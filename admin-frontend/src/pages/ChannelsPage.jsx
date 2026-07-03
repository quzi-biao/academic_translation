import { useEffect, useState } from 'react';
import { Button, Card, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tag, Typography, App } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { adminApi } from '../api';

const { Title, Text } = Typography;

const CHANNEL_TYPES = {
  affiliate: '分销商',
  manager: '客户经理',
  partner: '合作伙伴',
};

export default function ChannelsPage() {
  const { message } = App.useApp();
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminApi.channels.list();
      setChannels(res.channels || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    const values = await form.validateFields();
    const body = { ...values };
    try {
      if (editing) {
        await adminApi.channels.update(editing.id, body);
        message.success('已更新');
      } else {
        await adminApi.channels.create(body);
        message.success('已创建');
      }
      setOpen(false);
      setEditing(null);
      form.resetFields();
      load();
    } catch (err) {
      message.error(err.message);
    }
  };

  const columns = [
    { title: '名称', dataIndex: 'name', key: 'name', render: (n, r) => <Link to={`/admin/channels/${r.id}`}>{n}</Link> },
    { title: '类型', dataIndex: 'type', key: 'type', render: (v) => <Tag>{CHANNEL_TYPES[v] || v}</Tag> },
    { title: '硬件分润', dataIndex: 'hardwareCommissionFen', key: 'hardwareCommissionFen', render: (v) => `¥${(v / 100).toFixed(2)}` },
    { title: '订阅分润', dataIndex: 'subscriptionCommissionRate', key: 'subscriptionCommissionRate', render: (v) => `${Math.round((v || 0) * 100)}%` },
    { title: '设备数', key: 'devices', render: (_, r) => r._count?.devices ?? 0 },
    { title: '工单数', key: 'tickets', render: (_, r) => r._count?.tickets ?? 0 },
    { title: '总分润', dataIndex: 'totalCommissionFen', key: 'totalCommissionFen', render: (v) => <Text strong style={{ color: '#cf1322' }}>¥{((v || 0) / 100).toFixed(2)}</Text> },
    { title: '未结算分润', dataIndex: 'pendingCommissionFen', key: 'pendingCommissionFen', render: (v) => <Text style={{ color: '#fa8c16' }}>¥{((v || 0) / 100).toFixed(2)}</Text> },
    { title: '联系人', dataIndex: 'contactName', key: 'contactName' },
    { title: '状态', dataIndex: 'isActive', key: 'isActive', render: (v) => <Tag color={v ? 'green' : 'red'}>{v ? '启用' : '禁用'}</Tag> },
    {
      title: '操作', key: 'action', render: (_, r) => (
        <Space>
          <Button type="link" onClick={() => { setEditing(r); setOpen(true); form.setFieldsValue(r); }}>编辑</Button>
          <Popconfirm title="确认删除？" onConfirm={async () => { await adminApi.channels.remove(r.id); load(); }}>
            <Button type="link" danger>删除</Button>
          </Popconfirm>
        </Space>
      )
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <Text type="secondary">先把渠道主体、联系人、分润规则和启停状态管起来。</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); form.resetFields(); setOpen(true); }}>新增渠道</Button>
      </div>

      <Card>
        <Table rowKey="id" columns={columns} dataSource={channels} loading={loading} pagination={false} size="small" />
      </Card>

      <Modal title={editing ? '编辑渠道' : '新增渠道'} open={open} onCancel={() => setOpen(false)} onOk={save} destroyOnClose>
        <Form form={form} layout="vertical" initialValues={{ type: 'affiliate', hardwareCommissionFen: 300, subscriptionCommissionRate: 0.2, isActive: true }}>
          <Form.Item name="name" label="渠道名称" rules={[{ required: true, message: '请输入渠道名称' }]}><Input /></Form.Item>
          <Form.Item name="type" label="渠道类型"><Select options={[{ value: 'affiliate', label: '分销商' }, { value: 'manager', label: '客户经理' }, { value: 'partner', label: '合作伙伴' }]} /></Form.Item>
          <Form.Item name="contactName" label="联系人"><Input /></Form.Item>
          <Form.Item name="contactPhone" label="联系电话"><Input /></Form.Item>
          <Form.Item name="hardwareCommissionFen" label="硬件分润（分）"><InputNumber style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="subscriptionCommissionRate" label="订阅分润比例"><InputNumber style={{ width: '100%' }} min={0} max={1} step={0.05} /></Form.Item>
          <Form.Item name="notes" label="备注"><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="isActive" label="启用" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
