import { useState, useEffect, useCallback } from 'react';
import { Table, Input, Button, Space, Typography, Card, Image, App } from 'antd';
import { SearchOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import { adminApi } from '../api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

/**
 * 图片缓存页（原话题缓存页）
 * 只展示已生成缓存图片的话题
 */
export default function CachePage() {
  const { modal, message } = App.useApp();
  const [data,    setData]    = useState({ total: 0, topics: [] });
  const [page,    setPage]    = useState(1);
  const [search,  setSearch]  = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.topics.list({ page, limit: 50, search });
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = (record) => {
    modal.confirm({
      title: '删除缓存',
      content: `确认删除「${record.topicName.slice(0, 40)}」的图片缓存？`,
      okText: '确认删除', cancelText: '取消', okType: 'danger',
      onOk: async () => {
        try {
          await adminApi.topics.remove(record.id);
          message.success('缓存已删除');
          load();
        } catch (err) {
          message.error(err.message);
        }
      },
    });
  };

  const columns = [
    {
      title: '图片', key: 'image', width: 70,
      render: (_, r) => (
        <Image
          src={r.imageUrl} width={48} height={48}
          style={{ borderRadius: 6, objectFit: 'cover', border: '1px solid #f0f0f0' }}
          preview={{ mask: false }}
        />
      ),
    },
    {
      title: '话题名', dataIndex: 'topicName', key: 'topicName', ellipsis: true,
      render: v => <span style={{ fontSize: 13 }}>{v}</span>,
    },
    {
      title: '命中次数', dataIndex: 'hitCount', key: 'hitCount', width: 90, sorter: (a, b) => a.hitCount - b.hitCount,
      render: v => <span style={{ fontWeight: 600, color: v > 10 ? '#52c41a' : '#262626' }}>{v}</span>,
    },
    {
      title: 'OSS 链接', dataIndex: 'imageUrl', key: 'imageUrl', ellipsis: true, width: 180,
      render: v => <a href={v} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11 }}>查看原图</a>,
    },
    {
      title: '更新时间', dataIndex: 'updatedAt', key: 'updatedAt', width: 120,
      render: v => <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(v).format('MM-DD HH:mm')}</Text>,
    },
    {
      title: '操作', key: 'action', width: 80, fixed: 'right',
      render: (_, r) => (
        <Button type="link" danger size="small" icon={<DeleteOutlined />} onClick={() => handleDelete(r)}>删除</Button>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>图片缓存</Title>
        <Text type="secondary" style={{ fontSize: 13 }}>共 {data.total} 个话题已生成图片缓存</Text>
      </div>
      <Card>
        <Space style={{ marginBottom: 16 }}>
          <Input.Search
            placeholder="搜索话题名称…" allowClear style={{ width: 280 }}
            enterButton={<SearchOutlined />}
            onSearch={v => { setSearch(v); setPage(1); }}
          />
          <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
        </Space>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data.topics}
          loading={loading}
          size="small"
          scroll={{ x: 700 }}
          pagination={{
            current: page, pageSize: 50, total: data.total,
            showSizeChanger: false,
            showTotal: t => `共 ${t} 条`,
            onChange: p => setPage(p),
          }}
        />
      </Card>
    </div>
  );
}
