import { useState, useEffect } from 'react';
import {
  Card, Table, InputNumber, Input, Button, Tag, Typography,
  Space, Tooltip, App, Select
} from 'antd';
import { EditOutlined, CheckOutlined, CloseOutlined, ReloadOutlined } from '@ant-design/icons';
import { adminApi } from '../api';

const { Title, Text } = Typography;

// 配置项分组与元信息
const CONFIG_META = {
  points_per_image:    { label: '图片生成消耗点数',    unit: '点/张',  group: '点数消耗', type: 'number', min: 0 },
  points_per_tts_min:  { label: 'TTS 消耗点数',        unit: '点/分钟', group: '点数消耗', type: 'number', min: 0 },
  points_per_wan_text: { label: '文字生成消耗点数',    unit: '点/万字', group: '点数消耗', type: 'number', min: 0 },
  init_points:         { label: '新设备初始赠送点数',  unit: '点',     group: '点数规则', type: 'number', min: 0 },
  overdraft_limit:     { label: '点数透支下限',        unit: '点',     group: '点数规则', type: 'number', max: 0, tooltip: '负数，到达此值后 AI 调用被拒绝' },
  POINTS_PER_YUAN:     { label: '充值比例',            unit: '点/元',  group: '充值设置', type: 'number', min: 1, tooltip: '1元换算的点数数量，默认100' },
  DIRECT_RECHARGE_MIN: { label: '单次充值最低金额',    unit: '元',     group: '充值设置', type: 'number', min: 1, tooltip: '设备端充值页面的最低金额限制' },
  DIRECT_RECHARGE_MAX: { label: '单次充值最高金额',    unit: '元',     group: '充值设置', type: 'number', min: 1, tooltip: '设备端充值页面的最高金额限制（隐藏规则）' },
  price_image:         { label: '图片成本单价',        unit: '元/张',  group: '成本参考', type: 'decimal' },
  price_tts_per_min:   { label: 'TTS 成本单价',        unit: '元/分钟', group: '成本参考', type: 'decimal' },
  price_text_per_wan:  { label: '文字成本单价',        unit: '元/万字', group: '成本参考', type: 'decimal' },
  model_image_gen:     { label: '全局生图模型',        group: '模型设置', type: 'select', options: ['gpt-image-2', 'gemini'], tooltip: '如果没有被风格覆盖，则使用此默认生图模型' },
  model_page_desc:     { label: '页面描述模型',        group: '模型设置', type: 'select', options: ['gemini-2.5-flash', 'gemini-1.5-pro'] },
  model_region_expl:   { label: '区域解读模型',        group: '模型设置', type: 'select', options: ['gemini-2.5-flash', 'gemini-1.5-pro'] },
  model_tts:           { label: 'TTS 合成模型',        group: '模型设置', type: 'string' },
};

const GROUP_ORDER = ['点数消耗', '点数规则', '充值设置', '模型设置', '成本参考'];
const GROUP_COLOR = { '点数消耗': 'purple', '点数规则': 'blue', '充值设置': 'green', '模型设置': 'cyan', '成本参考': 'orange' };

function EditCell({ configKey, value, onSaved }) {
  const { message } = App.useApp();
  const [editing, setEditing]   = useState(false);
  const [draft,   setDraft]     = useState(value);
  const [loading, setLoading]   = useState(false);
  const meta = CONFIG_META[configKey] || {};

  const save = async () => {
    setLoading(true);
    try {
      await adminApi.config.update(configKey, String(draft));
      message.success('已保存');
      setEditing(false);
      onSaved();
    } catch (err) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (editing) {
    return (
      <Space size={4}>
        {meta.type === 'select' ? (
          <Select
            size="small"
            value={draft}
            onChange={setDraft}
            style={{ width: 140 }}
            autoFocus
          >
            {meta.options.map((opt) => (
              <Select.Option key={opt} value={opt}>{opt}</Select.Option>
            ))}
          </Select>
        ) : meta.type === 'string' ? (
          <Input
            size="small"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            style={{ width: 140 }}
            autoFocus
          />
        ) : meta.type === 'decimal' ? (
          <InputNumber
            size="small"
            value={draft}
            step={0.01}
            min={meta.min}
            max={meta.max}
            onChange={setDraft}
            style={{ width: 100 }}
            autoFocus
          />
        ) : (
          <InputNumber
            size="small"
            value={draft}
            step={1}
            min={meta.min}
            max={meta.max}
            onChange={setDraft}
            style={{ width: 100 }}
            autoFocus
          />
        )}
        <Button
          type="primary" size="small" icon={<CheckOutlined />}
          loading={loading} onClick={save}
        />
        <Button
          size="small" icon={<CloseOutlined />}
          onClick={() => { setDraft(value); setEditing(false); }}
        />
      </Space>
    );
  }

  return (
    <Space size={8}>
      <Text strong style={{ fontSize: 15 }}>{value}</Text>
      {meta.unit && <Text type="secondary" style={{ fontSize: 12 }}>{meta.unit}</Text>}
      <Tooltip title="编辑">
        <Button
          type="text" size="small" icon={<EditOutlined />}
          onClick={() => {
            setDraft(meta.type === 'number' || meta.type === 'decimal' ? Number(value) : String(value));
            setEditing(true);
          }}
        />
      </Tooltip>
    </Space>
  );
}

export default function ConfigPage() {
  const [configs,  setConfigs]  = useState([]);
  const [loading,  setLoading]  = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminApi.config.list();
      setConfigs(res.configs || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // 分组
  const grouped = GROUP_ORDER.map((group) => ({
    group,
    items: configs.filter((c) => (CONFIG_META[c.key]?.group || '其他') === group),
  })).filter((g) => g.items.length > 0);

  // 无法匹配分组的条目
  const others = configs.filter((c) => !CONFIG_META[c.key]);

  const columns = [
    {
      title: '配置项', key: 'label', width: 200,
      render: (_, c) => {
        const meta = CONFIG_META[c.key];
        return (
          <div>
            <div style={{ fontWeight: 500 }}>{meta?.label || c.key}</div>
            {c.desc && <div style={{ fontSize: 11, color: '#8c8c8c' }}>{c.desc}</div>}
          </div>
        );
      },
    },
    {
      title: '当前值', key: 'value', width: 220,
      render: (_, c) => (
        <EditCell configKey={c.key} value={c.value} onSaved={load} />
      ),
    },
    {
      title: '描述', dataIndex: 'desc', key: 'desc',
      render: (v) => <Text type="secondary" style={{ fontSize: 12 }}>{v || '—'}</Text>,
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>全局配置</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>点数消耗规则、成本定价等系统参数，修改后立即生效</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>刷新</Button>
      </div>

      {grouped.map(({ group, items }) => (
        <Card
          key={group}
          title={<><Tag color={GROUP_COLOR[group]}>{group}</Tag></>}
          style={{ marginBottom: 16 }}
          size="small"
        >
          <Table
            rowKey="key"
            columns={columns}
            dataSource={items}
            loading={loading}
            size="small"
            pagination={false}
            showHeader={false}
          />
        </Card>
      ))}

      {others.length > 0 && (
        <Card title={<Tag>其他</Tag>} size="small">
          <Table
            rowKey="key"
            columns={columns}
            dataSource={others}
            size="small"
            pagination={false}
            showHeader={false}
          />
        </Card>
      )}
    </div>
  );
}
