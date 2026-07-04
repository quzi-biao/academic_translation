import { useEffect, useState } from 'react';
import { Button, Card, Drawer, Form, Input, Modal, Select, Space, Table, Tag, Typography, App } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { adminApi } from '../api';

const { Title, Text } = Typography;

export default function TicketsPage() {
  const { message } = App.useApp();
  const [tickets, setTickets] = useState([]);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [preview, setPreview] = useState(null);
  const [form] = Form.useForm();
  const [detailForm] = Form.useForm();

  const load = async () => {
    const res = await adminApi.tickets.list();
    setTickets(res.tickets || []);
  };

  useEffect(() => { load(); }, []);

  const createTicket = async () => {
    const values = await form.validateFields();
    await adminApi.tickets.create(values);
    message.success('工单已创建');
    setOpen(false);
    form.resetFields();
    load();
  };

  const saveDetail = async () => {
    const values = await detailForm.validateFields();
    await adminApi.tickets.update(detail.id, values);
    message.success('已更新');
    setDetail(null);
    load();
  };

  const openDetail = (record) => {
    setDetail(record);
    detailForm.setFieldsValue(record);
  };

  const columns = [
    { title: '标题', dataIndex: 'title', key: 'title', ellipsis: true },
    { title: '用户', key: 'customer', render: (_, r) => r.customer?.username || r.customer?.phone || r.customer?.email || r.contactName || '匿名用户' },
    { title: '类型', dataIndex: 'type', key: 'type' },
    { title: '优先级', dataIndex: 'priority', key: 'priority' },
    { title: '状态', dataIndex: 'status', key: 'status', render: (v) => <Tag color={v === 'resolved' ? 'green' : 'blue'}>{v}</Tag> },
    { title: '留言数', key: 'msgs', render: (_, r) => r._count?.messages ?? 0 },
    {
      title: '操作',
      key: 'action',
      render: (_, r) => (
        <Space size={0}>
          <Button type="link" onClick={() => setPreview(r)}>查看内容</Button>
          <Button type="link" onClick={() => openDetail(r)}>处理</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <Text type="secondary">集中查看用户提交的问题反馈，并可直接补充回复内容。</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>新建工单</Button>
      </div>

      <Card>
        <Table rowKey="id" columns={columns} dataSource={tickets} pagination={false} size="small" />
      </Card>

      <Modal title="新建工单" open={open} onCancel={() => setOpen(false)} onOk={createTicket} destroyOnClose>
        <Form form={form} layout="vertical" initialValues={{ type: 'feedback', priority: 'medium' }}>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}><Input /></Form.Item>
          <Form.Item name="type" label="类型"><Select options={[{ value: 'feedback', label: '意见反馈' }, { value: 'payment', label: '支付退款' }, { value: 'refund', label: '退款' }, { value: 'other', label: '其他' }]} /></Form.Item>
          <Form.Item name="priority" label="优先级"><Select options={[{ value: 'low', label: '低' }, { value: 'medium', label: '中' }, { value: 'high', label: '高' }, { value: 'urgent', label: '紧急' }]} /></Form.Item>
          <Form.Item name="contactName" label="联系人"><Input /></Form.Item>
          <Form.Item name="contactPhone" label="联系电话"><Input /></Form.Item>
          <Form.Item name="description" label="描述" rules={[{ required: true, message: '请输入描述' }]}><Input.TextArea rows={5} /></Form.Item>
        </Form>
      </Modal>

      <Modal
        title="反馈内容"
        open={!!preview}
        footer={<Button type="primary" onClick={() => setPreview(null)}>关闭</Button>}
        onCancel={() => setPreview(null)}
        destroyOnClose
        width={720}
      >
        {preview && (
          <div style={{ display: 'grid', gap: 16 }}>
            <div>
              <Text type="secondary">标题</Text>
              <div style={{ marginTop: 6, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{preview.title || '未命名反馈'}</div>
            </div>
            <div>
              <Text type="secondary">反馈内容</Text>
              <div style={{ marginTop: 6, whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>{preview.description || '暂无内容'}</div>
            </div>
            {preview.resolution ? (
              <div>
                <Text type="secondary">当前回复</Text>
                <div style={{ marginTop: 6, whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>{preview.resolution}</div>
              </div>
            ) : null}
            {preview.messages && preview.messages.length > 0 ? (
              <div>
                <Text type="secondary">历史留言</Text>
                <div style={{ marginTop: 8, maxHeight: 260, overflow: 'auto', padding: 12, border: '1px solid #f0f0f0', borderRadius: 8, background: '#fafafa' }}>
                  {preview.messages.map((m) => (
                    <div key={m.id} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #f0f0f0' }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>{new Date(m.createdAt).toLocaleString()} [{m.authorType === 'customer' ? '客户' : '客服'}]</Text>
                      <div style={{ marginTop: 4, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{m.content}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </Modal>

      <Drawer title="处理工单" open={!!detail} onClose={() => setDetail(null)} width={520}>
        {detail && (
          <Form form={detailForm} layout="vertical" initialValues={detail}>
            <Form.Item name="title" label="标题"><Input /></Form.Item>
            <Form.Item name="status" label="状态"><Select options={[{ value: 'open', label: '待处理' }, { value: 'processing', label: '处理中' }, { value: 'waiting', label: '等待用户' }, { value: 'resolved', label: '已解决' }, { value: 'closed', label: '已关闭' }]} /></Form.Item>
            <Form.Item name="priority" label="优先级"><Select options={[{ value: 'low', label: '低' }, { value: 'medium', label: '中' }, { value: 'high', label: '高' }, { value: 'urgent', label: '紧急' }]} /></Form.Item>
            <Form.Item name="description" label="反馈内容"><Input.TextArea rows={5} /></Form.Item>
            <Form.Item name="resolution" label="回复内容"><Input.TextArea rows={4} /></Form.Item>
            <Button type="primary" onClick={saveDetail} style={{ marginBottom: 24 }}>保存</Button>
            
            {detail.messages && detail.messages.length > 0 && (
              <div>
                <Title level={5}>历史留言</Title>
                <div style={{ background: '#fafafa', padding: 12, borderRadius: 8 }}>
                  {detail.messages.map(m => (
                    <div key={m.id} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>{new Date(m.createdAt).toLocaleString()} [{m.authorType === 'customer' ? '客户' : '客服'}]</Text>
                      <div style={{ marginTop: 4 }}>{m.content}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Form>
        )}
      </Drawer>
    </div>
  );
}
