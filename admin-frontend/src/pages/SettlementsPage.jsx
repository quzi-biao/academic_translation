import { useEffect, useState } from 'react';
import { Button, Card, DatePicker, Form, Input, Modal, Select, Space, Table, Tag, Typography, App } from 'antd';
import { adminApi } from '../api';

const { Title, Text } = Typography;

export default function SettlementsPage() {
  const { message } = App.useApp();
  const [settlements, setSettlements] = useState([]);
  const [channels, setChannels] = useState([]);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    const [sRes, cRes] = await Promise.all([adminApi.settlements.list(), adminApi.channels.list()]);
    setSettlements(sRes.settlements || []);
    setChannels(cRes.channels || []);
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    const values = await form.validateFields();
    await adminApi.settlements.generate(values);
    message.success('已生成结算草稿');
    setOpen(false);
    form.resetFields();
    load();
  };

  const columns = [
    { title: '渠道', dataIndex: ['channel', 'name'], key: 'channel' },
    { title: '区间', key: 'range', render: (_, r) => `${String(r.periodStart).slice(0, 10)} ~ ${String(r.periodEnd).slice(0, 10)}` },
    { title: '订单数', dataIndex: 'hardwareOrderCount', key: 'hardwareOrderCount' },
    { title: '渠道分润', dataIndex: 'totalCommissionFen', key: 'totalCommissionFen', render: (v) => `¥${(v / 100).toFixed(2)}` },
    { title: '状态', dataIndex: 'status', key: 'status', render: (v) => <Tag>{v}</Tag> },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>结算报表</Title>
          <Text type="secondary">先生成渠道分润草稿，后续可继续加人工审核和打款状态。</Text>
        </div>
        <Button type="primary" onClick={() => setOpen(true)}>生成结算草稿</Button>
      </div>
      <Card>
        <Table rowKey="id" columns={columns} dataSource={settlements} pagination={false} size="small" />
      </Card>
      <Modal title="生成结算草稿" open={open} onCancel={() => setOpen(false)} onOk={create} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="channelId" label="渠道" rules={[{ required: true, message: '请选择渠道' }]}>
            <Select options={channels.map((c) => ({ value: c.id, label: c.name }))} />
          </Form.Item>
          <Form.Item name="periodStart" label="开始时间" rules={[{ required: true, message: '请输入开始时间' }]}>
            <Input placeholder="2026-06-01T00:00:00.000Z" />
          </Form.Item>
          <Form.Item name="periodEnd" label="结束时间" rules={[{ required: true, message: '请输入结束时间' }]}>
            <Input placeholder="2026-06-30T23:59:59.000Z" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
