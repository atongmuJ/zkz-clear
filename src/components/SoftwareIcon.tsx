import { useEffect, useState } from "react";
import { Icon } from "./Icon";

interface SoftwareIconProps {
  name: string;
  iconUrl?: string;
  size?: number;
}

/** 软件图标：优先显示真实图标，加载失败或未提供时回退到通用图标。 */
export function SoftwareIcon({ name, iconUrl, size = 38 }: SoftwareIconProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [iconUrl]);

  const style = { width: size, height: size };
  if (iconUrl && !failed) {
    return (
      <span className="software-icon has-image" style={style}>
        <img src={iconUrl} alt="" loading="lazy" draggable={false} onError={() => setFailed(true)} />
      </span>
    );
  }
  return (
    <span className="software-icon" style={style} title={name}>
      <Icon name="software" size={Math.max(12, Math.round(size * 0.52))} />
    </span>
  );
}
