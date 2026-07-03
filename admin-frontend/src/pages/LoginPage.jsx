import { Button, Card, Form, Input, App } from 'antd';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../api';

export default function LoginPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();

  const onFinish = async (values) => {
    try {
      const res = await adminApi.login(values);
      localStorage.setItem('admin_token', res.token);
      localStorage.setItem('admin_user', JSON.stringify(res.user));
      navigate('/admin/dashboard', { replace: true });
    } catch (e) {
      message.error(e.message || '登录失败');
    }
  };

  return <div className="login-page">
    <Card className="login-card">
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: '#1f3327' }}>闻一翻译</div>
        <div style={{ color: '#8c8c8c', marginTop: 6 }}>后台管理系统</div>
      </div>
      <Form layout="vertical" onFinish={onFinish} initialValues={{ username: 'admin', password: 'admin' }}>
        <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}><Input size="large" /></Form.Item>
        <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}><Input.Password size="large" /></Form.Item>
        <Button type="primary" htmlType="submit" size="large" block>登录</Button>
      </Form>
    </Card>
  </div>;
}
