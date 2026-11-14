import { Icon } from "./Icon";

export function ExportLink({ name, label = "Export" }: { name: string; label?: string }) {
  return (
    <a className="btn ghost" href={`/api/export/${name}`} download>
      <Icon name="download" size={15} />
      {label}
    </a>
  );
}
