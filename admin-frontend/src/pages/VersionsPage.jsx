import { useState, useEffect } from 'react';
import {
  Table, Button, Tag, Modal, Form, Input, InputNumber,
  Checkbox, Space, Typography, Card, App, Upload,
} from 'antd';
import {
  PlusOutlined, CheckOutlined, DeleteOutlined, ReloadOutlined,
  DownloadOutlined, InboxOutlined, StopOutlined,
} from '@ant-design/icons';
import { adminApi } from '../api';
import dayjs from 'dayjs';

const { Text } = Typography;
const { Dragger } = Upload;

function CreateModal({ open, onClose, onCreated }) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [apkFile, setApkFile] = useState(null);

  const submit = async (values) => {
    if (!apkFile) { message.error('请选择 APK 文件'); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('versionCode',  String(parseInt(values.versionCode)));
      fd.append('versionName',  values.versionName);
      fd.append('changelog',    values.changelog || '');
      fd.append('forceUpgrade', values.forceUpgrade ? 'true' : 'false');
      fd.append('file',         apkFile, apkFile.name);
      await adminApi.versions.create(fd);
      message.success('版本发布成功，APK 已上传至 OSS');
      form.resetFields();
      setApkFile(null);
      onCreated();
    } catch (err) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => { form.resetFields(); setApkFile(null); onClose(); };

  return (
    <Modal title="发布新版本" open={open} onCancel={handleClose} footer={null} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={submit} style={{ marginTop: 16 }}>
        <Form.Item name="versionCode" label="版本号（versionCode，整数）" rules={[{ required: true }]}>
          <InputNumber style={{ width: '100%' }} placeholder="如 10" min={1} />
        </Form.Item>
        <Form.Item name="versionName" label="版本名（versionName）" rules={[{ required: true }]}>
          <Input placeholder="如 1.0.0" />
        </Form.Item>
        <Form.Item label="APK 文件" required>
          <Dragger
            accept=".apk"
            maxCount={1}
            beforeUpload={(file) => { setApkFile(file); return false; }}
            onRemove={() => setApkFile(null)}
            fileList={apkFile ? [{ uid: '1', name: apkFile.name, status: 'done' }] : []}
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">点击或拖拽 APK 文件到此区域</p>
            <p className="ant-upload-hint">仅支持 .apk 文件，最大 200MB，上传后自动存储到 OSS</p>
          </Dragger>
        </Form.Item>
        <Form.Item name="changelog" label="更新日志">
          <Input.TextArea rows={3} placeholder="更新内容描述…" />
        </Form.Item>
        <Form.Item name="forceUpgrade" valuePropName="checked">
          <Checkbox>强制升级（App 启动时必须更新）</Checkbox>
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={loading} block>
          {loading ? '上传中，请稍候…' : '发 布'}
        </Button>
      </Form>
    </Modal>
  );
}

export default function VersionsPage() {
  const { modal, message } = App.useApp();
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminApi.versions.list();
      setVersions(res.versions);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSetCurrent = (id, name) => {
    modal.confirm({
      title: '设为当前版本',
      content: `确认将 ${name} 设为全局当前版本？所有设备将收到此版本推送。`,
      okText: '确认', cancelText: '取消',
      onOk: async () => {
        try { await adminApi.versions.setCurrent(id); load(); }
        catch (err) { message.error(err.message); }
      },
    });
  };

  const handleDelete = (id, name) => {
    modal.confirm({
      title: '删除版本', content: `确认删除版本 ${name}？`,
      okText: '确认删除', cancelText: '取消', okType: 'danger',
      onOk: async () => {
        try { await adminApi.versions.remove(id); load(); }
        catch (err) { message.error(err.message); }
      },
    });
  };

  const handleClearCurrent = () => {
    modal.confirm({
      title: '撤销当前版本',
      content: '确认撤销当前版本？撤销后设备将不再收到 OTA 推送。',
      okText: '确认撤销', cancelText: '取消', okType: 'danger',
      onOk: async () => {
        try { await adminApi.versions.clearCurrent(); message.success('已撤销当前版本'); load(); }
        catch (err) { message.error(err.message); }
      },
    });
  };

  const columns = [
    {
      title: '状态', key: 'status',
      render: (_, v) => v.isCurrent
        ? <Tag color="success" icon={<CheckOutlined />}>当前版本</Tag>
        : <Tag color="default">历史版本</Tag>,
    },
    { title: '版本名', dataIndex: 'versionName', key: 'versionName', render: v => <strong>{v}</strong> },
    { title: '版本号', dataIndex: 'versionCode', key: 'versionCode', render: v => <Text type="secondary">{v}</Text> },
    {
      title: '强制升级', dataIndex: 'forceUpgrade', key: 'forceUpgrade',
      render: v => v ? <Tag color="warning">强制</Tag> : <Text type="secondary" style={{ fontSize: 12 }}>否</Text>,
    },
    { title: '更新日志', dataIndex: 'changelog', key: 'changelog', ellipsis: true, render: v => <Text type="secondary" style={{ fontSize: 12 }}>{v || '—'}</Text> },
    {
      title: 'APK', key: 'apk',
      render: (_, v) => <a href={v.apkUrl} target="_blank" rel="noopener noreferrer"><DownloadOutlined /> 下载</a>,
    },
    {
      title: '发布时间', dataIndex: 'createdAt', key: 'createdAt',
      render: v => <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(v).format('MM-DD HH:mm')}</Text>,
    },
    {
      title: '操作', key: 'action',
      render: (_, v) => v.isCurrent ? (
        <Button type="link" danger size="small" icon={<StopOutlined />} onClick={handleClearCurrent}>撤销当前</Button>
      ) : (
        <Space size="small">
          <Button type="link" size="small" icon={<CheckOutlined />} onClick={() => handleSetCurrent(v.id, v.versionName)}>设为当前</Button>
          <Button type="link" danger size="small" icon={<DeleteOutlined />} onClick={() => handleDelete(v.id, v.versionName)}>删除</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>发布新版本</Button>
        </Space>
      </div>
      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={versions}
          loading={loading}
          size="small"
          pagination={false}
        />
      </Card>
      <CreateModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); load(); }} />
    </div>
  );
}
