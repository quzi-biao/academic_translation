import { useState, useEffect } from 'react';
import { Table, Button, Space, message, Tag, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../api';

export default function PromptStylesPage() {
  const navigate = useNavigate();
  const [styles, setStyles] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchStyles();
  }, []);

  const fetchStyles = async () => {
    setLoading(true);
    try {
      const data = await adminApi.promptStyles.list();
      setStyles(data);
    } catch (err) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await adminApi.promptStyles.remove(id);
      message.success('删除成功');
      fetchStyles();
    } catch (err) {
      message.error('删除失败: ' + err.message);
    }
  };

  const columns = [
    { title: '风格名称', dataIndex: 'name', key: 'name' },
    { title: '适用的生图模型', dataIndex: 'imageModel', key: 'imageModel', render: (val) => <Tag color="blue">{val || '未指定'}</Tag> },
    { title: '状态', dataIndex: 'isActive', key: 'isActive', render: (active) => active ? <Tag color="success">启用</Tag> : <Tag color="default">停用</Tag> },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space size="middle">
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => navigate(`/admin/prompt-styles/${record.id}`)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除此风格吗？如果设备正在使用，将可能引发错误。"
            onConfirm={() => handleDelete(record.id)}
            okText="删除"
            cancelText="取消"
          >
            <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24, background: '#fff', borderRadius: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2>提示词风格管理</h2>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => navigate('/admin/prompt-styles/new')}
        >
          添加新风格
        </Button>
      </div>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={styles}
        loading={loading}
        pagination={false}
      />
    </div>
  );
}
