import type { Summary } from "../utils/api.ts";

interface SummaryViewProps {
  summary: Summary;
}

export default function SummaryView({ summary }: SummaryViewProps) {
  return (
    <div>
      <div class="summary-content">{summary.content}</div>
      <div class="summary-meta">
        <span>model: {summary.model}</span>
        <span>{new Date(summary.created_at).toLocaleString()}</span>
      </div>
    </div>
  );
}
