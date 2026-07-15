import { useId, useRef } from 'react';

import { formatBytes } from '../lib/format.ts';

interface FilePickerProps {
  file: File | null;
  onChange: (file: File | null) => void;
  error?: string | null | undefined;
}

export function FilePicker({ file, onChange, error }: FilePickerProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="field">
      <label htmlFor={id}>本地视频</label>
      <button
        className={`file-picker ${error ? 'has-error' : ''}`}
        type="button"
        onClick={() => inputRef.current?.click()}
      >
        <span className="file-picker-plus" aria-hidden="true">+</span>
        <span className="file-picker-copy">
          <strong>{file ? file.name : '选择一个视频文件'}</strong>
          <small>{file ? formatBytes(file.size) : 'MP4 / MOV / WebM · 最大 300 MB'}</small>
        </span>
        <span className="file-picker-action">{file ? '更换' : '浏览'}</span>
      </button>
      <input
        ref={inputRef}
        id={id}
        className="visually-hidden"
        type="file"
        accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
      {error ? <p className="field-error" role="alert">{error}</p> : null}
    </div>
  );
}
