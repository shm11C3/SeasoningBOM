import { Label } from "@primer/react";
import { type AuditSeverity, describeLifecycleStatus, type LifecycleStatus } from "../../domain";

export function LifecycleLabel({ status }: { status: LifecycleStatus }) {
  const display = describeLifecycleStatus(status);
  return (
    <Label
      style={{ width: "fit-content", whiteSpace: "nowrap" }}
      variant={
        display.tone === "danger" ? "danger" : display.tone === "success" ? "success" : "attention"
      }
    >
      {display.label}
    </Label>
  );
}

export function SeverityLabel({ severity }: { severity: AuditSeverity }) {
  const variant =
    severity === "critical" || severity === "high"
      ? "danger"
      : severity === "medium"
        ? "attention"
        : "default";
  return (
    <Label style={{ width: "fit-content", whiteSpace: "nowrap" }} variant={variant}>
      {severity.toUpperCase()}
    </Label>
  );
}

export function DependencyLabel({ value }: { value: string }) {
  const variant = value === "required" ? "accent" : value === "optional" ? "success" : "default";
  return (
    <Label style={{ width: "fit-content", whiteSpace: "nowrap" }} variant={variant}>
      {value}
    </Label>
  );
}
