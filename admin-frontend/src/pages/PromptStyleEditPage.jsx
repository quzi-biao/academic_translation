import { useState, useEffect } from 'react';
import { Form, Input, Button, Switch, Select, message, Space, Card } from 'antd';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { adminApi } from '../api';

const { TextArea } = Input;
const { Option } = Select;

export default function PromptStyleEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new';
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isNew) {
      fetchStyle();
    }
  }, [id]);

  const fetchStyle = async () => {
    setLoading(true);
    try {
      const data = await adminApi.promptStyles.get(id);
      form.setFieldsValue(data);
    } catch (err) {
      message.error('加载风格失败: ' + err.message);
      navigate('/admin/prompt-styles');
    } finally {
      setLoading(false);
    }
  };

  const onFinish = async (values) => {
    setSaving(true);
    try {
      if (isNew) {
        await adminApi.promptStyles.create(values);
        message.success('创建成功');
      } else {
        await adminApi.promptStyles.update(id, values);
        message.success('保存成功');
      }
      navigate('/admin/prompt-styles');
    } catch (err) {
      message.error('保存失败: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 40 }}>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin/prompt-styles')} />
        <h2 style={{ margin: 0 }}>{isNew ? '添加提示词风格' : '编辑提示词风格'}</h2>
      </div>

      <Card loading={loading}>
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{ isActive: true, imageModel: 'gpt-image-2' }}
        >
          <Form.Item
            name="name"
            label="风格名称"
            rules={[{ required: true, message: '请输入风格名称' }]}
          >
            <Input placeholder="例如: 酷炫科普风" />
          </Form.Item>

          <Form.Item
            name="imageModel"
            label="适用的生图模型"
            rules={[{ required: true, message: '请选择生图模型' }]}
            extra="不同的模型可能对提示词结构的响应不同，该风格绑定到对应模型后表现更稳定"
          >
            <Select>
              <Option value="gpt-image-2">gpt-image-2 (yunwu.ai)</Option>
              <Option value="gemini">Gemini (原生)</Option>
            </Select>
          </Form.Item>

          <Form.Item name="isActive" label="是否启用" valuePropName="checked">
            <Switch />
          </Form.Item>

          <div style={{ marginTop: 32, marginBottom: 16 }}>
            <h3 style={{ borderBottom: '1px solid #f0f0f0', paddingBottom: 8 }}>详细提示词配置</h3>
          </div>

          <Form.Item
            name="unifiedStyle"
            label="统一风格基础 (Unified Style)"
            extra="各个场景生成时都会附加的基础视觉风格设定（画风、色彩、细节等）"
          >
            <TextArea autoSize={{ minRows: 8, maxRows: 30 }} placeholder="例如: 暗色调、高细节、细线描边..." />
          </Form.Item>

          <Form.Item
            name="topicExploration"
            label="主题探索 (文生图)"
            extra="根据话题直接生成科普图片的 Prompt 模板，使用 ${query} 占位符代表话题名称"
          >
            <TextArea autoSize={{ minRows: 12, maxRows: 40 }} placeholder="例如: A stunning scientific illustration about ${query}..." />
          </Form.Item>

          <Form.Item
            name="regionExploration"
            label="区域探索 (视觉识别)"
            extra="用于让视觉大模型识别框选区域是 SCENE 还是 OBJECT 的 Prompt"
          >
            <TextArea autoSize={{ minRows: 8, maxRows: 30 }} placeholder="Look carefully at this image region..." />
          </Form.Item>

          <Form.Item
            name="deepExploration"
            label="深入探索 (图生图扩展)"
            extra="用于基于识别结果进行图生图发散扩展的复杂 Prompt 模板。支持占位符 ${contextHint} 和 ${randomTopics}"
          >
            <TextArea autoSize={{ minRows: 16, maxRows: 50 }} />
          </Form.Item>

          <Form.Item
            name="pageDescription"
            label="页面描述 (看图说话)"
            extra="用于探索标注、框选解读时使用的 Prompt 模板，主要用于生成 Markdown 格式的中文科普文本"
          >
            <TextArea autoSize={{ minRows: 10, maxRows: 40 }} />
          </Form.Item>

          <Form.Item
            name="ttsSynthesis"
            label="TTS 合成 Prompt (预留)"
          >
            <TextArea autoSize={{ minRows: 6, maxRows: 20 }} />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={saving}>
                保存
              </Button>
              <Button onClick={() => navigate('/admin/prompt-styles')}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
