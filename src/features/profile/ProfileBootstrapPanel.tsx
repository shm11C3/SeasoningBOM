import { Button } from "@primer/react";
import { type FormEvent, useId, useState } from "react";
import { useCloudProfile } from "../../app/providers/CloudProfileProvider";

export function ProfileBootstrapPanel() {
  const cloudProfile = useCloudProfile();
  const inputId = useId();
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (cloudProfile.status === "error") {
    return (
      <div className="flash flash-danger profile-bootstrap-error">
        <span>Your account profile could not be loaded.</span>
        <Button type="button" onClick={cloudProfile.refresh}>
          Retry
        </Button>
      </div>
    );
  }

  if (cloudProfile.status !== "needs-profile") {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await cloudProfile.bootstrapProfile({ username });
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Profile creation failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="profile-bootstrap" aria-labelledby={`${inputId}-heading`}>
      <div>
        <h2 id={`${inputId}-heading`}>Choose your User Handle</h2>
        <p>Your recipes will use this permanent SeasoningBOM URL identity.</p>
      </div>
      <form className="profile-bootstrap-form" onSubmit={handleSubmit}>
        <label htmlFor={inputId}>User Handle</label>
        <input
          autoComplete="username"
          id={inputId}
          maxLength={39}
          pattern="[a-z0-9](?:[a-z0-9-]*[a-z0-9])?"
          placeholder="seasoned-coder"
          required
          value={username}
          onChange={(event) => setUsername(event.target.value.toLowerCase())}
        />
        <Button disabled={saving} type="submit" variant="primary">
          {saving ? "Saving..." : "Reserve handle"}
        </Button>
      </form>
      {error ? (
        <div className="flash flash-danger" role="alert">
          {error}
        </div>
      ) : null}
    </section>
  );
}
