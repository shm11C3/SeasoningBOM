import type { InventoryItem } from "../inventory/types";

export type LifecycleStatus = "active" | "deprecated" | "eol" | "unsupported" | "hazardous";

export type CalculateLifecycleStatusInput = {
  item: InventoryItem;
  now: Date;
  deprecatedThresholdDays: number;
};

export type LifecycleDisplay = {
  status: LifecycleStatus;
  label: string;
  tone: "success" | "attention" | "severe" | "danger";
};
