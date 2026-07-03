import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Statistic, Row, Col, Table, Button, Modal, Form, DatePicker, Input, message } from 'antd';
import { ArrowLeftOutlined, PlusOutlined } from '@ant-design/icons';
import { adminApi } from '../api';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

export default function ChannelDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [channel, setChannel] = useState(null);
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [settlementModalVisible, setSettlementModalVisible] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [chRes, setRes] = await Promise.all([
        adminApi.channels.get(id),
        adminApi.channels.settlements.list(id)
      ]);
      setChannel(chRes.channel);
      setSettlements(setRes.settlements || []);
    } catch (err) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePeriodChange = async (dates) => {
    if (!dates || !dates[0] || !dates[1]) {
      setPreviewData(null);
      return;
    }
    
    setPreviewLoading(true);
    try {
      const periodStart = dates[0].startOf('day').toISOString();
      const periodEnd = dates[1].endOf('day').toISOString();
      
      const res = await adminApi.channels.settlements.preview(id, { periodStart, periodEnd });
      setPreviewData(res);
    } catch (err) {
      message.error(err.message);
      setPreviewData(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCreateSettlement = async (values) => {
    try {
      const [start, end] = values.period;
      // 由于 RangePicker 结束时间是 00:00，为了包含当天需要将结束时间设为 23:59:59
      const periodStart = start.startOf('day').toISOString();
      const periodEnd = end.endOf('day').toISOString();

      const res = await adminApi.channels.settlements.create(id, {
        periodStart,
        periodEnd,
        note: values.note,
      });
      message.success(`结算成功，生成结款: ￥${(res.commission / 100).toFixed(2)}`);
      setSettlementModalVisible(false);
      form.resetFields();
      fetchData(); // 刷新数据
    } catch (err) {
      message.error(err.message);
    }
  };

  const columns = [
    { title: '结算单号', dataIndex: 'id', key: 'id' },
    { 
      title: '结算周期', 
      key: 'period', 
      render: (_, r) => `${dayjs(r.periodStart).format('YYYY-MM-DD')} ~ ${dayjs(r.periodEnd).format('YYYY-MM-DD')}` 
    },
    { title: '结算金额(元)', dataIndex: 'totalCommissionFen', key: 'amount', render: (val) => `¥${(val / 100).toFixed(2)}` },
    { title: '备注', dataIndex: 'note', key: 'note' },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', render: (val) => dayjs(val).format('YYYY-MM-DD HH:mm') }
  ];

  if (!channel) return <div style={{ padding: 24 }}>加载中...</div>;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin/channels')} style={{ marginRight: 16 }}>
          返回渠道列表
        </Button>
        <span style={{ fontSize: 20, fontWeight: 'bold' }}>{channel.name} 详情</span>
      </div>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic title="卖出设备数（多页设备）" value={channel.validDeviceCount} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic 
              title="待结算分润 (元)" 
              value={(channel.pendingCommissionFen / 100).toFixed(2)} 
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic 
              title="已结算分润 (元)" 
              value={(channel.settledCommissionFen / 100).toFixed(2)} 
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
      </Row>

      <Card 
        title="结算记录" 
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setSettlementModalVisible(true)}>生成新结算</Button>}
      >
        <Table
          dataSource={settlements}
          columns={columns}
          rowKey="id"
          loading={loading}
        />
      </Card>

      <Modal
        title="生成渠道结算单"
        open={settlementModalVisible}
        onCancel={() => {
          setSettlementModalVisible(false);
          setPreviewData(null);
        }}
        onOk={() => form.submit()}
        width={700}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleCreateSettlement}>
          <Form.Item name="period" label="结算周期" rules={[{ required: true, message: '请选择结算周期' }]}>
            <RangePicker style={{ width: '100%' }} onChange={handlePeriodChange} />
          </Form.Item>
          <Form.Item name="note" label="备注">
            <Input.TextArea rows={3} placeholder="选填，例如打款凭证号等" />
          </Form.Item>
        </Form>
        {previewLoading && <div style={{ marginTop: 16 }}>正在计算包含的订单...</div>}
        {previewData && (
          <div style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 16, fontWeight: 'bold' }}>预计生成分润：</span>
              <span style={{ color: '#cf1322', fontSize: 20, fontWeight: 'bold' }}>¥{(previewData.commission / 100).toFixed(2)}</span>
              <span style={{ marginLeft: 16, color: '#888' }}>
                （此期间总营收 ¥{(previewData.revenue / 100).toFixed(2)}，共计 {previewData.orders?.length || 0} 笔未结算订单）
              </span>
            </div>
            <Table 
              dataSource={previewData.orders || []} 
              rowKey="id" 
              size="small" 
              pagination={{ pageSize: 5 }}
              columns={[
                { title: '订单号', dataIndex: 'id', width: 150, ellipsis: true },
                { title: '设备', render: (_, r) => r.device?.deviceCode || '-', width: 120, ellipsis: true },
                { title: '订单金额', render: (_, r) => `¥${(r.amount / 100).toFixed(2)}`, width: 100 },
                { title: '支付时间', render: (_, r) => dayjs(r.paidAt).format('YYYY-MM-DD HH:mm'), width: 150 }
              ]}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
