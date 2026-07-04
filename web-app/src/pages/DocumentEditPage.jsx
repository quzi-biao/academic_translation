import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, RotateCcw, RotateCw, Save, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { BlockRenderer } from '../components/DocumentBlocks';
import { Header, Shell } from '../components/Layout';
import { BlockDeleteModal } from '../components/Modals';
import {
  cloneBlockSnapshot,
  getEditableSourceText,
  getEditableTranslatedText,
  removeBlockFromDocument,
  replaceBlockInDocument,
  restoreBlockIntoDocument,
  stripFileExtension,
} from '../documentHelpers';

function BlockEditorCard({ title, value, onChange, onDelete, onSave, onCancel, saving = false }) {
  return <div className="block-editor-card">
    <div className="block-editor-header">
      <span>{title}</span>
      <div className="block-editor-actions">
        <button className="ghost" onClick={onDelete}><Trash2 size={14} />删除</button>
        <button className="ghost" onClick={onCancel}>取消</button>
        <button className="primary" onClick={onSave} disabled={saving}><Save size={14} />{saving ? '保存中...' : '保存'}</button>
      </div>
    </div>
    <textarea className="block-editor-textarea" value={value} onChange={(e) => onChange(e.target.value)} />
  </div>;
}

export default function DocumentEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const headerRef = useRef(null);
  const [doc, setDoc] = useState(null);
  const [editingBlockId, setEditingBlockId] = useState('');
  const [editorState, setEditorState] = useState({ sourceText: '', translatedText: '' });
  const [saving, setSaving] = useState(false);
  const [deleteState, setDeleteState] = useState({ open: false, block: null, busy: false });
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [showFloatingTools, setShowFloatingTools] = useState(false);

  const load = async () => setDoc((await api(`/documents/${id}`)).document);
  useEffect(() => { load(); }, [id]);
  useEffect(() => {
    const updateFloatingTools = () => {
      const headerBottom = headerRef.current?.getBoundingClientRect?.().bottom ?? 0;
      setShowFloatingTools(headerBottom <= 0);
    };
    updateFloatingTools();
    window.addEventListener('scroll', updateFloatingTools, { passive: true });
    window.addEventListener('resize', updateFloatingTools);
    return () => {
      window.removeEventListener('scroll', updateFloatingTools);
      window.removeEventListener('resize', updateFloatingTools);
    };
  }, []);

  const blocks = useMemo(() => (doc?.blocks || []).filter((block) => block.type !== 'document'), [doc]);
  const editingBlock = useMemo(() => (doc?.blocks || []).find((block) => block.id === editingBlockId) || null, [doc, editingBlockId]);

  const beginEdit = (block) => {
    if (!block?.id) return;
    setEditingBlockId(block.id);
    setEditorState({
      sourceText: getEditableSourceText(block),
      translatedText: getEditableTranslatedText(block),
    });
  };

  const cancelEdit = () => {
    setEditingBlockId('');
    setEditorState({ sourceText: '', translatedText: '' });
  };

  const saveBlock = async () => {
    if (!editingBlock || saving) return;
    const previous = cloneBlockSnapshot(editingBlock);
    setSaving(true);
    try {
      const data = await api(`/documents/${id}/blocks/${editingBlock.id}`, {
        method: 'PATCH',
        body: {
          sourceText: editorState.sourceText,
          translatedText: editorState.translatedText,
        },
      });
      setDoc((current) => replaceBlockInDocument(current, data.block));
      setHistory((current) => [...current, { type: 'update', before: previous, after: cloneBlockSnapshot(data.block) }]);
      setFuture([]);
      cancelEdit();
    } finally {
      setSaving(false);
    }
  };

  const askDeleteBlock = (block) => {
    setDeleteState({ open: true, block, busy: false });
  };

  const confirmDeleteBlock = async () => {
    const block = deleteState.block;
    if (!block) return;
    setDeleteState((current) => ({ ...current, busy: true }));
    try {
      await api(`/documents/${id}/blocks/${block.id}`, { method: 'DELETE' });
      setDoc((current) => removeBlockFromDocument(current, block.id));
      setHistory((current) => [...current, { type: 'delete', block: cloneBlockSnapshot(block) }]);
      setFuture([]);
      if (editingBlockId === block.id) cancelEdit();
      setDeleteState({ open: false, block: null, busy: false });
    } catch (error) {
      setDeleteState((current) => ({ ...current, busy: false }));
      throw error;
    }
  };

  const undo = async () => {
    const action = history[history.length - 1];
    if (!action) return;
    if (action.type === 'update') {
      const data = await api(`/documents/${id}/blocks/${action.before.id}`, {
        method: 'PATCH',
        body: {
          sourceText: getEditableSourceText(action.before),
          translatedText: getEditableTranslatedText(action.before),
        },
      });
      setDoc((current) => replaceBlockInDocument(current, data.block));
    } else if (action.type === 'delete') {
      const data = await api(`/documents/${id}/blocks/restore`, {
        method: 'POST',
        body: { block: action.block },
      });
      setDoc((current) => restoreBlockIntoDocument(current, data.block));
    }
    setHistory((current) => current.slice(0, -1));
    setFuture((current) => [action, ...current]);
  };

  const redo = async () => {
    const action = future[0];
    if (!action) return;
    if (action.type === 'update') {
      const data = await api(`/documents/${id}/blocks/${action.after.id}`, {
        method: 'PATCH',
        body: {
          sourceText: getEditableSourceText(action.after),
          translatedText: getEditableTranslatedText(action.after),
        },
      });
      setDoc((current) => replaceBlockInDocument(current, data.block));
    } else if (action.type === 'delete') {
      await api(`/documents/${id}/blocks/${action.block.id}`, { method: 'DELETE' });
      setDoc((current) => removeBlockFromDocument(current, action.block.id));
    }
    setFuture((current) => current.slice(1));
    setHistory((current) => [...current, action]);
  };

  if (!doc) return <Shell><p>加载中...</p></Shell>;

  const editorToolButtons = <>
    <button className="ghost icon-only floating-tool-button" onClick={undo} disabled={!history.length} aria-label="回撤"><RotateCcw size={15} /></button>
    <span className="editor-tool-divider" aria-hidden="true" />
    <button className="ghost icon-only floating-tool-button" onClick={redo} disabled={!future.length} aria-label="恢复"><RotateCw size={15} /></button>
  </>;

  return <Shell contentClassName="result-page edit-page">
    <div ref={headerRef}>
      <Header
        title={stripFileExtension(doc.originalName)}
        showMeta={false}
        titlePrefix={<button className="ghost back-button icon-only" onClick={() => navigate(`/documents/${id}`)} aria-label="返回"><ArrowLeft size={15} /></button>}
        action={!showFloatingTools ? <div className="header-actions editor-header-tools">{editorToolButtons}</div> : null}
      />
    </div>
    {showFloatingTools && <div className="editor-floating-tools">{editorToolButtons}</div>}
    <div className="reader edit-reader">
      {blocks.map((block) => {
        const isEditing = block.id === editingBlockId;
        return <div className="block-row" key={block.id}>
          <div className={`block-panel${isEditing ? ' block-panel-active' : ''}`}>
            {isEditing ? <BlockEditorCard
              title="原文"
              value={editorState.sourceText}
              onChange={(value) => setEditorState((current) => ({ ...current, sourceText: value }))}
              onDelete={() => askDeleteBlock(editingBlock)}
              onSave={saveBlock}
              onCancel={cancelEdit}
              saving={saving}
            /> : <button className="editable-block" onClick={() => beginEdit(block)}><BlockRenderer block={block} translated={false} /></button>}
          </div>
          <div className={`block-panel${isEditing ? ' block-panel-active' : ''}`}>
            {isEditing ? <BlockEditorCard
              title="译文"
              value={editorState.translatedText}
              onChange={(value) => setEditorState((current) => ({ ...current, translatedText: value }))}
              onDelete={() => askDeleteBlock(editingBlock)}
              onSave={saveBlock}
              onCancel={cancelEdit}
              saving={saving}
            /> : <button className="editable-block" onClick={() => beginEdit(block)}><BlockRenderer block={block} translated /></button>}
          </div>
        </div>;
      })}
    </div>
    <BlockDeleteModal
      open={deleteState.open}
      block={deleteState.block}
      onConfirm={confirmDeleteBlock}
      onCancel={() => !deleteState.busy && setDeleteState({ open: false, block: null, busy: false })}
      busy={deleteState.busy}
    />
  </Shell>;
}
