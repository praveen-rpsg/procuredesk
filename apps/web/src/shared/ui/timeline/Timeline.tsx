export type TimelineStep = {
  date?: string | null;
  isComplete: boolean;
  label: string;
  stage: number;
};

type TimelineProps = {
  steps: TimelineStep[];
};

export function Timeline({ steps }: TimelineProps) {
  return (
    <ol className="timeline-list">
      {steps.map((step) => (
        <li className={`timeline-item${step.isComplete ? " timeline-item-done" : ""}`} key={`${step.stage}-${step.label}`}>
          <span>{step.stage}</span>
          <div>
            <strong>{step.label}</strong>
            <small>{step.date ?? "Pending"}</small>
          </div>
        </li>
      ))}
    </ol>
  );
}
