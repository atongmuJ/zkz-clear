import { Icon } from "./Icon";

interface ErrorBannerProps {
  message: string;
  onClose?: () => void;
}

/** 各页面统一的错误提示条，消息为空时不渲染。 */
export function ErrorBanner({ message, onClose }: ErrorBannerProps) {
  if (!message) return null;

  return (
    <div className="error-banner" role="alert">
      <Icon name="warning" size={16} />
      <span>{message}</span>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="关闭提示">
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  );
}
