import { useState } from 'react';

/**
 * 统一大图查看器组件
 * @param {{ src: string, alt?: string, className?: string, style?: object }} props
 */
export default function ImageViewer({ src, alt = '', className = '', style = {} }) {
  const [open, setOpen] = useState(false);

  if (!src) return <div style={{ width: 48, height: 48, background: 'var(--bg3)', borderRadius: 6 }} />;

  return (
    <>
      <img
        src={src} alt={alt}
        className={`topic-img ${className}`}
        style={style}
        onClick={() => setOpen(true)}
        onError={e => { e.target.style.display = 'none'; }}
      />
      {open && (
        <div className="img-viewer-overlay" onClick={() => setOpen(false)}>
          <img src={src} alt={alt} onClick={e => e.stopPropagation()} />
        </div>
      )}
    </>
  );
}
