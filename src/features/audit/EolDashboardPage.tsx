import { useMemo } from "react";
import { calculateLifecycleStatus, type InventoryItem, type LifecycleStatus } from "../../domain";
import { EmptyState } from "../../ui/components/EmptyState";
import { LifecycleLabel } from "../../ui/components/Labels";
import { AlertIcon } from "../../ui/components/TemporaryIcons";
import { formatQuantity } from "../format";
import { useLiveData } from "../useLiveData";

const visibleStatuses: LifecycleStatus[] = ["hazardous", "unsupported", "eol", "deprecated"];

export function EolDashboardPage() {
  const { inventoryItems, settings } = useLiveData();
  const now = useMemo(() => new Date(), []);
  const groupedItems = useMemo(() => {
    return inventoryItems.reduce<Record<LifecycleStatus, InventoryItem[]>>(
      (groups, item) => {
        const status = calculateLifecycleStatus({
          item,
          now,
          deprecatedThresholdDays: settings.deprecatedThresholdDays,
        });
        groups[status].push(item);
        return groups;
      },
      { active: [], deprecated: [], eol: [], unsupported: [], hazardous: [] },
    );
  }, [inventoryItems, now, settings]);

  const visibleCount = visibleStatuses.reduce(
    (total, status) => total + groupedItems[status].length,
    0,
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>EOL dashboard</h1>
          <p>Best-before and use-by lifecycle status for installed ingredients.</p>
        </div>
      </div>

      <div className="stat-strip">
        <div className="stat">
          <strong>{groupedItems.deprecated.length}</strong>
          <span className="muted">deprecated</span>
        </div>
        <div className="stat">
          <strong>{groupedItems.eol.length}</strong>
          <span className="muted">EOL</span>
        </div>
        <div className="stat">
          <strong>{groupedItems.unsupported.length + groupedItems.hazardous.length}</strong>
          <span className="muted">unavailable</span>
        </div>
      </div>

      {visibleCount === 0 ? <EmptyState title="No lifecycle warnings" /> : null}

      {visibleStatuses.map((status) =>
        groupedItems[status].length > 0 ? (
          <section className="section" key={status}>
            <div className="section-header">
              <h2>{status}</h2>
            </div>
            <div className="inventory-table">
              {groupedItems[status].map((item) => (
                <div className="inventory-row" key={item.id}>
                  <div>
                    <strong>
                      <AlertIcon /> {item.name}
                    </strong>
                    <p className="muted">{item.category}</p>
                  </div>
                  <span>{formatQuantity(item.quantity, item.unit)}</span>
                  <span>{item.bestBeforeDate ?? "No EOL"}</span>
                  <span>{item.useByDate ?? "No use-by"}</span>
                  <LifecycleLabel status={status} />
                  <span
                    className={
                      status === "unsupported" || status === "hazardous" ? "danger-text" : "muted"
                    }
                  >
                    {status === "unsupported" || status === "hazardous"
                      ? "Excluded from recommendations"
                      : "Review before cooking"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null,
      )}
    </>
  );
}
