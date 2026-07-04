import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpenText } from 'lucide-react';
import { api, setSession } from '../api';

export default function LoginPage({ mode = 'login' }) {
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const data = await api(`/auth/${mode === 'register' ? 'register' : 'login'}`, { method: 'POST', body: { account, password, username } });
      setSession(data.token, data.customer);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    }
  };

  return <div className="auth-page">
    <div className="auth-card">
      <div className="auth-copy"><BookOpenText size={34} /><h1>闻一翻译</h1><p>把 PDF/DOCX 学术文献拆成可对应的知识块，先理解论文，再逐块翻译。</p></div>
      <form onSubmit={submit}>
        <h2>{mode === 'register' ? '创建账号' : '登录账号'}</h2>
        {mode === 'register' && <input placeholder="昵称，可选" value={username} onChange={(e) => setUsername(e.target.value)} />}
        <input placeholder="手机号或邮箱" value={account} onChange={(e) => setAccount(e.target.value)} />
        <input placeholder="密码" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="error">{error}</p>}
        <button className="primary" type="submit">{mode === 'register' ? '注册并进入' : '登录'}</button>
        <Link className="switch" to={mode === 'register' ? '/login' : '/register'}>{mode === 'register' ? '已有账号，去登录' : '没有账号，去注册'}</Link>
      </form>
    </div>
  </div>;
}
