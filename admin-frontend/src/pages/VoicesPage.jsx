/**
 * VoicesPage.jsx — 音色管理页面（后台管理系统）
 *
 * 功能：
 *  - 列出全部音色（系统音色 / 克隆 / 生成）
 *  - 启用/禁用开关
 *  - 试听按钮（优先 OSS，无则合成）
 *  - 立即同步按钮
 */

import { useState, useEffect, useRef } from 'react';
import {
  Table, Switch, Button, Tag, Space, Typography,
  message, Tooltip, Badge,
} from 'antd';
import { SyncOutlined, PlayCircleOutlined, PauseCircleOutlined } from '@ant-design/icons';
import { adminApi } from '../api';

const { Title } = Typography;

/** 音色类型标签 */
const TYPE_MAP = {
  system:           { label: '系统音色', color: 'blue' },
  voice_cloning:    { label: '克隆音色', color: 'purple' },
  voice_generation: { label: '生成音色', color: 'green' },
};

export default function VoicesPage() {
  const [voices,   setVoices]   = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [syncing,  setSyncing]  = useState(false);
  // 试听状态：{ [voiceId]: 'loading' | 'playing' | null }
  const [previewState, setPreviewState] = useState({});
  const audioRef = useRef(null);
  const playingIdRef = useRef(null);

  /** 拉取音色列表 */
  const fetchVoices = async () => {
    setLoading(true);
    try {
      const data = await adminApi.voices.list();
      setVoices(data.voices || []);
    } catch {
      message.error('加载音色列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchVoices(); }, []);

  /** 立即同步 */
  const handleSync = async () => {
    setSyncing(true);
    try {
      const data = await adminApi.voices.sync();
      message.success(`同步成功，共 ${data.total} 个音色`);
      fetchVoices();
    } catch {
      message.error('同步失败');
    } finally {
      setSyncing(false);
    }
  };

  /** 切换启用状态 */
  const handleToggle = async (record) => {
    try {
      const data = await adminApi.voices.toggle(record.id);
      setVoices((prev) => prev.map((v) => v.id === record.id ? data.voice : v));
    } catch {
      message.error('操作失败');
    }
  };

  /** 试听 */
  const handlePreview = async (record) => {
    const id = record.id;

    // 如果正在播放这个音色，则暂停
    if (playingIdRef.current === id && audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      setPreviewState((p) => ({ ...p, [id]: null }));
      playingIdRef.current = null;
      return;
    }

    // 停止其他正在播放的
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    const prevId = playingIdRef.current;
    if (prevId) setPreviewState((p) => ({ ...p, [prevId]: null }));

    setPreviewState((p) => ({ ...p, [id]: 'loading' }));
    playingIdRef.current = id;

    try {
      const data = await adminApi.voices.preview(id);
      const url  = data.url;
      if (!url) throw new Error('无试听 URL');

      const audio = new Audio(url);
      audioRef.current = audio;
      audio.play();
      setPreviewState((p) => ({ ...p, [id]: 'playing' }));
      audio.onended = () => {
        setPreviewState((p) => ({ ...p, [id]: null }));
        playingIdRef.current = null;
      };
      audio.onerror = () => {
        setPreviewState((p) => ({ ...p, [id]: null }));
        playingIdRef.current = null;
        message.error('播放失败');
      };
    } catch (err) {
      setPreviewState((p) => ({ ...p, [id]: null }));
      playingIdRef.current = null;
      message.error(err.message || '试听失败');
    }
  };

  const columns = [
    {
      title: '音色名称',
      dataIndex: 'voiceName',
      key: 'voiceName',
      render: (name, r) => name || <span style={{ color: '#999', fontSize: 12 }}>{r.voiceId}</span>,
    },
    {
      title: 'Voice ID',
      dataIndex: 'voiceId',
      key: 'voiceId',
      render: (v) => <span style={{ fontSize: 12, color: '#666', fontFamily: 'monospace' }}>{v}</span>,
    },
    {
      title: '类型',
      dataIndex: 'voiceType',
      key: 'voiceType',
      width: 100,
      render: (t) => {
        const map = TYPE_MAP[t] || { label: t, color: 'default' };
        return <Tag color={map.color}>{map.label}</Tag>;
      },
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (d) => d || '-',
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 80,
      render: (enabled, record) => {
        const isDefault = record.voiceId === 'Chinese (Mandarin)_Lyrical_Voice';
        return (
          <Tooltip title={isDefault && enabled ? '系统默认音色，不可禁用' : ''} placement="top">
            <Switch
              checked={enabled}
              size="small"
              disabled={isDefault && enabled}
              onChange={() => handleToggle(record)}
            />
          </Tooltip>
        );
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: (_, record) => {
        const state = previewState[record.id];
        const isLoading = state === 'loading';
        const isPlaying = state === 'playing';
        return (
          <Tooltip title={isPlaying ? '点击暂停' : '试听音色'}>
            <Button
              type="text"
              size="small"
              loading={isLoading}
              icon={isPlaying ? <PauseCircleOutlined style={{ color: '#1890ff' }} /> : <PlayCircleOutlined />}
              onClick={() => handlePreview(record)}
            >
              {isPlaying ? '暂停' : '试听'}
            </Button>
          </Tooltip>
        );
      },
    },
  ];

  const enabledCount = voices.filter((v) => v.enabled).length;

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          音色管理
          <Badge count={enabledCount} style={{ marginLeft: 8, backgroundColor: '#52c41a' }} title="已启用数量" />
        </Title>
        <Space>
          <Button
            icon={<SyncOutlined spin={syncing} />}
            loading={syncing}
            onClick={handleSync}
          >
            立即同步
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={voices}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={{ pageSize: 20, showSizeChanger: false }}
        rowClassName={(r) => r.enabled ? '' : 'row-disabled'}
      />

      <style>{`
        .row-disabled td { opacity: 0.5; }
      `}</style>
    </div>
  );
}
