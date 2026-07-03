/**
 * PlansPage.jsx — 套餐管理页面
 * 后台管理员可以创建/编辑/启用/停用/删除套餐
 */

import { useState, useEffect } from 'react';
import {
  Table, Button, Space, Tag, Switch, Modal, Form,
  Input, InputNumber, Typography, App, Tooltip, Popconfirm,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ShoppingOutlined,
} from '@ant-design/icons';
import { adminApi } from '../api';

const { Title, Text } = Typography;

/** 格式化分→元 */
const fmtPrice = (fen) => `¥${(fen / 100).toFixed(2)}`;

/** 新建/编辑 弹窗 */
function PlanModal({ open, plan, onClose, onSaved }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const isEdit = !!plan;

  useEffect(() => {
    if (open) {
      form.setFieldsValue(
        plan
          ? { ...plan, priceYuan: plan.price / 100 }
          : { isActive: true, sortOrder: 0 }
      );
    }
  }, [open, plan, form]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      const body = {
        name:        values.name,
        price:       Math.round(values.priceYuan * 100), // 元→分
        points:      values.points,
        description: values.description || null,
        isActive:    values.isActive ?? true,
        sortOrder:   values.sortOrder ?? 0,
      };

      if (isEdit) {
        await adminApi.plans.update(plan.id, body);
        message.success('套餐已更新');
      } else {
        await adminApi.plans.create(body);
        message.success('套餐已创建');
      }

      onSaved();
      onClose();
    } catch (err) {
      if (err?.errorFields) return; // 表单校验失败
      message.error(err.message || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={isEdit ? '编辑套餐' : '新建套餐'}
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      confirmLoading={loading}
      width={480}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item name="name" label="套餐名称" rules={[{ required: true, message: '请输入套餐名称' }]}>
          <Input placeholder="如：月度基础版" />
        </Form.Item>

        <Space size={16} style={{ width: '100%' }}>
          <Form.Item
            name="priceYuan"
            label="价格（元）"
            rules={[{ required: true, message: '请输入价格' }, { type: 'number', min: 0.01, message: '价格须 > 0' }]}
            style={{ flex: 1 }}
          >
            <InputNumber
              prefix="¥"
              min={0.01}
              step={0.01}
              precision={2}
              style={{ width: '100%' }}
              placeholder="60.00"
            />
          </Form.Item>

          <Form.Item
            name="points"
            label="赠送点数"
            rules={[{ required: true, message: '请输入点数' }, { type: 'number', min: 1, message: '点数须 > 0' }]}
            style={{ flex: 1 }}
          >
            <InputNumber min={1} step={10} style={{ width: '100%' }} placeholder="600" />
          </Form.Item>
        </Space>

        <Form.Item name="description" label="套餐描述（可选）">
          <Input.TextArea rows={3} placeholder="套餐的详细说明，显示在设备端卡片中" />
        </Form.Item>

        <Space size={32}>
          <Form.Item name="isActive" label="是否启用" valuePropName="checked" style={{ marginBottom: 0 }}>
            <Switch />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序权重（越小越靠前）" style={{ marginBottom: 0 }}>
            <InputNumber min={0} step={1} />
          </Form.Item>
        </Space>
      </Form>
    </Modal>
  );
}

/** 主页面 */
export default function PlansPage() {
  const { message } = App.useApp();
  const [plans,   setPlans]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState({ open: false, plan: null });

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminApi.plans.list();
      setPlans(res.plans || []);
    } catch (err) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleToggle = async (id, checked) => {
    try {
      await adminApi.plans.toggle(id);
      load();
    } catch (err) {
      message.error(err.message);
    }
  };

  const handleDelete = async (id) => {
    try {
      await adminApi.plans.remove(id);
      message.success('套餐已删除');
      load();
    } catch (err) {
      message.error(err.message);
    }
  };

  const columns = [
    {
      title: '套餐名称', dataIndex: 'name', key: 'name',
      render: (v) => <Text strong>{v}</Text>,
    },
    {
      title: '价格', dataIndex: 'price', key: 'price',
      render: (v) => <Text style={{ color: '#16a34a', fontWeight: 600 }}>{fmtPrice(v)}</Text>,
    },
    {
      title: '点数', dataIndex: 'points', key: 'points',
      render: (v) => <Tag color="purple">{v.toLocaleString()} 点</Tag>,
    },
    {
      title: '描述', dataIndex: 'descriptionJson', key: 'desc',
      ellipsis: true,
      render: (v) => <Text type="secondary" style={{ fontSize: 12 }}>{v || '—'}</Text>,
    },
    {
      title: '排序', dataIndex: 'sortOrder', key: 'sortOrder', width: 70,
      render: (v) => <Text type="secondary">{v}</Text>,
    },
    {
      title: '订单数', key: 'orders', width: 80,
      render: (_, r) => <Text type="secondary">{r._count?.orders ?? 0}</Text>,
    },
    {
      title: '启用', key: 'isActive', width: 80,
      render: (_, r) => (
        <Switch
          checked={r.isActive}
          size="small"
          onChange={(checked) => handleToggle(r.id, checked)}
        />
      ),
    },
    {
      title: '操作', key: 'action', width: 100,
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="编辑">
            <Button
              type="text" size="small" icon={<EditOutlined />}
              onClick={() => setModal({ open: true, plan: r })}
            />
          </Tooltip>
          <Tooltip title={r._count?.orders > 0 ? '有关联订单，不可删除' : '删除'}>
            <Popconfirm
              title="确认删除此套餐？"
              disabled={r._count?.orders > 0}
              onConfirm={() => handleDelete(r.id)}
            >
              <Button
                type="text" size="small" danger icon={<DeleteOutlined />}
                disabled={r._count?.orders > 0}
              />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            <ShoppingOutlined style={{ marginRight: 8 }} />套餐管理
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            管理设备端订阅套餐，设备端展示已启用的套餐供购买
          </Text>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setModal({ open: true, plan: null })}
        >
          新建套餐
        </Button>
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={plans}
        loading={loading}
        size="middle"
        pagination={false}
      />

      <PlanModal
        open={modal.open}
        plan={modal.plan}
        onClose={() => setModal({ open: false, plan: null })}
        onSaved={load}
      />
    </div>
  );
}
