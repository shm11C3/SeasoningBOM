import { Button } from "@primer/react";
import { useState } from "react";
import type { ImportOptions, SeasoningBOMAppBackup } from "../../repositories/contracts";
import { DownloadIcon, UploadIcon } from "../../ui/components/TemporaryIcons";
import { downloadJson } from "../download";
import { useLiveData } from "../useLiveData";

export function BackupPage() {
  const { repositories, recipes, components, inventoryItems } = useLiveData();
  const [backupText, setBackupText] = useState("");
  const [conflictStrategy, setConflictStrategy] =
    useState<ImportOptions["conflictStrategy"]>("overwrite");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    const backup = await repositories.backup.exportAll();
    downloadJson(`seasoning-bom-backup-${backup.exportedAt.slice(0, 10)}.json`, backup);
    setMessage("Backup exported.");
    setError(null);
  }

  async function handleImport() {
    try {
      const parsed = JSON.parse(backupText) as SeasoningBOMAppBackup;
      const result = await repositories.backup.importAll(parsed, { conflictStrategy });
      setMessage(
        `Imported ${result.importedRepositories} repositories, ${result.importedComponents} components, and ${result.importedInventoryItems} inventory items.`,
      );
      setError(null);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Import failed.");
      setMessage(null);
    }
  }

  function handleFile(file: File | undefined) {
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      setBackupText(String(reader.result ?? ""));
    });
    reader.readAsText(file);
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Backup / restore</h1>
          <p>SeasoningBOMAppBackup JSON for local data transfer.</p>
        </div>
      </div>

      {message ? <div className="flash">{message}</div> : null}
      {error ? <div className="flash flash-danger">{error}</div> : null}

      <div className="stat-strip">
        <div className="stat">
          <strong>{recipes.length}</strong>
          <span className="muted">repositories</span>
        </div>
        <div className="stat">
          <strong>{components.length}</strong>
          <span className="muted">components</span>
        </div>
        <div className="stat">
          <strong>{inventoryItems.length}</strong>
          <span className="muted">inventory items</span>
        </div>
      </div>

      <section className="surface readme">
        <div className="section-header">
          <h2>Export</h2>
          <Button type="button" onClick={handleExport}>
            <DownloadIcon /> Export JSON
          </Button>
        </div>
      </section>

      <section className="surface readme section">
        <div className="section-header">
          <h2>Import</h2>
          <Button
            type="button"
            variant="primary"
            onClick={handleImport}
            disabled={!backupText.trim()}
          >
            <UploadIcon /> Import JSON
          </Button>
        </div>
        <div className="form-grid">
          <div className="field span-4">
            <label htmlFor="backup-conflict-strategy">Conflict strategy</label>
            <select
              id="backup-conflict-strategy"
              value={conflictStrategy}
              onChange={(event) =>
                setConflictStrategy(event.target.value as ImportOptions["conflictStrategy"])
              }
            >
              <option value="overwrite">overwrite</option>
              <option value="duplicate">duplicate</option>
            </select>
          </div>
          <div className="field span-8">
            <label htmlFor="backup-file">Backup file</label>
            <input
              id="backup-file"
              type="file"
              accept="application/json"
              onChange={(event) => handleFile(event.target.files?.[0])}
            />
          </div>
          <div className="field span-12">
            <label htmlFor="backup-json">Backup JSON</label>
            <textarea
              id="backup-json"
              value={backupText}
              onChange={(event) => setBackupText(event.target.value)}
            />
          </div>
        </div>
      </section>
    </>
  );
}
