import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';

/**
 * 节点标题的本地编辑状态：双击进入编辑、回车/失焦提交、Esc 取消，
 * 并在外部数据变化时同步标题。TextNode / ImageNode 等节点共用。
 */
export function useEditableTitle(
  externalTitle: string | undefined,
  fallback: string,
  onCommit: (title: string) => void,
) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(externalTitle || fallback);
  const inputRef = useRef<HTMLInputElement>(null);

  // 进入编辑态时自动聚焦并全选
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // 外部标题变化时同步（编辑中不打断用户输入）
  useEffect(() => {
    if (!isEditing && externalTitle !== title) {
      setTitle(externalTitle || fallback);
    }
  }, [externalTitle, isEditing, title, fallback]);

  const submit = useCallback(() => {
    setIsEditing(false);
    const next = title.trim() || fallback;
    setTitle(next);
    onCommit(next);
  }, [title, fallback, onCommit]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        submit();
      } else if (e.key === 'Escape') {
        setIsEditing(false);
        setTitle(externalTitle || fallback);
      }
    },
    [submit, externalTitle, fallback],
  );

  return {
    isEditing,
    startEditing: () => setIsEditing(true),
    title,
    setTitle,
    inputRef,
    submit,
    handleKeyDown,
  };
}
