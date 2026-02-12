interface StatusBadgeProps {
  status: string;
}

const activeStatuses = [
  "joining",
  "recording",
  "transcribing",
  "summarizing",
  "processing",
];

export default function StatusBadge({ status }: StatusBadgeProps) {
  const isActive = activeStatuses.includes(status);

  return (
    <span class={`badge badge-${status}`}>
      {isActive && <span class="badge-dot" />}
      {status}
    </span>
  );
}
