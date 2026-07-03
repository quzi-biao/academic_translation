import { useEffect, useState } from 'react';
import { Card, Table, Space, Button, Modal, Form, Input, App, Typography } from 'antd';
import { EditOutlined, PlusOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import { adminApi } from '../api';

const { Title } = Typography;

export default function AgreementsPage() {
  const { message, modal } = App.useApp();
  const [agreements, setAgreements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [viewingContent, setViewingContent] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminApi.agreements.list();
      setAgreements(res.agreements || []);
    } catch (err) {
      message.error(err.message || '获取内容失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (editingId) {
        await adminApi.agreements.update(editingId, values);
        message.success('更新成功');
      } else {
        await adminApi.agreements.create(values);
        message.success('创建成功');
      }
      setOpen(false);
      load();
    } catch (err) {
      if (err.name !== 'ValidationError') {
        message.error(err.message || '保存失败');
      }
    }
  };

  const handleDelete = (id) => {
    modal.confirm({
      title: '确认删除该内容吗？',
      content: '删除后客户端将无法拉取到该内容。',
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        try {
          await adminApi.agreements.remove(id);
          message.success('已删除');
          load();
        } catch (err) {
          message.error(err.message || '删除失败');
        }
      }
    });
  };

  const columns = [
    { title: '内容名称', dataIndex: 'title', key: 'title' },
    { title: '标识 (Name)', dataIndex: 'name', key: 'name' },
    { title: '更新时间', dataIndex: 'updatedAt', key: 'updatedAt', render: v => new Date(v).toLocaleString() },
    {
      title: '操作',
      key: 'action',
      render: (_, r) => (
        <Space>
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => setViewingContent(r)}
          >
            查看
          </Button>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => {
              setEditingId(r.id);
              form.setFieldsValue(r);
              setOpen(true);
            }}
          >
            编辑
          </Button>
          <Button type="link" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r.id)}>删除</Button>
        </Space>
      )
    }
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>内容管理</Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setEditingId(null);
            form.resetFields();
            setOpen(true);
          }}
        >
          添加内容
        </Button>
      </div>

      <Card>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={agreements}
          pagination={false}
        />
      </Card>

      <Modal
        title={editingId ? '编辑内容' : '添加内容'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={handleSave}
        width={800}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="内容标题 (展示名称)" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="如：用户服务内容" />
          </Form.Item>
          <Form.Item
            name="name"
            label="内容标识 (英文标识)"
            rules={[{ required: true, message: '请输入英文标识' }]}
            help="客户端根据此标识拉取内容内容，如：user_agreement, privacy_policy"
          >
            <Input placeholder="如：user_agreement" />
          </Form.Item>
          <Form.Item name="content" label="内容正文内容" rules={[{ required: true, message: '请输入正文' }]}>
            <Input.TextArea rows={14} placeholder="支持文本或 HTML..." />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={viewingContent?.title}
        open={!!viewingContent}
        onCancel={() => setViewingContent(null)}
        footer={null}
        width={800}
        destroyOnClose
      >
        <div style={{ maxHeight: '70vh', overflowY: 'auto' }} dangerouslySetInnerHTML={{ __html: viewingContent?.content || '' }} />
      </Modal>
    </div>
  );
}
