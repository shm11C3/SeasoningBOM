type TemporaryIconProps = {
  size?: number;
};

type IconShape =
  | "alert"
  | "archive"
  | "checklist"
  | "code"
  | "download"
  | "mark"
  | "package"
  | "pencil"
  | "plus"
  | "repo"
  | "shield"
  | "star"
  | "trash"
  | "upload";

export function AlertIcon(props: TemporaryIconProps) {
  return <TemporaryIcon shape="alert" {...props} />;
}

export function ArchiveIcon(props: TemporaryIconProps) {
  return <TemporaryIcon shape="archive" {...props} />;
}

export function AppMarkIcon(props: TemporaryIconProps) {
  return <TemporaryIcon shape="mark" {...props} />;
}

export function ChecklistIcon(props: TemporaryIconProps) {
  return <TemporaryIcon shape="checklist" {...props} />;
}

export function CodeIcon(props: TemporaryIconProps) {
  return <TemporaryIcon shape="code" {...props} />;
}

export function DownloadIcon(props: TemporaryIconProps) {
  return <TemporaryIcon shape="download" {...props} />;
}

export function PackageIcon(props: TemporaryIconProps) {
  return <TemporaryIcon shape="package" {...props} />;
}

export function PencilIcon(props: TemporaryIconProps) {
  return <TemporaryIcon shape="pencil" {...props} />;
}

export function PlusIcon(props: TemporaryIconProps) {
  return <TemporaryIcon shape="plus" {...props} />;
}

export function RepoIcon(props: TemporaryIconProps) {
  return <TemporaryIcon shape="repo" {...props} />;
}

export function ShieldIcon(props: TemporaryIconProps) {
  return <TemporaryIcon shape="shield" {...props} />;
}

export function StarIcon(props: TemporaryIconProps) {
  return <TemporaryIcon shape="star" {...props} />;
}

export function TrashIcon(props: TemporaryIconProps) {
  return <TemporaryIcon shape="trash" {...props} />;
}

export function UploadIcon(props: TemporaryIconProps) {
  return <TemporaryIcon shape="upload" {...props} />;
}

function TemporaryIcon({ shape, size = 16 }: TemporaryIconProps & { shape: IconShape }) {
  return (
    <svg
      aria-hidden="true"
      className="temp-icon"
      focusable="false"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      {renderShape(shape)}
    </svg>
  );
}

function renderShape(shape: IconShape) {
  switch (shape) {
    case "alert":
      return (
        <>
          <path d="M12 4 3.5 19h17L12 4Z" />
          <path d="M12 9v5" />
          <path d="M12 17h.01" />
        </>
      );
    case "archive":
      return (
        <>
          <path d="M4 7h16v13H4V7Z" />
          <path d="M3 4h18v3H3V4Z" />
          <path d="M9 11h6" />
        </>
      );
    case "checklist":
      return (
        <>
          <path d="m5 8 2 2 4-5" />
          <path d="M13 8h6" />
          <path d="m5 16 2 2 4-5" />
          <path d="M13 16h6" />
        </>
      );
    case "code":
      return (
        <>
          <path d="m9 7-5 5 5 5" />
          <path d="m15 7 5 5-5 5" />
        </>
      );
    case "download":
      return (
        <>
          <path d="M12 4v11" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 20h14" />
        </>
      );
    case "mark":
      return (
        <>
          <path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" />
          <path d="M8 9h8" />
          <path d="M8 12h5" />
          <path d="M8 15h8" />
        </>
      );
    case "package":
      return (
        <>
          <path d="M4 8 12 4l8 4-8 4-8-4Z" />
          <path d="M4 8v8l8 4 8-4V8" />
          <path d="M12 12v8" />
        </>
      );
    case "pencil":
      return (
        <>
          <path d="M5 19h4l10-10-4-4L5 15v4Z" />
          <path d="m13 7 4 4" />
        </>
      );
    case "plus":
      return (
        <>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </>
      );
    case "repo":
      return (
        <>
          <path d="M6 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1Z" />
          <path d="M8 8h7" />
          <path d="M8 12h5" />
        </>
      );
    case "shield":
      return (
        <>
          <path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6l-7-3Z" />
          <path d="m9 12 2 2 4-5" />
        </>
      );
    case "star":
      return <path d="m12 4 2.4 5 5.6.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.6-.8L12 4Z" />;
    case "trash":
      return (
        <>
          <path d="M5 7h14" />
          <path d="M9 7V5h6v2" />
          <path d="M7 7v13h10V7" />
          <path d="M10 11v5" />
          <path d="M14 11v5" />
        </>
      );
    case "upload":
      return (
        <>
          <path d="M12 20V9" />
          <path d="m7 14 5-5 5 5" />
          <path d="M5 4h14" />
        </>
      );
  }
}
